"""Compra de mercadoria sai da conta: a entrada diz de onde saiu o dinheiro (gaveta ou banco) e o saldo do Financeiro cai
sozinho, na hora, pelo que a mercadoria custou (peças x custo menos desconto). Frete tem a própria conta."""
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.stock_entry import StockEntry
from tests.test_financeiro import _conta, _implantar, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse: limpa a loja 1 depois de cada teste)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
FIN = "/api/v1/finance"
ENT = "/api/v1/stock-entries/"


async def _loja(client, db, user):
    """Loja 1 com o financeiro implantado hoje: gaveta 150, Nubank 1000 (recebe o PIX), sem contas a pagar."""
    t_id, h, p, va, vb = await _cenario(db, user)
    await _zerar_implantacao(db, t_id)
    d = (await _implantar(client, h, payables=[])).json()
    return h, p, va, vb, _conta(d, "Gaveta")["id"], _conta(d, "Nubank")["id"]


def _corpo(p, v, qtd=10, custo="10.00", **extra):
    base = {"entry_date": date.today().isoformat(), "supplier_name": "Fornecedor Teste", "entry_type": "local",
            "entry_code": f"COMPRA-{uuid.uuid4().hex[:6].upper()}",
            "items": [{"product_id": p.id, "variant_id": v.id, "quantity_received": qtd, "unit_cost": custo}]}
    base.update(extra)
    return base


async def _saldo(client, h, nome):
    return _conta((await client.get(f"{FIN}/accounts", headers=h)).json(), nome)


async def test_compra_com_conta_tira_o_dinheiro_na_hora_e_frete_nao_entra(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    # 10 x R$ 10 = 100, desconto do fornecedor 15, frete 25 (frete NÃO sai desta conta: tem a "Pago com" da despesa)
    r = await test_client.post(ENT, headers=h, json=_corpo(
        p, va, discount_amount="15.00", paid_account_id=nu, extra_costs=[{"description": "Frete", "amount": "25.00"}]))
    assert r.status_code == 201, r.text
    assert r.json()["paid_account_id"] == nu and r.json()["paid_outside"] is False
    n = await _saldo(test_client, h, "Nubank")
    assert n["breakdown"]["purchases_paid"] == 85.0 and n["balance"] == 1000.0 - 85.0
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 150.0            # as outras contas não mexem


async def test_compra_sem_conta_fica_na_lista_e_nao_mexe_no_saldo(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    base = (await test_client.get(f"{FIN}/purchases-pending", headers=h)).json()   # a loja de teste já tem entradas de hoje
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=20, custo="10.00"))     # 200, sem conta
    assert r.status_code == 201, r.text
    entry_id = r.json()["id"]
    d = (await test_client.get(f"{FIN}/accounts", headers=h)).json()
    assert _conta(d, "Nubank")["balance"] == 1000.0
    pend = d["purchases_pending"]
    assert pend["count"] == base["count"] + 1 and pend["total"] == base["total"] + 200.0
    assert entry_id in [e["id"] for e in pend["entries"]]

    async def _pend():
        j = (await test_client.get(f"{FIN}/purchases-pending", headers=h)).json()
        return j["count"], entry_id in [e["id"] for e in j["entries"]]

    # diz de onde saiu: o saldo cai e a compra some da lista
    r = await test_client.post(f"{FIN}/purchases-pay", headers=h, json={"entry_ids": [entry_id], "account_id": nu})
    assert r.status_code == 200, r.text
    assert _conta(r.json(), "Nubank")["balance"] == 800.0
    assert await _pend() == (base["count"], False)

    # desfaz (conta vazia): o dinheiro volta e a compra volta para a lista
    r = await test_client.post(f"{FIN}/purchases-pay", headers=h, json={"entry_ids": [entry_id], "account_id": None})
    assert _conta(r.json(), "Nubank")["balance"] == 1000.0
    assert await _pend() == (base["count"] + 1, True)

    # "paga por fora" (dinheiro pessoal): não tira de conta nenhuma e também sai da lista
    r = await test_client.post(f"{FIN}/purchases-pay", headers=h, json={"entry_ids": [entry_id], "outside": True})
    assert r.status_code == 200 and _conta(r.json(), "Nubank")["balance"] == 1000.0
    assert await _pend() == (base["count"], False)


async def test_gaveta_nao_fica_negativa_e_a_entrada_nao_e_gravada(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    antes = len((await async_session.execute(select(StockEntry.id))).all())
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=30, custo="10.00", paid_account_id=gaveta))  # 300 > 150
    assert r.status_code == 400 and "A gaveta tem R$ 150,00" in r.text and "R$ 300,00" in r.text, r.text
    async_session.expire_all()
    assert len((await async_session.execute(select(StockEntry.id))).all()) == antes      # nada ficou gravado
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 150.0
    # o que cabe na gaveta passa
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=5, custo="10.00", paid_account_id=gaveta))
    assert r.status_code == 201 and (await _saldo(test_client, h, "Gaveta"))["balance"] == 100.0
    # e corrigir uma compra já lançada para a gaveta, sem saldo, também é recusado
    r2 = await test_client.post(ENT, headers=h, json=_corpo(p, vb, qtd=30, custo="10.00"))
    r = await test_client.post(f"{FIN}/purchases-pay", headers=h, json={"entry_ids": [r2.json()["id"]], "account_id": gaveta})
    assert r.status_code == 400 and "A gaveta tem R$ 100,00 e esta compra custa R$ 300,00" in r.json()["detail"], r.text
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 100.0


async def test_so_gaveta_ou_banco_so_compra_e_so_depois_do_corte(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    d = (await test_client.get(f"{FIN}/accounts", headers=h)).json()
    maq = _conta(d, "Maquininha a receber")["id"]
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, paid_account_id=maq))
    assert r.status_code == 400 and "gaveta ou de um banco" in r.text
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, entry_type="initial", paid_account_id=nu))
    assert r.status_code == 400 and "Só compra de mercadoria" in r.text
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, paid_account_id=999999))
    assert r.status_code in (400, 404) and "Conta não encontrada" in r.text

    # compra de antes de começar a contar: o dinheiro já está no saldo de partida, então a conta é ignorada
    ontem = (date.today() - timedelta(days=3)).isoformat()
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, entry_date=ontem, paid_account_id=nu))
    assert r.status_code == 201 and r.json()["paid_account_id"] is None
    assert (await _saldo(test_client, h, "Nubank"))["balance"] == 1000.0
    r = await test_client.post(f"{FIN}/purchases-pay", headers=h, json={"entry_ids": [r.json()["id"]], "account_id": nu})
    assert r.status_code == 400 and "antes de o app começar a contar" in r.json()["detail"]
    antiga_id = (await async_session.execute(
        select(StockEntry.id).where(StockEntry.entry_date == date.today() - timedelta(days=3)))).scalars().first()
    ids = [e["id"] for e in (await test_client.get(f"{FIN}/purchases-pending", headers=h)).json()["entries"]]
    assert antiga_id is not None and antiga_id not in ids        # a compra de antes do corte nem entra na lista


async def test_corrigir_a_conta_pela_entrada_e_excluir_devolve_o_dinheiro(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=10, custo="10.00", paid_account_id=nu))
    entry_id = r.json()["id"]
    assert (await _saldo(test_client, h, "Nubank"))["balance"] == 900.0
    # troca para a gaveta (100 cabe nos 150) pela própria entrada
    r = await test_client.put(f"{ENT}{entry_id}", headers=h, json={"paid_account_id": gaveta})
    assert r.status_code == 200, r.text
    assert (await _saldo(test_client, h, "Nubank"))["balance"] == 1000.0 and (await _saldo(test_client, h, "Gaveta"))["balance"] == 50.0
    # null desfaz
    r = await test_client.put(f"{ENT}{entry_id}", headers=h, json={"paid_account_id": None})
    assert r.status_code == 200 and (await _saldo(test_client, h, "Gaveta"))["balance"] == 150.0
    # volta para o banco e exclui a compra: o dinheiro volta
    await test_client.put(f"{ENT}{entry_id}", headers=h, json={"paid_account_id": nu})
    assert (await _saldo(test_client, h, "Nubank"))["balance"] == 900.0
    r = await test_client.delete(f"{ENT}{entry_id}", headers=h)
    assert r.status_code in (200, 204), r.text
    assert (await _saldo(test_client, h, "Nubank"))["balance"] == 1000.0


async def test_recusa_ao_mudar_a_conta_pela_entrada_volta_400_e_nada_muda(test_client, async_session, test_user):
    """Achado no navegador: a rota de editar a entrada respondia 404 a qualquer ValueError, inclusive a recusa do Financeiro."""
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=30, custo="10.00"))     # 300, sem conta (gaveta tem 150)
    entry_id = r.json()["id"]
    r = await test_client.put(f"{ENT}{entry_id}", headers=h, json={"paid_account_id": gaveta})
    assert r.status_code == 400 and "A gaveta tem R$ 150,00 e esta compra custa R$ 300,00" in r.json()["detail"], r.text
    r = await test_client.put(f"{ENT}{entry_id}", headers=h, json={"paid_account_id": 999999})
    assert r.status_code == 404 and "Conta não encontrada" in r.json()["detail"]
    got = (await test_client.get(f"{ENT}{entry_id}", headers=h)).json()
    assert got["paid_account_id"] is None and (await _saldo(test_client, h, "Gaveta"))["balance"] == 150.0
    # mês fechado: recusa com 409 (a compra é de um mês já fechado)
    from app.models.finance import MonthClosing
    from sqlalchemy import update
    from app.models.stock_entry import StockEntry as SE
    hoje = date.today()
    tenant = (await async_session.execute(select(SE.tenant_id).where(SE.id == entry_id))).scalar_one()
    async_session.add(MonthClosing(tenant_id=tenant, year=hoje.year, month=hoje.month, expected_total=0, counted_total=0,
                                   difference=0, snapshot="{}", closed_at=__import__("datetime").datetime.utcnow()))
    await async_session.commit()
    r = await test_client.put(f"{ENT}{entry_id}", headers=h, json={"paid_account_id": nu})
    assert r.status_code == 409 and "já foi fechado" in r.json()["detail"], r.text


async def test_item_adicionado_depois_acompanha_o_valor_pago(test_client, async_session, test_user):
    """O valor que sai é calculado na hora pelos itens: lançar mais uma peça na mesma compra tira mais da mesma conta."""
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=10, custo="10.00", paid_account_id=nu))
    entry_id = r.json()["id"]
    r = await test_client.post(f"{ENT}{entry_id}/items", headers=h, json={
        "product_id": p.id, "variant_id": vb.id, "quantity_received": 4, "unit_cost": "25.00"})
    assert r.status_code in (200, 201), r.text
    assert (await _saldo(test_client, h, "Nubank"))["balance"] == 1000.0 - 100.0 - 100.0


async def test_mesma_conta_do_rateio_goods_paid_igual_base_menos_desconto(test_client, async_session, test_user):
    """O dinheiro que sai da conta usa a MESMA regra de desconto do custo por lote (geral + por fornecedor, com teto)."""
    from app.services import lot_cost_service
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    for desconto in ("0", "15.00", "999.00"):                       # o último passa da mercadoria: o teto vale
        r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=10, custo="10.00", discount_amount=desconto))
        entry_id = r.json()["id"]
        goods = (await lot_cost_service.goods_paid_by_entry(async_session, [entry_id]))[entry_id]
        rec = (await lot_cost_service.recompute_entries(async_session, [entry_id], dry_run=True))[entry_id]
        assert goods == (rec["base"] - rec["discount"]).quantize(Decimal("0.01"))
        assert Decimal("0") <= goods <= Decimal("100.00")
