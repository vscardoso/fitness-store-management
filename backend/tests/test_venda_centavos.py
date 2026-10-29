"""Venda em centavos: preço com mais de 2 casas, desconto por forma de pagamento e arredondamento do app.

Caso real (29/10/2026): venda no cartão em 10x com desconto; a tela mostrava R$ 2.847,44 e o servidor respondia
"O valor pago (R$ 2847.44) passa do total da venda (R$ 2847.44)", porque o total tinha milésimos escondidos.
"""
from decimal import Decimal

import pytest
from sqlalchemy import delete

from tests.test_estresse_cenarios import confere_conservacao
from tests.test_estresse_vendas_fifo import _cenario_30, _limpa_loja_1, _limpa_vendas  # noqa: F401

pytestmark = pytest.mark.asyncio
D = Decimal


def _corpo(p, v, preco, qtd, pagamentos, metodo="credit_card"):
    return {
        "payment_method": metodo,
        "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": str(preco)}],
        "payments": pagamentos,
    }


def _soma_pagamentos(venda):
    return sum(D(str(x["amount"])) for x in venda["payments"])


async def test_preco_com_milesimos_no_cartao_em_10x_nao_da_erro_de_troco(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    # o total escondido era 99,996: pagar R$ 100,00 "passava" por 0,004
    r = await test_client.post("/api/v1/sales/", headers=h, json=_corpo(
        p, va, "99.996", 1, [{"amount": "100.00", "payment_method": "credit_card", "installments": 10}]))
    assert r.status_code in (200, 201), r.text
    venda = r.json()
    assert D(str(venda["total_amount"])) == D("100.00")
    assert _soma_pagamentos(venda) == D("100.00")


async def test_desconto_da_forma_de_pagamento_com_fracao_fecha_no_centavo(test_client, async_session, test_user):
    from app.models.payment_discount import PaymentDiscount
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    cfg = PaymentDiscount(tenant_id=t_id, payment_method="credit_card", discount_percentage=D("7.5"), is_active=True)
    async_session.add(cfg)
    await async_session.commit()
    cfg_id = cfg.id
    # subtotal 3075,48 (3075,4795 arredondado); desconto 7,5% = 230,661 -> 230,66; total 2844,82
    r = await test_client.post("/api/v1/sales/", headers=h, json=_corpo(
        p, va, "3075.4795", 1, [{"amount": "2844.82", "payment_method": "credit_card", "installments": 10}]))
    assert r.status_code in (200, 201), r.text
    venda = r.json()
    assert D(str(venda["total_amount"])) == D("2844.82") and D(str(venda["discount_amount"])) == D("230.66")
    assert _soma_pagamentos(venda) == D("2844.82")
    # a configuração é da loja de teste compartilhada: remove para não contaminar os outros testes
    await async_session.execute(delete(PaymentDiscount).where(PaymentDiscount.id == cfg_id))
    await async_session.commit()


async def test_diferenca_de_um_centavo_e_arredondamento_dois_centavos_nao(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    url = "/api/v1/sales/"
    # 1 centavo a mais no cartão (ponto flutuante do app): aceita e grava exatamente o total
    r = await test_client.post(url, headers=h, json=_corpo(p, va, "100.00", 1, [{"amount": "100.01", "payment_method": "credit_card"}]))
    assert r.status_code in (200, 201), r.text
    assert _soma_pagamentos(r.json()) == D("100.00")
    # 1 centavo a menos: também é arredondamento
    r = await test_client.post(url, headers=h, json=_corpo(p, va, "100.00", 1, [{"amount": "99.99", "payment_method": "pix"}], metodo="pix"))
    assert r.status_code in (200, 201), r.text
    assert _soma_pagamentos(r.json()) == D("100.00")
    # 2 centavos a mais no cartão: troco só existe em dinheiro
    r = await test_client.post(url, headers=h, json=_corpo(p, va, "100.00", 1, [{"amount": "100.02", "payment_method": "credit_card"}]))
    assert r.status_code == 400 and "Troco só existe em dinheiro" in r.text
    # 2 centavos a menos: pagamento insuficiente
    r = await test_client.post(url, headers=h, json=_corpo(p, va, "100.00", 1, [{"amount": "99.98", "payment_method": "credit_card"}]))
    assert r.status_code == 400 and "insuficiente" in r.text.lower()
    # as recusas não baixaram estoque: só as 2 vendas aceitas saíram
    await confere_conservacao(async_session, [va.id])


async def test_troco_em_dinheiro_continua_funcionando(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    r = await test_client.post("/api/v1/sales/", headers=h, json=_corpo(
        p, va, "100.00", 1, [{"amount": "150.00", "payment_method": "cash"}], metodo="cash"))
    assert r.status_code in (200, 201), r.text
    assert _soma_pagamentos(r.json()) == D("100.00")   # grava o que ficou na loja, não o troco
