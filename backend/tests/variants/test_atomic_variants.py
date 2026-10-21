"""Regras do cadastro atômico de produto com variantes (validação dos modelos de requisição)."""
import pytest
from pydantic import ValidationError

from app.api.v1.endpoints.stock_entries import (
    NewVariantInput,
    StockEntryWithNewProductRequest,
    StockEntryWithNewProductVariantsRequest,
)
from app.utils.variant_grid import normalize_gender

BASE = {
    "product_name": "Legging QA",
    "product_category_id": 1,
    "base_price": 120,
    "entry_code": "  ent-001 ",
    "supplier_name": "Forn",
}


def test_variant_input_normaliza_tamanho_cor_e_sku():
    v = NewVariantInput(sku=" leg-p-pr ", size=" p ", color="preto", price=10, quantity=2)
    assert (v.sku, v.size, v.color) == ("LEG-P-PR", "P", "Preto")


def test_requisicao_com_variantes_normaliza_e_poe_codigo_em_maiusculas():
    req = StockEntryWithNewProductVariantsRequest(
        **BASE,
        product_gender="feminina",
        variants=[{"sku": "a1", "size": "pp", "color": "rosa pink", "quantity": 3}],
    )
    assert req.entry_code == "ENT-001"
    assert req.product_gender == "Feminino"
    assert (req.variants[0].size, req.variants[0].color) == ("PP", "Rosa Pink")


def test_duplicata_de_tamanho_e_cor_com_caixa_diferente_e_recusada():
    with pytest.raises(ValidationError, match="Variante duplicada"):
        StockEntryWithNewProductVariantsRequest(
            **BASE,
            variants=[
                {"sku": "a1", "size": "P", "color": "Preto", "quantity": 1},
                {"sku": "a2", "size": " p ", "color": "PRETO", "quantity": 1},
            ],
        )


def test_sku_repetido_na_mesma_requisicao_e_recusado():
    with pytest.raises(ValidationError, match="SKU repetido"):
        StockEntryWithNewProductVariantsRequest(
            **BASE,
            variants=[
                {"sku": "a1", "size": "P", "color": "Preto", "quantity": 1},
                {"sku": "A1", "size": "M", "color": "Preto", "quantity": 1},
            ],
        )


def test_lista_de_variantes_vazia_e_recusada():
    with pytest.raises(ValidationError):
        StockEntryWithNewProductVariantsRequest(**BASE, variants=[])


def test_produto_unico_aceita_genero_material_e_normaliza():
    req = StockEntryWithNewProductRequest(
        product_name="Top",
        product_sku="top-1",
        product_category_id=1,
        product_price=79.9,
        product_gender="MASCULINO",
        product_material="Poliamida",
        product_size=" m ",
        product_color="preto",
        quantity=1,
        entry_code="ent-9",
        supplier_name="Forn",
    )
    assert (req.product_gender, req.product_material) == ("Masculino", "Poliamida")
    assert (req.product_size, req.product_color) == ("M", "Preto")
    assert req.entry_code == "ENT-9"


@pytest.mark.parametrize(
    "entrada,saida",
    [("feminina", "Feminino"), ("FEMININO", "Feminino"), ("masculino", "Masculino"),
     ("Unissex", "Unissex"), ("unissex", "Unissex"), ("  ", None), (None, None)],
)
def test_normalize_gender(entrada, saida):
    assert normalize_gender(entrada) == saida
