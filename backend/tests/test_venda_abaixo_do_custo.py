"""O sistema não vende abaixo do custo (regra do Victor, 18/11/2026).

Caso real: a Legging Ciclista saiu por R$ 36,00 com custo de R$ 40,00 (60% de desconto na peça). Agora a venda é recusada,
com o estoque, o caixa e os pontos intactos. 100% de desconto já era recusado (peça de graça é brinde). Vale também para o
desconto da venda inteira (manual ou da forma de pagamento, rateado entre as linhas) e para a peça nova de uma troca.
A mensagem não diz o custo: vendedor e caixa não podem ver custo.
"""
import itertools
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from tests.test_lot_costs import _limpa_loja_1, _loja_api, _lote, _produto  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
D = Decimal
_n = itertools.count(1)


# ---------- as contas puras ----------
async def test_rateio_do_desconto_da_venda_inteira_fecha_no_centavo():
    from app.services.price_floor import allocate_header_discount
    shares = allocate_header_discount([D("100.00"), D("50.00"), D("33.33")], D("10.00"))
    assert sum(shares) == D("10.00")
    assert shares[0] > shares[1] > shares[2] >= 0
    assert allocate_header_discount([D("10.00")], D("0")) == [D("0")]
    assert allocate_header_discount([], D("5")) == []
    assert allocate_header_discount([D("0.00")], D("5")) == [D("0")]


async def test_abaixo_do_custo_compara_o_valor_da_linha_toda_em_centavos():
    from app.services.price_floor import is_below_cost
    assert is_below_cost("36.00", "40.00") is True
    assert is_below_cost("39.99", "40.00") is True
    assert is_below_cost("40.00", "40.00") is False       # no custo ainda vende (lucro zero)
    assert is_below_cost("100.00", "99.996") is False     # custo médio com milésimos: compara em centavos (100,00 x 100,00)
    assert is_below_cost("10.00", "0") is False           # peça sem custo cadastrado não trava


async def test_mensagem_nao_revela_o_custo_e_diz_o_que_fazer():
    from app.services.price_floor import below_cost_message
    m = below_cost_message("Legging Ciclista", 1, D("36.00"), has_discount=True)
    assert "R$ 36,00" in m and "abaixo" in m and "custo" in m and "desconto" in m.lower()
    assert "40" not in m
    m2 = below_cost_message("Legging", 3, D("90.00"), has_discount=False)
    assert "3 peças" in m2 and "cadastro" in m2


# ---------- a venda ----------
async def _cenario(db, test_user, *, price="89.90", custo=40, qtd=10):
    t_id, token, cat = await _loja_api(db, test_user)
    p, v = await _produto(db, t_id, cat, f"Legging Piso {next(_n)}", price)
    await _lote(db, t_id, [(v, p, qtd, custo)])
    ids = [SimpleNamespace(id=x.id) for x in (p, v)]
    await db.commit()
    return t_id, {"Authorization": f"Bearer {token}"}, *ids


async def _vender(client, h, p, v, qtd, preco, desc=0, extra=None):
    liquido = D(str(preco)) * qtd - D(str(desc))
    body = {"payment_method": "cash",
            "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": str(preco), "discount_amount": str(desc)}],
            "payments": [{"amount": str(liquido), "payment_method": "cash"}]}
    if extra:
        body.update(extra)
        if "discount_amount" in extra:
            body["payments"][0]["amount"] = str(liquido - D(str(extra["discount_amount"])))
    return await client.post("/api/v1/sales/", headers=h, json=body)


async def _estoque(db, variant_id):
    from app.models.entry_item import EntryItem
    rows = (await db.execute(select(EntryItem).where(EntryItem.variant_id == variant_id))).scalars().all()
    return sum(r.quantity_remaining for r in rows)


async def _vendas(db, tenant_id):
    from app.models.sale import Sale
    return (await db.execute(select(func.count()).select_from(Sale).where(Sale.tenant_id == tenant_id))).scalar_one()


async def test_o_caso_real_legging_por_36_com_custo_40_e_recusado(test_client, async_session, test_user):
    t_id, h, p, v = await _cenario(async_session, test_user, price="89.90", custo=40)
    antes, n0 = await _estoque(async_session, v.id), await _vendas(async_session, t_id)
    r = await _vender(test_client, h, p, v, 1, "89.90", desc="53.90")      # 60% de desconto: sai por R$ 36,00
    assert r.status_code == 400, r.text
    msg = r.text
    assert "abaixo" in msg and "custo" in msg and "R$ 36,00" in msg
    assert "40,00" not in msg and "40.00" not in msg                        # a mensagem não conta quanto a peça custou
    async_session.expire_all()
    assert await _estoque(async_session, v.id) == antes                    # nada saiu do estoque
    assert await _vendas(async_session, t_id) == n0                        # nenhuma venda gravada


async def test_no_custo_vende_e_um_centavo_abaixo_nao(test_client, async_session, test_user):
    t_id, h, p, v = await _cenario(async_session, test_user, price="89.90", custo=40)
    r = await _vender(test_client, h, p, v, 1, "89.90", desc="49.91")      # sai por R$ 39,99
    assert r.status_code == 400, r.text
    r = await _vender(test_client, h, p, v, 1, "89.90", desc="49.90")      # sai por R$ 40,00 = custo: lucro zero, ainda vende
    assert r.status_code in (200, 201), r.text
    assert float(r.json()["total_profit"]) == 0.0


async def test_varias_pecas_a_conta_e_da_linha_toda(test_client, async_session, test_user):
    t_id, h, p, v = await _cenario(async_session, test_user, price="100.00", custo=40)
    # 3 peças: custo 120 no total. 3 x 100 com R$ 181 de desconto = R$ 119 (abaixo); com R$ 180 = R$ 120 (no custo)
    r = await _vender(test_client, h, p, v, 3, "100.00", desc="181.00")
    assert r.status_code == 400, r.text
    assert "3 peças" in r.text
    r = await _vender(test_client, h, p, v, 3, "100.00", desc="180.00")
    assert r.status_code in (200, 201), r.text


async def test_cem_por_cento_continua_recusado_e_manda_para_brindes(test_client, async_session, test_user):
    """Uma peça de graça (100%) numa venda que tem outra peça paga: o servidor recusa e manda usar Brindes."""
    t_id, token, cat = await _loja_api(async_session, test_user)
    pa, va = await _produto(async_session, t_id, cat, f"Piso Gratis {next(_n)}", "89.90")
    pb, vb = await _produto(async_session, t_id, cat, f"Piso Paga {next(_n)}", "50.00")
    await _lote(async_session, t_id, [(va, pa, 5, 40), (vb, pb, 5, 20)])
    ids = [SimpleNamespace(id=x.id) for x in (pa, va, pb, vb)]
    await async_session.commit()
    pa, va, pb, vb = ids
    r = await test_client.post("/api/v1/sales/", headers={"Authorization": f"Bearer {token}"}, json={
        "payment_method": "cash",
        "items": [{"product_id": pa.id, "variant_id": va.id, "quantity": 1, "unit_price": "89.90", "discount_amount": "89.90"},
                  {"product_id": pb.id, "variant_id": vb.id, "quantity": 1, "unit_price": "50.00"}],
        "payments": [{"amount": "50.00", "payment_method": "cash"}]})
    assert r.status_code == 400 and "Brindes" in r.text, r.text


async def test_desconto_da_venda_inteira_tambem_nao_leva_a_peca_para_baixo_do_custo(test_client, async_session, test_user):
    """Peça de R$ 60 (custo 40) com R$ 25 de desconto geral sai por R$ 35: recusa. Com R$ 20 sai por R$ 40: passa."""
    t_id, h, p, v = await _cenario(async_session, test_user, price="60.00", custo=40)
    r = await _vender(test_client, h, p, v, 1, "60.00", extra={"discount_amount": "25.00"})
    assert r.status_code == 400, r.text
    assert "abaixo" in r.text and "desconto" in r.text.lower()
    r = await _vender(test_client, h, p, v, 1, "60.00", extra={"discount_amount": "20.00"})
    assert r.status_code in (200, 201), r.text


async def test_desconto_geral_e_rateado_entre_as_linhas(test_client, async_session, test_user):
    """Duas peças na venda: A (R$ 100, custo 40) e B (R$ 50, custo 40). R$ 30 de desconto geral rateado por valor (20 em A, 10 em B)
    deixa B em R$ 40: no custo, passa. Com R$ 33 sobram R$ 38,90 em B (abaixo): a venda inteira é recusada."""
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    pa, va = await _produto(async_session, t_id, cat, f"Piso A {next(_n)}", "100.00")
    pb, vb = await _produto(async_session, t_id, cat, f"Piso B {next(_n)}", "50.00")
    await _lote(async_session, t_id, [(va, pa, 5, 40), (vb, pb, 5, 40)])
    ids = [SimpleNamespace(id=x.id) for x in (pa, va, pb, vb)]
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    pa, va, pb, vb = ids

    async def venda(desc):
        return await test_client.post("/api/v1/sales/", headers=h, json={
            "payment_method": "cash", "discount_amount": desc,
            "items": [{"product_id": pa.id, "variant_id": va.id, "quantity": 1, "unit_price": "100.00"},
                      {"product_id": pb.id, "variant_id": vb.id, "quantity": 1, "unit_price": "50.00"}],
            "payments": [{"amount": str(D("150.00") - D(desc)), "payment_method": "cash"}]})
    ea, eb = await _estoque(async_session, va.id), await _estoque(async_session, vb.id)
    r = await venda("33.00")
    assert r.status_code == 400, r.text
    async_session.expire_all()
    assert (await _estoque(async_session, va.id), await _estoque(async_session, vb.id)) == (ea, eb)   # tudo ou nada
    r = await venda("30.00")
    assert r.status_code in (200, 201), r.text


async def test_preco_de_tabela_abaixo_do_custo_sem_desconto_tambem_recusa_e_manda_conferir_o_cadastro(test_client, async_session, test_user):
    t_id, h, p, v = await _cenario(async_session, test_user, price="30.00", custo=40)
    r = await _vender(test_client, h, p, v, 1, "30.00")
    assert r.status_code == 400, r.text
    assert "cadastro" in r.text


async def test_venda_normal_com_desconto_acima_do_custo_continua_passando(test_client, async_session, test_user):
    t_id, h, p, v = await _cenario(async_session, test_user, price="89.90", custo=40)
    r = await _vender(test_client, h, p, v, 1, "89.90", desc="26.97")      # 30%: R$ 62,93
    assert r.status_code in (200, 201), r.text
    assert float(r.json()["total_amount"]) == 62.93


# ---------- a troca ----------
async def test_peca_nova_da_troca_abaixo_do_custo_e_recusada_e_nada_muda(test_client, async_session, test_user):
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    p, va = await _produto(async_session, t_id, cat, f"Troca Piso {next(_n)}", "100.00")
    vb = ProductVariant(product_id=p.id, sku=f"PISO-{next(_n)}-B", color="Azul", size="M", price=D("130.00"), tenant_id=t_id)
    async_session.add(vb)
    await async_session.flush()
    await _lote(async_session, t_id, [(va, p, 10, 40), (vb, p, 10, 40)])
    ids = [SimpleNamespace(id=x.id) for x in (p, va, vb)]
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    p, va, vb = ids
    r = await _vender(test_client, h, p, va, 1, "100.00")
    assert r.status_code in (200, 201), r.text
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    ea, eb = await _estoque(async_session, va.id), await _estoque(async_session, vb.id)
    item = {"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id, "replacement_unit_price": "35.00"}
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={"reason": "Quis outra cor", "settlement_method": "cash", "items": [item]})
    assert r.status_code == 400, r.text
    assert "abaixo" in r.text and "custo" in r.text and "40,00" not in r.text
    async_session.expire_all()
    assert (await _estoque(async_session, va.id), await _estoque(async_session, vb.id)) == (ea, eb)   # nada voltou nem saiu
    item["replacement_unit_price"] = "40.00"                                                          # no custo: passa
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={"reason": "Quis outra cor", "settlement_method": "cash", "items": [item]})
    assert r.status_code == 201, r.text


async def test_mensagem_do_desconto_geral_nao_fala_de_desconto_na_peca():
    """Caso real (23/11/2026): 50% de desconto geral numa venda de 3 peças; a recusa soava como desconto naquela peça."""
    from app.services.price_floor import below_cost_message
    m = below_cost_message("Conjunto Short Top", 1, D("64.95"), has_discount=True, general_discount=D("199.85"))
    assert m.startswith("Com o desconto geral de R$ 199,85")
    assert "R$ 64,95" in m and m.endswith("Diminua o desconto geral.")
    m2 = below_cost_message("Conjunto", 1, D("64.95"), has_discount=True, general_discount=D("50"), piece_discount=True)
    assert "desta peça ou o desconto geral" in m2


async def test_venda_recusada_pelo_desconto_geral_explica_o_desconto_geral(test_client, async_session, test_user):
    _t, h, p, v = await _cenario(async_session, test_user)
    r = await _vender(test_client, h, p, v, 1, "89.90", extra={"discount_amount": "60.00"})
    assert r.status_code == 400, r.text
    assert "desconto geral" in r.text
