"""A lojista nunca vê SQL, nome de tabela ou rastreio: erro técnico vira frase clara; o original fica no registro de erros."""
from datetime import date

import pytest

from app.core.friendly_errors import friendly_from_text, is_technical
from tests.test_lot_costs import _loja_api, _limpa_loja_1, D  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio

ERRO_DO_PRINT = (
    "Erro ao lançar o produto na entrada: Error creating Product: (sqlalchemy.dialects.postgresql.asyncpg.Error) "
    "<class 'asyncpg.exceptions.StringDataRightTruncationError'>: value too long for type character varying(100) "
    "[SQL: INSERT INTO products (name, material) VALUES ($1::VARCHAR, $2::VARCHAR)] "
    "[parameters: ('Macacão', 'Tecido esticado')] (Background on this error at: https://sqlalche.me/e/20/dbapi)"
)


def test_texto_tecnico_vira_frase_clara():
    assert is_technical(ERRO_DO_PRINT)
    msg = friendly_from_text(ERRO_DO_PRINT)
    assert "100 letras" in msg and "maior" in msg
    for proibido in ("sql", "asyncpg", "varchar", "parameters", "products"):
        assert proibido not in msg.lower()
    assert "Já existe" in friendly_from_text('duplicate key value violates unique constraint "uq_variant_tenant_short_code"')
    assert "obrigatório" in friendly_from_text('null value in column "name" violates not-null constraint')
    assert "ocupado" in friendly_from_text("deadlock detected")
    assert "avise o suporte" in friendly_from_text("algo que ninguém previu")
    assert not is_technical("Estoque insuficiente para a peça Preto M.")


def test_scanner_corta_texto_no_limite_do_campo():
    from app.services.ai_scan_service import _clip
    longo = "Tecido esticado, provavelmente composto por poliamida e elastano (tecido de performance para fitness)"
    out = _clip(longo, 60)
    assert len(out) <= 60 and not out.endswith((",", " ")) and longo.startswith(out)
    assert _clip("Poliamida", 100) == "Poliamida" and _clip(None, 10) is None
    assert len(_clip("a" * 500, 100)) == 100                   # sem espaço para cortar: corta seco, nunca passa do limite


async def test_material_grande_vira_aviso_claro_e_nao_erro_500(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    r = await test_client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json={
        "entry_code": "ERR-0001", "entry_date": date.today().isoformat(), "entry_type": "local", "supplier_name": "Fornecedor",
        "product_name": "Macacão Longo", "product_category_id": cat, "base_price": 30, "product_material": "x" * 150,
        "variants": [{"sku": "ERR-1", "color": "Preto", "size": "M", "price": 30, "cost_price": 10, "quantity": 1}]})
    assert r.status_code == 422, r.text
    assert "Material: no máximo 100 letras" in r.json()["message"]


async def test_erro_tecnico_do_servidor_chega_limpo(test_client, async_session, test_user, monkeypatch):
    from app.services.stock_entry_service import StockEntryService

    async def estoura(self, *a, **k):
        raise Exception(ERRO_DO_PRINT)

    monkeypatch.setattr(StockEntryService, "add_new_product_to_entry", estoura)
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    r = await test_client.post("/api/v1/stock-entries/1/with-new-product", headers=h, json={
        "product_name": "Macacão", "product_category_id": cat, "base_price": 30,
        "variants": [{"sku": "ERR-2", "color": "Preto", "size": "M", "price": 30, "cost_price": 10, "quantity": 1}]})
    assert r.status_code == 500
    detail = r.json()["detail"]
    assert "100 letras" in detail and not is_technical(detail), detail
