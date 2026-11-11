"""Relatório de vendas, 'Forma de pagamento': a venda de 2 métodos conta cada forma pelo valor que ela pagou.

Antes a venda inteira entrava só na forma principal: cartão 700 + PIX 228,34 aparecia como cartão 928,34 e o PIX sumia
(loja 2, 11/11/2026: cartão R$ 1.065,07 e PIX R$ 769,66 no painel, contra R$ 836,73 e R$ 998,00 no Financeiro)."""
import pytest

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1"


@pytest.fixture(autouse=True)
async def _limpa_vendas(async_session):
    from sqlalchemy import delete, func, select
    from app.models.sale import Payment, Sale, SaleItem
    modelos = [Payment, SaleItem, Sale]
    antes = {m: (await async_session.execute(select(func.coalesce(func.max(m.id), 0)))).scalar() for m in modelos}
    yield
    await async_session.rollback()
    for m in modelos:
        await async_session.execute(delete(m).where(m.id > antes[m]))
    await async_session.commit()


async def _vender(client, h, p, v, preco, pagamentos, forma_principal):
    r = await client.post(f"{API}/sales/", headers=h, json={
        "payment_method": forma_principal, "items": [{"product_id": p.id, "variant_id": v.id, "quantity": 1, "unit_price": str(preco)}],
        "payments": pagamentos})
    assert r.status_code in (200, 201), r.text


def _por_forma(rep):
    return {b["method"].lower(): b for b in rep["payment_breakdown"]}


async def test_venda_de_dois_metodos_conta_cada_forma_pelo_seu_valor(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    # cartão 700 em 6x + PIX 228,34 (a venda de 928,34 do dia 11/11)
    await _vender(test_client, h, p, va, "928.34", [
        {"amount": "700.00", "payment_method": "credit_card", "installments": 6},
        {"amount": "228.34", "payment_method": "pix"}], "credit_card")
    # venda comum em dinheiro e uma só em PIX
    await _vender(test_client, h, p, va, "100.00", [{"amount": "100.00", "payment_method": "cash"}], "cash")
    await _vender(test_client, h, p, vb, "50.00", [{"amount": "50.00", "payment_method": "pix"}], "pix")

    rep = (await test_client.get(f"{API}/reports/sales?period=this_month", headers=h)).json()
    f = _por_forma(rep)
    assert float(f["credit_card"]["total"]) == 700.00, f
    assert float(f["pix"]["total"]) == 278.34, f             # 228,34 da venda de 2 métodos + 50,00
    assert float(f["cash"]["total"]) == 100.00, f
    assert f["credit_card"]["count"] == 1 and f["pix"]["count"] == 2 and f["cash"]["count"] == 1
    # a soma das formas é o total vendido: nada some nem se repete
    assert round(sum(float(b["total"]) for b in rep["payment_breakdown"]), 2) == 1078.34
    assert round(sum(float(b["percentage"]) for b in rep["payment_breakdown"]), 1) == 100.0


async def test_venda_antiga_sem_pagamentos_gravados_usa_a_forma_principal(test_client, async_session, test_user):
    from sqlalchemy import delete
    from app.models.sale import Payment, Sale
    from sqlalchemy import select
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _vender(test_client, h, p, va, "80.00", [{"amount": "80.00", "payment_method": "pix"}], "pix")
    sale_id = (await async_session.execute(select(Sale.id).where(Sale.tenant_id == t_id).order_by(Sale.id.desc()))).scalars().first()
    await async_session.execute(delete(Payment).where(Payment.sale_id == sale_id))   # venda de antes dos pagamentos gravados
    await async_session.commit()
    rep = (await test_client.get(f"{API}/reports/sales?period=this_month", headers=h)).json()
    f = _por_forma(rep)
    assert float(f["pix"]["total"]) == 80.00 and f["pix"]["count"] == 1, f
