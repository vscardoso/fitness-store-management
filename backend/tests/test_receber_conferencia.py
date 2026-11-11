"""Conferir recebimento compartilhado: várias vendedoras conferem a MESMA entrada e as bipadas se somam (igual à Conferência de estoque)."""
import itertools

import pytest

from app.core.security import create_access_token, get_password_hash
from app.models.user import User, UserRole
from tests.test_lot_costs import _limpa_loja_1, _loja_api, _lote, _produto  # noqa: F401
from tests.test_isolamento_fornecedores import _sem_override, _tenant_de_verdade  # noqa: F401  (fixture)
from tests.test_team_limit import _nova_loja

pytestmark = pytest.mark.asyncio
_seq = itertools.count(1)


async def _pessoa(db, tenant_id, nome, role=UserRole.SELLER):
    u = User(email=f"rc.{next(_seq)}.{tenant_id}@example.com", full_name=nome, hashed_password=get_password_hash("Senha1234"),
             role=role, is_active=True, tenant_id=tenant_id)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}


async def _entrada(db, tenant_id, cat):
    """Entrada com 3 peças Preto P, 2 Preto M e 1 Rosa M do mesmo produto. Devolve (entry, {(cor, tam): variant_id}, produto, outra variação fora da entrada)."""
    from app.models.product_variant import ProductVariant
    p, v0 = await _produto(db, tenant_id, cat, "Legging Recebida")
    n = next(_seq)
    vs = {}
    for cor, tam, qtd in (("Preto", "P", 3), ("Preto", "M", 2), ("Rosa", "M", 1)):
        v = ProductVariant(product_id=p.id, sku=f"RC-{n}-{cor[:2]}{tam}-{tenant_id}", color=cor, size=tam, price=100, tenant_id=tenant_id)
        db.add(v)
        await db.flush()
        vs[(cor, tam)] = (v, qtd)
    fora = ProductVariant(product_id=p.id, sku=f"RC-{n}-FORA-{tenant_id}", color="Azul", size="G", price=100, tenant_id=tenant_id)
    db.add(fora)
    await db.flush()
    e = await _lote(db, tenant_id, [(v, p, q, 10) for v, q in vs.values()])
    await db.commit()
    return e, {k: v.id for k, (v, _) in vs.items()}, p, fora.id


def _url(entry_id, tail=""):
    return f"/api/v1/stock-entries/{entry_id}/receipt-check{tail}"


def _por_variante(estado):
    return {l["variant_id"]: l for l in estado["lines"]}


async def test_duas_vendedoras_somam_na_mesma_entrada(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    e, vs, _, _ = await _entrada(async_session, t_id, cat)
    ana = await _pessoa(async_session, t_id, "Ana Vendedora")
    bia = await _pessoa(async_session, t_id, "Bia Vendedora")
    pp, pm, rm = vs[("Preto", "P")], vs[("Preto", "M")], vs[("Rosa", "M")]

    # estado inicial: nada lido, falta tudo (6 peças)
    r = await test_client.get(_url(e.id), headers=ana)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["totals"] == {"expected": 6, "read": 0, "missing": 6, "over": 0, "extra": 0}
    assert s["entry"]["id"] == e.id and s["revision"] == 0

    # as duas bipam a mesma peça (Preto P) e cada uma uma diferente: ninguém apaga ninguém
    assert (await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": pp, "delta": 1}, {"variant_id": pp, "delta": 1}]}, headers=ana)).status_code == 200
    r = await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": pp, "delta": 1}, {"variant_id": pm, "delta": 1}]}, headers=bia)
    assert r.status_code == 200, r.text
    s = r.json()
    por = _por_variante(s)
    assert por[pp]["counted"] == 3 and por[pp]["expected"] == 3 and por[pp]["counted_by_name"] == "Bia Vendedora"
    assert por[pm]["counted"] == 1 and por[pm]["counted_by_name"] == "Bia Vendedora"
    assert por[rm]["counted"] == 0
    assert s["totals"] == {"expected": 6, "read": 4, "missing": 2, "over": 0, "extra": 0}   # Preto M falta 1, Rosa M falta 1

    # a outra vendedora vê a mesma coisa na próxima atualização
    visto = (await test_client.get(_url(e.id), headers=ana)).json()
    assert visto["totals"] == s["totals"] and visto["revision"] == s["revision"] >= 2

    # uma peça a mais passa do esperado: entra em "vieram a mais" e some de "faltam"
    r = await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": pp, "delta": 1}]}, headers=ana)
    assert r.json()["totals"]["over"] == 1 and r.json()["totals"]["read"] == 5


async def test_set_clear_e_seta_para_baixo(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    e, vs, _, _ = await _entrada(async_session, t_id, cat)
    ana = await _pessoa(async_session, t_id, "Ana")
    pm = vs[("Preto", "M")]
    r = await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": pm, "set": 2}]}, headers=ana)
    assert _por_variante(r.json())[pm]["counted"] == 2
    # seta para baixo nunca passa de 0 e a linha some (não fica "lida com 0")
    r = await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": pm, "delta": -1}] * 3}, headers=ana)
    assert _por_variante(r.json())[pm]["counted"] == 0
    r = await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": pm, "set": 2}, {"variant_id": pm, "clear": True}]}, headers=ana)
    assert _por_variante(r.json())[pm]["counted"] == 0 and r.json()["totals"]["read"] == 0
    # somar em bloco (delta 50) é recusado: foi assim que a conferência de estoque dobrou
    r = await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": pm, "delta": 50}]}, headers=ana)
    assert r.status_code == 422


async def test_peca_fora_da_entrada_nao_entra_na_conta(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    e, vs, _, fora = await _entrada(async_session, t_id, cat)
    ana = await _pessoa(async_session, t_id, "Ana")
    r = await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": fora, "delta": 1}, {"variant_id": fora, "delta": 1}]}, headers=ana)
    s = r.json()
    assert s["totals"] == {"expected": 6, "read": 0, "missing": 6, "over": 0, "extra": 2}
    assert [(x["variant_id"], x["quantity"]) for x in s["extras"]] == [(fora, 2)]
    assert "Legging Recebida" in s["extras"][0]["product_name"] and "Azul" in s["extras"][0]["label"]
    # zerar a peça de fora tira ela da lista
    r = await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": fora, "clear": True}]}, headers=ana)
    assert r.json()["extras"] == [] and r.json()["totals"]["extra"] == 0


async def test_lote_reenviado_depois_de_falha_de_rede_nao_conta_em_dobro(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    e, vs, _, _ = await _entrada(async_session, t_id, cat)
    ana = await _pessoa(async_session, t_id, "Ana")
    pp = vs[("Preto", "P")]
    corpo = {"batch_id": "lote-abc-123", "ops": [{"variant_id": pp, "delta": 1}, {"variant_id": pp, "delta": 1}]}
    r1 = await test_client.post(_url(e.id, "/apply"), json=corpo, headers=ana)
    assert _por_variante(r1.json())[pp]["counted"] == 2
    rev = r1.json()["revision"]
    # a resposta se perdeu e o aparelho mandou de novo o MESMO lote: nada muda
    r2 = await test_client.post(_url(e.id, "/apply"), json=corpo, headers=ana)
    assert r2.status_code == 200 and _por_variante(r2.json())[pp]["counted"] == 2 and r2.json()["revision"] == rev
    # outro lote (id novo) conta normalmente
    r3 = await test_client.post(_url(e.id, "/apply"), json={**corpo, "batch_id": "lote-abc-124"}, headers=ana)
    assert _por_variante(r3.json())[pp]["counted"] == 4


async def test_zerar_leituras_e_so_do_gerente_e_zera_para_todos(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    e, vs, _, _ = await _entrada(async_session, t_id, cat)
    ana = await _pessoa(async_session, t_id, "Ana")
    gerente = await _pessoa(async_session, t_id, "Gerente", UserRole.MANAGER)
    pp = vs[("Preto", "P")]
    await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": pp, "delta": 1}]}, headers=ana)
    r = await test_client.delete(_url(e.id), headers=ana)
    assert r.status_code == 403            # vendedora não apaga a contagem das outras
    assert (await test_client.get(_url(e.id), headers=ana)).json()["totals"]["read"] == 1
    r = await test_client.delete(_url(e.id), headers=gerente)
    assert r.status_code == 200 and r.json()["totals"]["read"] == 0
    assert (await test_client.get(_url(e.id), headers=ana)).json()["totals"]["read"] == 0


async def test_caixa_nao_confere_e_a_resposta_nao_tem_custo(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    e, vs, _, _ = await _entrada(async_session, t_id, cat)
    caixa = await _pessoa(async_session, t_id, "Caixa", UserRole.CASHIER)
    vendedora = await _pessoa(async_session, t_id, "Vendedora")
    assert (await test_client.get(_url(e.id), headers=caixa)).status_code == 403
    assert (await test_client.post(_url(e.id, "/apply"), json={"ops": []}, headers=caixa)).status_code == 403
    r = await test_client.get(_url(e.id), headers=vendedora)
    assert r.status_code == 200
    texto = r.text.lower()
    assert not any(k in texto for k in ("cost", "price", "custo", "preco", "preço", "margin"))


async def test_isolamento_entre_lojas(test_client, async_session, test_user):
    _sem_override()   # o conftest força a loja 1 em toda chamada; aqui cada token vale a loja dele
    t_id, token, cat = await _loja_api(async_session, test_user)
    e, vs, _, _ = await _entrada(async_session, t_id, cat)
    _, _, outro_token = await _nova_loja(async_session, "pro")
    outro = {"Authorization": f"Bearer {outro_token}"}
    # a outra loja não enxerga nem mexe na entrada desta
    assert (await test_client.get(_url(e.id), headers=outro)).status_code == 404
    assert (await test_client.post(_url(e.id, "/apply"), json={"ops": []}, headers=outro)).status_code == 404
    assert (await test_client.delete(_url(e.id), headers=outro)).status_code == 404
    # e esta loja não conta peça que não existe nela
    ana = await _pessoa(async_session, t_id, "Ana")
    r = await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": 99999999, "delta": 1}]}, headers=ana)
    assert r.status_code == 400
    assert (await test_client.get(_url(99999999), headers=ana)).status_code == 404


async def test_recebimento_e_estoque_nao_se_misturam(test_client, async_session, test_user):
    """É o mesmo serviço, mas a conferência de uma entrada não aparece na lista da Conferência de estoque nem impede de abrir
    uma conferência de estoque da loja (e a conferência de estoque não vira conferência de entrada)."""
    t_id, token, cat = await _loja_api(async_session, test_user)
    e, vs, _, _ = await _entrada(async_session, t_id, cat)
    ana = await _pessoa(async_session, t_id, "Ana")
    gerente = await _pessoa(async_session, t_id, "Gerente", UserRole.MANAGER)
    pp = vs[("Preto", "P")]
    await test_client.post(_url(e.id, "/apply"), json={"ops": [{"variant_id": pp, "delta": 1}]}, headers=ana)

    lista = (await test_client.get("/api/v1/reports/stock-counts", headers=gerente)).json()
    assert all("Recebimento" not in (c.get("name") or "") for c in lista["results"])
    abertas = (await test_client.get("/api/v1/reports/stock-counts?status=open", headers=gerente)).json()
    assert abertas["results"] == [] and abertas["total"] == 0

    # abrir uma conferência de estoque da loja continua possível com a de recebimento aberta
    r = await test_client.post("/api/v1/reports/stock-counts", json={"category_id": cat, "items": [{"variant_id": pp, "counted_quantity": 1}]}, headers=gerente)
    assert r.status_code == 201, r.text
    # e a contagem do recebimento segue intacta
    s = (await test_client.get(_url(e.id), headers=ana)).json()
    assert s["totals"]["read"] == 1


async def test_uma_conferencia_por_entrada_e_entradas_separadas(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    e1, vs1, _, _ = await _entrada(async_session, t_id, cat)
    e2, vs2, _, _ = await _entrada(async_session, t_id, cat)
    ana = await _pessoa(async_session, t_id, "Ana")
    bia = await _pessoa(async_session, t_id, "Bia")
    a = await test_client.post(_url(e1.id, "/apply"), json={"ops": [{"variant_id": vs1[("Preto", "P")], "delta": 1}]}, headers=ana)
    b = await test_client.post(_url(e1.id, "/apply"), json={"ops": [{"variant_id": vs1[("Preto", "P")], "delta": 1}]}, headers=bia)
    assert a.json()["count_id"] == b.json()["count_id"]          # as duas entraram na MESMA conferência
    c = await test_client.post(_url(e2.id, "/apply"), json={"ops": [{"variant_id": vs2[("Preto", "P")], "delta": 1}]}, headers=ana)
    assert c.json()["count_id"] != a.json()["count_id"]           # outra entrada, outra conferência
    assert (await test_client.get(_url(e1.id), headers=ana)).json()["totals"]["read"] == 2
    assert (await test_client.get(_url(e2.id), headers=ana)).json()["totals"]["read"] == 1


async def test_conferencia_de_estoque_tambem_nao_conta_lote_repetido(test_client, async_session, test_user):
    """O lote idempotente vale para a Conferência de estoque também (o mesmo serviço)."""
    t_id, token, cat = await _loja_api(async_session, test_user)
    e, vs, _, _ = await _entrada(async_session, t_id, cat)
    h = {"Authorization": f"Bearer {token}"}
    pp = vs[("Preto", "P")]
    cid = (await test_client.post("/api/v1/reports/stock-counts", json={"category_id": cat, "items": [{"variant_id": pp, "counted_quantity": 1}]}, headers=h)).json()["id"]
    corpo = {"batch_id": "est-1", "ops": [{"variant_id": pp, "delta": 1}]}
    await test_client.post(f"/api/v1/reports/stock-counts/{cid}/apply", json=corpo, headers=h)
    await test_client.post(f"/api/v1/reports/stock-counts/{cid}/apply", json=corpo, headers=h)
    d = (await test_client.get(f"/api/v1/reports/stock-counts/{cid}", headers=h)).json()
    assert {i["variant_id"]: i["counted_quantity"] for i in d["items"]}[pp] == 2     # 1 + 1 (o reenvio não somou)
