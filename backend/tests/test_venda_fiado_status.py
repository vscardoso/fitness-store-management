"""Lista e tela da venda mostram o estado do fiado: a vencer, vencido ou pago (e quanto falta). Venda sem fiado fica sem estado."""
from datetime import date, timedelta

import pytest

from tests.test_fiado import _aberto, _cliente, _venda
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio


async def _lista(client, h, cid):
    r = await client.get("/api/v1/sales/", headers=h, params={"customer_id": cid})
    assert r.status_code == 200, r.text
    return {s["id"]: s for s in r.json()}


async def test_estado_do_fiado_na_lista_e_no_detalhe(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    r = await _venda(test_client, h, p, va, cid, [{"amount": "100.00", "payment_method": "on_account"}])
    assert r.status_code in (200, 201), r.text
    fiado_id = r.json()["id"]
    r = await _venda(test_client, h, p, va, cid, [{"amount": "100.00", "payment_method": "pix"}])
    assert r.status_code in (200, 201), r.text
    pix_id = r.json()["id"]

    lista = await _lista(test_client, h, cid)
    assert lista[fiado_id]["fiado_status"] == "open" and lista[fiado_id]["fiado_outstanding"] == 100.0
    assert lista[pix_id]["fiado_status"] is None and lista[pix_id]["fiado_outstanding"] is None

    # recebe 40: continua em aberto, faltam 60
    r = await test_client.post("/api/v1/receivables/receive", headers=h, json={"customer_id": cid, "amount": "40,00", "payment_method": "pix"})
    assert r.status_code == 200, r.text
    assert (await _lista(test_client, h, cid))[fiado_id]["fiado_outstanding"] == 60.0

    # recebe o resto: paga
    r = await test_client.post("/api/v1/receivables/receive", headers=h, json={"customer_id": cid, "amount": "60,00", "payment_method": "pix"})
    assert r.status_code == 200, r.text
    lista = await _lista(test_client, h, cid)
    assert lista[fiado_id]["fiado_status"] == "paid" and lista[fiado_id]["fiado_outstanding"] == 0.0
    det = await test_client.get(f"/api/v1/sales/{fiado_id}", headers=h)
    assert det.status_code == 200 and det.json()["fiado_status"] == "paid"


async def test_fiado_vencido_e_venda_devolvida_sem_estado(test_client, async_session, test_user):
    from sqlalchemy import select, update
    from app.models.receivable import Receivable
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    r = await _venda(test_client, h, p, va, cid, [{"amount": "100.00", "payment_method": "on_account"}])
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    await async_session.execute(update(Receivable).where(Receivable.sale_id == sale_id).values(due_date=date.today() - timedelta(days=3)))
    await async_session.commit()
    assert (await _lista(test_client, h, cid))[sale_id]["fiado_status"] == "overdue"

    # devolve a peça inteira: a parcela é abatida e cancelada, então a venda sai sem estado de fiado
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Devolução total", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text
    assert (await _lista(test_client, h, cid))[sale_id]["fiado_status"] is None


async def test_filtros_sugeridos_da_lista_de_vendas(test_client, async_session, test_user):
    """Chips da tela de vendas: fiado (pago, em aberto, vencido), forma de pagamento, devolvidas e sem cliente."""
    from sqlalchemy import update
    from app.models.receivable import Receivable
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)

    async def vender(cliente, forma, valor="100.00"):
        j = {"payment_method": forma, "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 1, "unit_price": "100.00"}],
             "payments": [{"amount": valor, "payment_method": forma}]}
        if cliente:
            j["customer_id"] = cliente
        r = await test_client.post("/api/v1/sales/", headers=h, json=j)
        assert r.status_code in (200, 201), r.text
        return r.json()["id"], r.json()["items"][0]["id"]

    aberto, _ = await vender(cid, "on_account")
    vencido, _ = await vender(cid, "on_account")
    pago, _ = await vender(cid, "on_account")
    pix, _ = await vender(cid, "pix")
    dinheiro_sem_cliente, _ = await vender(None, "cash")
    devolvida, item = await vender(cid, "pix")
    await async_session.execute(update(Receivable).where(Receivable.sale_id == vencido).values(due_date=date.today() - timedelta(days=2)))
    await async_session.commit()
    r = await test_client.post("/api/v1/receivables/receive", headers=h, json={"receivable_id": (await _aberto(test_client, h, cid))["items"][0]["id"], "amount": "100,00", "payment_method": "pix"})
    assert r.status_code == 200, r.text   # recebe a parcela mais antiga primeiro: a da venda "aberto"? confere abaixo
    r = await test_client.post(f"/api/v1/returns/{devolvida}", headers=h, json={"reason": "devolveu", "items": [{"sale_item_id": item, "quantity": 1}]})
    assert r.status_code == 201, r.text

    async def ids(**params):
        r = await test_client.get("/api/v1/sales/", headers=h, params=params)
        assert r.status_code == 200, r.text
        return {s["id"] for s in r.json()}

    todas = await ids()
    pagos = await ids(fiado="paid")
    abertos = await ids(fiado="open")
    vencidos = await ids(fiado="overdue")
    assert len(pagos) == 1 and pagos <= {aberto, vencido, pago}           # a parcela recebida
    assert pagos | abertos | vencidos == {aberto, vencido, pago}          # todo fiado cai em exatamente um estado
    assert not (pagos & abertos) and not (pagos & vencidos) and not (abertos & vencidos)
    assert vencido in vencidos or vencido in pagos
    assert await ids(payment="pix") == {pix, devolvida}
    assert await ids(payment="cash") == {dinheiro_sem_cliente}
    assert await ids(payment="on_account") == {aberto, vencido, pago}
    assert await ids(payment="card") == set()
    assert await ids(refunded="true") == {devolvida}
    assert await ids(no_customer="true") == {dinheiro_sem_cliente}
    assert await ids(payment="pix", refunded="true") == {devolvida}        # filtros se combinam
    assert await ids(fiado="paid", payment="pix") == set()
    assert (await test_client.get("/api/v1/sales/", headers=h, params={"fiado": "xx"})).status_code == 422
    assert todas >= {aberto, vencido, pago, pix, dinheiro_sem_cliente, devolvida}
