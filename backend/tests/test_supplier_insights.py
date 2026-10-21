"""Fase 2 de fornecedores: regras puras (nota, classificação, texto de WhatsApp) e documento CPF/CNPJ."""
import pytest
from pydantic import ValidationError

from app.schemas.stock_entry import StockEntryUpdate, validate_cpf_cnpj
from app.services.supplier_insights_service import (
    compute_score,
    rating_for,
    whatsapp_message,
)


def test_score_pondera_giro_e_margem():
    # 60% do giro + 40% da margem: 0.6*80 + 0.4*50 = 68
    assert compute_score(80, 50) == 68


def test_score_sem_margem_nao_tem_nota():
    assert compute_score(40, None) is None


def test_score_limita_entre_0_e_100():
    assert compute_score(150, 300) == 100
    assert compute_score(-10, -50) == 0


@pytest.mark.parametrize(
    "score,low,esperado",
    [(70, False, "otimo"), (69, False, "bom"), (45, False, "bom"), (44, False, "atencao"),
     (90, True, "sem_dados"), (None, False, "sem_dados")],
)
def test_classificacao(score, low, esperado):
    assert rating_for(score, low) == esperado


def test_texto_whatsapp_sem_preco_e_com_variacao():
    txt = whatsapp_message("Brás Atacado", [
        {"product_name": "Legging", "size": "M", "color": "Preto", "suggested_qty": 3},
        {"product_name": "Top", "size": None, "color": None, "suggested_qty": 1},
    ])
    assert txt.startswith("Olá, Brás Atacado!")
    assert "- Legging (M · Preto): 3 un" in txt
    assert "- Top: 1 un" in txt
    assert "R$" not in txt


@pytest.mark.parametrize("valor", [None, "", "  ", "12345678901", "123.456.789-01", "12.345.678/0001-90"])
def test_documento_aceita_vazio_cpf_e_cnpj(valor):
    assert validate_cpf_cnpj(valor) == valor


@pytest.mark.parametrize("valor", ["123", "1234567890", "123456789012", "123456789012345"])
def test_documento_recusa_tamanho_errado(valor):
    with pytest.raises(ValueError):
        validate_cpf_cnpj(valor)


def test_atualizacao_da_entrada_aceita_cpf():
    assert StockEntryUpdate(supplier_cnpj="123.456.789-01").supplier_cnpj == "123.456.789-01"
    with pytest.raises(ValidationError):
        StockEntryUpdate(supplier_cnpj="123")
