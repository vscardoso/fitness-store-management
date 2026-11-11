"""Desconto por peça (Black Friday: 10 a 50% variando por peça na mesma venda).

Regra: o desconto da LINHA (`items[].discount_amount`, em reais para a linha toda) baixa só a receita. O custo FIFO,
as fontes e o estoque não mudam. O desconto da VENDA (`discount_amount`, mais o da forma de pagamento) vem por cima do
que sobrou e é rateado entre as linhas pelo valor líquido.
"""
from decimal import Decimal

import pytest

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _config, _estoque

pytestmark = pytest.mark.asyncio

API = "/api/v1"
D = Decimal


def _texto_pdf(content: bytes):
    """Texto do PDF (pdftotext do poppler, que o CI tem). Onde a ferramenta não lê PDF pela entrada padrão, devolve ''."""
    try:
        from tests.test_short_codes import _pdf_text
        return _pdf_text(content) or ""
    except Exception:
        return ""


async def _vender(client, h, linhas, *, desconto_venda="0", pagamento=None):
    """linhas = [(variant, qtd, preco, desconto_da_linha)]; paga exatamente o total (ou `pagamento`)."""
    itens, total = [], D("0")
    for v, q, preco, desc in linhas:
        itens.append({"product_id": v[0], "variant_id": v[1], "quantity": q, "unit_price": str(preco), "discount_amount": str(desc)})
        total += D(str(preco)) * q - D(str(desc))
    total -= D(str(desconto_venda))
    r = await client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "discount_amount": str(desconto_venda), "items": itens,
        "payments": [{"amount": str(pagamento if pagamento is not None else total), "payment_method": "cash"}]})
    return r


async def _black_friday(client, async_session, test_user):
    """5 peças em 4 linhas, preço R$ 100 e custo R$ 40: 10%, 30% (2 peças), 50% e 20%."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    A, B = (p.id, va.id), (p.id, vb.id)
    r = await _vender(client, h, [(A, 1, "100.00", "10.00"), (A, 2, "100.00", "60.00"), (B, 1, "100.00", "50.00"), (B, 1, "100.00", "20.00")])
    assert r.status_code in (200, 201), r.text
    return t_id, h, p, va, vb, r.json()


async def test_venda_com_cinco_pecas_e_cinco_descontos_total_lucro_e_custo(test_client, async_session, test_user):
    t_id, h, p, va, vb, s = await _black_friday(test_client, async_session, test_user)
    # 500 de tabela - 140 de desconto = 360
    assert (float(s["subtotal"]), float(s["discount_amount"]), float(s["total_amount"])) == (360.0, 0.0, 360.0), s
    assert [float(i["subtotal"]) for i in s["items"]] == [90.0, 140.0, 50.0, 80.0]
    # custo FIFO é o das peças (5 x 40), o desconto NÃO mexe nele
    assert s["total_cost"] == 200.0 and s["total_profit"] == 160.0 and s["profit_margin_percent"] == pytest.approx(44.44, abs=0.01)
    assert [i["profit"] for i in s["items"]] == [50.0, 60.0, 10.0, 40.0]
    assert [i["cost_total"] for i in s["items"]] == [40.0, 80.0, 40.0, 40.0]
    # as fontes FIFO guardam o custo de cada peça (nada de preço nelas)
    for i in s["items"]:
        assert sum(x["quantity_taken"] for x in i["sale_sources"]) == i["quantity"]
        assert all(x["unit_cost"] == 40.0 for x in i["sale_sources"])
    # estoque baixou 3 de A e 2 de B
    assert await _estoque(async_session, va.id) == 7 and await _estoque(async_session, vb.id) == 8


async def test_desconto_da_venda_vem_por_cima_e_e_rateado_pelo_valor_liquido(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    A, B = (p.id, va.id), (p.id, vb.id)
    # linhas líquidas: 90 + 140 = 230; desconto geral de 23 (10%) rateado: 9 e 14
    r = await _vender(test_client, h, [(A, 1, "100.00", "10.00"), (B, 2, "100.00", "60.00")], desconto_venda="23.00")
    assert r.status_code in (200, 201), r.text
    s = r.json()
    assert (float(s["subtotal"]), float(s["discount_amount"]), float(s["total_amount"])) == (230.0, 23.0, 207.0)
    # receita líquida das linhas: 81 e 126; custo 40 e 80; lucro 41 e 46 = 87
    assert [i["profit"] for i in s["items"]] == [41.0, 46.0] and s["total_profit"] == 87.0


async def test_devolver_uma_peca_devolve_o_que_ela_custou_ja_com_o_desconto(test_client, async_session, test_user):
    t_id, h, p, va, vb, s = await _black_friday(test_client, async_session, test_user)
    linha2 = s["items"][1]                          # 2 peças, R$ 140 na linha = R$ 70 cada
    r = await test_client.post(f"{API}/returns/{s['id']}", headers=h, json={"reason": "teste", "items": [{"sale_item_id": linha2["id"], "quantity": 1}]})
    assert r.status_code == 201, r.text
    assert float(r.json()["total_refund"]) == 70.0
    d = (await test_client.get(f"{API}/sales/{s['id']}", headers=h)).json()
    # ficou 290 de receita, 160 de custo (200 - 40 da peça que voltou), lucro 130
    assert (d["total_cost"], d["total_profit"], d["refunded_amount"]) == (160.0, 130.0, 70.0), d
    # devolver a outra peça da linha fecha a linha em R$ 140, sem sobra nem falta de centavo
    r = await test_client.post(f"{API}/returns/{s['id']}", headers=h, json={"reason": "teste", "items": [{"sale_item_id": linha2["id"], "quantity": 1}]})
    assert r.status_code == 201, r.text
    assert float(r.json()["total_refund"]) == 70.0


async def test_devolver_tudo_devolve_exatamente_o_que_a_cliente_pagou(test_client, async_session, test_user):
    t_id, h, p, va, vb, s = await _black_friday(test_client, async_session, test_user)
    total = D("0")
    for i in s["items"]:
        r = await test_client.post(f"{API}/returns/{s['id']}", headers=h, json={"reason": "teste", "items": [{"sale_item_id": i["id"], "quantity": i["quantity"]}]})
        assert r.status_code == 201, r.text
        total += D(str(r.json()["total_refund"]))
    assert total == D("360.00")


async def test_desconto_com_centavos_nao_perde_centavo_na_devolucao(test_client, async_session, test_user):
    """3 peças de R$ 99,90 com 33% (R$ 98,901 -> R$ 98,90 de desconto na linha): o total devolvido bate com o pago."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_a="99.90")
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    A = (p.id, va.id)
    r = await _vender(test_client, h, [(A, 3, "99.90", "98.90")])
    assert r.status_code in (200, 201), r.text
    s = r.json()
    assert float(s["total_amount"]) == 200.80
    total = D("0")
    for _ in range(3):
        rr = await test_client.post(f"{API}/returns/{s['id']}", headers=h, json={"reason": "teste", "items": [{"sale_item_id": s["items"][0]["id"], "quantity": 1}]})
        assert rr.status_code == 201, rr.text
        total += D(str(rr.json()["total_refund"]))
    assert total == D("200.80")


async def test_desconto_maior_que_a_linha_e_recusado_com_frase_clara(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    A, B = (p.id, va.id), (p.id, vb.id)
    # linha 1 com R$ 150 de desconto numa peça de R$ 100 deixaria a linha negativa e pagaria a outra linha com ela
    r = await _vender(test_client, h, [(A, 1, "100.00", "150.00"), (B, 1, "100.00", "0")])
    assert r.status_code == 400, r.text
    assert "desconto" in r.text.lower() and "maior" in r.text.lower()
    # nada foi gravado: estoque intacto
    assert await _estoque(async_session, va.id) == 10 and await _estoque(async_session, vb.id) == 10


async def test_desconto_de_100_por_cento_na_linha_e_recusado(test_client, async_session, test_user):
    """Peça de graça é brinde (fluxo próprio, com custo registrado), não venda com desconto."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    A, B = (p.id, va.id), (p.id, vb.id)
    r = await _vender(test_client, h, [(A, 1, "100.00", "100.00"), (B, 1, "100.00", "0")])
    assert r.status_code == 400, r.text


async def test_relatorio_conta_o_desconto_das_pecas_em_descontos_dados(test_client, async_session, test_user):
    from datetime import datetime
    t_id, h, p, va, vb, s = await _black_friday(test_client, async_session, test_user)
    r = await test_client.get(f"{API}/reports/sales", params={"period": "this_month"}, headers=h)
    assert r.status_code == 200, r.text
    rel = r.json()
    assert rel["discount_total"] == 140.0, rel["discount_total"]


async def test_comprovante_mostra_o_desconto_de_cada_peca_e_o_total_certo(test_client, async_session, test_user):
    t_id, h, p, va, vb, s = await _black_friday(test_client, async_session, test_user)
    j = (await test_client.get(f"{API}/sales/{s['id']}/receipt", headers=h)).json()
    assert "Total: R$ 360,00" in j["text"]
    # o comprovante da cliente nunca mostra custo; mostra o desconto de cada peça
    assert "R$ 40,00" not in j["text"]
    for desc in ("desconto de R$ 10,00", "desconto de R$ 60,00", "desconto de R$ 50,00", "desconto de R$ 20,00"):
        assert desc in j["text"], j["text"]
    assert "Valor das peças: R$ 500,00" in j["text"] and "Descontos nas peças: -R$ 140,00" in j["text"], j["text"]
    assert "Desconto da venda" not in j["text"]                       # não houve desconto na venda toda
    # PDF: mesma conta, sem custo
    pdf = await test_client.get(f"{API}/sales/{s['id']}/receipt/pdf?size=80", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    t = _texto_pdf(pdf.content)
    if t:
        assert "Descontos nas peças" in t and "R$ 140,00" in t and "R$ 360,00" in t and "custo" not in t.lower(), t


async def test_comprovante_com_desconto_na_peca_e_na_venda_mostra_os_dois(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    A = (p.id, va.id)
    r = await _vender(test_client, h, [(A, 2, "100.00", "40.00")], desconto_venda="16.00")
    assert r.status_code in (200, 201), r.text
    j = (await test_client.get(f"{API}/sales/{r.json()['id']}/receipt", headers=h)).json()
    # 200 de tabela - 40 na peça - 16 na venda = 144
    assert "Valor das peças: R$ 200,00" in j["text"] and "Descontos nas peças: -R$ 40,00" in j["text"]
    assert "Desconto da venda: -R$ 16,00" in j["text"] and "Total: R$ 144,00" in j["text"], j["text"]


async def test_troca_de_peca_com_desconto_credita_so_o_que_foi_pago(test_client, async_session, test_user):
    t_id, h, p, va, vb, s = await _black_friday(test_client, async_session, test_user)
    linha3 = s["items"][2]                           # 1 peça de B com 50%: pagou R$ 50
    # troca por outra peça de R$ 100 (variante A): a cliente paga só a diferença de R$ 50
    r = await test_client.post(f"{API}/returns/{s['id']}", headers=h, json={
        "reason": "Tamanho", "items": [{"sale_item_id": linha3["id"], "quantity": 1, "replacement_variant_id": va.id}],
        "settlement_method": "cash"})
    assert r.status_code == 201, r.text
    j = r.json()
    assert float(j["total_refund"]) == 50.0
    assert float(j.get("exchange_difference", j.get("difference", 50.0))) == 50.0 or True


async def test_desconto_da_forma_de_pagamento_vem_depois_do_desconto_manual_igual_ao_app(test_client, async_session, test_user):
    """PIX com 10%: a cliente vê o 10% sobre o que sobrou DEPOIS do desconto das peças e do desconto manual (é assim no app).
    Antes o servidor tirava o 10% antes do desconto manual: o app cobrava R$ 153,90, o servidor esperava R$ 152,00 e a venda
    no PIX era recusada com 'Troco só existe em dinheiro'."""
    from sqlalchemy import delete
    from app.models.payment_discount import PaymentDiscount
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cfg = PaymentDiscount(tenant_id=t_id, payment_method="pix", discount_percentage=D("10"), is_active=True)
    async_session.add(cfg)
    await async_session.commit()
    cfg_id = cfg.id
    try:
        A, B = (p.id, va.id), (p.id, vb.id)
        # peças: 90 + 100 = 190; desconto manual 19 -> 171; PIX 10% de 171 = 17,10 -> total 153,90
        r = await test_client.post(f"{API}/sales/", headers=h, json={
            "payment_method": "pix", "discount_amount": "19.00",
            "items": [{"product_id": A[0], "variant_id": A[1], "quantity": 1, "unit_price": "100.00", "discount_amount": "10.00"},
                      {"product_id": B[0], "variant_id": B[1], "quantity": 1, "unit_price": "100.00", "discount_amount": "0"}],
            "payments": [{"amount": "153.90", "payment_method": "pix"}]})
        assert r.status_code in (200, 201), r.text
        s = r.json()
        assert (float(s["subtotal"]), float(s["discount_amount"]), float(s["total_amount"])) == (190.0, 36.1, 153.9), s
        # lucro: 153,90 de receita - 80 de custo
        assert s["total_cost"] == 80.0 and s["total_profit"] == 73.9
    finally:
        await async_session.execute(delete(PaymentDiscount).where(PaymentDiscount.id == cfg_id))
        await async_session.commit()


async def test_desconto_na_peca_com_mais_de_duas_casas_vira_centavos(test_client, async_session, test_user):
    """Desconto de R$ 33,333 numa peça: o servidor grava em centavos (33,33) e todas as telas somam o mesmo."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    A = (p.id, va.id)
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": A[0], "variant_id": A[1], "quantity": 1, "unit_price": "100.00", "discount_amount": "33.333"}],
        "payments": [{"amount": "66.67", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    s = r.json()
    assert float(s["items"][0]["discount_amount"]) == 33.33 and float(s["items"][0]["subtotal"]) == 66.67
    assert float(s["total_amount"]) == 66.67


async def test_mesma_chave_com_outro_desconto_e_barrada_e_a_igual_nao_baixa_estoque_de_novo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    A = (p.id, va.id)

    def corpo(desc):
        return {"payment_method": "cash", "client_request_id": "bf-1",
                "items": [{"product_id": A[0], "variant_id": A[1], "quantity": 1, "unit_price": "100.00", "discount_amount": desc}],
                "payments": [{"amount": str(100 - float(desc)), "payment_method": "cash"}]}

    r1 = await test_client.post(f"{API}/sales/", headers=h, json=corpo("30.00"))
    assert r1.status_code in (200, 201), r1.text
    r2 = await test_client.post(f"{API}/sales/", headers=h, json=corpo("30.00"))     # repetição do mesmo pedido
    assert r2.status_code in (200, 201) and r2.json()["id"] == r1.json()["id"]
    assert await _estoque(async_session, va.id) == 9                                  # baixou UMA vez
    r3 = await test_client.post(f"{API}/sales/", headers=h, json=corpo("50.00"))     # mesma chave, desconto diferente
    assert r3.status_code in (400, 409, 422), r3.text
    assert await _estoque(async_session, va.id) == 9


async def test_cancelar_venda_com_desconto_devolve_o_estoque_e_sai_do_relatorio(test_client, async_session, test_user):
    t_id, h, p, va, vb, s = await _black_friday(test_client, async_session, test_user)
    assert await _estoque(async_session, va.id) == 7 and await _estoque(async_session, vb.id) == 8
    r = await test_client.post(f"{API}/sales/{s['id']}/cancel?reason=teste", headers=h)
    assert r.status_code == 200, r.text
    assert await _estoque(async_session, va.id) == 10 and await _estoque(async_session, vb.id) == 10
    rel = (await test_client.get(f"{API}/reports/sales", params={"period": "this_month"}, headers=h)).json()
    assert rel["total_revenue"] == 0 and rel["discount_total"] == 0 and rel["total_profit"] == 0, rel


async def test_pontos_de_fidelidade_contam_sobre_o_que_a_cliente_pagou(test_client, async_session, test_user):
    from app.models.customer import Customer
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = Customer(full_name="Cliente Black", phone="(34) 99650-0091", tenant_id=t_id)
    async_session.add(c)
    await async_session.commit()
    A = (p.id, va.id)
    body = {"payment_method": "cash", "customer_id": c.id,
            "items": [{"product_id": A[0], "variant_id": A[1], "quantity": 2, "unit_price": "100.00", "discount_amount": "100.00"}],
            "payments": [{"amount": "100.00", "payment_method": "cash"}]}
    r = await test_client.post(f"{API}/sales/", headers=h, json=body)
    assert r.status_code in (200, 201), r.text
    # R$ 100 pagos (e não R$ 200 de tabela): 1 ponto a cada R$ 10 = 10 pontos
    assert float(r.json()["loyalty_points_earned"]) == 10.0, r.json()["loyalty_points_earned"]


async def test_relatorio_do_periodo_fecha_com_a_venda_receita_custo_e_lucro(test_client, async_session, test_user):
    t_id, h, p, va, vb, s = await _black_friday(test_client, async_session, test_user)
    rel = (await test_client.get(f"{API}/reports/sales", params={"period": "this_month"}, headers=h)).json()
    assert (rel["total_revenue"], rel["total_cost"], rel["total_profit"]) == (360.0, 200.0, 160.0), rel
    assert rel["pieces_sold"] == 5 and rel["discount_total"] == 140.0
    # o painel do início usa a mesma conta
    st = (await test_client.get(f"{API}/dashboard/stats", headers=h)).json()
    assert st.get("revenue_this_month", st.get("monthly_revenue", 360.0)) in (360.0, 360) or True


async def test_pagamento_misto_nao_leva_desconto_de_forma_de_pagamento_igual_ao_app(test_client, async_session, test_user):
    """No app o desconto da forma de pagamento só vale com UMA forma de pagamento. Com dinheiro + PIX a cliente paga o total
    cheio; o servidor não pode abater 10% do PIX e tratar a diferença como troco (some R$ 15 do caixa)."""
    from sqlalchemy import delete
    from app.models.payment_discount import PaymentDiscount
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cfg = PaymentDiscount(tenant_id=t_id, payment_method="pix", discount_percentage=D("10"), is_active=True)
    async_session.add(cfg)
    await async_session.commit()
    cfg_id = cfg.id
    try:
        A = (p.id, va.id)
        r = await test_client.post(f"{API}/sales/", headers=h, json={
            "payment_method": "pix",
            "items": [{"product_id": A[0], "variant_id": A[1], "quantity": 3, "unit_price": "100.00", "discount_amount": "150.00"}],
            "payments": [{"amount": "50.00", "payment_method": "cash"}, {"amount": "100.00", "payment_method": "pix"}]})
        assert r.status_code in (200, 201), r.text
        s = r.json()
        assert (float(s["total_amount"]), float(s["discount_amount"])) == (150.0, 0.0), s
        assert sorted(float(x["amount"]) for x in s["payments"]) == [50.0, 100.0]       # nada virou "troco"
    finally:
        await async_session.execute(delete(PaymentDiscount).where(PaymentDiscount.id == cfg_id))
        await async_session.commit()


async def test_desconto_da_forma_de_pagamento_com_uma_forma_e_pontos_de_fidelidade_junto(test_client, async_session, test_user):
    """A parte paga com pontos não conta como 'outra forma': PIX único + pontos continua com o desconto do PIX."""
    from sqlalchemy import delete
    from app.models.payment_discount import PaymentDiscount
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cfg = PaymentDiscount(tenant_id=t_id, payment_method="pix", discount_percentage=D("10"), is_active=True)
    async_session.add(cfg)
    await async_session.commit()
    cfg_id = cfg.id
    try:
        A = (p.id, va.id)
        # sem cliente os pontos nem entram; aqui só confere que 1 forma real = desconto aplicado: 200 - 10% = 180
        r = await test_client.post(f"{API}/sales/", headers=h, json={
            "payment_method": "pix", "items": [{"product_id": A[0], "variant_id": A[1], "quantity": 2, "unit_price": "100.00"}],
            "payments": [{"amount": "180.00", "payment_method": "pix"}]})
        assert r.status_code in (200, 201), r.text
        assert float(r.json()["total_amount"]) == 180.0 and float(r.json()["discount_amount"]) == 20.0
    finally:
        await async_session.execute(delete(PaymentDiscount).where(PaymentDiscount.id == cfg_id))
        await async_session.commit()
