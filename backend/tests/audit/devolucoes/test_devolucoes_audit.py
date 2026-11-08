"""Auditoria independente: devolução, troca e estorno.

O esperado é calculado AQUI (contas simples em Decimal), nunca lendo a regra do app. Compara com a API, o estoque
por variação, as fontes FIFO (sale_sources.quantity_returned) e a conta única do dinheiro (period_totals).
"""
from datetime import date
from decimal import Decimal as D

import pytest
from sqlalchemy import select

from app.services.money_ledger import period_totals
from tests.test_lot_costs import _limpa_loja_1, _lote  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _config, _estoque, _vender
from tests.test_short_codes import _user

pytestmark = pytest.mark.asyncio
API = "/api/v1"


@pytest.fixture(autouse=True)
async def _loja_padrao(async_session):
    yield
    await async_session.rollback()
    from sqlalchemy import update
    from app.models.store import Store
    await async_session.execute(update(Store).where(Store.id == 1).values(allow_money_refund=True, return_window_days=7))
    await async_session.commit()


# ───────────────────────── helpers ─────────────────────────

async def _dev(client, h, sale_id, itens, **extra):
    corpo = {"reason": "Teste de auditoria", "items": itens, **extra}
    return await client.post(f"{API}/returns/{sale_id}", headers=h, json=corpo)


async def _mes(db, t_id):
    db.expire_all()
    hoje = date.today()
    return await period_totals(db, t_id, hoje.replace(day=1), hoje)


async def _fontes(db, sale_item_id):
    from app.models.sale import SaleItem
    db.expire_all()
    it = (await db.execute(select(SaleItem).where(SaleItem.id == sale_item_id))).scalar_one()
    return it.sale_sources["sources"]


async def _status_venda(db, sale_id):
    from app.models.sale import Sale
    db.expire_all()
    s = (await db.execute(select(Sale).where(Sale.id == sale_id))).scalar_one()
    return str(getattr(s.status, "value", s.status)).lower().split(".")[-1]


async def _base_mes(db, t_id):
    t = await _mes(db, t_id)
    return t.revenue, t.cost, t.profit


# ───────────────────────── parcial e total ─────────────────────────

async def test_varias_devolucoes_parciais_ate_zerar_e_livro_liquido(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r0, c0, _ = await _base_mes(async_session, t_id)
    e0 = await _estoque(async_session, va.id)
    sale_id, item_id = await _vender(test_client, h, p, va, 5, "100.00")
    assert await _estoque(async_session, va.id) == e0 - 5

    # livro: receita 500, custo 5*40
    t = await _mes(async_session, t_id)
    assert (t.revenue - r0, t.cost - c0) == (D("500"), D("200"))

    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 2}])
    assert r.status_code == 201, r.text
    assert float(r.json()["total_refund"]) == 200.0
    assert await _status_venda(async_session, sale_id) == "partially_refunded"
    assert await _estoque(async_session, va.id) == e0 - 3
    t = await _mes(async_session, t_id)
    assert (t.revenue - r0, t.cost - c0) == (D("300"), D("120"))     # 500-200 ; 200-80

    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert r.status_code == 201 and float(r.json()["total_refund"]) == 100.0
    assert await _status_venda(async_session, sale_id) == "partially_refunded"

    # elegibilidade mostra o que resta (2) e o que já voltou (3)
    e = (await test_client.get(f"{API}/returns/eligibility/{sale_id}", headers=h)).json()
    assert e["is_eligible"] and e["items"][0]["quantity_available_for_return"] == 2
    assert e["items"][0]["quantity_already_returned"] == 3 and float(e["items"][0]["max_refund_amount"]) == 200.0

    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 2}])
    assert r.status_code == 201
    assert await _status_venda(async_session, sale_id) == "refunded"
    assert await _estoque(async_session, va.id) == e0                 # tudo voltou
    t = await _mes(async_session, t_id)
    assert (t.revenue - r0, t.cost - c0) == (D("0"), D("0"))

    # FIFO: nenhuma fonte devolveu mais do que tirou e a soma devolvida = 5
    f = await _fontes(async_session, item_id)
    assert sum(s["quantity_taken"] for s in f) == 5
    assert sum(s.get("quantity_returned", 0) for s in f) == 5
    assert all(0 <= s.get("quantity_returned", 0) <= s["quantity_taken"] for s in f)

    # histórico: 3 devoluções, soma 500
    h_ = (await test_client.get(f"{API}/returns/history/{sale_id}", headers=h)).json()
    assert len(h_) == 3 and sum(float(x["total_refund"]) for x in h_) == 500

    # depois de tudo devolvido: elegibilidade recusa com frase e nova devolução dá 400
    e = (await test_client.get(f"{API}/returns/eligibility/{sale_id}", headers=h)).json()
    assert e["is_eligible"] is False and e["reason"]
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert r.status_code == 400 and r.json()["detail"]


async def test_devolucao_vai_para_as_camadas_fifo_certas_em_duas_entradas(test_client, async_session, test_user):
    """Venda que consome 2 lotes (custos 40 e 60): devolver volta para a ÚLTIMA camada primeiro e o custo devolvido é o dela."""
    from app.models.entry_item import EntryItem
    from app.models.product_variant import ProductVariant
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    # lote A tem 10 a 40 (do cenário). Isola uma variação nova com 2 lotes
    from tests.test_lot_costs import _produto
    cat_id = await _cat(async_session, p.id)
    p2, v2 = await _produto(async_session, t_id, cat_id, "Fifo2", "100.00")
    await _lote(async_session, t_id, [(v2, p2, 3, 40)])
    await _lote(async_session, t_id, [(v2, p2, 3, 60)])
    await async_session.commit()
    v2_id, p2_id = v2.id, p2.id
    r0, c0, _ = await _base_mes(async_session, t_id)
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": p2_id, "variant_id": v2_id, "quantity": 4, "unit_price": "100.00"}],
        "payments": [{"amount": "400.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    t = await _mes(async_session, t_id)
    assert t.cost - c0 == D("3") * 40 + D("1") * 60                   # 180

    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 2}])
    assert r.status_code == 201, r.text
    # voltam 1 do lote de 60 e 1 do de 40 (a última camada primeiro): custo devolvido = 60 + 40
    t = await _mes(async_session, t_id)
    assert t.cost - c0 == D("180") - D("100")
    async_session.expire_all()
    itens = (await async_session.execute(select(EntryItem).where(EntryItem.variant_id == v2_id).order_by(EntryItem.id))).scalars().all()
    assert [i.quantity_remaining for i in itens] == [1, 3]
    # (lote 40: tinha 3, saíram 3, voltou 1 = 1 ; lote 60: tinha 3, saiu 1, voltou 1 ... = 3)
    f = await _fontes(async_session, item_id)
    assert sum(s.get("quantity_returned", 0) for s in f) == 2


async def _cat(db, product_id):
    from app.models.product import Product
    return (await db.execute(select(Product.category_id).where(Product.id == product_id))).scalar_one()


# ───────────────────────── defeito ─────────────────────────

async def test_defeito_nao_volta_ao_estoque_e_custo_fica_como_prejuizo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r0, c0, pr0 = await _base_mes(async_session, t_id)
    e0 = await _estoque(async_session, va.id)
    sale_id, item_id = await _vender(test_client, h, p, va, 2, "100.00")
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1, "restock": False}])
    assert r.status_code == 201, r.text
    assert await _estoque(async_session, va.id) == e0 - 2             # nada voltou
    t = await _mes(async_session, t_id)
    # receita 200-100 = 100 ; custo 80 (a peça com defeito continua custo) ; lucro 20
    assert (t.revenue - r0, t.cost - c0, t.profit - pr0) == (D("100"), D("80"), D("20"))
    f = await _fontes(async_session, item_id)
    assert sum(s.get("quantity_returned", 0) for s in f) == 0         # fonte não "devolveu"


# ───────────────────────── troca ─────────────────────────

async def test_troca_mais_cara_livro_e_pagamento_da_diferenca(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_b="130.00")
    r0, c0, _ = await _base_mes(async_session, t_id)
    t0 = await _mes(async_session, t_id)
    n0 = t0.sales_count
    sale_id, item_id = await _vender(test_client, h, p, va, 5, "100.00")
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id}],
                   settlement_method="credit_card")
    assert r.status_code == 201, r.text
    assert float(r.json()["net_amount"]) == 30.0
    t = await _mes(async_session, t_id)
    # receita: 500 + 130 (peça nova) - 100 (devolvida) = 530 ; custo 200 + 40 - 40 ; só 1 venda conta (troca não é venda)
    assert t.revenue - r0 == D("530") and t.cost - c0 == D("200")
    assert t.sales_count - n0 == 1


async def test_troca_mais_barata_devolve_diferenca_quando_loja_reembolsa(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_b="70.00")
    r0, c0, _ = await _base_mes(async_session, t_id)
    sale_id, item_id = await _vender(test_client, h, p, va, 2, "100.00")
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id}])
    assert r.status_code == 201, r.text
    assert float(r.json()["net_amount"]) == -30.0                       # loja devolve 30
    t = await _mes(async_session, t_id)
    assert t.revenue - r0 == D("200") + D("70") - D("100")


async def test_troca_com_preco_escolhido_na_hora(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 2, "100.00")
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 2, "replacement_variant_id": vb.id,
                                              "replacement_unit_price": "110.00"}])
    assert r.status_code == 201, r.text
    assert float(r.json()["net_amount"]) == 20.0                         # 2*110 - 2*100
    assert await _status_venda(async_session, sale_id) == "refunded"


async def test_duas_pecas_na_troca_nao_podem_passar_do_estoque_da_peca_nova(test_client, async_session, test_user):
    """Dois itens da venda trocados pela MESMA peça nova que só tem 1 em estoque: o app tem que recusar (4xx) sem gravar nada."""
    from app.models.product_variant import ProductVariant
    t_id, h, p, va, vb = await _cenario(async_session, test_user, stock_b=0)
    vc = ProductVariant(product_id=p.id, sku="AUD-VC-1", color="Rosa", size="G", price=D("100"), tenant_id=t_id)
    async_session.add(vc)
    await async_session.flush()
    await _lote(async_session, t_id, [(vc, p, 1, 40), (vb, p, 1, 40)])
    await async_session.commit()
    vc_id, vb_id = vc.id, vb.id
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 1, "unit_price": "100.00"},
                  {"product_id": p.id, "variant_id": vb_id, "quantity": 1, "unit_price": "100.00"}],
        "payments": [{"amount": "200.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    sale_id = r.json()["id"]
    ids = [i["id"] for i in r.json()["items"]]
    e_c = await _estoque(async_session, vc_id)
    assert e_c == 1
    # troca os dois itens pela variação vc (1 em estoque)
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": ids[0], "quantity": 1, "replacement_variant_id": vc_id},
                                             {"sale_item_id": ids[1], "quantity": 1, "replacement_variant_id": vc_id}])
    async_session.expire_all()
    assert r.status_code == 400, f"aceitou trocar 2 peças por uma peça nova que só tem 1 (estoque agora {await _estoque(async_session, vc_id)})"
    assert await _estoque(async_session, vc_id) >= 0


async def test_troca_por_variacao_inexistente_ou_de_outra_loja_e_recusada(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 2, "100.00")
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": 99999999}])
    assert r.status_code == 400 and "não foi encontrada" in r.json()["detail"]
    assert await _status_venda(async_session, sale_id) == "completed"


async def test_troca_forma_de_pagamento_invalida_e_422(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_b="130.00")
    sale_id, item_id = await _vender(test_client, h, p, va, 2, "100.00")
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id}],
                   settlement_method="bitcoin")
    assert r.status_code == 422


# ───────────────────────── erros ─────────────────────────

async def test_erros_de_validacao_sao_4xx_com_frase(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 3, "100.00")
    e0 = await _estoque(async_session, va.id)

    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 4}])
    assert r.status_code == 400 and "excede" in r.json()["detail"]
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": 99999999, "quantity": 1}])
    assert r.status_code == 400 and "não encontrado" in r.json()["detail"]
    assert (await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 0}])).status_code == 422
    assert (await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": -1}])).status_code == 422
    assert (await _dev(test_client, h, sale_id, [])).status_code == 422
    assert (await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={"items": [{"sale_item_id": item_id, "quantity": 1}]})).status_code == 422
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}], reason="x")
    assert r.status_code == 422
    r = await _dev(test_client, h, 99999999, [{"sale_item_id": item_id, "quantity": 1}])
    assert r.status_code == 400 and "não encontrada" in r.json()["detail"]
    assert (await test_client.post(f"{API}/returns/{sale_id}", json={})).status_code in (401, 403)
    assert (await test_client.get(f"{API}/returns/history/{sale_id}")).status_code in (401, 403)
    assert await _estoque(async_session, va.id) == e0
    h_ = (await test_client.get(f"{API}/returns/history/{sale_id}", headers=h)).json()
    assert h_ == []


async def test_mesmo_item_repetido_no_corpo_nao_pode_devolver_mais_que_o_vendido(test_client, async_session, test_user):
    """Venda de 5; corpo com o mesmo item duas vezes (3 + 3). Total 6 > 5 tem que ser recusado."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 5, "100.00")
    e0 = await _estoque(async_session, va.id)
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 3}, {"sale_item_id": item_id, "quantity": 3}])
    assert r.status_code == 400, f"aceitou devolver 6 de 5 (status {r.status_code})"
    assert await _estoque(async_session, va.id) == e0


async def test_item_repetido_com_defeito_nao_pode_passar_do_vendido(test_client, async_session, test_user):
    """Mesmo caso, mas as duas linhas são defeito (restock=false): não passa pela trava das fontes FIFO."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r0, c0, _ = await _base_mes(async_session, t_id)
    sale_id, item_id = await _vender(test_client, h, p, va, 5, "100.00")
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 3, "restock": False},
                                             {"sale_item_id": item_id, "quantity": 3, "restock": False}])
    t = await _mes(async_session, t_id)
    assert r.status_code == 400, f"devolveu 6 peças de uma venda de 5: reembolso {r.text[:120]} ; receita do mês {t.revenue - r0}"


async def test_item_de_outra_venda_no_corpo_e_recusado(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    s1, i1 = await _vender(test_client, h, p, va, 2, "100.00")
    s2, i2 = await _vender(test_client, h, p, va, 2, "100.00")
    r = await _dev(test_client, h, s1, [{"sale_item_id": i2, "quantity": 1}])
    assert r.status_code == 400
    assert await _status_venda(async_session, s2) == "completed"


async def test_devolucao_arredondamento_com_desconto_nunca_passa_do_que_foi_pago(test_client, async_session, test_user):
    """3 peças de 100, desconto de R$ 10 na venda (paga 290). Devolver uma a uma: a soma não pode passar de 290."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "discount_amount": "10.00",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 3, "unit_price": "100.00"}],
        "payments": [{"amount": "290.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    soma = D("0")
    for _ in range(3):
        d = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
        assert d.status_code == 201, d.text
        soma += D(str(d.json()["total_refund"]))
    assert soma == D("290.00"), f"devolveu R$ {soma} de uma venda que a cliente pagou R$ 290,00"


async def test_devolucao_total_de_uma_vez_com_desconto_devolve_exato(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r0, c0, _ = await _base_mes(async_session, t_id)
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "discount_amount": "50.00",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 2, "unit_price": "100.00"}],
        "payments": [{"amount": "150.00", "payment_method": "cash"}]})
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    d = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert float(d.json()["total_refund"]) == 75.0
    d = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert float(d.json()["total_refund"]) == 75.0
    t = await _mes(async_session, t_id)
    assert t.revenue - r0 == D("0")


# ───────────────────────── cancelar, status, outra loja ─────────────────────────

async def test_cancelar_venda_com_devolucao_e_recusado_e_devolver_venda_cancelada_tambem(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    s1, i1 = await _vender(test_client, h, p, va, 2, "100.00")
    assert (await _dev(test_client, h, s1, [{"sale_item_id": i1, "quantity": 1}])).status_code == 201
    r = await test_client.post(f"{API}/sales/{s1}/cancel", headers=h, params={"reason": "Engano total"})
    assert r.status_code == 400 and r.json()["detail"], r.text
    assert await _status_venda(async_session, s1) == "partially_refunded"

    s2, i2 = await _vender(test_client, h, p, va, 2, "100.00")
    e_antes = await _estoque(async_session, va.id)
    r = await test_client.post(f"{API}/sales/{s2}/cancel", headers=h, params={"reason": "Cliente desistiu"})
    assert r.status_code == 200, r.text
    assert await _estoque(async_session, va.id) == e_antes + 2
    r = await _dev(test_client, h, s2, [{"sale_item_id": i2, "quantity": 1}])
    assert r.status_code == 400 and "cancelada" in r.json()["detail"].lower()
    e = (await test_client.get(f"{API}/returns/eligibility/{s2}", headers=h)).json()
    assert e["is_eligible"] is False and "cancelada" in e["reason"].lower()
    assert await _estoque(async_session, va.id) == e_antes + 2        # só voltou uma vez


async def test_venda_devolvida_por_inteiro_nao_cancela(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    s, i = await _vender(test_client, h, p, va, 1, "100.00")
    assert (await _dev(test_client, h, s, [{"sale_item_id": i, "quantity": 1}])).status_code == 201
    e = await _estoque(async_session, va.id)
    r = await test_client.post(f"{API}/sales/{s}/cancel", headers=h, params={"reason": "Cancelar de novo"})
    assert r.status_code == 400
    assert await _estoque(async_session, va.id) == e                  # não voltou duas vezes


async def test_devolver_venda_de_outra_loja_e_negado(test_client, async_session, test_user):
    from tests.test_isolamento_fornecedores import _h, _sem_override
    from tests.test_team_limit import _nova_loja
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 2, "100.00")
    _sem_override()
    _, _, token_b = await _nova_loja(async_session, "pro")
    hb = _h(token_b)
    r = await _dev(test_client, hb, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert r.status_code in (400, 403, 404), r.text
    e = (await test_client.get(f"{API}/returns/eligibility/{sale_id}", headers=hb)).json()
    assert e["is_eligible"] is False and e["items"] == []
    hist = await test_client.get(f"{API}/returns/history/{sale_id}", headers=hb)
    assert hist.status_code in (200, 403, 404) and (hist.status_code != 200 or hist.json() == [])
    assert await _status_venda(async_session, sale_id) == "completed"


# ───────────────────────── papéis e estorno do admin ─────────────────────────

async def test_estorno_do_admin_papel_caixa_tambem_e_barrado_e_estorno_nao_exige_loja_com_reembolso(test_client, async_session, test_user):
    from app.models.user import UserRole
    t_id, admin, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=False)
    s, i = await _vender(test_client, admin, p, va, 1, "100.00")
    cx = await _user(async_session, t_id, UserRole.CASHIER)
    r = await _dev(test_client, cx, s, [{"sale_item_id": i, "quantity": 1}], is_correction=True)
    assert r.status_code == 403
    # elegibilidade com correção por caixa também
    assert (await test_client.get(f"{API}/returns/eligibility/{s}?correction=true", headers=cx)).status_code == 403
    # admin: ok mesmo sem reembolso na loja; elegibilidade sem correção diz que a loja só troca
    e = (await test_client.get(f"{API}/returns/eligibility/{s}", headers=admin)).json()
    assert e["allow_money_refund"] is False
    r = await _dev(test_client, admin, s, [{"sale_item_id": i, "quantity": 1}], is_correction=True)
    assert r.status_code == 201 and r.json()["reason"].startswith("Estorno por erro de lançamento: ")


async def test_gerente_e_vendedor_conseguem_devolver_dentro_do_prazo(test_client, async_session, test_user):
    from app.models.user import UserRole
    t_id, admin, p, va, vb = await _cenario(async_session, test_user)
    s, i = await _vender(test_client, admin, p, va, 3, "100.00")
    ger = await _user(async_session, t_id, UserRole.MANAGER)
    vend = await _user(async_session, t_id, UserRole.SELLER)
    for hh in (ger, vend):
        r = await _dev(test_client, hh, s, [{"sale_item_id": i, "quantity": 1}])
        assert r.status_code == 201, r.text


async def test_prazo_vencido_no_limite_do_dia(test_client, async_session, test_user):
    from datetime import datetime, timedelta, timezone
    from app.models.sale import Sale
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    s, i = await _vender(test_client, h, p, va, 2, "100.00")
    venda = (await async_session.execute(select(Sale).where(Sale.id == s))).scalar_one()
    venda.created_at = datetime.now(timezone.utc) - timedelta(days=6, hours=20)
    await async_session.commit()
    assert (await _dev(test_client, h, s, [{"sale_item_id": i, "quantity": 1}])).status_code == 201   # dentro dos 7 dias
    await _config(async_session, t_id, return_window_days=0)
    venda = (await async_session.execute(select(Sale).where(Sale.id == s))).scalar_one()
    venda.created_at = datetime.now(timezone.utc) - timedelta(days=2)
    await async_session.commit()
    r = await _dev(test_client, h, s, [{"sale_item_id": i, "quantity": 1}])
    assert r.status_code == 400 and "Prazo" in r.json()["detail"]


# ───────────────────────── cliente: total gasto, pontos, fiado ─────────────────────────

async def test_total_gasto_da_cliente_fica_liquido(test_client, async_session, test_user):
    from tests.test_fidelidade import _cliente, _venda
    from app.models.customer import Customer
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_b="130.00")
    c = await _cliente(async_session, t_id, "Cliente Gasto Audit")
    r = await _venda(test_client, h, p, va, 3, c.id)
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    async_session.expire_all()
    gasto0 = float((await async_session.execute(select(Customer.total_spent).where(Customer.id == c.id))).scalar_one())
    assert gasto0 == 300.0
    assert (await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])).status_code == 201
    async_session.expire_all()
    assert float((await async_session.execute(select(Customer.total_spent).where(Customer.id == c.id))).scalar_one()) == 200.0
    # troca: devolve 1 (100) e leva peça de 130: gasto = 200 - 100 + 130 = 230
    assert (await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id}])).status_code == 201
    async_session.expire_all()
    assert float((await async_session.execute(select(Customer.total_spent).where(Customer.id == c.id))).scalar_one()) == 230.0


async def test_pontos_ganhos_saem_proporcionais_na_devolucao_e_troca_da_pontos_da_peca_nova(test_client, async_session, test_user):
    from tests.test_fidelidade import _cliente, _saldo, _venda
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_b="130.00")
    c = await _cliente(async_session, t_id, "Cliente Pontos Audit")
    r = await _venda(test_client, h, p, va, 4, c.id)                     # R$ 400 -> 40 pontos
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    assert (await _saldo(test_client, h, c.id))["balance"] == 40.0
    assert (await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])).status_code == 201
    assert (await _saldo(test_client, h, c.id))["balance"] == 30.0       # -10
    # troca de 1 peça por uma de 130: tira 10 da devolvida e ganha 13 da nova
    assert (await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id}])).status_code == 201
    assert (await _saldo(test_client, h, c.id))["balance"] == 33.0


async def test_devolucao_de_compra_paga_com_pontos_devolve_os_pontos_usados(test_client, async_session, test_user):
    from tests.test_fidelidade import _cliente, _saldo, _venda
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = await _cliente(async_session, t_id, "Cliente Cashback Audit")
    await _venda(test_client, h, p, va, 4, c.id)                         # 40 pontos
    r = await _venda(test_client, h, p, va, 1, c.id, pagamentos=[
        {"amount": "4.00", "payment_method": "loyalty_points"}, {"amount": "96.00", "payment_method": "cash"}])
    assert r.status_code in (200, 201), r.text
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    s = await _saldo(test_client, h, c.id)
    assert s["balance"] == 9.6                                           # 40-40 + 9,6
    d = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert d.status_code == 201, d.text
    s = await _saldo(test_client, h, c.id)
    assert s["balance"] == 40.0, s                                      # voltaram 40 usados e saíram 9,6 ganhos


async def test_devolucao_de_venda_fiado_abate_o_que_a_cliente_deve(test_client, async_session, test_user):
    from datetime import timedelta
    from tests.test_fiado import _aberto, _cliente, _venda
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id, "Cliente Fiado Audit")
    first = date.today() + timedelta(days=7)
    r = await _venda(test_client, h, p, va, cid, [{"amount": "200.00", "payment_method": "on_account", "installments": 2,
                                                    "first_due_date": first.isoformat(), "interval_days": 7}], qtd=2)
    assert r.status_code in (200, 201), r.text
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 200.0
    d = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert d.status_code == 201, d.text
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 100.0
    d = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert d.status_code == 201
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 0.0


async def test_cancelar_venda_fiado_com_devolucao_e_recusado(test_client, async_session, test_user):
    from datetime import timedelta
    from tests.test_fiado import _cliente, _venda
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id, "Cliente Fiado Cancel")
    r = await _venda(test_client, h, p, va, cid, [{"amount": "200.00", "payment_method": "on_account", "installments": 1,
                                                    "first_due_date": (date.today() + timedelta(days=7)).isoformat(), "interval_days": 7}], qtd=2)
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    assert (await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])).status_code == 201
    r = await test_client.post(f"{API}/sales/{sale_id}/cancel", headers=h, params={"reason": "Cancelar depois"})
    assert r.status_code == 400


# ───────────────────────── vários itens ─────────────────────────

async def test_devolver_dois_itens_diferentes_de_uma_vez_e_estoque_por_variacao(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    ea, eb = await _estoque(async_session, va.id), await _estoque(async_session, vb.id)
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 2, "unit_price": "100.00"},
                  {"product_id": p.id, "variant_id": vb.id, "quantity": 3, "unit_price": "100.00"}],
        "payments": [{"amount": "500.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    sale_id = r.json()["id"]
    ia, ib = [i["id"] for i in r.json()["items"]]
    d = await _dev(test_client, h, sale_id, [{"sale_item_id": ia, "quantity": 1}, {"sale_item_id": ib, "quantity": 3}])
    assert d.status_code == 201, d.text
    assert float(d.json()["total_refund"]) == 400.0
    assert await _estoque(async_session, va.id) == ea - 2 + 1
    assert await _estoque(async_session, vb.id) == eb
    assert await _status_venda(async_session, sale_id) == "partially_refunded"
    d = await _dev(test_client, h, sale_id, [{"sale_item_id": ia, "quantity": 1}])
    assert d.status_code == 201
    assert await _status_venda(async_session, sale_id) == "refunded"


# ───────────────────────── B-05 e B-04 ─────────────────────────

async def test_defeito_marca_fonte(test_client, async_session, test_user):
    """restock=false grava quantity_defective na fonte FIFO; quantity_returned e estoque não mudam."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    e0 = await _estoque(async_session, va.id)
    sale_id, item_id = await _vender(test_client, h, p, va, 3, "100.00")
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 2, "restock": False}])
    assert r.status_code == 201, r.text
    f = await _fontes(async_session, item_id)
    assert sum(s.get("quantity_defective", 0) for s in f) == 2
    assert sum(s.get("quantity_returned", 0) for s in f) == 0
    assert await _estoque(async_session, va.id) == e0 - 3
    # a peça que sobrou volta ao estoque normalmente e não reaproveita a fonte do defeito
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert r.status_code == 201, r.text
    f = await _fontes(async_session, item_id)
    assert sum(s.get("quantity_defective", 0) for s in f) == 2 and sum(s.get("quantity_returned", 0) for s in f) == 1
    assert await _estoque(async_session, va.id) == e0 - 2


async def test_devolucao_com_desconto_no_item_estorna_o_pago_e_elegibilidade_bate(test_client, async_session, test_user):
    """2 x 100 com R$ 40 de desconto no item (pago 160): elegibilidade 160; devolver 1 = 80 e depois 1 = 80."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 2, "unit_price": "100.00", "discount_amount": "40.00"}],
        "payments": [{"amount": "160.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    el = (await test_client.get(f"{API}/returns/eligibility/{sale_id}", headers=h)).json()
    assert D(str(el["items"][0]["max_refund_amount"])) == D("160.00")
    for _ in range(2):
        d = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
        assert d.status_code == 201, d.text
        assert D(str(d.json()["total_refund"])) == D("80.00")


async def test_erro_interno_na_devolucao_nao_vaza_texto_tecnico(test_client, async_session, test_user, monkeypatch):
    from app.services.return_service import ReturnService

    async def _boom(*a, **k):
        raise RuntimeError('(sqlalchemy.exc.IntegrityError) duplicate key value violates unique constraint "x" SELECT * FROM sales')
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 2, "100.00")
    monkeypatch.setattr(ReturnService, "process_return", _boom)
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert r.status_code == 500
    d = r.json()["detail"]
    assert "SELECT" not in d and "sqlalchemy" not in d and "constraint" not in d, d
    monkeypatch.setattr(ReturnService, "check_eligibility", _boom)
    r = await test_client.get(f"{API}/returns/eligibility/{sale_id}", headers=h)
    assert r.status_code == 500 and "SELECT" not in r.json()["detail"]
