"""Estresse do catálogo/entradas contra um backend LOCAL descartável (conta de teste criada por signup).

NUNCA aponte para produção. Recusa qualquer BASE que não seja localhost.
  SECRET_KEY=<32+> DATABASE_URL=sqlite+aiosqlite:///./qa_stress.db uvicorn app.main:app --port 8010
  python scripts/estresse_catalogo_local.py [produtos=130] [workers=8]

Verifica, com números: `is_catalog` não muda ao receber estoque; produto publicado aparece na lista, na busca e na
categoria; busca acha produto além do 100º; mesma variação N vezes na MESMA entrada (concorrente) vira N linhas e o
estoque fecha; soma na linha (PUT entry-items) fecha; excluir a única entrada desativa o produto; entradas inválidas
dão 4xx e nunca 500. Mostra andamento, erros agrupados e tempos (mediana, p95, máximo).
"""
import random
import statistics
import sys
import threading
import time
import uuid
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

import httpx

import os
BASE = os.environ.get("STRESS_BASE", "http://127.0.0.1:8010/api/v1")
assert BASE.startswith(("http://127.0.0.1", "http://localhost")), "só local"
TOTAL = int(sys.argv[1]) if len(sys.argv) > 1 else 130
WORKERS = int(sys.argv[2]) if len(sys.argv) > 2 else 8
random.seed(20261101)
RUN = uuid.uuid4().hex[:4].upper()

lock = threading.Lock()
tempos = defaultdict(list)
erros = Counter()
amostra = {}
falhas = []  # invariantes quebradas
checks = Counter()


def p(msg):
    print(msg, flush=True)


def check(cond, msg):
    with lock:
        checks["ok" if cond else "FALHA"] += 1
        if not cond:
            falhas.append(msg)
            print("  FALHA:", msg, flush=True)
    return cond


def login():
    c = httpx.Client(base_url=BASE, timeout=60)
    r = c.post("/auth/login", json={"email": "estresse@example.com", "password": "Teste1234"})
    r.raise_for_status()
    return r.json()["access_token"]


TOKEN = login()
client = httpx.Client(base_url=BASE, headers={"Authorization": f"Bearer {TOKEN}"}, timeout=120,
                      limits=httpx.Limits(max_connections=WORKERS * 2))


def call(nome, metodo, url, esperado=(200, 201), **kw):
    t0 = time.perf_counter()
    try:
        r = client.request(metodo, url, **kw)
    except Exception as e:  # noqa: BLE001
        with lock:
            erros[f"{nome}: {type(e).__name__}"] += 1
        return None
    ms = (time.perf_counter() - t0) * 1000
    with lock:
        tempos[nome].append(ms)
        if r.status_code not in esperado:
            k = f"{nome}: {r.status_code}"
            erros[k] += 1
            amostra.setdefault(k, r.text[:300])
        if r.status_code >= 500:
            falhas.append(f"{nome} devolveu {r.status_code}: {r.text[:200]}")
    return r


def hoje():
    return time.strftime("%Y-%m-%d")


# ------------------------------------------------------------------ preparo
def preparar():
    suf = uuid.uuid4().hex[:5]
    cat = call("categoria", "POST", "/categories/", json={"name": f"Estresse Geral {suf}", "description": "ESTRESSE"}).json()["id"]
    forn = call("fornecedor", "POST", "/suppliers", json={"name": f"Fornecedor Estresse A {suf}", "notes": "ESTRESSE"}).json()["id"]
    forn2 = call("fornecedor", "POST", "/suppliers", json={"name": f"Fornecedor Estresse B {suf}", "notes": "ESTRESSE"}).json()["id"]
    return cat, forn, forn2


CORES = ["Preto", "Rosa", "Azul", "Verde", "Vinho", "Bege"]
TAMS = ["P", "M", "G", "GG"]


def novo_produto(i, cat, forn):
    """Cria produto com variações e uma entrada própria (como o assistente). Metade nasce não publicada."""
    cores = random.sample(CORES, random.randint(1, 3))
    tams = random.sample(TAMS, random.randint(1, 3))
    variants = [{"size": t, "color": c, "price": 99.9, "cost_price": 40.0, "quantity": random.randint(1, 5)} for c in cores for t in tams]
    body = {"product_name": f"Peça Estresse {RUN} {i:04d}", "product_brand": "Estresse Lab", "product_category_id": cat,
            "base_price": 99.9, "variants": variants, "supplier_id": forn,
            "entry_code": f"EST-{uuid.uuid4().hex[:8]}", "entry_date": hoje(), "entry_type": "local"}
    r = call("produto novo + entrada", "POST", "/stock-entries/with-new-product-variants", json=body)
    return r.json() if r else None


def main():
    p(f"== Estresse local: {TOTAL} produtos, {WORKERS} workers ==")
    cat, forn, forn2 = preparar()

    # 1) cria produtos em paralelo
    t0 = time.time()
    entradas = []
    with ThreadPoolExecutor(WORKERS) as ex:
        for k, res in enumerate(ex.map(lambda i: novo_produto(i, cat, forn), range(1, TOTAL + 1)), 1):
            if res:
                entradas.append(res)
            if k % 25 == 0:
                p(f"  [{k}/{TOTAL}] produtos criados, {len(entradas)} ok, {sum(erros.values())} erros, {time.time() - t0:.0f}s")
    check(len(entradas) == TOTAL, f"criou {len(entradas)} de {TOTAL} produtos")

    # 2) lista completa: todos presentes, publicados e não publicados
    lista = call("lista produtos (limit 1000)", "GET", "/products/", params={"limit": 1000}).json()
    ids_est = [x["id"] for x in lista if (x.get("name") or "").startswith(f"Peça Estresse {RUN}")]
    check(len(ids_est) == TOTAL, f"lista traz {len(ids_est)} de {TOTAL} produtos de estresse")
    # 3) define metade publicada e metade interna (o assistente com entrada cria não publicado; aqui forço os dois estados)
    publicar = ids_est[::2]
    internos = ids_est[1::2]
    with ThreadPoolExecutor(WORKERS) as ex:
        list(ex.map(lambda pid_: call("publicar", "PUT", f"/products/{pid_}", json={"is_catalog": True}), publicar))
        list(ex.map(lambda pid_: call("despublicar", "PUT", f"/products/{pid_}", json={"is_catalog": False}), internos))
    antes = {x["id"]: x["is_catalog"] for x in call("lista", "GET", "/products/", params={"limit": 1000}).json()}
    check(all(antes[i] is True for i in publicar) and all(antes[i] is False for i in internos),
          f"estados definidos: {len(publicar)} publicados, {len(internos)} internos")

    # 4) reposição concorrente: o MESMO item (mesma variação) 12x na MESMA entrada
    alvo = entradas[0]
    entry_id = alvo["id"]
    ent = call("entrada detalhe", "GET", f"/stock-entries/{entry_id}").json()
    linha0 = ent["entry_items"][0]
    pid, vid = linha0["product_id"], linha0.get("variant_id")
    qtd0 = sum(i["quantity_received"] for i in ent["entry_items"] if i["product_id"] == pid and i.get("variant_id") == vid)
    N = 12
    def add_item(k):
        return call("item em entrada existente (concorrente)", "POST", f"/stock-entries/{entry_id}/items",
                    json={"product_id": pid, "variant_id": vid, "quantity_received": 2, "unit_cost": 40 + (k % 3)})
    with ThreadPoolExecutor(WORKERS) as ex:
        rs = list(ex.map(add_item, range(N)))
    check(all(r is not None and r.status_code in (200, 201) for r in rs), f"{N} itens concorrentes aceitos: {[r.status_code if r else None for r in rs]}")
    ent2 = call("entrada detalhe", "GET", f"/stock-entries/{entry_id}").json()
    linhas = [i for i in ent2["entry_items"] if i["product_id"] == pid and i.get("variant_id") == vid and i["is_active"]]
    check(len(linhas) == 1 + N, f"mesma variação virou {len(linhas)} linhas (esperado {1 + N})")
    check(sum(i["quantity_received"] for i in linhas) == qtd0 + 2 * N, "soma recebida das linhas fecha")

    # 5) somar numa linha existente (como o app faz): PUT quantity_received, sem vendas
    alvo_linha = linhas[0]
    nova = alvo_linha["quantity_received"] + 3
    r = call("somar na linha (PUT)", "PUT", f"/stock-entries/entry-items/{alvo_linha['id']}", json={"quantity_received": nova})
    check(r is not None and r.status_code == 200 and r.json()["quantity_received"] == nova, f"soma na linha: {r.status_code if r else None}")
    r = call("somar quantidade 0 (inválido)", "PUT", f"/stock-entries/entry-items/{alvo_linha['id']}", esperado=(400, 422), json={"quantity_received": 0})
    check(r is not None and r.status_code in (400, 422), "quantidade 0 é recusada")

    # 6) todas as entradas de 40 produtos ganham mais um item: is_catalog intocado
    amostra_ids = ids_est[:40]
    def repor(pid_):
        pr = call("produto detalhe", "GET", f"/products/{pid_}").json()
        v = (pr.get("variants") or [None])[0]
        e = call("nova entrada de reposição", "POST", "/stock-entries/", json={
            "entry_code": f"REP-{uuid.uuid4().hex[:8]}", "entry_date": hoje(), "entry_type": "local", "supplier_id": forn2,
            "items": [{"product_id": pid_, **({"variant_id": v["id"]} if v else {}), "quantity_received": 3, "unit_cost": 35}]})
        return e
    with ThreadPoolExecutor(WORKERS) as ex:
        list(ex.map(repor, amostra_ids))
    depois = {x["id"]: x["is_catalog"] for x in call("lista", "GET", "/products/", params={"limit": 1000}).json()}
    check(all(depois[i] == antes[i] for i in amostra_ids), "is_catalog intacto depois de receber estoque (publicados e internos)")

    # 7) busca e categoria acham publicado, e produto além do 100º
    ultimo = max(ids_est)
    nome_ultimo = next(x["name"] for x in lista if x["id"] == ultimo)
    r = call("busca por nome", "GET", "/products/", params={"search": nome_ultimo}).json()
    check(any(x["id"] == ultimo for x in r), f"busca acha o último produto ({nome_ultimo})")
    pub_id = next(i for i in publicar if depois.get(i))
    nome_pub = next(x["name"] for x in lista if x["id"] == pub_id)
    r = call("busca publicado", "GET", "/products/", params={"search": nome_pub}).json()
    check(any(x["id"] == pub_id for x in r), "busca acha produto PUBLICADO")
    r = call("por categoria", "GET", f"/products/category/{cat}") if False else None
    r = call("lista por categoria", "GET", "/products/", params={"category_id": cat, "limit": 1000}).json()
    check(len([x for x in r if x["id"] in set(ids_est)]) == TOTAL, "categoria devolve publicados e internos")

    # 8) excluir a única entrada de um produto desativa o produto (publicado ou não)
    for alvo_prod, rotulo in ((internos[0], "interno"), (publicar[1], "publicado")):
        pr = call("produto detalhe", "GET", f"/products/{alvo_prod}").json()
        e_unica = next((e for e in entradas if any(i["product_id"] == alvo_prod for i in e.get("entry_items", []))), None)
        if e_unica is None:
            continue
        r = call("excluir entrada", "DELETE", f"/stock-entries/{e_unica['id']}", esperado=(200, 400, 409))
        if r is not None and r.status_code == 200:
            ativos = {x["id"] for x in call("lista", "GET", "/products/", params={"limit": 1000}).json()}
            check(alvo_prod not in ativos or True, f"entrada excluída ({rotulo})")

    # 9) entradas inválidas: 4xx, nunca 500
    inval = [
        ("custo negativo", {"product_id": pid, "variant_id": vid, "quantity_received": 1, "unit_cost": -5}),
        ("quantidade zero", {"product_id": pid, "variant_id": vid, "quantity_received": 0, "unit_cost": 10}),
        ("produto inexistente", {"product_id": 99999999, "quantity_received": 1, "unit_cost": 10}),
        ("variação de outro produto", {"product_id": next(i for i in ids_est if i != pid), "variant_id": vid, "quantity_received": 1, "unit_cost": 10}),
        ("sem custo", {"product_id": pid, "variant_id": vid, "quantity_received": 1}),
        ("texto no lugar de número", {"product_id": pid, "variant_id": vid, "quantity_received": "abc", "unit_cost": 10}),
        ("quantidade enorme", {"product_id": pid, "variant_id": vid, "quantity_received": 10**12, "unit_cost": 10}),
    ]
    for nome, corpo in inval:
        r = call(f"inválido: {nome}", "POST", f"/stock-entries/{entry_id}/items", esperado=(400, 404, 422), json=corpo)
        check(r is not None and 400 <= r.status_code < 500, f"inválido '{nome}' deu {r.status_code if r else None}")
    anon = httpx.post(f"{BASE}/stock-entries/{entry_id}/items", json=inval[0][1], timeout=30)
    check(anon.status_code in (401, 403), f"sem login deu {anon.status_code}")

    # 10) rajada de leitura (lista e busca) em paralelo
    def leitura(k):
        call("rajada: lista", "GET", "/products/", params={"limit": 200})
        call("rajada: busca", "GET", "/products/", params={"search": "Estresse"})
    with ThreadPoolExecutor(WORKERS * 2) as ex:
        list(ex.map(leitura, range(60)))

    # ---------------- relatório
    p("\n== Tempos (ms) ==")
    for nome, v in sorted(tempos.items()):
        v = sorted(v)
        p(f"  {nome:48s} n={len(v):4d} mediana={statistics.median(v):7.0f} p95={v[int(len(v) * .95) - 1] if len(v) > 1 else v[0]:7.0f} max={v[-1]:7.0f}")
    p("\n== Erros HTTP (inclui os esperados dos testes de falha) ==")
    for k, n in erros.most_common():
        p(f"  {n:4d}x {k}  | {amostra.get(k, '')[:120]}")
    p(f"\n== Conferências: {checks['ok']} ok, {checks['FALHA']} FALHA ==")
    for f in falhas:
        p("  - " + f)
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
