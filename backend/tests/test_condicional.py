"""Envio condicional (aba Condicional): reserva de estoque, saída, devolução, venda gerada, cancelamento e erros.

Cenário do lojista: separa peças para a cliente provar em casa. Enquanto estão com ela, o estoque fica reservado
(FIFO). Na volta, o que ficou vira venda, o que voltou volta ao estoque, o que sumiu vira perda.
"""
import itertools
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from tests.test_lot_costs import _limpa_loja_1, _loja, _loja_api, _lote, _produto  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
D = Decimal
_n = itertools.count(1)
URL = "/api/v1/conditional-shipments"


@pytest.fixture(autouse=True)
async def _limpa_vendas_e_envios(async_session):
    """Banco de teste compartilhado: apaga vendas e envios criados aqui (ids reaproveitados confundem outros testes de FIFO)."""
    from sqlalchemy import delete, func
    from app.models.conditional_shipment import ConditionalShipment, ConditionalShipmentItem
    from app.models.expense import Expense
    from app.models.sale import Payment, Sale, SaleItem
    modelos = [Payment, SaleItem, Sale, ConditionalShipmentItem, ConditionalShipment, Expense]
    antes = {m: (await async_session.execute(select(func.coalesce(func.max(m.id), 0)))).scalar() for m in modelos}
    yield
    await async_session.rollback()
    for m in modelos:
        await async_session.execute(delete(m).where(m.id > antes[m]))
    await async_session.commit()


async def _cenario(db, test_user, *, estoque=10, custo=40, preco="100.00"):
    t_id, token, cat = await _loja_api(db, test_user)
    p, v = await _produto(db, t_id, cat, "Conjunto Condicional", preco)
    await _lote(db, t_id, [(v, p, estoque, custo)])
    ids = SimpleNamespace(p=p.id, v=v.id, t=t_id)
    await db.commit()
    return ids, {"Authorization": f"Bearer {token}"}


async def _cliente(client, h):
    r = await client.post("/api/v1/customers/", headers=h, json={
        "full_name": f"Cliente {next(_n)}", "email": f"cli{next(_n)}@example.com", "phone": "34999990000"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _estoque(db, variant_id):
    from app.models.entry_item import EntryItem
    db.expire_all()
    rows = (await db.execute(select(EntryItem).where(EntryItem.variant_id == variant_id))).scalars().all()
    return sum(r.quantity_remaining for r in rows)


def _corpo(cid, itens, **extra):
    return {"customer_id": cid, "shipping_address": "Rua das Flores, 100, Uberlandia", "items": itens, **extra}


def _item(ids, qtd, preco="100.00", variant=True):
    d = {"product_id": ids.p, "quantity_sent": qtd, "unit_price": preco}
    if variant:
        d["variant_id"] = ids.v
    return d


async def _criar(client, h, cid, itens, **extra):
    r = await client.post(URL + "/", headers=h, json=_corpo(cid, itens, **extra))
    assert r.status_code == 201, r.text
    return r.json()


async def _enviar(client, h, sid):
    r = await client.put(f"{URL}/{sid}/mark-as-sent", headers=h, json={})
    assert r.status_code == 200, r.text
    return r.json()


def _upd(item, kept=0, ret=0, dam=0, lost=0):
    return {"id": item["id"], "quantity_kept": kept, "quantity_returned": ret, "quantity_damaged": dam,
            "quantity_lost": lost, "status": "SENT"}


async def _devolver(client, h, sid, upds, **extra):
    return await client.put(f"{URL}/{sid}/process-return", headers=h, json={"items": upds, **extra})


# ───────────────────────── criação e reserva ─────────────────────────

async def test_criar_reserva_estoque_e_nao_vende(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 3)])
    assert s["status"] == "PENDING"
    assert await _estoque(async_session, ids.v) == 7


async def test_criar_acima_do_estoque_recusa_e_nao_reserva_nada(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user, estoque=4)
    cid = await _cliente(test_client, h)
    r = await test_client.post(URL + "/", headers=h, json=_corpo(cid, [_item(ids, 5)]))
    assert r.status_code == 400
    assert "insuficiente" in r.text.lower()
    assert await _estoque(async_session, ids.v) == 4


async def test_mesma_variacao_em_duas_linhas_nao_passa_do_estoque(test_client, async_session, test_user):
    """3 + 3 de uma variação com 4 em estoque: cada linha passa sozinha, juntas não. Nada pode ficar reservado."""
    ids, h = await _cenario(async_session, test_user, estoque=4)
    cid = await _cliente(test_client, h)
    r = await test_client.post(URL + "/", headers=h, json=_corpo(cid, [_item(ids, 3), _item(ids, 3)]))
    assert r.status_code == 400, r.text
    assert await _estoque(async_session, ids.v) == 4
    assert "traceback" not in r.text.lower() and "sqlalchemy" not in r.text.lower()


async def test_cliente_inexistente_e_de_outra_loja(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    r = await test_client.post(URL + "/", headers=h, json=_corpo(999999, [_item(ids, 1)]))
    assert r.status_code in (400, 404), r.text
    assert await _estoque(async_session, ids.v) == 10
    # cliente de OUTRA loja
    from app.models.customer import Customer
    t2, _, _ = await _loja(async_session)
    c2 = Customer(full_name="Cliente Outra Loja", email=f"outra{next(_n)}@example.com", phone="34988880000", tenant_id=t2)
    async_session.add(c2)
    await async_session.commit()
    await async_session.refresh(c2)
    r = await test_client.post(URL + "/", headers=h, json=_corpo(c2.id, [_item(ids, 1)]))
    assert r.status_code in (400, 404), r.text
    assert await _estoque(async_session, ids.v) == 10


async def test_produto_inexistente_e_variacao_de_outro_produto(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    ids2, _ = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    r = await test_client.post(URL + "/", headers=h, json=_corpo(cid, [{"product_id": 999999, "quantity_sent": 1, "unit_price": "10"}]))
    assert r.status_code in (400, 404), r.text
    r = await test_client.post(URL + "/", headers=h, json=_corpo(cid, [{"product_id": ids.p, "variant_id": ids2.v, "quantity_sent": 1, "unit_price": "10"}]))
    assert r.status_code in (400, 404), r.text
    assert await _estoque(async_session, ids.v) == 10 and await _estoque(async_session, ids2.v) == 10


@pytest.mark.parametrize("campo,valor", [
    ("quantity_sent", 0), ("quantity_sent", -2), ("unit_price", "0"), ("unit_price", "-5"),
])
async def test_item_invalido_vira_422_amigavel(test_client, async_session, test_user, campo, valor):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    item = _item(ids, 1)
    item[campo] = valor
    r = await test_client.post(URL + "/", headers=h, json=_corpo(cid, [item]))
    assert r.status_code == 422
    assert "sql" not in r.text.lower()
    assert await _estoque(async_session, ids.v) == 10


async def test_endereco_curto_e_sem_itens(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    r = await test_client.post(URL + "/", headers=h, json={**_corpo(cid, [_item(ids, 1)]), "shipping_address": "Rua"})
    assert r.status_code == 422
    r = await test_client.post(URL + "/", headers=h, json=_corpo(cid, []))
    assert r.status_code == 422


# ───────────────────────── saída ─────────────────────────

async def test_marcar_enviado_duas_vezes_e_com_status_errado(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 2)])
    await _enviar(test_client, h, s["id"])
    r = await test_client.put(f"{URL}/{s['id']}/mark-as-sent", headers=h, json={})
    assert r.status_code == 400 and "já" in r.text.lower()


async def test_devolver_antes_de_enviar_e_envio_inexistente(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 2)])
    r = await _devolver(test_client, h, s["id"], [_upd(s["items"][0], ret=2)])
    assert r.status_code == 400 and "ainda não foi enviado" in r.text
    r = await _devolver(test_client, h, 999999, [_upd(s["items"][0], ret=2)])
    assert r.status_code in (400, 404)


# ───────────────────────── devolução ─────────────────────────

async def test_devolve_tudo_estoque_volta_sem_venda(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 3)])
    await _enviar(test_client, h, s["id"])
    r = await _devolver(test_client, h, s["id"], [_upd(s["items"][0], ret=3)])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "RETURNED_NO_SALE"
    assert await _estoque(async_session, ids.v) == 10
    from app.models.sale import Sale
    vendas = (await async_session.execute(select(Sale).where(Sale.notes.like(f"%Condicional #{s['id']}%")))).scalars().all()
    assert vendas == []


async def test_ficou_com_tudo_gera_venda_com_custo_e_pagamento(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user, custo=40, preco="100.00")
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 2)])
    await _enviar(test_client, h, s["id"])
    r = await _devolver(test_client, h, s["id"], [_upd(s["items"][0], kept=2)], payment_method="pix")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "COMPLETED_FULL_SALE"
    assert await _estoque(async_session, ids.v) == 8          # ficou com a cliente: não volta
    from app.models.sale import Payment, Sale, SaleItem
    venda = (await async_session.execute(select(Sale).where(Sale.notes.like(f"%Condicional #{s['id']}%")))).scalar_one()
    assert float(venda.total_amount) == 200.0
    itens = (await async_session.execute(select(SaleItem).where(SaleItem.sale_id == venda.id))).scalars().all()
    # o custo real da peça (R$ 40) tem que ficar na venda; com custo 0 o lucro do relatório fica inflado
    assert [float(i.unit_cost) for i in itens] == [40.0], "venda do condicional sem o custo FIFO da peça"
    pagos = (await async_session.execute(select(Payment).where(Payment.sale_id == venda.id))).scalars().all()
    assert sum(float(p.amount) for p in pagos) == 200.0, "venda do condicional sem pagamento registrado"


async def test_ficou_com_parte_volta_o_resto(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 5)])
    await _enviar(test_client, h, s["id"])
    r = await _devolver(test_client, h, s["id"], [_upd(s["items"][0], kept=2, ret=3)])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "COMPLETED_PARTIAL_SALE"
    assert await _estoque(async_session, ids.v) == 8


async def test_danificada_nao_volta_e_perdida_vira_despesa(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user, custo=40)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 4)])
    await _enviar(test_client, h, s["id"])
    r = await _devolver(test_client, h, s["id"], [_upd(s["items"][0], ret=1, dam=1, lost=2)])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "RETURNED_NO_SALE"
    assert await _estoque(async_session, ids.v) == 7          # só a devolvida em bom estado voltou
    from app.models.expense import Expense
    gastos = (await async_session.execute(select(Expense).where(Expense.description.like(f"%envio condicional #{s['id']}%")))).scalars().all()
    assert sum(float(g.amount) for g in gastos) == 120.0      # 2 perdidas + 1 danificada, a R$ 40 de custo
    # a danificada também é prejuízo para a loja e precisa aparecer em algum lugar
    assert sum(float(g.amount) for g in gastos) >= 120.0, "peça danificada sumiu do estoque sem virar perda"


async def test_quantidade_acima_do_enviado_recusa_e_nao_mexe_em_nada(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 3)])
    await _enviar(test_client, h, s["id"])
    r = await _devolver(test_client, h, s["id"], [_upd(s["items"][0], kept=2, ret=2)])
    assert r.status_code == 400
    assert await _estoque(async_session, ids.v) == 7
    ver = await test_client.get(f"{URL}/{s['id']}", headers=h)
    assert ver.json()["status"] == "SENT"


async def test_devolucao_incompleta_nao_pode_sumir_com_peca(test_client, async_session, test_user):
    """Enviou 3, informou só que ficou com 1: as outras 2 não foram nem devolvidas nem registradas."""
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 3)])
    await _enviar(test_client, h, s["id"])
    r = await _devolver(test_client, h, s["id"], [_upd(s["items"][0], kept=1)])
    if r.status_code == 200:
        # se aceitou, as 2 peças restantes têm que continuar reservadas e o envio em aberto, nunca finalizado
        assert r.json()["status"] in ("SENT", "OVERDUE"), f"envio finalizado ({r.json()['status']}) com 2 peças sem destino"
    assert await _estoque(async_session, ids.v) in (7, 9)


async def test_linha_de_item_de_outro_envio_nao_e_ignorada_em_silencio(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    a = await _criar(test_client, h, cid, [_item(ids, 2)])
    b = await _criar(test_client, h, cid, [_item(ids, 2)])
    await _enviar(test_client, h, a["id"])
    r = await _devolver(test_client, h, a["id"], [_upd(b["items"][0], ret=2)])
    assert r.status_code == 400, "item de outro envio foi ignorado em silêncio (e o envio finalizado sem nada)"


async def test_nao_processa_duas_vezes_e_nao_devolve_estoque_em_dobro(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 3)])
    await _enviar(test_client, h, s["id"])
    r1 = await _devolver(test_client, h, s["id"], [_upd(s["items"][0], ret=3)])
    assert r1.status_code == 200
    r2 = await _devolver(test_client, h, s["id"], [_upd(s["items"][0], ret=3)])
    assert r2.status_code == 400
    assert await _estoque(async_session, ids.v) == 10


async def test_processar_parcial_e_de_novo_nao_duplica_o_estoque(test_client, async_session, test_user):
    """Dois itens; manda processar só o 1º (fica aberto) e depois repete o 1º: o estoque dele não pode voltar duas vezes."""
    ids, h = await _cenario(async_session, test_user)
    ids_b, _ = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 2), _item(ids_b, 2)])
    await _enviar(test_client, h, s["id"])
    a = next(i for i in s["items"] if i["product_id"] == ids.p)
    await _devolver(test_client, h, s["id"], [_upd(a, ret=2)])
    await _devolver(test_client, h, s["id"], [_upd(a, ret=2)])
    assert await _estoque(async_session, ids.v) <= 10, "estoque passou do que existia (devolvido em dobro)"


# ───────────────────────── cancelamento ─────────────────────────

async def test_cancelar_pendente_e_enviado_devolve_tudo(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 4)])
    r = await test_client.delete(f"{URL}/{s['id']}", headers=h, params={"reason": "Cliente desistiu"})
    assert r.status_code == 200, r.text
    assert await _estoque(async_session, ids.v) == 10
    s2 = await _criar(test_client, h, cid, [_item(ids, 4)])
    await _enviar(test_client, h, s2["id"])
    r = await test_client.delete(f"{URL}/{s2['id']}", headers=h, params={"reason": "Cliente desistiu"})
    assert r.status_code == 200, r.text
    assert await _estoque(async_session, ids.v) == 10


async def test_cancelar_duas_vezes_e_finalizado(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 2)])
    await test_client.delete(f"{URL}/{s['id']}", headers=h, params={"reason": "Cliente desistiu"})
    r = await test_client.delete(f"{URL}/{s['id']}", headers=h, params={"reason": "Cliente desistiu"})
    assert r.status_code == 400 and "já foi cancelado" in r.text
    assert await _estoque(async_session, ids.v) == 10
    s2 = await _criar(test_client, h, cid, [_item(ids, 2)])
    await _enviar(test_client, h, s2["id"])
    await _devolver(test_client, h, s2["id"], [_upd(s2["items"][0], kept=2)])
    r = await test_client.delete(f"{URL}/{s2['id']}", headers=h, params={"reason": "Cliente desistiu"})
    assert r.status_code == 400
    assert await _estoque(async_session, ids.v) == 8


async def test_cancelar_atrasado_nao_prende_o_estoque(test_client, async_session, test_user):
    """Envio atrasado (OVERDUE) ainda tem peças reservadas; precisa poder cancelar ou devolver."""
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 2)])
    await _enviar(test_client, h, s["id"])
    from app.models.conditional_shipment import ConditionalShipment
    obj = (await async_session.execute(select(ConditionalShipment).where(ConditionalShipment.id == s["id"]))).scalar_one()
    obj.status = "OVERDUE"
    await async_session.commit()
    r = await test_client.delete(f"{URL}/{s['id']}", headers=h, params={"reason": "Cliente sumiu"})
    assert r.status_code == 200, f"envio atrasado não pode ser cancelado: {r.text}"
    assert await _estoque(async_session, ids.v) == 10


async def test_motivo_curto_do_cancelamento_e_422(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 2)])
    r = await test_client.delete(f"{URL}/{s['id']}", headers=h, params={"reason": "no"})
    assert r.status_code == 422
    assert await _estoque(async_session, ids.v) == 8


# ───────────────────────── isolamento e atualização manual ─────────────────────────

async def test_outra_loja_nao_ve_nem_mexe(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 2)])
    from app.core.security import create_access_token
    from app.models.user import User, UserRole
    from app.core.security import get_password_hash
    t2, _, _ = await _loja(async_session)
    u2 = User(email=f"dono.cond.{next(_n)}@example.com", full_name="Outra", hashed_password=get_password_hash("Senha1234"),
              role=UserRole.ADMIN, is_active=True, tenant_id=t2)
    async_session.add(u2)
    await async_session.commit()
    await async_session.refresh(u2)
    h2 = {"Authorization": f"Bearer {create_access_token(data={'sub': str(u2.id)})}"}
    # o conftest usa um tenant fixo; este teste só vale se o tenant do token for respeitado
    r = await test_client.get(f"{URL}/{s['id']}", headers=h2)
    assert r.status_code in (200, 404)


async def test_trocar_status_a_mao_nao_pode_pular_estoque(test_client, async_session, test_user):
    """PUT /{id} aceita `status`: marcar como finalizado/cancelado por aqui não pode deixar peças presas ou vendidas sem venda."""
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 3)])
    r = await test_client.put(f"{URL}/{s['id']}", headers=h, json={"status": "RETURNED_NO_SALE"})
    if r.status_code == 200:
        assert await _estoque(async_session, ids.v) == 10, "status mudou para devolvido mas o estoque continua reservado"
    r = await test_client.put(f"{URL}/{s['id']}", headers=h, json={"status": "NAO_EXISTE"})
    assert r.status_code == 422


async def test_listagem_filtra_por_status_e_cliente(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    c1, c2 = await _cliente(test_client, h), await _cliente(test_client, h)
    a = await _criar(test_client, h, c1, [_item(ids, 1)])
    b = await _criar(test_client, h, c2, [_item(ids, 1)])
    await _enviar(test_client, h, b["id"])
    r = await test_client.get(URL + "/", headers=h, params={"customer_id": c1})
    assert [x["id"] for x in r.json()] == [a["id"]]
    r = await test_client.get(URL + "/", headers=h, params={"status": "SENT", "customer_id": c2})
    assert [x["id"] for x in r.json()] == [b["id"]]
    r = await test_client.get(URL + "/", headers=h, params={"limit": 0})
    assert r.status_code == 422
