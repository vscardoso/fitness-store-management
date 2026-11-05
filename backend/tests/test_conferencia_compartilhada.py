"""Conferência compartilhada: duas pessoas contam a mesma conferência ao mesmo tempo e uma não apaga a outra."""
import pytest

from app.core.security import create_access_token, get_password_hash
from app.models.user import User, UserRole
from tests.test_lot_costs import _limpa_loja_1, _loja_api  # noqa: F401
from tests.test_stock_check import _n, _produto_com_variacoes

pytestmark = pytest.mark.asyncio


async def _segunda_pessoa(db, tenant_id, nome="Bia Conferente"):
    u = User(email=f"conf.{next(_n)}@example.com", full_name=nome, hashed_password=get_password_hash("Senha1234"),
             role=UserRole.MANAGER, is_active=True, tenant_id=tenant_id)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}


async def test_duas_pessoas_somam_sem_apagar_uma_a_outra(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    await _produto_com_variacoes(async_session, t_id, cat, "Legging Dupla", [("Preto", "P", 5), ("Preto", "M", 3), ("Rosa", "M", 2)])
    await async_session.commit()
    ana = {"Authorization": f"Bearer {token}"}
    bia = await _segunda_pessoa(async_session, t_id)
    rows = {(r["color"], r["size"]): r["variant_id"] for r in
            (await test_client.get(f"/api/v1/reports/stock-check?category_id={cat}", headers=ana)).json()["rows"]}
    pp, pm, rm = rows[("Preto", "P")], rows[("Preto", "M")], rows[("Rosa", "M")]

    # Ana começa a conferência
    r = await test_client.post("/api/v1/reports/stock-counts",
                               json={"category_id": cat, "items": [{"variant_id": pp, "counted_quantity": 1}]}, headers=ana)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    url = f"/api/v1/reports/stock-counts/{cid}/apply"

    # as duas bipam a mesma peça (Preto P) e cada uma uma peça diferente
    assert (await test_client.post(url, json={"ops": [{"variant_id": pp, "delta": 1}, {"variant_id": pp, "delta": 1}]}, headers=bia)).status_code == 200
    assert (await test_client.post(url, json={"ops": [{"variant_id": pp, "delta": 1}, {"variant_id": pm, "delta": 1}]}, headers=ana)).status_code == 200
    r = await test_client.post(url, json={"ops": [{"variant_id": rm, "set": 2}]}, headers=bia)
    assert r.status_code == 200, r.text

    d = (await test_client.get(f"/api/v1/reports/stock-counts/{cid}", headers=ana)).json()
    por = {i["variant_id"]: i for i in d["items"]}
    assert por[pp]["counted_quantity"] == 4          # 1 (Ana) + 2 (Bia) + 1 (Ana): ninguém apagou ninguém
    assert por[pm]["counted_quantity"] == 1 and por[pm]["counted_by_name"] == test_user.full_name
    assert por[rm]["counted_quantity"] == 2 and por[rm]["counted_by_name"] == "Bia Conferente"
    s = d["count"]
    assert (s["counted_variants"], s["counted_pieces"], s["short_pieces"]) == (3, 7, 3)   # PP falta 1, PM falta 2
    assert s["revision"] >= 4

    # seta para baixo nunca passa de 0; "limpar" volta a peça para não contada
    await test_client.post(url, json={"ops": [{"variant_id": pm, "delta": -1}, {"variant_id": pm, "delta": -1}]}, headers=bia)
    await test_client.post(url, json={"ops": [{"variant_id": rm, "clear": True}]}, headers=ana)
    d = (await test_client.get(f"/api/v1/reports/stock-counts/{cid}", headers=ana)).json()
    por = {i["variant_id"]: i["counted_quantity"] for i in d["items"]}
    assert por == {pp: 4, pm: 0}

    # uma conferência só: com esta aberta, ninguém abre outra
    r = await test_client.post("/api/v1/reports/stock-counts",
                               json={"category_id": cat, "items": [{"variant_id": pm, "counted_quantity": 1}]}, headers=bia)
    assert r.status_code == 409 and f"[#{cid}]" in r.json()["detail"]

    # finalizar exige a tela atualizada: com revisão velha (Ana contou depois) é recusado
    rev_bia = d["count"]["revision"]
    await test_client.post(url, json={"ops": [{"variant_id": pp, "delta": 1}]}, headers=ana)
    r = await test_client.post(url, json={"finish": True, "revision": rev_bia}, headers=bia)
    assert r.status_code == 409 and "atualizada" in r.json()["detail"]
    r = await test_client.post(url, json={"finish": True}, headers=bia)   # sem dizer o que está vendo: recusado
    assert r.status_code == 409
    r = await test_client.post(url, json={"finish": True, "ops": [{"variant_id": pp, "delta": 1}], "revision": 999}, headers=bia)
    assert r.status_code == 409   # contagem pendente junto com o finalizar: recusado (manda antes, atualiza, finaliza)
    d = (await test_client.get(f"/api/v1/reports/stock-counts/{cid}", headers=bia)).json()
    assert {i["variant_id"]: i["counted_quantity"] for i in d["items"]}[pp] == 5

    # Bia finaliza com a tela atualizada; depois disso ninguém muda mais (409 com frase clara)
    r = await test_client.post(url, json={"finish": True, "name": "Loja toda", "revision": d["count"]["revision"]}, headers=bia)
    assert r.status_code == 200 and r.json()["status"] == "finished" and r.json()["name"] == "Loja toda"
    r = await test_client.post(url, json={"ops": [{"variant_id": pp, "delta": 1}]}, headers=ana)
    assert r.status_code == 409 and "finalizada" in r.json()["detail"]


async def test_peca_de_fora_e_conferencia_de_outra_loja_sao_recusadas(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    await _produto_com_variacoes(async_session, t_id, cat, "Top Sozinho", [("Preto", "M", 1)])
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    vid = (await test_client.get(f"/api/v1/reports/stock-check?category_id={cat}", headers=h)).json()["rows"][0]["variant_id"]
    cid = (await test_client.post("/api/v1/reports/stock-counts",
                                  json={"category_id": cat, "items": [{"variant_id": vid, "counted_quantity": 1}]}, headers=h)).json()["id"]
    r = await test_client.post(f"/api/v1/reports/stock-counts/{cid}/apply", json={"ops": [{"variant_id": 999999, "delta": 1}]}, headers=h)
    assert r.status_code == 400
    r = await test_client.post("/api/v1/reports/stock-counts/999999/apply", json={"ops": []}, headers=h)
    assert r.status_code == 404


async def test_apagar_em_andamento_e_comecar_de_novo(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    await _produto_com_variacoes(async_session, t_id, cat, "Short Zerar", [("Preto", "M", 1)])
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    vid = (await test_client.get(f"/api/v1/reports/stock-check?category_id={cat}", headers=h)).json()["rows"][0]["variant_id"]
    url = "/api/v1/reports/stock-counts"
    cid = (await test_client.post(url, json={"items": [{"variant_id": vid, "counted_quantity": 4}]}, headers=h)).json()["id"]
    assert (await test_client.delete(f"{url}/{cid}", headers=h)).status_code == 204
    # os aparelhos que contavam nela recebem 404 (e limpam a tela)
    assert (await test_client.get(f"{url}/{cid}", headers=h)).status_code == 404
    assert (await test_client.post(f"{url}/{cid}/apply", json={"ops": [{"variant_id": vid, "delta": 1}]}, headers=h)).status_code == 404
    # começa outra do zero (a apagada não trava)
    r = await test_client.post(url, json={"items": [{"variant_id": vid, "counted_quantity": 1}]}, headers=h)
    assert r.status_code == 201, r.text
    novo = r.json()["id"]
    # finalizada não se apaga
    d = (await test_client.get(f"{url}/{novo}", headers=h)).json()
    await test_client.post(f"{url}/{novo}/apply", json={"finish": True, "revision": d["count"]["revision"]}, headers=h)
    assert (await test_client.delete(f"{url}/{novo}", headers=h)).status_code == 409


async def test_soma_em_bloco_e_recusada(test_client, async_session, test_user):
    """A versão antiga do app mandava delta = número inteiro guardado no celular e dobrava a conferência."""
    t_id, token, cat = await _loja_api(async_session, test_user)
    await _produto_com_variacoes(async_session, t_id, cat, "Top Bloco", [("Preto", "M", 1)])
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    vid = (await test_client.get(f"/api/v1/reports/stock-check?category_id={cat}", headers=h)).json()["rows"][0]["variant_id"]
    cid = (await test_client.post("/api/v1/reports/stock-counts", json={"items": [{"variant_id": vid, "counted_quantity": 1}]}, headers=h)).json()["id"]
    url = f"/api/v1/reports/stock-counts/{cid}/apply"
    assert (await test_client.post(url, json={"ops": [{"variant_id": vid, "delta": 2}]}, headers=h)).status_code == 422
    assert (await test_client.post(url, json={"ops": [{"variant_id": vid, "delta": 1}]}, headers=h)).status_code == 200
    d = (await test_client.get(f"/api/v1/reports/stock-counts/{cid}", headers=h)).json()
    assert d["items"][0]["counted_quantity"] == 2
