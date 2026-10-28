"""Estresse do condicional com FIFO: reservas, devolução parcial, perda/danificada, venda gerada, cancelamento, venda no balcão
disputando a mesma peça, e um aleatório (sementes fixas) misturando condicional, vendas, devoluções, trocas e reposições.

Oráculo (por camada FIFO): recebido - restante == vendas ativas (inclusive as nascidas de condicional) + peças reservadas em envios
abertos (PENDING/SENT/OVERDUE) + peças perdidas/danificadas de envios finalizados. Ver docs/PLANO_TESTES_VENDAS_FIFO.md.
Mais carga: `ESTRESSE_OPS=300 ESTRESSE_SEEDS=1,2,3,4,5,6 pytest tests/test_estresse_condicional.py -q --no-cov`.
"""
import os
import random
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from tests.test_condicional import (  # noqa: F401
    URL, _criar, _cliente, _enviar, _limpa_vendas_e_envios, _upd,
    _devolver as _processar,
)
from tests.test_estresse_cenarios import confere_conservacao, foto
from tests.test_estresse_vendas_fifo import (  # noqa: F401
    _camadas, _devolver, _estoque, _limpa_loja_1, _limpa_vendas, _lote, _variacao,
)
from tests.test_lot_costs import _loja_api, _produto

pytestmark = pytest.mark.asyncio
D = Decimal
OPS = int(os.environ.get("ESTRESSE_OPS", "60"))
_s = os.environ.get("ESTRESSE_SEEDS", "11,23,37")
SEEDS = [int(x) for x in _s.split(",")] if "," in _s else list(range(1, int(_s) + 1))
FINAIS = {"RETURNED_NO_SALE", "COMPLETED_PARTIAL_SALE", "COMPLETED_FULL_SALE"}


# ─────────────────────────────────────────────────────────────── oráculo e cenário
async def consumo_condicional(db, variant_ids):
    """{entry_item_id: peças que envios condicionais seguram}: abertos seguram tudo; finalizados só perdidas/danificadas
    (as devolvidas voltaram pela frente das fontes e as que ficaram viraram venda, que o oráculo das vendas já conta)."""
    from app.models.conditional_shipment import ConditionalShipment, ConditionalShipmentItem
    rows = (await db.execute(
        select(ConditionalShipmentItem, ConditionalShipment.status)
        .join(ConditionalShipment, ConditionalShipment.id == ConditionalShipmentItem.shipment_id)
        .where(ConditionalShipmentItem.variant_id.in_(variant_ids)))).all()
    out = {}
    for it, status in rows:
        fontes = (it.fifo_sources or {}).get("sources", [])
        if status == "CANCELLED":
            continue
        pular = 0 if status not in FINAIS else it.quantity_returned + it.quantity_kept
        for src in fontes:
            q = int(src["quantity_taken"])
            tirar = min(q, pular)
            pular -= tirar
            q -= tirar
            if q > 0:
                out[src["entry_item_id"]] = out.get(src["entry_item_id"], 0) + q
    return out


async def confere(db, vids):
    extra = await consumo_condicional(db, vids)
    await confere_conservacao(db, vids, extra_consumo=extra)


async def _cenario(db, test_user, camadas=((10, 40), (10, 45), (10, 50)), preco="100.00"):
    """Variação A com 3 camadas de custo e variação B com 20 peças. Devolve (ids, headers)."""
    t_id, token, cat = await _loja_api(db, test_user)
    p, va = await _produto(db, t_id, cat, "Estresse Condicional", preco)
    vb = await _variacao(db, p, t_id, preco, cor="Rosa", tam="G")
    hoje = date.today()
    for k, (q, c) in enumerate(camadas):
        await _lote(db, t_id, [(va, p, q, c)], entry_date=hoje - timedelta(days=30 - k * 5))
    await _lote(db, t_id, [(vb, p, 20, 30)], entry_date=hoje - timedelta(days=10))
    ids = SimpleNamespace(p=p.id, a=va.id, b=vb.id, t=t_id)
    await db.commit()
    return ids, None, t_id, token


def _item(ids, qtd, variante="a", preco="100.00"):
    return {"product_id": ids.p, "variant_id": getattr(ids, variante), "quantity_sent": qtd, "unit_price": preco}


async def _setup(db, test_client, test_user, **kw):
    ids, _, t_id, token = await _cenario(db, test_user, **kw)
    h = {"Authorization": f"Bearer {token}"}
    cid = await _cliente(test_client, h)
    return ids, h, cid


async def _vende(client, h, ids, variante, qtd, preco="100.00"):
    return await client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": ids.p, "variant_id": getattr(ids, variante), "quantity": qtd, "unit_price": preco}],
        "payments": [{"amount": str(D(preco) * qtd), "payment_method": "cash"}]})


async def _venda_do_envio(db, sid):
    from app.models.sale import Sale, SaleItem
    db.expire_all()
    venda = (await db.execute(select(Sale).where(Sale.notes.like(f"%Condicional #{sid}%")))).scalar_one_or_none()
    if not venda:
        return None, []
    itens = (await db.execute(select(SaleItem).where(SaleItem.sale_id == venda.id))).scalars().all()
    return venda, itens


# ─────────────────────────────────────────────────────────────── cenários
async def test_reserva_atravessa_camadas_e_devolucao_volta_pelas_fontes(test_client, async_session, test_user):
    ids, h, cid = await _setup(async_session, test_client, test_user)
    s = await _criar(test_client, h, cid, [_item(ids, 25)])                  # 10@40 + 10@45 + 5@50
    assert [c[2] for c in await _camadas(async_session, ids.a)] == [0, 0, 5]
    await confere(async_session, [ids.a])
    await _enviar(test_client, h, s["id"])
    r = await _processar(test_client, h, s["id"], [_upd(s["items"][0], ret=25)])
    assert r.status_code == 200, r.text
    assert [c[2] for c in await _camadas(async_session, ids.a)] == [10, 10, 10]
    await confere(async_session, [ids.a])


async def test_ficou_parte_devolveu_parte_perdeu_parte_danificou_parte(test_client, async_session, test_user):
    ids, h, cid = await _setup(async_session, test_client, test_user)
    s = await _criar(test_client, h, cid, [_item(ids, 25)])                  # 10@40 + 10@45 + 5@50
    await _enviar(test_client, h, s["id"])
    # 7 voltam (da frente: camada 40), 8 ficam (3@40 + 5@45), 6 perdidas e 4 danificadas (as outras 5@45 + 5@50)
    r = await _processar(test_client, h, s["id"], [_upd(s["items"][0], kept=8, ret=7, lost=6, dam=4)], payment_method="pix")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "COMPLETED_PARTIAL_SALE"
    assert [c[2] for c in await _camadas(async_session, ids.a)] == [7, 0, 5]   # 7 voltaram; a camada 50 nunca saiu do restante 5
    await confere(async_session, [ids.a])
    venda, itens = await _venda_do_envio(async_session, s["id"])
    assert float(venda.total_amount) == 800.0
    assert [i.quantity for i in itens] == [8]
    # custo FIFO das 8 que ficaram: 3@40 + 5@45 = 345 -> 43,125 médio
    assert abs(float(itens[0].unit_cost) * 8 - 345.0) <= 0.05   # unit_cost guarda só centavos (43,125 -> 43,12); o exato fica em sale_sources
    assert sum(float(x['unit_cost']) * x['quantity_taken'] for x in itens[0].sale_sources['sources']) == 345.0
    from app.models.expense import Expense
    gastos = (await async_session.execute(select(Expense).where(Expense.description.like(f"%envio condicional #{s['id']}%")))).scalars().all()
    # perdidas 6 = 5@45 + 1@50 = 275; danificadas 4 = 4@50 = 200 (o custo é o das peças que sumiram, não a média do envio)
    assert len(gastos) == 2 and sorted(float(g.amount) for g in gastos) == [200.0, 275.0], [float(g.amount) for g in gastos]


async def test_venda_nascida_de_condicional_pode_ser_devolvida_e_trocada(test_client, async_session, test_user):
    ids, h, cid = await _setup(async_session, test_client, test_user)
    s = await _criar(test_client, h, cid, [_item(ids, 15)])                  # 10@40 + 5@45
    await _enviar(test_client, h, s["id"])
    r = await _processar(test_client, h, s["id"], [_upd(s["items"][0], kept=15)], payment_method="pix")
    assert r.status_code == 200, r.text
    venda, itens = await _venda_do_envio(async_session, s["id"])
    venda_id, item_id = venda.id, itens[0].id
    await confere(async_session, [ids.a, ids.b])
    r = await _devolver(test_client, h, venda_id, [{"sale_item_id": item_id, "quantity": 4}])
    assert r.status_code == 201, r.text
    await confere(async_session, [ids.a, ids.b])
    r = await _devolver(test_client, h, venda_id, [{"sale_item_id": item_id, "quantity": 3, "replacement_variant_id": ids.b}])
    assert r.status_code == 201, r.text
    await confere(async_session, [ids.a, ids.b])
    assert await _estoque(async_session, ids.b) == 17
    assert await _estoque(async_session, ids.a) == 30 - 15 + 4 + 3
    r = await _devolver(test_client, h, venda_id, [{"sale_item_id": item_id, "quantity": 9}])      # só restam 8
    assert r.status_code == 400
    r = await test_client.post(f"/api/v1/sales/{venda_id}/cancel", headers=h, json={"reason": "Cliente desistiu de tudo"})
    assert r.status_code < 500
    await confere(async_session, [ids.a, ids.b])


async def test_balcao_nao_vende_a_peca_reservada_no_condicional(test_client, async_session, test_user):
    ids, h, cid = await _setup(async_session, test_client, test_user, camadas=((5, 40),))
    s = await _criar(test_client, h, cid, [_item(ids, 4)])                  # sobra 1
    antes = await foto(async_session, [ids.a])
    r = await _vende(test_client, h, ids, "a", 2)
    assert r.status_code in (400, 422), r.text
    assert await foto(async_session, [ids.a]) == antes
    assert (await _vende(test_client, h, ids, "a", 1)).status_code in (200, 201)
    assert await _estoque(async_session, ids.a) == 0
    await confere(async_session, [ids.a])
    # volta a peça: agora dá para vender
    assert (await test_client.delete(f"{URL}/{s['id']}", headers=h, params={"reason": "Cliente desistiu"})).status_code == 200
    assert await _estoque(async_session, ids.a) == 4
    assert (await _vende(test_client, h, ids, "a", 4)).status_code in (200, 201)
    await confere(async_session, [ids.a])


async def test_dois_envios_disputando_a_mesma_peca(test_client, async_session, test_user):
    ids, h, cid = await _setup(async_session, test_client, test_user, camadas=((5, 40),))
    await _criar(test_client, h, cid, [_item(ids, 3)])
    r = await test_client.post(URL + "/", headers=h, json={"customer_id": cid, "shipping_address": "Rua das Flores, 100, Uberlandia", "items": [_item(ids, 3)]})
    assert r.status_code in (400, 422), r.text
    assert await _estoque(async_session, ids.a) == 2
    r = await test_client.post(URL + "/", headers=h, json={"customer_id": cid, "shipping_address": "Rua das Flores, 100, Uberlandia", "items": [_item(ids, 2)]})
    assert r.status_code == 201, r.text
    assert await _estoque(async_session, ids.a) == 0
    await confere(async_session, [ids.a])


async def test_envio_nunca_enviado_segura_a_peca_e_cancelar_devolve(test_client, async_session, test_user):
    ids, h, cid = await _setup(async_session, test_client, test_user)
    s = await _criar(test_client, h, cid, [_item(ids, 12), _item(ids, 3, "b")])
    assert await _estoque(async_session, ids.a) == 18 and await _estoque(async_session, ids.b) == 17
    await confere(async_session, [ids.a, ids.b])
    assert (await test_client.delete(f"{URL}/{s['id']}", headers=h, params={"reason": "Cliente desistiu"})).status_code == 200
    assert [c[2] for c in await _camadas(async_session, ids.a)] == [10, 10, 10]
    assert await _estoque(async_session, ids.b) == 20
    await confere(async_session, [ids.a, ids.b])
    # cancelar de novo não repõe em dobro
    assert (await test_client.delete(f"{URL}/{s['id']}", headers=h, params={"reason": "Cliente desistiu"})).status_code in (400, 409, 422)
    assert await _estoque(async_session, ids.a) == 30
    await confere(async_session, [ids.a, ids.b])


async def test_envio_atrasado_ainda_processa_devolucao(test_client, async_session, test_user):
    from app.models.conditional_shipment import ConditionalShipment
    ids, h, cid = await _setup(async_session, test_client, test_user)
    s = await _criar(test_client, h, cid, [_item(ids, 6)])
    await _enviar(test_client, h, s["id"])
    obj = (await async_session.execute(select(ConditionalShipment).where(ConditionalShipment.id == s["id"]))).scalar_one()
    obj.status = "OVERDUE"
    await async_session.commit()
    await confere(async_session, [ids.a])
    r = await _processar(test_client, h, s["id"], [_upd(s["items"][0], kept=2, ret=4)], payment_method="cash")
    assert r.status_code == 200, r.text
    await confere(async_session, [ids.a])
    assert await _estoque(async_session, ids.a) == 28


async def test_processar_de_novo_e_cancelar_depois_de_finalizado_nao_mexem_no_estoque(test_client, async_session, test_user):
    ids, h, cid = await _setup(async_session, test_client, test_user)
    s = await _criar(test_client, h, cid, [_item(ids, 5)])
    await _enviar(test_client, h, s["id"])
    assert (await _processar(test_client, h, s["id"], [_upd(s["items"][0], kept=2, ret=3)])).status_code == 200
    antes = await foto(async_session, [ids.a])
    for _ in range(3):
        assert (await _processar(test_client, h, s["id"], [_upd(s["items"][0], ret=5)])).status_code in (400, 409, 422)
    assert (await test_client.delete(f"{URL}/{s['id']}", headers=h, params={"reason": "Tentando cancelar"})).status_code in (400, 409, 422)
    assert await foto(async_session, [ids.a]) == antes
    await confere(async_session, [ids.a])


async def test_venda_do_condicional_com_preco_de_centavos_nao_vira_dizima(test_client, async_session, test_user):
    ids, h, cid = await _setup(async_session, test_client, test_user, preco="33.33")
    s = await _criar(test_client, h, cid, [_item(ids, 3, preco="33.33")])
    await _enviar(test_client, h, s["id"])
    assert (await _processar(test_client, h, s["id"], [_upd(s["items"][0], kept=3)], payment_method="pix")).status_code == 200
    venda, itens = await _venda_do_envio(async_session, s["id"])
    assert D(str(venda.total_amount)).quantize(D("0.01")) == D("99.99")
    assert D(str(venda.total_amount)) == D(str(venda.total_amount)).quantize(D("0.01")), f"total com dízima: {venda.total_amount}"
    assert D(str(itens[0].subtotal)) == D(str(itens[0].subtotal)).quantize(D("0.01")), f"subtotal com dízima: {itens[0].subtotal}"


async def test_tudo_ou_nada_envio_com_um_item_sem_estoque_nao_reserva_nenhum(test_client, async_session, test_user):
    ids, h, cid = await _setup(async_session, test_client, test_user)
    antes = await foto(async_session, [ids.a, ids.b])
    r = await test_client.post(URL + "/", headers=h, json={"customer_id": cid, "shipping_address": "Rua das Flores, 100, Uberlandia",
                                                          "items": [_item(ids, 5), _item(ids, 5, "b"), _item(ids, 99, "b")]})
    assert r.status_code in (400, 422), r.text
    assert await foto(async_session, [ids.a, ids.b]) == antes


async def test_devolucao_do_envio_recusada_nao_mexe_em_nada(test_client, async_session, test_user):
    ids, h, cid = await _setup(async_session, test_client, test_user)
    s = await _criar(test_client, h, cid, [_item(ids, 5), _item(ids, 4, "b")])
    await _enviar(test_client, h, s["id"])
    antes = await foto(async_session, [ids.a, ids.b])
    # o 2º item passa do enviado: o 1º não pode ter sido processado antes da recusa
    r = await _processar(test_client, h, s["id"], [_upd(s["items"][0], ret=5), _upd(s["items"][1], ret=9)])
    assert r.status_code in (400, 422), r.text
    assert await foto(async_session, [ids.a, ids.b]) == antes
    await confere(async_session, [ids.a, ids.b])


# ─────────────────────────────────────────────────────────────── aleatório
@pytest.mark.parametrize("seed", SEEDS)
async def test_estresse_aleatorio_com_condicional(test_client, async_session, test_user, seed):
    rng = random.Random(seed)
    ids, h, cid = await _setup(async_session, test_client, test_user,
                               camadas=tuple((rng.randint(5, 12), rng.choice((35, 40, 45, 50))) for _ in range(3)))
    vids = [ids.a, ids.b]
    nome = {ids.a: "a", ids.b: "b"}
    ledger = {v: await _estoque(async_session, v) for v in vids}
    envios = []          # {id, estado: PENDING|SENT|FIM, itens: [{id, variant, qtd}]}
    vendas = []          # {id, itens: [{id, variant, qtd, devolvido}], ativa}
    hist = []

    async def estado_ok(op):
        await confere(async_session, vids)
        for v in vids:
            real = await _estoque(async_session, v)
            assert real == ledger[v], f"[seed {seed}] depois de {op}: variação {v} tem {real}, livro {ledger[v]}\n" + "\n".join(hist[-8:])

    for passo in range(OPS):
        acao = rng.choices(["criar", "enviar", "processar", "cancelar_envio", "vender", "vender_demais", "devolver", "trocar", "cancelar_venda", "repor", "criar_demais"],
                           weights=[16, 14, 16, 6, 12, 6, 8, 6, 4, 6, 6])[0]
        antes = await foto(async_session, vids)

        if acao == "criar":
            v = rng.choice([x for x in vids if ledger[x] > 0] or [None])
            if v is None:
                continue
            q = rng.randint(1, min(ledger[v], 6))
            r = await test_client.post(URL + "/", headers=h, json={"customer_id": cid, "shipping_address": "Rua das Flores, 100, Uberlandia", "items": [_item(ids, q, nome[v])]})
            hist.append(f"{passo}: criar {nome[v]} {q} -> {r.status_code}")
            assert r.status_code == 201, f"[seed {seed}] envio válido recusado: {r.text}"
            c = r.json()
            envios.append({"id": c["id"], "estado": "PENDING", "itens": [{"id": c["items"][0]["id"], "variant": v, "qtd": q}]})
            ledger[v] -= q

        elif acao == "criar_demais":
            v = rng.choice(vids)
            r = await test_client.post(URL + "/", headers=h, json={"customer_id": cid, "shipping_address": "Rua das Flores, 100, Uberlandia", "items": [_item(ids, ledger[v] + rng.randint(1, 4), nome[v])]})
            hist.append(f"{passo}: criar_demais {nome[v]} -> {r.status_code}")
            assert r.status_code in (400, 422), f"[seed {seed}] envio acima do estoque deu {r.status_code}: {r.text}"
            assert await foto(async_session, vids) == antes, f"[seed {seed}] envio recusado mexeu no estoque"

        elif acao == "enviar":
            alvo = [e for e in envios if e["estado"] == "PENDING"]
            if not alvo:
                continue
            e = rng.choice(alvo)
            await _enviar(test_client, h, e["id"])
            e["estado"] = "SENT"
            hist.append(f"{passo}: enviar {e['id']}")

        elif acao == "processar":
            alvo = [e for e in envios if e["estado"] == "SENT"]
            if not alvo:
                continue
            e = rng.choice(alvo)
            it = e["itens"][0]
            resto = it["qtd"]
            kept = rng.randint(0, resto); resto -= kept
            ret = rng.randint(0, resto); resto -= ret
            dam = rng.randint(0, resto); resto -= dam
            lost = resto
            r = await _processar(test_client, h, e["id"], [_upd({"id": it["id"]}, kept=kept, ret=ret, dam=dam, lost=lost)], payment_method="pix")
            hist.append(f"{passo}: processar {e['id']} kept={kept} ret={ret} dam={dam} lost={lost} -> {r.status_code}")
            assert r.status_code == 200, f"[seed {seed}] devolução válida recusada: {r.text}"
            e["estado"] = "FIM"
            ledger[it["variant"]] += ret
            if kept:
                venda, itens = await _venda_do_envio(async_session, e["id"])
                vendas.append({"id": venda.id, "ativa": True, "itens": [{"id": i.id, "variant": i.variant_id, "qtd": i.quantity, "devolvido": 0} for i in itens]})

        elif acao == "cancelar_envio":
            alvo = [e for e in envios if e["estado"] in ("PENDING", "SENT")]
            if not alvo:
                continue
            e = rng.choice(alvo)
            r = await test_client.delete(f"{URL}/{e['id']}", headers=h, params={"reason": "Cliente desistiu do envio"})
            hist.append(f"{passo}: cancelar_envio {e['id']} -> {r.status_code}")
            assert r.status_code == 200, f"[seed {seed}] cancelamento válido recusado: {r.text}"
            e["estado"] = "FIM"
            ledger[e["itens"][0]["variant"]] += e["itens"][0]["qtd"]

        elif acao == "vender":
            com = [x for x in vids if ledger[x] > 0]
            if not com:
                continue
            v = rng.choice(com)
            q = rng.randint(1, min(ledger[v], 5))
            r = await _vende(test_client, h, ids, nome[v], q)
            hist.append(f"{passo}: vender {nome[v]} {q} -> {r.status_code}")
            assert r.status_code in (200, 201), f"[seed {seed}] venda válida recusada: {r.text}"
            c = r.json()
            vendas.append({"id": c["id"], "ativa": True, "itens": [{"id": i["id"], "variant": i["variant_id"], "qtd": i["quantity"], "devolvido": 0} for i in c["items"]]})
            ledger[v] -= q

        elif acao == "vender_demais":
            v = rng.choice(vids)
            r = await _vende(test_client, h, ids, nome[v], ledger[v] + rng.randint(1, 4))
            hist.append(f"{passo}: vender_demais {nome[v]} -> {r.status_code}")
            assert r.status_code in (400, 422), f"[seed {seed}] venda acima do estoque (com reservas) deu {r.status_code}: {r.text}"
            assert await foto(async_session, vids) == antes, f"[seed {seed}] venda recusada mexeu no estoque"

        elif acao in ("devolver", "trocar"):
            cand = [(s, i) for s in vendas if s["ativa"] for i in s["itens"] if i["qtd"] - i["devolvido"] > 0]
            if not cand:
                continue
            s, i = rng.choice(cand)
            q = rng.randint(1, i["qtd"] - i["devolvido"])
            linha = {"sale_item_id": i["id"], "quantity": q}
            troca = None
            if acao == "trocar":
                dest = [v for v in vids if v != i["variant"] and ledger[v] >= q]
                if not dest:
                    continue
                troca = rng.choice(dest)
                linha["replacement_variant_id"] = troca
            r = await _devolver(test_client, h, s["id"], [linha], motivo=f"fuzz {passo}")
            hist.append(f"{passo}: {acao} venda {s['id']} item {i['id']} qtd {q} {linha} -> {r.status_code}")
            assert r.status_code == 201, f"[seed {seed}] devolução válida recusada: {r.text}\n" + "\n".join(hist[-8:])
            i["devolvido"] += q
            ledger[i["variant"]] += q
            if troca is not None:
                ledger[troca] -= q
                nova = r.json().get("exchange_sale_id")
                if nova:
                    rv = await test_client.get(f"/api/v1/sales/{nova}", headers=h)
                    if rv.status_code == 200:
                        vendas.append({"id": nova, "ativa": True, "itens": [{"id": x["id"], "variant": x["variant_id"], "qtd": x["quantity"], "devolvido": 0} for x in rv.json()["items"]]})

        elif acao == "cancelar_venda":
            ativas = [s for s in vendas if s["ativa"]]
            if not ativas:
                continue
            s = rng.choice(ativas)
            r = await test_client.post(f"/api/v1/sales/{s['id']}/cancel", headers=h, json={"reason": f"fuzz cancelar {passo}"})
            hist.append(f"{passo}: cancelar_venda {s['id']} -> {r.status_code}")
            assert r.status_code < 500, f"[seed {seed}] cancelar deu {r.status_code}: {r.text}"
            if r.status_code in (200, 201):
                s["ativa"] = False
                for v in vids:
                    ledger[v] = await _estoque(async_session, v)
            else:
                assert await foto(async_session, vids) == antes, f"[seed {seed}] cancelamento recusado mexeu no estoque"

        elif acao == "repor":
            v = rng.choice(vids)
            q = rng.randint(1, 6)
            await _lote(async_session, ids.t, [(SimpleNamespace(id=v), SimpleNamespace(id=ids.p), q, rng.choice((32, 41, 48)))], entry_date=date.today())
            await async_session.commit()
            ledger[v] += q
            hist.append(f"{passo}: repor {nome[v]} +{q}")

        await estado_ok(f"{passo}:{acao}")
