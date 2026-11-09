"""Repasse automático da maquininha: o cartão cai no próximo dia útil e o sistema lança o repasse sozinho (interruptor por loja)."""
from datetime import date, datetime, time, timedelta

import pytest
from sqlalchemy import update

from app.core.timezone import today_brazil
from app.models.sale import Payment
from app.models.store import Store
from app.services.finance_service import FinanceService, card_expected_date, run_card_auto_settlement
from tests.test_financeiro import _conta, _implantar, _pagar_com, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/finance"


@pytest.fixture(autouse=True)
async def _desliga_interruptor(async_session):
    """A loja 1 é reaproveitada entre testes: começa e termina com o repasse automático desligado."""
    async def _reset():
        await async_session.execute(update(Store).values(card_auto_settlement=False, card_auto_account_id=None, card_auto_through=None))
        await async_session.commit()
    await _reset()
    yield
    await _reset()


def _dia_de_venda(antes: int) -> date:
    """Um dia de semana segunda a quinta, `antes` dias atrás ou mais: o cartão dele cai no dia seguinte."""
    d = today_brazil() - timedelta(days=antes)
    while d.weekday() > 3:
        d -= timedelta(days=1)
    return d


async def _vender_no_dia(client, db, h, p, v, metodo, valor, dia):
    sale = await _pagar_com(client, h, p, v, metodo, valor)
    await db.execute(update(Payment).where(Payment.sale_id == sale["id"]).values(created_at=datetime.combine(dia, time(15, 0))))
    await db.commit()
    return sale


async def _cenario_cartao(test_client, async_session, test_user):
    """Financeiro implantado há 10 dias; duas vendas no cartão em dias diferentes (R$ 100 e R$ 50)."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    inicio = (today_brazil() - timedelta(days=10)).isoformat()
    assert (await _implantar(test_client, h, start_date=inicio)).status_code == 200
    d1 = _dia_de_venda(3)
    d2 = d1 - timedelta(days=1)
    while d2.weekday() > 3:
        d2 -= timedelta(days=1)
    await _vender_no_dia(test_client, async_session, h, p, va, "credit_card", "100.00", d1)
    await _vender_no_dia(test_client, async_session, h, p, vb, "debit_card", "50.00", d2)
    return t_id, h, d1, d2


async def _ligar(test_client, h, **extra):
    r = await test_client.put(f"{API}/card-auto", headers=h, json={"enabled": True, **extra})
    assert r.status_code == 200, r.text
    return r.json()


async def _transferencias(test_client, h, so_automaticas=True):
    ts = (await test_client.get(f"{API}/transfers", headers=h)).json()
    return [t for t in ts if (not so_automaticas or "automático" in t["description"].lower())]


async def test_ligar_e_desligar_o_interruptor(test_client, async_session, test_user):
    t_id, h, d1, d2 = await _cenario_cartao(test_client, async_session, test_user)
    c = (await test_client.get(f"{API}/card-schedule", headers=h)).json()
    assert c["auto"]["enabled"] is False and c["auto"]["run_hour"] == 12 and c["auto"]["bank_name"] == "Nubank"

    ligado = await _ligar(test_client, h)
    assert ligado["auto"]["enabled"] is True
    assert ligado["auto"]["through"] == (today_brazil() - timedelta(days=1)).isoformat()    # só dias a partir de hoje

    desligado = (await test_client.put(f"{API}/card-auto", headers=h, json={"enabled": False})).json()
    assert desligado["auto"]["enabled"] is False

    for ruim, trecho in (({}, "ligado ou desligado"), ({"enabled": "sim"}, "ligado ou desligado")):
        r = await test_client.put(f"{API}/card-auto", headers=h, json=ruim)
        assert r.status_code == 400 and trecho in r.json()["detail"], (ruim, r.text)
    gaveta = _conta((await test_client.get(f"{API}/accounts", headers=h)).json(), "Gaveta")["id"]
    r = await test_client.put(f"{API}/card-auto", headers=h, json={"enabled": True, "account_id": gaveta})
    assert r.status_code == 400 and "banco" in r.json()["detail"]


async def test_lanca_um_repasse_por_dia_e_nao_repete(test_client, async_session, test_user):
    t_id, h, d1, d2 = await _cenario_cartao(test_client, async_session, test_user)
    await _ligar(test_client, h)
    # simula o interruptor ligado desde antes das vendas (ao ligar, só valem os dias de hoje em diante)
    await async_session.execute(update(Store).where(Store.id == t_id).values(card_auto_through=d2 - timedelta(days=3)))
    await async_session.commit()

    r = await run_card_auto_settlement(async_session)
    assert r["stores"] >= 1 and r["settled"] == 2 and r["amount"] == 150, r

    ts = await _transferencias(test_client, h)
    assert sorted(t["amount"] for t in ts) == [50, 100]
    assert {t["occurred_on"] for t in ts} == {card_expected_date(d1).isoformat(), card_expected_date(d2).isoformat()}
    assert all(t["created_by_name"] == "Automático" for t in ts)
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Maquininha a receber")["balance"] == 300 and _conta(d, "Nubank")["balance"] == 1150
    assert d["card_schedule"]["items"] == []                       # nada mais a receber nos dias datados

    # rodar de novo não duplica
    r = await run_card_auto_settlement(async_session)
    assert r["settled"] == 0
    assert len(await _transferencias(test_client, h)) == 2

    # apagar um repasse automático (o dinheiro não caiu de verdade) NÃO o refaz sozinho
    apagar = next(t for t in ts if t["amount"] == 100)
    assert (await test_client.delete(f"{API}/transfers/{apagar['id']}", headers=h)).status_code == 200
    r = await run_card_auto_settlement(async_session)
    assert r["settled"] == 0 and len(await _transferencias(test_client, h)) == 1
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Maquininha a receber")["balance"] == 400     # voltou para a linha, esperando o repasse manual


async def test_interruptor_desligado_nao_lanca_nada(test_client, async_session, test_user):
    t_id, h, d1, d2 = await _cenario_cartao(test_client, async_session, test_user)
    await async_session.execute(update(Store).where(Store.id == t_id).values(card_auto_through=d2 - timedelta(days=3)))
    await async_session.commit()
    r = await run_card_auto_settlement(async_session)
    assert r["settled"] == 0
    assert await _transferencias(test_client, h) == []
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Maquininha a receber")["balance"] == 450


async def test_dia_de_hoje_so_depois_do_meio_dia(test_client, async_session, test_user):
    t_id, h, d1, d2 = await _cenario_cartao(test_client, async_session, test_user)
    await _ligar(test_client, h)
    esperado = card_expected_date(d1)
    await async_session.execute(update(Store).where(Store.id == t_id).values(card_auto_through=esperado - timedelta(days=1)))
    await async_session.commit()
    svc = FinanceService(async_session)
    # no dia esperado, de manhã: ainda não lança o do dia (o outro dia, anterior, já está atrasado e entra)
    de_manha = await svc.auto_settle_card(t_id, now=datetime.combine(esperado, time(9, 0)))
    assert de_manha["amount"] == 0.0 and (await _transferencias(test_client, h)) == []
    a_tarde = await svc.auto_settle_card(t_id, now=datetime.combine(esperado, time(12, 30)))
    assert a_tarde["settled"] == 1 and a_tarde["amount"] == 100.0, a_tarde
    assert (await svc.auto_settle_card(t_id, now=datetime.combine(esperado, time(18, 0))))["settled"] == 0


async def test_sem_financeiro_implantado_nao_faz_nada(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    await async_session.execute(update(Store).where(Store.id == t_id).values(card_auto_settlement=True))
    await async_session.commit()
    r = await run_card_auto_settlement(async_session)                # loja ligada mas sem financeiro: ignorada
    assert r["settled"] == 0
    r = await test_client.put(f"{API}/card-auto", headers=h, json={"enabled": True})
    assert r.status_code in (400, 409)


async def _auditoria(db, tenant_id, acao):
    import json
    from sqlalchemy import select
    from app.models.audit_log import AuditLog
    rows = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.action == acao).order_by(AuditLog.id))).scalars().all()
    return [(r, json.loads(r.detail) if r.detail else {}) for r in rows]


async def test_tudo_fica_registrado_e_rastreavel(test_client, async_session, test_user):
    """Ligar, cada repasse lançado, o resumo da rodada, o aviso de falha: tudo no histórico, com quem/quando/quanto."""
    t_id, h, d1, d2 = await _cenario_cartao(test_client, async_session, test_user)
    await _ligar(test_client, h)
    await async_session.execute(update(Store).where(Store.id == t_id).values(card_auto_through=d2 - timedelta(days=3)))
    await async_session.commit()
    await run_card_auto_settlement(async_session)

    # 1) quem ligou: registro próprio (e não uma linha genérica da rota por cima)
    (lig,) = await _auditoria(async_session, t_id, "FINANCE_CARD_AUTO_CHANGED")
    assert lig[0].user_id == test_user.id and lig[1]["enabled"] is True and lig[1]["banco"] == "Nubank"
    assert await _auditoria(async_session, t_id, "ROTA_PUT_FINANCE_CARD_AUTO") == []

    # 2) um registro por repasse lançado, ligado ao lançamento (entity_id), com valor, dia do cartão e banco
    ts = await _transferencias(test_client, h)
    regs = await _auditoria(async_session, t_id, "FINANCE_CARD_AUTO_TRANSFER")
    assert sorted(r[0].entity_id for r in regs) == sorted(t["id"] for t in ts)
    for r, det in regs:
        assert r.user_id is None and det["origem"] == "automatico" and det["para"] == "Nubank" and det["de"] == "Maquininha a receber"
        assert det["valor"] in (100.0, 50.0) and det["dia_do_cartao"] in (card_expected_date(d1).isoformat(), card_expected_date(d2).isoformat())

    # 3) resumo da rodada
    (res,) = await _auditoria(async_session, t_id, "FINANCE_CARD_AUTO_SETTLED")
    assert res[1]["repasses"] == 2 and res[1]["total"] == 150.0 and res[1]["banco"] == "Nubank" and res[1]["pulados"] == 0

    # 4) o lançamento diz que é automático e qual dia do cartão quitou
    assert all(t["is_auto"] is True and t["card_day"] for t in ts)

    # 5) o Histórico mostra, na categoria Dinheiro
    api = (await test_client.get("/api/v1/audit?category=dinheiro&limit=50", headers=h)).json()
    acoes = {i["action"] for i in api["items"]}
    assert {"FINANCE_CARD_AUTO_CHANGED", "FINANCE_CARD_AUTO_TRANSFER", "FINANCE_CARD_AUTO_SETTLED"} <= acoes

    # 6) falha de uma loja: não derruba as outras e fica registrada
    from app.services import finance_service as fs

    async def boom(self, tenant_id, now=None):
        raise RuntimeError("banco fora do ar")
    original = fs.FinanceService.auto_settle_card
    fs.FinanceService.auto_settle_card = boom
    try:
        r = await run_card_auto_settlement(async_session)
    finally:
        fs.FinanceService.auto_settle_card = original
    assert r["failed"] == 1
    (falha,) = await _auditoria(async_session, t_id, "FINANCE_CARD_AUTO_FAILED")
    assert "banco fora do ar" in falha[1]["erro"] and falha[1]["tipo"] == "RuntimeError"
