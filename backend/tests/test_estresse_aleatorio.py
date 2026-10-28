"""Estresse aleatório (com sementes fixas, então reproduzível) de vendas, devolução, troca, cancelamento e reposição.

A cada operação confere: (1) o oráculo de conservação por camada FIFO, (2) um livro de estoque independente por variação,
(3) que uma operação recusada não mexe em NADA (tudo ou nada) e (4) que nenhuma resposta é erro 5xx.
Aumentar a carga (nuvem): `ESTRESSE_OPS=2000 ESTRESSE_SEEDS=20 pytest tests/test_estresse_aleatorio.py -q --no-cov`.
Ver docs/PLANO_TESTES_VENDAS_FIFO.md.
"""
import os
import random
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest

from tests.test_estresse_cenarios import confere_conservacao, foto
from tests.test_estresse_vendas_fifo import (  # noqa: F401
    _camadas, _devolver, _estoque, _limpa_loja_1, _limpa_vendas, _lote, _variacao,
)
from tests.test_lot_costs import _loja_api, _produto

pytestmark = pytest.mark.asyncio
D = Decimal
OPS = int(os.environ.get("ESTRESSE_OPS", "70"))
SEEDS = [int(x) for x in os.environ.get("ESTRESSE_SEEDS", "11,23,37").split(",")] if "," in os.environ.get("ESTRESSE_SEEDS", "11,23,37") \
    else list(range(1, int(os.environ.get("ESTRESSE_SEEDS", "3")) + 1))


async def _loja(db, test_user, rng):
    t_id, token, cat = await _loja_api(db, test_user)
    p, v0 = await _produto(db, t_id, cat, "Fuzz Estresse", "100.00")
    variantes = [v0] + [await _variacao(db, p, t_id, preco, cor=cor, tam=tam)
                        for preco, cor, tam in (("80.00", "Rosa", "P"), ("120.00", "Preto", "G"), ("100.00", "Azul", "GG"))]
    ledger = {}
    hoje = date.today()
    for v in variantes:
        total = 0
        for k in range(rng.randint(2, 3)):
            q = rng.randint(3, 12)
            await _lote(db, t_id, [(v, p, q, rng.choice((30, 35, 40, 45, 50)))], entry_date=hoje - timedelta(days=40 - k * 7))
            total += q
        ledger[v.id] = total
    ids = [SimpleNamespace(id=x.id) for x in variantes]
    pid = p.id
    await db.commit()
    return t_id, {"Authorization": f"Bearer {token}"}, pid, ids, ledger


@pytest.mark.parametrize("seed", SEEDS)
async def test_estresse_aleatorio_de_vendas_devolucoes_trocas_e_cancelamentos(test_client, async_session, test_user, seed):
    rng = random.Random(seed)
    t_id, h, pid, variantes, ledger = await _loja(async_session, test_user, rng)
    vids = [v.id for v in variantes]
    preco = {vids[0]: "100.00", vids[1]: "80.00", vids[2]: "120.00", vids[3]: "100.00"}
    vendas = []        # [{id, ativa, itens: [{id, variant, qtd, devolvido}]}]
    historico = []

    async def estado_ok(op):
        await confere_conservacao(async_session, vids)
        for vid in vids:
            real = await _estoque(async_session, vid)
            assert real == ledger[vid], f"[seed {seed}] depois de {op}: variação {vid} tem {real}, o livro diz {ledger[vid]}\n" + "\n".join(historico[-8:])

    for passo in range(OPS):
        acao = rng.choices(["vender", "devolver", "trocar", "cancelar", "repor", "vender_demais"], weights=[34, 22, 18, 6, 8, 12])[0]
        antes = await foto(async_session, vids)

        if acao == "vender":
            com_estoque = [v for v in vids if ledger[v] > 0]
            if not com_estoque:
                continue
            escolhidos = rng.sample(com_estoque, k=min(len(com_estoque), rng.choice((1, 1, 2, 3))))
            itens = [{"product_id": pid, "variant_id": v, "quantity": rng.randint(1, ledger[v]), "unit_price": preco[v]} for v in escolhidos]
            total = sum(D(i["unit_price"]) * i["quantity"] for i in itens)
            r = await test_client.post("/api/v1/sales/", headers=h, json={
                "payment_method": "cash", "items": itens, "payments": [{"amount": str(total), "payment_method": "cash"}]})
            historico.append(f"{passo}: vender {[(i['variant_id'], i['quantity']) for i in itens]} -> {r.status_code}")
            assert r.status_code in (200, 201), f"[seed {seed}] venda válida recusada: {r.text}\n" + "\n".join(historico[-8:])
            corpo = r.json()
            vendas.append({"id": corpo["id"], "ativa": True,
                           "itens": [{"id": it["id"], "variant": it["variant_id"], "qtd": it["quantity"], "devolvido": 0} for it in corpo["items"]]})
            for it in itens:
                ledger[it["variant_id"]] -= it["quantity"]

        elif acao == "vender_demais":
            v = rng.choice(vids)
            r = await test_client.post("/api/v1/sales/", headers=h, json={
                "payment_method": "cash", "items": [{"product_id": pid, "variant_id": v, "quantity": ledger[v] + rng.randint(1, 5), "unit_price": preco[v]}],
                "payments": [{"amount": "1.00", "payment_method": "cash"}]})
            historico.append(f"{passo}: vender_demais {v} -> {r.status_code}")
            assert r.status_code in (400, 422), f"[seed {seed}] venda acima do estoque deu {r.status_code}: {r.text}"
            assert await foto(async_session, vids) == antes, f"[seed {seed}] venda recusada mexeu no estoque"

        elif acao in ("devolver", "trocar"):
            candidatas = [(s, it) for s in vendas if s["ativa"] for it in s["itens"] if it["qtd"] - it["devolvido"] > 0]
            if not candidatas:
                continue
            s, it = rng.choice(candidatas)
            qtd = rng.randint(1, it["qtd"] - it["devolvido"])
            linha = {"sale_item_id": it["id"], "quantity": qtd}
            troca_para = None
            if acao == "trocar":
                destinos = [v for v in vids if v != it["variant"] and ledger[v] >= qtd]
                if not destinos:
                    continue
                troca_para = rng.choice(destinos)
                linha["replacement_variant_id"] = troca_para
            else:
                linha["restock"] = rng.random() < 0.85
            r = await _devolver(test_client, h, s["id"], [linha], motivo=f"fuzz {passo}")
            historico.append(f"{passo}: {acao} venda {s['id']} item {it['id']} qtd {qtd} {linha} -> {r.status_code}")
            assert r.status_code == 201, f"[seed {seed}] devolução válida recusada: {r.text}\n" + "\n".join(historico[-8:])
            it["devolvido"] += qtd
            if troca_para is not None:
                ledger[it["variant"]] += qtd
                ledger[troca_para] -= qtd
                # a venda de troca nova também entra no jogo: suas peças podem ser devolvidas depois
                nova = r.json().get("exchange_sale_id")
                if nova:
                    rv = await test_client.get(f"/api/v1/sales/{nova}", headers=h)
                    if rv.status_code == 200:
                        vendas.append({"id": nova, "ativa": True,
                                       "itens": [{"id": x["id"], "variant": x["variant_id"], "qtd": x["quantity"], "devolvido": 0} for x in rv.json()["items"]]})
            elif linha["restock"]:
                ledger[it["variant"]] += qtd

        elif acao == "cancelar":
            ativas = [s for s in vendas if s["ativa"]]
            if not ativas:
                continue
            s = rng.choice(ativas)
            r = await test_client.post(f"/api/v1/sales/{s['id']}/cancel", headers=h, json={"reason": f"fuzz cancelar {passo}"})
            historico.append(f"{passo}: cancelar venda {s['id']} -> {r.status_code}")
            assert r.status_code < 500, f"[seed {seed}] cancelar deu {r.status_code}: {r.text}"
            if r.status_code in (200, 201):
                s["ativa"] = False
                for vid in vids:   # o cancelamento repõe o que a venda ainda segurava: o livro se refaz pelo estado real
                    ledger[vid] = await _estoque(async_session, vid)
            else:
                assert await foto(async_session, vids) == antes, f"[seed {seed}] cancelamento recusado mexeu no estoque"

        elif acao == "repor":
            v = rng.choice(vids)
            q = rng.randint(1, 8)
            await _lote(async_session, t_id, [(SimpleNamespace(id=v), SimpleNamespace(id=pid), q, rng.choice((32, 41, 48)))],
                        entry_date=date.today() - timedelta(days=rng.randint(0, 5)))
            await async_session.commit()
            ledger[v] += q
            historico.append(f"{passo}: repor {v} +{q}")

        await estado_ok(f"{passo}:{acao}")
