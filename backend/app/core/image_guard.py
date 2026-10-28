"""
Confere o conteúdo REAL de uma imagem enviada e a regrava do zero (item 2.4).

Antes o servidor confiava no tipo que o aparelho declarava e na extensão do nome do arquivo: dava para
subir um .html (ou qualquer coisa em base64) com "image/png" e o servidor de fotos entregava como página.
Aqui:
- a imagem é aberta pelo Pillow (HEIC via pillow-heif quando instalado); o que não abre é recusado;
- formato só da lista (JPEG, PNG, WebP, GIF, HEIC/HEIF, TIFF, BMP, MPO);
- imagem gigante é recusada antes de descompactar (proteção contra "bomba" de pixels);
- a saída é SEMPRE regravada (JPEG; PNG se tiver transparência): some qualquer coisa escondida no arquivo
  e também os metadados EXIF, inclusive a localização GPS da foto;
- a extensão é decidida aqui, nunca pelo nome que veio do aparelho.
"""
import io
from typing import Tuple

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "HEIF", "HEIC", "TIFF", "BMP", "MPO"}
MAX_BYTES = 15 * 1024 * 1024
MAX_PIXELS = 40_000_000          # ~ 7.700 x 5.200; foto de celular moderna tem 12 a 50 MP
MAX_SIDE_OUT = 2560              # lado maior gravado (a tela do app não usa mais que isso)
INVALID = "O arquivo não é uma imagem válida. Envie uma foto em JPG, PNG, WebP ou HEIC."


class InvalidImage(ValueError):
    pass


def _open(data: bytes):
    from PIL import Image
    try:
        import pillow_heif  # type: ignore
        pillow_heif.register_heif_opener()
    except ImportError:
        pass
    return Image.open(io.BytesIO(data))


def sanitize_image(data: bytes, keep_animation: bool = False) -> Tuple[bytes, str, str]:
    """Devolve (bytes regravados, extensão com ponto, content-type). Levanta InvalidImage se não for imagem.

    keep_animation: GIF animado continua animado (galeria do produto), regravado quadro a quadro.
    """
    from PIL import Image, ImageOps

    if not data:
        raise InvalidImage("A imagem chegou vazia.")
    if len(data) > MAX_BYTES:
        raise InvalidImage("Imagem muito grande (máximo 15 MB).")
    try:
        probe = _open(data)
        fmt = (probe.format or "").upper()
        width, height = probe.size
        if fmt not in ALLOWED_FORMATS:
            raise InvalidImage(INVALID)
        if width * height > MAX_PIXELS:
            raise InvalidImage("Imagem com resolução grande demais. Tire a foto de novo ou reduza o tamanho.")
        probe.verify()  # confere a estrutura do arquivo sem descompactar tudo
        img = _open(data)  # verify() inutiliza o objeto: abre de novo para ler os pixels
        img.load()
    except InvalidImage:
        raise
    except Image.DecompressionBombError:
        raise InvalidImage("Imagem com resolução grande demais. Tire a foto de novo ou reduza o tamanho.")
    except Exception:
        raise InvalidImage(INVALID)

    # GIF animado: antes do exif_transpose, que devolve uma cópia de um quadro só
    if fmt == "GIF" and keep_animation and getattr(img, "is_animated", False):
        from PIL import ImageSequence
        frames = [f.copy() for f in ImageSequence.Iterator(img)]
        if len(frames) > 300:
            raise InvalidImage("GIF com quadros demais (máximo 300).")
        for f in frames:
            f.thumbnail((1080, 1080))
        out = io.BytesIO()
        frames[0].save(out, format="GIF", save_all=True, append_images=frames[1:], loop=img.info.get("loop", 0),
                       duration=img.info.get("duration", 100), disposal=2)
        return out.getvalue(), ".gif", "image/gif"
    if getattr(img, "is_animated", False):
        img.seek(0)  # GIF animado vira a primeira imagem
    try:
        img = ImageOps.exif_transpose(img)  # aplica a rotação da câmera antes de jogar fora o EXIF
    except Exception:
        pass
    img.thumbnail((MAX_SIDE_OUT, MAX_SIDE_OUT))

    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    out = io.BytesIO()
    if has_alpha:
        img.convert("RGBA").save(out, format="PNG", optimize=True)
        return out.getvalue(), ".png", "image/png"
    img.convert("RGB").save(out, format="JPEG", quality=88, optimize=True)
    return out.getvalue(), ".jpg", "image/jpeg"


def sniff_image_type(head: bytes):
    """Tipo pela assinatura dos primeiros bytes (para arquivo antigo gravado sem extensão). None = não é imagem."""
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def sanitize_or_400(data: bytes, keep_animation: bool = False) -> Tuple[bytes, str, str]:
    """Para as rotas: imagem inválida vira 400 com a frase para a lojista."""
    from fastapi import HTTPException, status
    try:
        return sanitize_image(data, keep_animation=keep_animation)
    except InvalidImage as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


def base64_or_400(text: str, keep_animation: bool = False) -> Tuple[bytes, str, str]:
    """Aceita "data:image/...;base64,XXXX" ou só o base64. O cabeçalho NÃO decide o tipo: quem decide é o conteúdo."""
    import base64
    import binascii
    from fastapi import HTTPException, status
    raw = (text or "").split(",", 1)[1] if "," in (text or "") else (text or "")
    try:
        data = base64.b64decode(raw, validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID)
    return sanitize_or_400(data, keep_animation=keep_animation)
