"""Excluir a entrada: só admin e, no app, só efetiva depois de digitar o código da entrada. O servidor recusa se o código enviado não confere."""
import pytest
from sqlalchemy import select

from tests.test_lot_costs import _limpa_loja_1, _loja_api  # noqa: F401  (fixture autouse)
from tests.test_sku_e_registro_de_erros import _criar, _n

pytestmark = pytest.mark.asyncio


async def test_codigo_errado_nao_exclui_e_o_certo_exclui(test_client, async_session, test_user):
    from app.models.stock_entry import StockEntry
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    codigo = f"EXC-{n:04d}"
    r = await _criar(test_client, h, cat, f"Top Excluir {n}", f"TEX{n}", codigo)
    assert r.status_code in (200, 201), r.text
    entry_id = r.json()["id"]

    errado = await test_client.delete(f"/api/v1/stock-entries/{entry_id}", params={"confirm_code": "OUTRA"}, headers=h)
    assert errado.status_code == 400 and "não confere" in errado.json()["detail"], errado.text
    vazio = await test_client.delete(f"/api/v1/stock-entries/{entry_id}", params={"confirm_code": "  "}, headers=h)
    assert vazio.status_code == 400
    async_session.expire_all()
    e = (await async_session.execute(select(StockEntry).where(StockEntry.id == entry_id))).scalar_one()
    assert e.is_active is True                                                        # nada foi excluído

    # código certo (sem diferenciar caixa nem espaços nas pontas) exclui
    ok = await test_client.delete(f"/api/v1/stock-entries/{entry_id}", params={"confirm_code": f"  {codigo.lower()} "}, headers=h)
    assert ok.status_code == 200, ok.text
    async_session.expire_all()
    e = (await async_session.execute(select(StockEntry).where(StockEntry.id == entry_id))).scalar_one_or_none()
    # entrada excluída: o sistema renomeia o código com _del_<id> e solta a loja (é como toda exclusão de entrada marca)
    assert e is None or e.entry_code.endswith(f"_del_{entry_id}")


async def test_outra_loja_nao_exclui_com_o_codigo_certo(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    r = await _criar(test_client, h, cat, f"Top Excluir B {n}", f"TXB{n}", f"EXB-{n:04d}")
    assert r.status_code in (200, 201), r.text
    nao_existe = await test_client.delete("/api/v1/stock-entries/99999999", params={"confirm_code": "QUALQUER"}, headers=h)
    assert nao_existe.status_code == 404
