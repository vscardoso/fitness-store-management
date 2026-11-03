"""Miniaturas das fotos (?w=160): as listas do app não baixam a foto de 2560 px para mostrar um quadradinho."""
import io
import os
import time
import uuid
from pathlib import Path

import pytest
from httpx import AsyncClient
from PIL import Image

from app.core.config import settings
from tests.conftest import test_client  # noqa: F401

pytestmark = pytest.mark.asyncio

BASE = Path(settings.UPLOAD_DIR)


def _foto(pasta, nome, size=(2400, 1800), fmt="JPEG", cor=(180, 40, 120)):
    (BASE / pasta).mkdir(parents=True, exist_ok=True)
    im = Image.effect_noise(size, 60).convert("RGB")  # ruído: JPEG realista (não comprime a nada)
    im = Image.blend(im, Image.new("RGB", size, cor), 0.5)
    caminho = BASE / pasta / nome
    im.save(caminho, format=fmt, quality=88)
    return caminho


async def test_miniatura_e_bem_menor_e_tem_o_tamanho_pedido(test_client: AsyncClient):
    nome = f"thumb_{uuid.uuid4().hex[:8]}.jpg"
    orig = _foto("products", nome)
    r0 = await test_client.get(f"/uploads/products/{nome}")
    r1 = await test_client.get(f"/uploads/products/{nome}", params={"w": 160})
    assert r0.status_code == 200 and r1.status_code == 200
    assert r1.headers["content-type"] == "image/jpeg"
    im = Image.open(io.BytesIO(r1.content))
    assert max(im.size) == 160 and im.size[0] / im.size[1] == pytest.approx(4 / 3, rel=0.02)   # proporção mantida
    assert len(r1.content) < len(r0.content) / 15, (len(r1.content), len(r0.content))
    assert orig.stat().st_size == len(r0.content)   # o original não foi tocado


async def test_pedido_vira_o_menor_tamanho_permitido_e_acima_do_teto_fica_no_teto(test_client: AsyncClient):
    nome = f"thumb_{uuid.uuid4().hex[:8]}.jpg"
    _foto("products", nome, size=(2000, 2000))
    for pedido, esperado in ((50, 96), (97, 160), (200, 240), (401, 800), (801, 1200), (5000, 1200)):
        r = await test_client.get(f"/uploads/products/{nome}", params={"w": pedido})
        assert max(Image.open(io.BytesIO(r.content)).size) == esperado, pedido
    existentes = sorted(p.name for p in (BASE / "_thumbs").iterdir() if (p / "products" / f"{nome}.jpg").exists())
    assert set(existentes) == {"96", "160", "240", "800", "1200"}   # nunca w=97, w=401...


async def test_parametro_invalido_serve_o_original(test_client: AsyncClient):
    nome = f"thumb_{uuid.uuid4().hex[:8]}.jpg"
    orig = _foto("products", nome, size=(1200, 900))
    for w in ("abc", "-5", "0", "", "1e3"):
        r = await test_client.get(f"/uploads/products/{nome}", params={"w": w})
        assert r.status_code == 200 and len(r.content) == orig.stat().st_size, w


async def test_cache_foto_com_nome_unico_e_imutavel_e_a_regravavel_revalida(test_client: AsyncClient):
    unica = f"product_7_{uuid.uuid4().hex[:10]}_media.jpg"
    _foto("product_media", unica, size=(800, 600))
    comum = f"thumb_{uuid.uuid4().hex[:8]}.jpg"
    _foto("products", comum, size=(800, 600))
    for url in (f"/uploads/product_media/{unica}", f"/uploads/product_media/{unica}?w=96"):
        assert "immutable" in (await test_client.get(url)).headers["cache-control"], url
    for url in (f"/uploads/products/{comum}", f"/uploads/products/{comum}?w=96"):
        assert (await test_client.get(url)).headers["cache-control"] == "no-cache", url
    r = await test_client.get(f"/uploads/products/{comum}", params={"w": 96})
    r2 = await test_client.get(f"/uploads/products/{comum}", params={"w": 96}, headers={"If-None-Match": r.headers["etag"]})
    assert r2.status_code == 304    # revalidar custa só o cabeçalho


async def test_foto_regravada_com_o_mesmo_nome_refaz_a_miniatura(test_client: AsyncClient):
    nome = f"thumb_{uuid.uuid4().hex[:8]}.jpg"
    caminho = _foto("products", nome, size=(900, 900), cor=(250, 10, 10))
    a = (await test_client.get(f"/uploads/products/{nome}", params={"w": 96})).content
    time.sleep(1.1)
    _foto("products", nome, size=(900, 900), cor=(10, 10, 250))
    os.utime(caminho, None)
    b = (await test_client.get(f"/uploads/products/{nome}", params={"w": 96})).content
    assert a != b
    ra, rb = Image.open(io.BytesIO(a)).convert("RGB").getpixel((48, 48)), Image.open(io.BytesIO(b)).convert("RGB").getpixel((48, 48))
    assert ra[0] > ra[2] and rb[2] > rb[0]   # vermelha antes, azul depois


async def test_png_com_transparencia_vira_jpg_com_fundo_branco(test_client: AsyncClient):
    nome = f"thumb_{uuid.uuid4().hex[:8]}.png"
    (BASE / "products").mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (600, 600), (0, 0, 0, 0)).save(BASE / "products" / nome)
    r = await test_client.get(f"/uploads/products/{nome}", params={"w": 96})
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(r.content)).convert("RGB").getpixel((10, 10)) == (255, 255, 255)


async def test_gif_nao_vira_miniatura_e_continua_animado(test_client: AsyncClient):
    nome = f"thumb_{uuid.uuid4().hex[:8]}.gif"
    (BASE / "product_media").mkdir(parents=True, exist_ok=True)
    frames = [Image.new("RGB", (300, 300), c) for c in ((255, 0, 0), (0, 255, 0))]
    frames[0].save(BASE / "product_media" / nome, save_all=True, append_images=frames[1:], duration=100, loop=0)
    r = await test_client.get(f"/uploads/product_media/{nome}", params={"w": 96})
    assert r.status_code == 200 and r.headers["content-type"] == "image/gif"
    assert getattr(Image.open(io.BytesIO(r.content)), "n_frames", 1) == 2


async def test_travessia_de_pasta_e_arquivo_que_nao_e_imagem_dao_404(test_client: AsyncClient):
    (BASE / "products").mkdir(parents=True, exist_ok=True)
    (BASE / "segredo.txt").write_text("nao sair")
    for url in ("/uploads/../segredo.txt?w=96", "/uploads/products/..%2F..%2Fsegredo.txt?w=96", "/uploads/segredo.txt?w=96",
                "/uploads/products/nao_existe.jpg?w=96", "/uploads/_thumbs/96/../../segredo.txt"):
        r = await test_client.get(url)
        assert r.status_code in (404, 400), (url, r.status_code)
        assert b"nao sair" not in r.content


async def test_arquivo_que_diz_ser_jpg_mas_e_lixo_serve_sem_quebrar(test_client: AsyncClient):
    nome = f"thumb_{uuid.uuid4().hex[:8]}.jpg"
    (BASE / "products").mkdir(parents=True, exist_ok=True)
    (BASE / "products" / nome).write_bytes(b"isto nao e uma imagem")
    r = await test_client.get(f"/uploads/products/{nome}", params={"w": 96})
    assert r.status_code == 200    # cai no original (o app mostra o ícone se não abrir), nunca erro 500


async def test_foto_deitada_com_rotacao_da_camera_sai_em_pe_no_tamanho_do_catalogo(test_client: AsyncClient):
    """Foto antiga gravada deitada (4032 x 3024) com a rotação só no EXIF: a Meta ignora o EXIF e mostrava a faixa deitada."""
    nome = f"exif_{uuid.uuid4().hex[:8]}.jpg"
    (BASE / "products").mkdir(parents=True, exist_ok=True)
    im = Image.blend(Image.effect_noise((2400, 1800), 60).convert("RGB"), Image.new("RGB", (2400, 1800), (200, 180, 120)), 0.5)
    exif = Image.Exif()
    exif[274] = 6   # câmera: girar 90 graus para mostrar
    im.save(BASE / "products" / nome, format="JPEG", quality=88, exif=exif.tobytes())
    r = await test_client.get(f"/uploads/products/{nome}", params={"w": 1200})
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    out = Image.open(io.BytesIO(r.content))
    assert out.size == (900, 1200)                      # em pé, lado maior 1200
    assert out.getexif().get(274) in (None, 1)          # sem rotação pendente para a Meta ignorar

