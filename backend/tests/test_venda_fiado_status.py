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
