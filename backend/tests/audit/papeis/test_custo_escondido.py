"""Caixa e vendedor nunca veem custo, lucro ou margem, em NENHUMA resposta de dinheiro.

Além de conferir as chaves conhecidas, varre os VALORES: a peça custa 40 e vende por 100 (3 peças: custo 120, lucro 180,
margem 60%). Se algum desses números aparecer sob QUALQUER nome de campo para caixa/vendedor, é vazamento com nome novo
que a regex do middleware não pegou.
"""
import pytest

from app.core.cost_mask import is_cost_key
from tests.test_troca import _cenario
from .conftest import quatro_papeis

pytestmark = pytest.mark.asyncio
API = "/api/v1"
VAZA = {40.0, 120.0, 180.0, 60.0}   # custo unit., custo total, lucro, margem % (3 x 100 - 3 x 40; 180/300)


def _anda(obj, caminho=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield f"{caminho}.{k}", k, v
            yield from _anda(v, f"{caminho}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _anda(v, f"{caminho}[{i}]")


def _suspeitos(corpo):
    """(caminho, valor) de custo conhecido não nulo OU de número que bate com custo/lucro/margem sob outro nome."""
    ruins = []
    for caminho, k, v in _anda(corpo):
        if is_cost_key(str(k)) and v is not None and not isinstance(v, (dict, list)):
            ruins.append((caminho, v, "chave de custo sem máscara"))
        elif isinstance(v, (int, float)) and not isinstance(v, bool) and float(v) in VAZA:
            ruins.append((caminho, v, "número igual a custo/lucro/margem sob outro nome"))
    return ruins


@pytest.fixture
async def mundo(async_session, test_user, test_client):
    t_id, h_admin, p, va, vb = await _cenario(async_session, test_user)
    h = await quatro_papeis(async_session, t_id, h_admin)
    cli = (await test_client.post(f"{API}/customers/", headers=h["admin"],
                                  json={"full_name": "Cliente Custo Audit", "phone": "34988887777"})).json()["id"]
    r = await test_client.post(f"{API}/sales/", headers=h["admin"], json={
        "customer_id": cli, "payment_method": "cash",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 3, "unit_price": "100.00"}],
        "payments": [{"amount": "300.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    venda = r.json()
    return {"h": h, "p": p, "va": va, "cli": cli, "sale": venda["id"], "num": venda["sale_number"], "item": venda["items"][0]["id"]}


async def test_sanidade_admin_ve_o_custo(test_client, mundo):
    """Sem isto o teste de vazamento não prova nada: o admin PRECISA ver o 40 em algum lugar da venda."""
    r = await test_client.get(f"{API}/sales/{mundo['sale']}", headers=mundo["h"]["admin"])
    assert r.status_code == 200
    assert any(v == 40.0 for _, _, v in _anda(r.json()) if isinstance(v, (int, float))), r.text[:600]
    assert _suspeitos(r.json()), "o detector precisa enxergar o custo na resposta do admin (senão não prova nada)"


@pytest.mark.parametrize("papel", ["cashier", "seller"])
async def test_nenhuma_resposta_de_leitura_vaza_custo(test_client, mundo, papel):
    m, h = mundo, mundo["h"][papel]
    rotas = [
        "/sales/", f"/sales/{m['sale']}", f"/sales/number/{m['num']}", "/sales/daily-total",
        f"/sales/{m['sale']}/receipt", f"/customers/{m['cli']}", f"/customers/{m['cli']}/purchases",
        f"/customers/{m['cli']}/loyalty", "/customers/", "/products/", f"/products/{m['p'].id}", "/products/grouped",
        f"/product-variants/product/{m['p'].id}", f"/product-variants/{m['va'].id}",
        "/cash/current", "/cash/reasons", "/receivables", "/receivables/summary", "/payment-discounts/",
        "/store/loyalty-settings", "/auth/me", "/looks/",
    ]
    if papel == "seller":
        rotas += [f"/returns/eligibility/{m['sale']}", f"/returns/history/{m['sale']}", f"/inventory/product/{m['p'].id}",
                  "/inventory/alerts", "/inventory/movements"]
    achados, c500, ok200 = [], [], 0
    for rota in rotas:
        r = await test_client.get(f"{API}{rota}", headers=h)
        ok200 += r.status_code == 200
        if r.status_code >= 500:
            c500.append(f"{rota} -> {r.status_code}")
        if r.status_code == 200 and r.headers.get("content-type", "").startswith("application/json"):
            achados += [(rota, *s) for s in _suspeitos(r.json())]
    assert c500 == [], c500
    assert achados == [], "\n".join(map(str, achados))


async def test_respostas_de_escrita_tambem_nao_vazam(test_client, mundo):
    """Venda criada pelo CAIXA e devolução feita pelo VENDEDOR devolvem o objeto novo: sem custo."""
    m = mundo
    r = await test_client.post(f"{API}/sales/", headers=m["h"]["cashier"], json={
        "payment_method": "cash",
        "items": [{"product_id": m["p"].id, "variant_id": m["va"].id, "quantity": 3, "unit_price": "100.00"}],
        "payments": [{"amount": "300.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    assert _suspeitos(r.json()) == [], _suspeitos(r.json())

    r = await test_client.post(f"{API}/returns/{m['sale']}", headers=m["h"]["seller"],
                               json={"reason": "Tamanho", "items": [{"sale_item_id": m["item"], "quantity": 1}]})
    assert r.status_code == 201, r.text
    assert _suspeitos(r.json()) == [], _suspeitos(r.json())
    # a venda depois da devolução (rentabilidade líquida) também não vaza
    r = await test_client.get(f"{API}/sales/{m['sale']}", headers=m["h"]["seller"])
    assert _suspeitos(r.json()) == [], _suspeitos(r.json())


@pytest.mark.parametrize("papel", ["cashier", "seller"])
async def test_rotas_de_gerente_continuam_fechadas_e_sem_custo_no_erro(test_client, mundo, papel):
    """O 403 não pode carregar custo nem dado de loja no corpo."""
    for rota in ("/reports/sales", "/dashboard/stats", "/expenses", "/finance/accounts", "/reports/monthly"):
        r = await test_client.get(f"{API}{rota}", headers=mundo["h"][papel])
        assert r.status_code == 403, (rota, r.status_code)
        assert set(r.json()) == {"detail"}, r.text
