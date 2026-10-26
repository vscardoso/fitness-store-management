"""Testes puros de normalização e ordenação da grade tamanho x cor."""
import pytest
from pydantic import ValidationError

from app.utils.variant_grid import (
    normalize_size, normalize_color, size_sort_key, sort_sizes, sort_colors,
)
from app.schemas.product_variant import (
    ProductVariantCreate, ProductVariantUpdate, BulkVariantCreate,
    ProductWithVariantsCreate,
)


def test_normalize_size():
    assert normalize_size(" p ") == "P"
    assert normalize_size("gg") == "GG"
    assert normalize_size("xl") == "XG"
    assert normalize_size("único") == "ÚNICO"
    assert normalize_size("u") == "ÚNICO"
    assert normalize_size("38") == "38"
    assert normalize_size("   ") is None
    assert normalize_size(None) is None


def test_normalize_color():
    assert normalize_color("  azul   marinho ") == "Azul Marinho"
    assert normalize_color("PRETO") == "Preto"
    assert normalize_color("verde E preto") == "Verde e Preto"
    assert normalize_color("") is None


def test_sort_sizes_natural_order():
    assert sort_sizes(["GG", "P", "M", "PP", "G", "XG"]) == ["PP", "P", "M", "G", "GG", "XG"]
    assert sort_sizes(["40", "34", "38", "36"]) == ["34", "36", "38", "40"]
    assert sort_sizes(["M", "38", "ÚNICO", None]) == ["ÚNICO", "M", "38"]


def test_sort_colors_ignores_accent_and_case():
    assert sort_colors(["Verde", "Azul", "Água", None]) == ["Água", "Azul", "Verde"]


def test_size_sort_key_without_size_goes_last():
    assert size_sort_key(None) > size_sort_key("GG") > size_sort_key("PP")


def test_schema_normalizes_on_create_and_update():
    v = ProductVariantCreate(sku="X", size=" m ", color="roxo  claro", price=10)
    assert (v.size, v.color) == ("M", "Roxo Claro")
    u = ProductVariantUpdate(size="g", color=" preto")
    assert (u.size, u.color) == ("G", "Preto")


def test_bulk_dedupes_case_variants_and_normalizes_adjustments():
    b = BulkVariantCreate(
        product_id=1, sizes=["p", "P", " m"], colors=["preto", "PRETO", "Rosa"],
        base_price=50, price_adjustments={"gg": 5},
    )
    assert b.sizes == ["P", "M"]
    assert b.colors == ["Preto", "Rosa"]
    assert b.price_adjustments["GG"] == 5


def test_bulk_rejects_only_blank_sizes():
    with pytest.raises(ValidationError):
        BulkVariantCreate(product_id=1, sizes=["  "], colors=["Preto"], base_price=10)


def test_product_with_variants_detects_duplicate_after_normalization():
    with pytest.raises(ValidationError):
        ProductWithVariantsCreate(
            name="Legging", category_id=1,
            variants=[
                {"sku": "A", "size": "P", "color": "Preto", "price": 10},
                {"sku": "B", "size": "p ", "color": "preto", "price": 10},
            ],
        )


def test_tamanhos_compostos_e_unico():
    from app.utils.variant_grid import normalize_size, sort_sizes
    assert normalize_size("p/m") == "P/M"
    assert normalize_size("P / M") == "P/M"
    assert normalize_size("m-g") == "M/G"
    assert normalize_size("g\gg") == "G/GG"
    assert normalize_size("S/M") == "P/M"
    assert normalize_size("unico") == "ÚNICO"
    assert normalize_size("Único") == "ÚNICO"
    assert normalize_size("38-40") == "38/40"
    # duplo fica entre os dois tamanhos que junta
    assert sort_sizes(["G", "GG", "G/GG", "P", "M/G", "ÚNICO", "P/M", "M", "38", "PP"]) == [
        "ÚNICO", "PP", "P", "P/M", "M", "M/G", "G", "G/GG", "GG", "38",
    ]
