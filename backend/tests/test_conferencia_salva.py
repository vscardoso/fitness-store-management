"""Conferência de estoque salva: data, quem contou, resultado por peça, só da própria loja, só gerente, tudo-ou-nada."""
import pytest
from sqlalchemy import func, select

from app.core.security import create_access_token, get_password_hash
from tests.test_lot_costs import _limpa_loja_1, _loja_api  # noqa: F401
from tests.test_stock_check import _n, _produto_com_variacoes
from tests.test_team_limit import _nova_loja

pytestmark = pytest.mark.asyncio


async def _linhas(test_client, h, cat):
    r = await test_client.get(f"/api/v1/reports/stock-check?category_id={cat}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()["rows"]


async def test_salvar_grava_data_autor_e_diferencas(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    await _produto_com_variacoes(async_session, t_id, cat, "Legging Salva", [("Preto", "P", 5), ("Preto", "M", 3), ("Preto", "G", 2), ("Rosa", "M", 4)])
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    rows = {(r["color"], r["size"]): r for r in await _linhas(test_client, h, cat)}
    corpo = {
        "name": "Prateleira 2", "note": "contagem de teste", "category_id": cat,
        "items": [
            {"variant_id": rows[("Preto", "P")]["variant_id"], "counted_quantity": 5},   # confere
            {"variant_id": rows[("Preto", "M")]["variant_id"], "counted_quantity": 1},   # falta 2
            {"variant_id": rows[("Preto", "G")]["variant_id"], "counted_quantity": 4},   # sobra 2
        ],
    }
    r = await test_client.post("/api/v1/reports/stock-counts", json=corpo, headers=h)
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["name"] == "Prateleira 2" and s["created_at"] and s["created_by_name"]
    assert (s["total_variants"], s["counted_variants"], s["ok_variants"], s["diff_variants"]) == (4, 3, 1, 2)
    assert (s["short_pieces"], s["over_pieces"], s["system_pieces"], s["counted_pieces"]) == (2, 2, 10, 10)

    d = (await test_client.get(f"/api/v1/reports/stock-counts/{s['id']}", headers=h)).json()
    assert [(i["size"], i["system_quantity"], i["counted_quantity"], i["difference"]) for i in d["items"]] == [
        ("P", 5, 5, 0), ("M", 3, 1, -2), ("G", 2, 4, 2)]   # ordem natural de tamanho
    d2 = (await test_client.get(f"/api/v1/reports/stock-counts/{s['id']}?only_diffs=true", headers=h)).json()
    assert [i["size"] for i in d2["items"]] == ["M", "G"]

    lista = (await test_client.get("/api/v1/reports/stock-counts", headers=h)).json()
    assert lista["total"] >= 1 and lista["results"][0]["id"] == s["id"]   # mais recente primeiro


async def test_fotografia_nao_muda_quando_a_peca_muda_depois(test_client, async_session, test_user):
    from app.models.product import Product
    t_id, token, cat = await _loja_api(async_session, test_user)
    p = await _produto_com_variacoes(async_session, t_id, cat, "Nome Original", [("Azul", "M", 4)])
    pid, nome = p.id, p.name
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    vid = (await _linhas(test_client, h, cat))[0]["variant_id"]
    sid = (await test_client.post("/api/v1/reports/stock-counts", json={"category_id": cat, "items": [{"variant_id": vid, "counted_quantity": 3}]}, headers=h)).json()["id"]
    prod = (await async_session.execute(select(Product).where(Product.id == pid))).scalar_one()
    prod.name = "Nome Novo Depois"
    prod.is_active = False
    await async_session.commit()
    d = (await test_client.get(f"/api/v1/reports/stock-counts/{sid}", headers=h)).json()
    assert d["items"][0]["product_name"] == nome and d["items"][0]["difference"] == -1


async def test_recusas_sem_gravar_nada(test_client, async_session, test_user):
    from app.models.stock_count import StockCount, StockCountItem
    t_id, token, cat = await _loja_api(async_session, test_user)
    await _produto_com_variacoes(async_session, t_id, cat, "Recusa", [("Preto", "M", 2)])
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    vid = (await _linhas(test_client, h, cat))[0]["variant_id"]
    antes = ((await async_session.execute(select(func.count(StockCount.id)))).scalar(),
             (await async_session.execute(select(func.count(StockCountItem.id)))).scalar())
    url = "/api/v1/reports/stock-counts"
    assert (await test_client.post(url, json={"items": []}, headers=h)).status_code == 422                       # vazio
    assert (await test_client.post(url, json={"items": [{"variant_id": vid, "counted_quantity": -1}]}, headers=h)).status_code == 422
    r = await test_client.post(url, json={"items": [{"variant_id": vid, "counted_quantity": 1}, {"variant_id": 99999999, "counted_quantity": 1}]}, headers=h)
    assert r.status_code == 400 and "não existem" in r.json()["detail"]                                         # peça de fora: nada grava
    assert (await test_client.post(url, json={"category_id": 99999999, "items": [{"variant_id": vid, "counted_quantity": 1}]}, headers=h)).status_code == 400
    assert (await test_client.get(f"{url}/99999999", headers=h)).status_code == 404
    depois = ((await async_session.execute(select(func.count(StockCount.id)))).scalar(),
              (await async_session.execute(select(func.count(StockCountItem.id)))).scalar())
    assert depois == antes
    # a mesma peça repetida vale a última
    r = await test_client.post(url, json={"category_id": cat, "items": [{"variant_id": vid, "counted_quantity": 9}, {"variant_id": vid, "counted_quantity": 2}]}, headers=h)
    assert r.status_code == 201 and r.json()["counted_variants"] == 1 and r.json()["ok_variants"] == 1


async def test_so_da_propria_loja_e_so_gerente(test_client, async_session, test_user):
    from app.api.deps import get_current_tenant_id
    from app.main import app
    from app.models.user import User, UserRole
    t_id, token_a, cat = await _loja_api(async_session, test_user)
    await _produto_com_variacoes(async_session, t_id, cat, "Loja A Conf", [("Preto", "M", 2)])
    await async_session.commit()
    ha = {"Authorization": f"Bearer {token_a}"}
    vid = (await _linhas(test_client, ha, cat))[0]["variant_id"]
    sid = (await test_client.post("/api/v1/reports/stock-counts", json={"category_id": cat, "items": [{"variant_id": vid, "counted_quantity": 2}]}, headers=ha)).json()["id"]
    app.dependency_overrides.pop(get_current_tenant_id, None)   # resolução real de loja
    tenant_b, _, token_b = await _nova_loja(async_session, "pro")
    hb = {"Authorization": f"Bearer {token_b}"}
    assert (await test_client.get(f"/api/v1/reports/stock-counts/{sid}", headers=hb)).status_code == 404
    assert (await test_client.get("/api/v1/reports/stock-counts", headers=hb)).json()["total"] == 0
    r = await test_client.post("/api/v1/reports/stock-counts", json={"items": [{"variant_id": vid, "counted_quantity": 1}]}, headers=hb)
    assert r.status_code == 400   # a peça é da loja A: não existe para a B
    for papel in (UserRole.CASHIER, UserRole.SELLER):
        u = User(email=f"papel.{papel.value}.{next(_n)}@example.com", full_name="Papel", hashed_password=get_password_hash("Senha1234"),
                 role=papel, is_active=True, tenant_id=tenant_b)
        async_session.add(u)
        await async_session.commit()
        await async_session.refresh(u)
        hh = {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}
        assert (await test_client.get("/api/v1/reports/stock-counts", headers=hh)).status_code == 403
        assert (await test_client.post("/api/v1/reports/stock-counts", json={"items": [{"variant_id": 1, "counted_quantity": 1}]}, headers=hh)).status_code == 403
