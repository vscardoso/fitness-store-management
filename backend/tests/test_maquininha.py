"""Maquininha a receber: quando o cartão cai no banco (próximo dia útil) e o repasse com taxa opcional."""
from datetime import date, timedelta

import pytest

from app.core.timezone import today_brazil
from app.services.finance_service import card_expected_date
from tests.test_financeiro import _conta, _implantar, _pagar_com, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/finance"


def test_regra_do_dia_util():
    """Segunda a quinta cai no dia seguinte; sexta, sábado e domingo caem na segunda."""
    seg = date(2026, 11, 2)
    assert seg.weekday() == 0
    esperado = {0: 1, 1: 1, 2: 1, 3: 1, 4: 3, 5: 2, 6: 1}      # dias depois da venda
    for k in range(7):
        d = seg + timedelta(days=k)
        assert card_expected_date(d) == d + timedelta(days=esperado[k]), d
    assert card_expected_date(date(2026, 11, 6)) == date(2026, 11, 9)      # sexta -> segunda
    assert card_expected_date(date(2026, 11, 7)) == date(2026, 11, 9)      # sábado -> segunda
    assert card_expected_date(date(2026, 11, 8)) == date(2026, 11, 9)      # domingo -> segunda
    assert card_expected_date(date(2026, 11, 5)).weekday() == 4            # quinta -> sexta


async def _cartao(client, h):
    return (await client.get(f"{API}/card-schedule", headers=h)).json()


async def test_previsao_repasse_sem_taxa_e_com_taxa(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await test_client.get(f"{API}/card-schedule", headers=h)).json() is None        # sem Financeiro implantado
    assert (await _implantar(test_client, h)).status_code == 200                            # maquininha começa com R$ 300
    await _pagar_com(test_client, h, p, va, "credit_card", "100.00")
    await _pagar_com(test_client, h, p, vb, "debit_card", "50.00")

    c = await _cartao(test_client, h)
    hoje = today_brazil()
    assert c["balance"] == 450 and c["previous"] == 300 and "próximo dia útil" in c["rule"]
    assert len(c["items"]) == 1 and c["items"][0]["amount"] == 150
    assert c["items"][0]["expected_on"] == card_expected_date(hoje).isoformat()
    assert c["bank_name"] == "Nubank"

    # taxa repassada para a cliente: o que cai é igual ao das vendas, sem despesa
    r = await test_client.post(f"{API}/card-settlement", headers=h, json={"gross": "100.00", "received": "100.00"})
    assert r.status_code == 200 and r.json()["fee"] == 0, r.text
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Maquininha a receber")["balance"] == 350 and _conta(d, "Nubank")["balance"] == 1100
    c = d["card_schedule"]
    assert c["previous"] == 200 and c["items"][0]["amount"] == 150            # o repasse abate primeiro o saldo anterior

    # com diferença de R$ 10: vira a despesa "Taxa da maquininha" paga pela linha do cartão
    r = await test_client.post(f"{API}/card-settlement", headers=h, json={"gross": "250.00", "received": "240.00"})
    assert r.status_code == 200 and r.json()["fee"] == 10, r.text
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Maquininha a receber")["balance"] == 100 and _conta(d, "Nubank")["balance"] == 1340
    assert d["total"] == 1540                      # 1.400 de começo + R$ 150 de vendas - R$ 10 de taxa
    c = d["card_schedule"]
    assert c["previous"] == 0 and c["items"][0]["amount"] == 100

    despesas = (await test_client.get("/api/v1/expenses", headers=h, params={"limit": 50})).json()
    taxa = [x for x in despesas if x["description"] == "Taxa da maquininha"]
    assert len(taxa) == 1 and float(taxa[0]["amount"]) == 10
    resultado = (await test_client.get("/api/v1/expenses/resultado-mes", params={"year": hoje.year, "month": hoje.month}, headers=h)).json()
    assert any(c["category"] == "Taxa da maquininha" and float(c["total"]) == 10 for c in resultado["expenses_by_category"])


async def test_repasse_recusa_valor_errado_e_apagar_desfaz_a_taxa(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await _implantar(test_client, h)).status_code == 200
    ruim = [({"gross": "100", "received": "101"}, "maior"), ({"gross": "999999", "received": "999999"}, "só R$"),
            ({"gross": "0", "received": "0"}, "Valor"), ({"gross": "100", "received": "100", "occurred_on": "2000-01-01"}, "antes")]
    for corpo, trecho in ruim:
        r = await test_client.post(f"{API}/card-settlement", headers=h, json=corpo)
        assert r.status_code == 400 and trecho in r.json()["detail"], (corpo, r.text)
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Maquininha a receber")["balance"] == 300                   # nada foi gravado

    assert (await test_client.post(f"{API}/card-settlement", headers=h, json={"gross": "120", "received": "115"})).status_code == 200
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Maquininha a receber")["balance"] == 180
    tid = next(t["id"] for t in (await test_client.get(f"{API}/transfers", headers=h)).json() if t["description"] == "Repasse da maquininha")
    assert (await test_client.delete(f"{API}/transfers/{tid}", headers=h)).status_code == 200
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Maquininha a receber")["balance"] == 300 and _conta(d, "Nubank")["balance"] == 1000   # a taxa também voltou


async def test_gaveta_e_dinheiro_nao_entram_na_previsao_do_cartao(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await _implantar(test_client, h)).status_code == 200
    await _pagar_com(test_client, h, p, va, "cash", "100.00")
    await _pagar_com(test_client, h, p, vb, "pix", "50.00")
    c = await _cartao(test_client, h)
    assert c["balance"] == 300 and c["items"] == []
