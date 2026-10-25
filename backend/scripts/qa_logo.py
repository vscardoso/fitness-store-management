"""Logo da loja: reduz para WebP <= 512 px, cache longo em /uploads/logos, troca sem deixar lixo e recusa imagem invalida.
Uso (na pasta backend): UPLOAD_DIR=./qa_uploads DATABASE_URL=sqlite+aiosqlite:///./qa_logo.db uvicorn app.main:app --port 8766; depois python scripts/qa_logo.py"""
import io
import os
import secrets
import sqlite3

import httpx
from PIL import Image

B = "http://127.0.0.1:8766/api/v1"
ROOT = "http://127.0.0.1:8766"
UP = "qa_uploads"
DB = "qa_logo.db"
c = httpx.Client(timeout=60)
falhas = []


def check(label, cond, extra=""):
    print(f"[{'OK ' if cond else 'ERR'}] {label}" + (f"  -> {extra}" if extra else ""))
    if not cond:
        falhas.append(label)


pw = "Qa!" + secrets.token_hex(6)
em = f"qa.logo{secrets.token_hex(2)}@example.com"
c.post(B + "/auth/signup", json={"full_name": "QA Logo", "email": em, "password": pw, "store_name": "Loja Logo", "plan": "pro", "accept_terms": True, "terms_version": c.get(B + "/legal/current").json()["version"]})
H = {"Authorization": "Bearer " + c.post(B + "/auth/login", json={"email": em, "password": pw}).json()["access_token"]}


def png_grande(lado=1400):
    # Degrade com ruido leve a 1400 px: PNG pesado como um logo exportado de design
    g = Image.linear_gradient("L").resize((lado, lado))
    ruido = Image.effect_noise((lado, lado), 4)
    canal = Image.blend(g, ruido, 0.25)
    img = Image.merge("RGBA", (canal, g.transpose(Image.FLIP_TOP_BOTTOM), ruido, Image.new("L", (lado, lado), 255)))
    img.paste((0, 0, 0, 0), (0, 0, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def logo_path_db():
    con = sqlite3.connect(DB)
    r = con.execute("select logo_path from stores order by id desc limit 1").fetchone()
    con.close()
    return r[0] if r else None


def arquivos_logos():
    out = []
    for d, _, fs in os.walk(os.path.join(UP, "logos")):
        out += [os.path.join(d, f) for f in fs]
    return sorted(out)


# 1. Upload de PNG grande
original = png_grande()
print(f"PNG original: {len(original) // 1024} KB")
r = c.post(B + "/store/logo", headers=H, files={"file": ("logo.png", original, "image/png")})
check("upload do PNG grande devolve 200", r.status_code == 200, r.text[:120])
url1 = r.json()["logo_url"]
check("logo_url termina em .webp", url1.endswith(".webp"), url1)
check("banco guarda o mesmo caminho", logo_path_db() == url1.removeprefix("/uploads/"), str(logo_path_db()))

g = c.get(ROOT + url1)
check("GET do logo devolve 200 image/webp", g.status_code == 200 and g.headers["content-type"] == "image/webp", g.headers.get("content-type", ""))
check("Cache-Control longo e imutavel", "max-age=2592000" in g.headers.get("cache-control", "") and "immutable" in g.headers.get("cache-control", ""), g.headers.get("cache-control", ""))
im = Image.open(io.BytesIO(g.content))
print(f"logo servido: {len(g.content) // 1024} KB, {im.size}, modo {im.mode}")
check("lado maior <= 512 px", max(im.size) <= 512, str(im.size))
check("peso final <= 15% do original", len(g.content) <= len(original) * 0.15, f"{len(g.content)} de {len(original)}")
check("transparencia preservada (RGBA)", im.mode == "RGBA" and im.getpixel((5, 5))[3] == 0 and im.getpixel((400, 400))[3] == 255, f"modo {im.mode}")
check("branding publico devolve a mesma url", c.get(B + "/store/branding", headers=H).json()["logo_url"] == url1)

# 2. Segundo upload (JPEG) troca e apaga o antigo
buf = io.BytesIO()
Image.new("RGB", (800, 400), (200, 30, 90)).save(buf, format="JPEG")
r2 = c.post(B + "/store/logo", headers=H, files={"file": ("logo.jpg", buf.getvalue(), "image/jpeg")})
check("segundo upload (JPEG) 200", r2.status_code == 200, r2.text[:120])
url2 = r2.json()["logo_url"]
check("urls diferentes", url1 != url2)
check("arquivo antigo removido, so o novo existe", len(arquivos_logos()) == 1 and arquivos_logos()[0].endswith(url2.split("/")[-1]), str(arquivos_logos()))
check("logo antigo deixa de existir no servidor", c.get(ROOT + url1).status_code == 404)

# 3. Falha: conteudo que nao e imagem
antes = (logo_path_db(), arquivos_logos())
r3 = c.post(B + "/store/logo", headers=H, files={"file": ("logo.png", b"isto nao e uma imagem" * 50, "image/png")})
check("imagem corrompida recusada com 400", r3.status_code == 400, r3.text[:120])
check("nada mudou no banco nem em disco apos a falha", (logo_path_db(), arquivos_logos()) == antes)

# 4. Falha: tipo nao permitido e arquivo grande demais
r4 = c.post(B + "/store/logo", headers=H, files={"file": ("a.txt", b"oi", "text/plain")})
check("tipo nao permitido recusado com 400", r4.status_code == 400)
r5 = c.post(B + "/store/logo", headers=H, files={"file": ("big.png", b"0" * (5 * 1024 * 1024 + 1), "image/png")})
check("arquivo acima de 5 MB recusado com 400", r5.status_code == 400)
check("estado continua o do segundo upload", (logo_path_db(), arquivos_logos()) == antes)

# 5. Outros uploads nao ganham cache imutavel
os.makedirs(os.path.join(UP, "products"), exist_ok=True)
Image.new("RGB", (10, 10)).save(os.path.join(UP, "products", "qa.png"))
p = c.get(ROOT + "/uploads/products/qa.png")
check("foto de produto continua sem cache imutavel", p.status_code == 200 and "immutable" not in p.headers.get("cache-control", ""), p.headers.get("cache-control", "sem header"))

print("\nTUDO OK" if not falhas else f"\nFALHAS: {falhas}")
raise SystemExit(1 if falhas else 0)
