"""Orçamento de consultas: nenhuma rota pode fazer mais consultas só porque a loja cresceu (detector de N+1).

Cada rota roda com poucos produtos e com bem mais produtos; a contagem de consultas ao banco não pode crescer
com o número de linhas e tem um teto absoluto. Premissa do app: ver docs/PLANO_DESEMPENHO.md.
Rota nova de lista/relatório nasce com sua linha em ROTAS.
"""
import itertools

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from tests.test_lot_costs import _loja_api, _limpa_loja_1  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio

_seq = itertools.count(1)
POUCOS, MUITOS = 3, 12
FOLGA = 2  # consultas a mais toleradas entre POUCOS e MUITOS (cache frio, paginação)

# (nome, rota, teto absoluto de consultas)
ROTAS = [
    ("lista de produtos", "/api/v1/products?limit=100", 12),
    ("busca de produtos", "/api/v1/products?search=Orcamento&limit=100", 12),
    ("produtos com estoque", "/api/v1/products?has_stock=true&limit=100", 14),
    ("estoque baixo", "/api/v1/products/low-stock", 14),
    ("fornecedores", "/api/v1/suppliers", 14),
    ("categorias", "/api/v1/categories/", 8),
    ("entradas", "/api/v1/stock-entries/?limit=50", 14),
    ("valor do estoque", "/api/v1/dashboard/inventory/valuation", 14),
    ("vendas do mes", "/api/v1/dashboard/sales/monthly?period=this_month", 14),
]


class _Contador:
    def __init__(self):
        self.n = 0
        self.ativo = False

    def __enter__(self):
        self.n, self.ativo = 0, True
        return self

    def __exit__(self, *a):
        self.ativo = False


@pytest.fixture
def contador():
    c = _Contador()

    @event.listens_for(Engine, "before_cursor_execute")
    def _conta(conn, cursor, statement, parameters, context, executemany):
        if c.ativo:
            c.n += 1

    yield c
    event.remove(Engine, "before_cursor_execute", _conta)


async def _cria_produtos(client, h, cat, quantos):
    ids = []
    for _ in range(quantos):
        n = next(_seq)
        r = await client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json={
            "product_name": f"Orcamento {n}", "product_category_id": cat, "base_price": 50, "supplier_name": f"Forn Orc {n % 4}",
            "variants": [{"size": s, "color": c, "price": 50, "cost_price": 20, "quantity": 2}
                         for s in ("P", "M") for c in ("Preto", "Rosa")],
            "entry_code": f"ORC-{n:05d}", "entry_type": "local", "entry_date": "2026-10-01"})
        assert r.status_code == 201, r.text
        ids.append(n)


async def _consultas(client, h, contador, url):
    with contador:
        r = await client.get(url, headers=h)
    assert r.status_code == 200, (url, r.status_code, r.text[:200])
    return contador.n


@pytest.mark.parametrize("nome,url,teto", ROTAS, ids=[r[0] for r in ROTAS])
async def test_rota_nao_faz_mais_consultas_com_mais_dados(nome, url, teto, test_client, async_session, test_user, contador):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    await _cria_produtos(test_client, h, cat, POUCOS)
    await _consultas(test_client, h, contador, url)            # aquece caches
    poucos = await _consultas(test_client, h, contador, url)
    await _cria_produtos(test_client, h, cat, MUITOS - POUCOS)
    muitos = await _consultas(test_client, h, contador, url)
    assert muitos <= poucos + FOLGA, f"{nome}: {poucos} consultas com {POUCOS} produtos e {muitos} com {MUITOS} (N+1)"
    assert muitos <= teto, f"{nome}: {muitos} consultas, teto {teto}"


async def test_detalhe_e_fornecedores_do_produto_nao_crescem(test_client, async_session, test_user, contador):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    await _cria_produtos(test_client, h, cat, POUCOS)
    pid = (await test_client.get("/api/v1/products?limit=1", headers=h)).json()[0]["id"]
    urls = [f"/api/v1/products/{pid}", f"/api/v1/products/{pid}/suppliers", f"/api/v1/product-variants/product/{pid}"]
    antes = {u: await _consultas(test_client, h, contador, u) for u in urls}
    await _cria_produtos(test_client, h, cat, MUITOS)
    for u in urls:
        depois = await _consultas(test_client, h, contador, u)
        assert depois <= antes[u] + FOLGA, f"{u}: {antes[u]} consultas antes e {depois} depois de entrar mais {MUITOS} produtos na loja"
        assert depois <= 14, f"{u}: {depois} consultas"
