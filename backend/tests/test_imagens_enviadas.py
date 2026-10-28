"""Item 2.4: o servidor confere o conteúdo REAL das imagens enviadas e regrava a foto.

Antes: tipo declarado pelo aparelho + extensão do nome decidiam; dava para subir um .html "image/png" (ou qualquer
coisa em base64) e o servidor de fotos entregava como página.
"""
import base64
import io
from pathlib import Path

import pytest
from PIL import Image

from app.core.image_guard import InvalidImage, sanitize_image
from tests.test_lot_costs import _limpa_loja_1, _loja_api, _produto  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
HTML = b"<html><script>alert(document.cookie)</script></html>"


def _png(size=(40, 30), mode="RGB", color=(200, 30, 90)) -> bytes:
    buf = io.BytesIO()
    Image.new(mode, size, color).save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_com_gps() -> bytes:
    img = Image.new("RGB", (50, 50), (10, 120, 200))
    exif = Image.Exif()
    exif[0x8825] = {1: "S", 2: (18.0, 55.0, 0.0)}  # GPSInfo
    exif[0x010F] = "Fabricante"
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def _gif_animado() -> bytes:
    frames = [Image.new("RGB", (20, 20), c) for c in ((255, 0, 0), (0, 255, 0), (0, 0, 255))]
    buf = io.BytesIO()
    frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
    return buf.getvalue()


# ───────────────────────── a função ─────────────────────────

def test_html_disfarcado_e_lixo_sao_recusados():
    for data in (HTML, b"GIF89a" + HTML, b"\x89PNG\r\n\x1a\n" + HTML, b""):
        with pytest.raises(InvalidImage):
            sanitize_image(data)


def test_foto_valida_e_regravada_sem_exif():
    out, ext, ct = sanitize_image(_jpeg_com_gps())
    assert (ext, ct) == (".jpg", "image/jpeg")
    img = Image.open(io.BytesIO(out))
    assert img.format == "JPEG"
    assert not img.getexif(), "a localização GPS da foto tem que sumir"


def test_transparencia_vira_png_e_resto_vira_jpeg():
    assert sanitize_image(_png(mode="RGBA", color=(0, 0, 0, 0)))[1] == ".png"
    assert sanitize_image(_png())[1] == ".jpg"


def test_gif_animado_so_continua_animado_na_galeria():
    out, ext, _ = sanitize_image(_gif_animado(), keep_animation=True)
    assert ext == ".gif" and Image.open(io.BytesIO(out)).n_frames == 3
    assert sanitize_image(_gif_animado())[1] == ".jpg"


def test_bomba_de_pixels_recusada():
    buf = io.BytesIO()
    Image.new("1", (9000, 9000)).save(buf, format="PNG")  # 81 MP, arquivo pequeno
    with pytest.raises(InvalidImage, match="resolução grande"):
        sanitize_image(buf.getvalue())


def test_foto_grande_e_reduzida():
    out, _, _ = sanitize_image(_png(size=(4000, 3000)))
    assert max(Image.open(io.BytesIO(out)).size) == 2560


# ───────────────────────── as rotas ─────────────────────────

async def _ctx(db, test_user):
    t_id, token, cat = await _loja_api(db, test_user)
    p, v = await _produto(db, t_id, cat, "Produto Foto")
    await db.commit()
    return p.id, v.id, {"Authorization": f"Bearer {token}"}


async def test_rotas_recusam_html_disfarcado(test_client, async_session, test_user):
    pid, vid, h = await _ctx(async_session, test_user)
    falso = {"file": ("foto.html", io.BytesIO(HTML), "image/png")}
    b64 = "data:image/jpeg;base64," + base64.b64encode(HTML).decode()
    for metodo, url, kw in (
        ("post", f"/api/v1/products/{pid}/image", {"files": falso}),
        ("post", f"/api/v1/products/{pid}/image/base64", {"json": {"image_data": b64}}),
        ("post", f"/api/v1/product-variants/{vid}/image", {"files": {"file": ("x.png", io.BytesIO(HTML), "image/png")}}),
        ("post", f"/api/v1/product-variants/{vid}/image/base64", {"json": {"image_data": b64}}),
        ("post", f"/api/v1/products/{pid}/media/upload", {"files": {"file": ("x.png", io.BytesIO(HTML), "image/png")}}),
        ("post", f"/api/v1/products/{pid}/media/upload/base64", {"json": {"image_data": b64}}),
    ):
        r = await getattr(test_client, metodo)(url, headers=h, **kw)
        assert r.status_code == 400, (url, r.status_code, r.text[:150])
        assert "não é uma imagem válida" in r.json()["detail"], url


async def test_rotas_aceitam_foto_e_gravam_com_extensao_do_servidor(test_client, async_session, test_user):
    pid, vid, h = await _ctx(async_session, test_user)
    # nome .html mas conteúdo PNG de verdade: grava como imagem, nunca com a extensão que veio
    r = await test_client.post(f"/api/v1/products/{pid}/image", headers=h,
                               files={"file": ("pagina.html", io.BytesIO(_png()), "image/png")})
    assert r.status_code == 200, r.text
    assert r.json()["image_url"].split("?")[0].endswith(".jpg")
    r = await test_client.post(f"/api/v1/products/{pid}/media/upload", headers=h,
                               files={"file": ("a.gif", io.BytesIO(_gif_animado()), "image/gif")})
    assert r.status_code == 201, r.text
    assert r.json()["media_type"] == "gif" and r.json()["url"].endswith(".gif")
    b64 = base64.b64encode(_png()).decode()
    r = await test_client.post(f"/api/v1/product-variants/{vid}/image/base64", headers=h, json={"image_data": b64})
    assert r.status_code == 200, r.text


async def test_servidor_de_fotos_so_entrega_imagem(test_client):
    from app.core.config import settings
    pasta = Path(settings.UPLOAD_DIR) / "products"
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "antigo_malicioso.html").write_bytes(HTML)
    (pasta / "antigo_malicioso.svg").write_bytes(b"<svg onload=alert(1)></svg>")
    (pasta / "foto_ok.jpg").write_bytes(sanitize_image(_png())[0])
    (pasta / "galeria_antiga_media").write_bytes(sanitize_image(_png())[0])  # galeria gravava sem extensão
    (pasta / "html_sem_extensao").write_bytes(HTML)
    try:
        r = await test_client.get("/uploads/products/galeria_antiga_media")
        assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
        assert r.headers["x-content-type-options"] == "nosniff"
        for nome in ("antigo_malicioso.html", "antigo_malicioso.svg", "html_sem_extensao"):
            assert (await test_client.get(f"/uploads/products/{nome}")).status_code == 404, nome
        r = await test_client.get("/uploads/products/foto_ok.jpg")
        assert r.status_code == 200
        assert "sandbox" in r.headers["content-security-policy"] and r.headers["x-content-type-options"] == "nosniff"
    finally:
        for nome in ("antigo_malicioso.html", "antigo_malicioso.svg", "foto_ok.jpg", "galeria_antiga_media",
                     "html_sem_extensao"):
            (pasta / nome).unlink(missing_ok=True)
