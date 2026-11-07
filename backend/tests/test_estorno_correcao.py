"""Estorno por erro de lançamento: só admin; vale fora do prazo e em loja que só troca peça; devolve o dinheiro e a peça volta."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_short_codes import _user
from tests.test_troca import _cenario, _config, _estoque, _vender

pytestmark = pytest.mark.asyncio


def _h(token_user_headers):
    return token_user_headers


async def _atrasar(db, sale_id, dias):
    from app.models.sale import Sale
    venda = (await db.execute(select(Sale).where(Sale.id == sale_id))).scalar_one()
    venda.created_at = datetime.now(timezone.utc) - timedelta(days=dias)
    await db.commit()


async def test_estorno_so_admin_fora_do_prazo_e_em_loja_que_so_troca(test_client, async_session, test_user):
    from app.models.user import UserRole
    t_id, admin, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=False, return_window_days=7)
    sale_id, item_id = await _vender(test_client, admin, p, va, 2, "100.00")
    antes = await _estoque(async_session, va.id)
    await _atrasar(async_session, sale_id, 30)                      # bem fora do prazo de 7 dias
    corpo = {"reason": "Lancei a peça errada", "items": [{"sale_item_id": item_id, "quantity": 1}]}

    # devolução comum: recusada (prazo vencido) para qualquer um
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=admin, json=corpo)
    assert r.status_code == 400 and "Prazo" in r.json()["detail"]

    # estorno: vendedor e gerente NÃO podem
    vend = await _user(async_session, t_id, UserRole.SELLER)
    ger = await _user(async_session, t_id, UserRole.MANAGER)
    for h in (vend, ger):
        r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={**corpo, "is_correction": True})
        assert r.status_code == 403 and "administrador" in r.json()["detail"]
        r = await test_client.get(f"/api/v1/returns/eligibility/{sale_id}?correction=true", headers=h)
        assert r.status_code == 403
    assert await _estoque(async_session, va.id) == antes             # nada mexeu

    # admin: a elegibilidade com correção ignora o prazo e libera o dinheiro
    e = (await test_client.get(f"/api/v1/returns/eligibility/{sale_id}?correction=true", headers=admin)).json()
    assert e["is_eligible"] is True and e["allow_money_refund"] is True
    e0 = (await test_client.get(f"/api/v1/returns/eligibility/{sale_id}", headers=admin)).json()
    assert e0["is_eligible"] is False                                # sem correção continua recusando

    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=admin, json={**corpo, "is_correction": True})
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["reason"].startswith("Estorno por erro de lançamento: ") and "Lancei a peça errada" in j["reason"]
    assert float(j["total_refund"]) == 100.0                         # devolveu o dinheiro da peça, sem trocar por outra
    assert await _estoque(async_session, va.id) == antes + 1         # a peça voltou ao estoque

    # fica registrado quem fez
    from app.models.audit_log import AuditLog
    reg = (await async_session.execute(select(AuditLog).where(AuditLog.action == "SALE_RETURN_CORRECTION"))).scalars().all()
    assert len(reg) == 1 and reg[0].entity_id == sale_id


async def test_estorno_nao_deixa_passar_do_que_foi_vendido_e_loja_comum_segue_igual(test_client, async_session, test_user):
    t_id, admin, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=False)
    sale_id, item_id = await _vender(test_client, admin, p, va, 1, "100.00")
    # devolução comum em loja que só troca continua recusando dinheiro (regra da loja intacta)
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=admin,
                               json={"reason": "não gostou", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 400
    # estorno de mais peças do que foram vendidas: recusado
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=admin, json={
        "reason": "erro", "is_correction": True, "items": [{"sale_item_id": item_id, "quantity": 2}]})
    assert r.status_code == 400 and "excede" in r.json()["detail"]
    # estorno do total: a venda fica devolvida e não aceita mais estorno
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=admin, json={
        "reason": "erro", "is_correction": True, "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=admin, json={
        "reason": "erro", "is_correction": True, "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 400
