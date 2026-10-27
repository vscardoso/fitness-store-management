"""Carga de teste na loja 1 (conta de teste): produtos, variações, entradas e fornecedores pela API real.

Roda DENTRO do container do backend (fala com http://localhost:8000 com um token da loja 1) e nunca toca a loja 2.
Tudo que cria leva a marca "ESTRESSE" (entrada com nota "ESTRESSE", produto com marca "Estresse Lab"), para limpar depois.

  docker cp estresse_loja_teste.py provador-backend:/tmp/ && docker exec provador-backend python -u /tmp/estresse_loja_teste.py 3000

Mostra andamento a cada 100 produtos, erros agrupados e o tempo (mediana, p95, máximo) de cada tipo de chamada.
"""
import random
import statistics
import sys
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

import httpx

from app.core.security import create_access_token

TENANT = 1
BASE = "http://localhost:8000/api/v1"
TOTAL = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
WORKERS = 4
random.seed(20261027)

lock = threading.Lock()
tempos = defaultdict(list)
erros = Counter()
amostra_erro = {}
criados = {"produtos": 0, "variacoes": 0, "entradas": 0}


def token():
    import psycopg2
    import os
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg", "postgresql")
    with psycopg2.connect(url) as c, c.cursor() as cur:
        cur.execute("select id from users where tenant_id=%s and role='ADMIN' order by id limit 1", (TENANT,))
        row = cur.fetchone() or (None,)
        if row[0] is None:
            cur.execute("select id from users where tenant_id=%s order by id limit 1", (TENANT,))
            row = cur.fetchone()
    return create_access_token(data={"sub": str(row[0])})


H = {"Authorization": f"Bearer {token()}"}
client = httpx.Client(base_url=BASE, headers=H, timeout=60.0, limits=httpx.Limits(max_connections=WORKERS * 2))


def chamar(nome, metodo, url, **kw):
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
        if r.status_code >= 400:
            chave = f"{nome}: {r.status_code}"
            erros[chave] += 1
            amostra_erro.setdefault(chave, r.text[:300])
    return r if r.status_code < 400 else None


# ---------------------------------------------------------------- catálogo de dados
BASES = ["Legging", "Top", "Short", "Camiseta", "Regata", "Macacão", "Conjunto", "Jaqueta", "Bermuda", "Calça Jogger",
         "Cropped", "Body", "Saia Short", "Moletom", "Blusa", "Vestido", "Sutiã Esportivo", "Meia", "Boné", "Tênis",
         "Sandália", "Rasteirinha", "Garrafa", "Bolsa", "Mochila", "Faixa", "Luva", "Corda", "Tapete Yoga", "Viseira"]
ADJ = ["Cirrê", "Suplex", "Canelada", "Texturizada", "Cintura Alta", "Fusô", "Dry Fit", "Poliamida", "Seamless", "Compressão",
       "Básica", "Estampada", "Lisa", "Premium", "Nadador", "Recorte", "Ribana", "Zíper", "Bolso", "Transpassada"]
CORES = ["Preto", "Branco", "Rosa", "Rosa Pink", "Azul Marinho", "Azul Bebê", "Verde Militar", "Verde Menta", "Vermelho",
         "Vinho", "Bege", "Nude", "Cinza Mescla", "Cinza Chumbo", "Lilás", "Roxo", "Amarelo", "Laranja", "Coral", "Marrom",
         "Off White", "Grafite", "Terracota", "Mostarda", "Azul Royal", "Verde Água", "Preto e Branco", "Rosa de Prússia",
         "Caramelo", "Dourado"]
ROUPA = ["PP", "P", "M", "G", "GG", "XG", "XGG", "G1", "G2", "G3"]
CALCADO = [str(n) for n in range(33, 45)]
DUPLO = ["P/M", "M/G", "G/GG", "ÚNICO"]
MARCAS = ["Estresse Lab", "Estresse Lab", "Estresse Lab", None]
MATERIAIS = ["Poliamida", "Algodão", "Suplex", "Poliéster", "Elastano", "Dry Fit", None]
GENEROS = ["Feminino", "Feminino", "Feminino", "Masculino", "Unissex", None]
FORMAS = ["pix", "cartao", "dinheiro", "boleto", "transferencia", None]

N_FORNECEDORES = 45
N_CATEGORIAS = 28


def digitos(n):
    return "".join(random.choice("0123456789") for _ in range(n))


def nome_produto(i):
    r = random.random()
    base = f"{random.choice(BASES)} {random.choice(ADJ)}"
    if r < 0.03:  # nome comprido (limite do campo é 255)
        return (base + " " + "Edição Especial Coleção Verão Alto Verão Fitness ".strip() * 5)[:250] + f" {i}"
    if r < 0.06:
        return f"{base} Ação & Co. 100% \"Teste\" ({i})"
    return f"{base} {i:04d}"


def tipo_de_produto():
    r = random.random()
    if r < 0.12:
        return "simples"
    if r < 0.24:
        return "so_tamanho"
    if r < 0.34:
        return "so_cor"
    if r < 0.69:
        return "grade"
    if r < 0.77:
        return "calcado"
    if r < 0.85:
        return "plus"
    if r < 0.91:
        return "duplo_unico"
    if r < 0.96:
        return "grade_grande"
    return "extremo"


def variantes(tipo):
    cores = random.sample(CORES, 1)
    tams = [None]
    if tipo == "simples":
        cores, tams = [None], [None]
    elif tipo == "so_tamanho":
        cores, tams = [None], random.sample(ROUPA[:7], random.randint(2, 6))
    elif tipo == "so_cor":
        cores, tams = random.sample(CORES, random.randint(2, 6)), [None]
    elif tipo == "grade":
        cores, tams = random.sample(CORES, random.randint(2, 5)), random.sample(ROUPA[:7], random.randint(3, 6))
    elif tipo == "calcado":
        cores, tams = random.sample(CORES, random.randint(1, 3)), random.sample(CALCADO, random.randint(4, 8))
    elif tipo == "plus":
        cores, tams = random.sample(CORES, random.randint(1, 4)), random.sample(["XG", "XGG", "G1", "G2", "G3"], random.randint(2, 5))
    elif tipo == "duplo_unico":
        cores, tams = random.sample(CORES, random.randint(1, 3)), random.sample(DUPLO, random.randint(1, 3))
    elif tipo == "grade_grande":
        cores, tams = random.sample(CORES, random.randint(8, 12)), random.sample(ROUPA, random.randint(7, 10))
    elif tipo == "extremo":
        cores, tams = random.sample(CORES, random.randint(1, 3)), random.sample(ROUPA[:7], random.randint(1, 4))
    out = []
    custo_base = round(random.uniform(8, 120), 2)
    if tipo == "extremo":
        custo_base = random.choice([0.01, 0.5, 4999.99])
    for c in cores:
        for t in tams:
            custo = round(custo_base * random.uniform(0.95, 1.1), 2)
            preco = round(custo * random.uniform(1.8, 3.2), 2)
            qtd = random.choice([0, 1, 1, 2, 3, 5, 8, 12, 20]) if tipo != "extremo" else random.choice([1, 500, 9999])
            out.append({"size": t, "color": c, "price": preco, "cost_price": custo, "quantity": qtd})
    if all(v["quantity"] == 0 for v in out):
        out[0]["quantity"] = 1
    return out


# ---------------------------------------------------------------- fases
def preparar():
    forn = []
    for i in range(N_FORNECEDORES):
        doc = digitos(14) if i % 3 else (digitos(11) if i % 2 else None)
        r = chamar("fornecedor", "POST", "/suppliers", json={
            "name": f"Fornecedor Estresse {i + 1:02d} " + random.choice(["Brás", "Bom Retiro", "Goiânia", "Fortaleza", "Online"]),
            "cnpj": doc, "phone": "349" + digitos(8), "email": f"estresse{i + 1}@teste.com", "notes": "ESTRESSE"})
        if r:
            forn.append(r.json()["id"])
    cats = []
    for i in range(N_CATEGORIAS):
        pai = random.choice(cats) if cats and i > 8 and random.random() < 0.4 else None
        r = chamar("categoria", "POST", "/categories/", json={
            "name": f"Estresse {random.choice(BASES)} {i + 1}", "description": "ESTRESSE", **({"parent_id": pai} if pai else {})})
        if r:
            cats.append(r.json()["id"])
    return forn, cats


def corpo_produto(i, cats, forn):
    return {
        "product_name": nome_produto(i), "product_description": "Produto gerado para teste de carga." if i % 4 else None,
        "product_brand": random.choice(MARCAS), "product_category_id": random.choice(cats),
        "product_gender": random.choice(GENEROS), "product_material": random.choice(MATERIAIS),
        "base_price": round(random.uniform(19.9, 399.9), 2), "variants": variantes(tipo_de_produto()),
    }


def uma_entrada(n_entrada, indices, cats, forn):
    """Uma entrada com vários produtos: o primeiro cria a entrada, os outros entram nela (como no app)."""
    hoje = time.time()
    data = time.strftime("%Y-%m-%d", time.localtime(hoje - random.randint(0, 85) * 86400))
    forn_id = random.choice(forn)
    extra = [{"description": random.choice(["Frete", "Pedágio", "Almoço", "Estacionamento"]), "amount": round(random.uniform(10, 300), 2)}
             for _ in range(random.choice([0, 0, 1, 2]))]
    primeiro = corpo_produto(indices[0], cats, forn)
    corpo = {**primeiro, "supplier_id": forn_id, "entry_code": f"EST-{n_entrada:04d}", "entry_date": data,
             "entry_type": random.choice(["local", "online"]), "invoice_number": f"NF{digitos(6)}",
             "payment_method": random.choice(FORMAS), "discount_amount": random.choice([0, 0, 0, 10, 50, 120.5]),
             "notes": "ESTRESSE", "extra_costs": extra}
    r = chamar("entrada+produto novo (1o)", "POST", "/stock-entries/with-new-product-variants", json=corpo)
    if not r:
        return
    entry_id = r.json()["id"]
    n_var = len(primeiro["variants"])
    with lock:
        criados["entradas"] += 1
        criados["produtos"] += 1
        criados["variacoes"] += n_var
    for i in indices[1:]:
        p = corpo_produto(i, cats, forn)
        if random.random() < 0.25:
            p["supplier_id"] = random.choice(forn)  # produto de outro fornecedor dentro da mesma entrada
        r = chamar("produto novo numa entrada", "POST", f"/stock-entries/{entry_id}/with-new-product", json=p)
        if r:
            with lock:
                criados["produtos"] += 1
                criados["variacoes"] += len(p["variants"])
                feitos = criados["produtos"]
            if feitos % 100 == 0:
                print(f"  [{feitos}/{TOTAL}] produtos, {criados['variacoes']} variações, {criados['entradas']} entradas, "
                      f"{sum(erros.values())} erros", flush=True)


def reposicoes(cats, forn, quantas=150):
    """Compra de novo de produtos que já existem: camadas novas de custo no FIFO, vários itens por entrada."""
    import os
    import psycopg2
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg", "postgresql")
    with psycopg2.connect(url) as c, c.cursor() as cur:
        cur.execute("select v.id, v.product_id, v.cost_price from product_variants v join products p on p.id=v.product_id "
                    "where v.tenant_id=%s and p.brand='Estresse Lab' order by random() limit %s", (TENANT, quantas * 6))
        linhas = cur.fetchall()
    for e in range(quantas):
        itens = linhas[e * 6:(e + 1) * 6]
        if not itens:
            break
        corpo = {"entry_code": f"EST-REP-{e + 1:04d}", "entry_date": time.strftime("%Y-%m-%d"), "entry_type": "local",
                 "supplier_id": random.choice(forn), "invoice_number": f"NF{digitos(6)}", "notes": "ESTRESSE",
                 "discount_amount": random.choice([0, 0, 15]),
                 "items": [{"product_id": pid, "variant_id": vid, "quantity_received": random.randint(1, 15),
                            "unit_cost": round(float(cost or 20) * random.uniform(0.9, 1.25), 2)} for vid, pid, cost in itens]}
        if chamar("reposicao (entrada com varios itens)", "POST", "/stock-entries/", json=corpo):
            with lock:
                criados["entradas"] += 1


def leituras():
    print("\n--- leituras com a base cheia (5 chamadas cada) ---", flush=True)
    alvos = [("lista de produtos (50)", "/products?limit=50"), ("lista de produtos (1000)", "/products?limit=1000"),
             ("busca por nome", "/products?search=Legging&limit=50"), ("busca por marca", "/products?search=Estresse&limit=50"),
             ("com estoque", "/products?has_stock=true&limit=100"), ("estoque baixo", "/products/low-stock"),
             ("entradas", "/stock-entries?limit=50"), ("fornecedores", "/suppliers"), ("categorias", "/categories/"),
             ("dashboard vendas mes", "/dashboard/sales/monthly?period=this_month"),
             ("dashboard valor do estoque", "/dashboard/inventory/valuation")]
    for nome, url in alvos:
        for _ in range(5):
            chamar("LEITURA " + nome, "GET", url)


def relatorio():
    print("\n=========== RESULTADO ===========")
    print("criados:", criados)
    print("\ntempo por tipo de chamada (ms): n / mediana / p95 / maximo")
    for nome in sorted(tempos):
        t = sorted(tempos[nome])
        p95 = t[min(len(t) - 1, int(len(t) * 0.95))]
        print(f"  {nome:42s} {len(t):5d}  {statistics.median(t):8.0f}  {p95:8.0f}  {t[-1]:8.0f}")
    if erros:
        print("\nERROS:")
        for k, v in erros.most_common():
            print(f"  {v:5d}x {k}   ex.: {amostra_erro.get(k, '')[:200]}")
    else:
        print("\nsem erros")


if __name__ == "__main__":
    t0 = time.time()
    print(f"carga de teste: {TOTAL} produtos na loja {TENANT}", flush=True)
    forn, cats = preparar()
    print(f"fornecedores: {len(forn)}  categorias: {len(cats)}", flush=True)
    por_entrada = 20
    grupos = [list(range(i, min(i + por_entrada, TOTAL))) for i in range(0, TOTAL, por_entrada)]
    with ThreadPoolExecutor(WORKERS) as ex:
        list(ex.map(lambda ig: uma_entrada(ig[0] + 1, ig[1], cats, forn), enumerate(grupos)))
    print(f"cadastro terminou em {time.time() - t0:.0f}s", flush=True)
    reposicoes(cats, forn)
    leituras()
    relatorio()
    print(f"\ntempo total {time.time() - t0:.0f}s")
