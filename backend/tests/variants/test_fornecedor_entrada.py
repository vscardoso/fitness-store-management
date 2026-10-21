"""Fase 1 de fornecedores: validação dos modelos e normalização de nomes (sem banco)."""
import pytest
from pydantic import ValidationError

from app.schemas.entry_item import EntryItemCreate
from app.schemas.stock_entry import StockEntryCreate
from app.services.stock_entry_service import StockEntryService

BASE = {"entry_code": "ENT-001", "entry_date": "2026-10-21", "entry_type": "local"}


def test_entrada_aceita_so_supplier_id():
    e = StockEntryCreate(**BASE, supplier_id=3)
    assert e.supplier_id == 3 and e.supplier_name is None


def test_entrada_aceita_so_supplier_name():
    assert StockEntryCreate(**BASE, supplier_name="Brás").supplier_name == "Brás"


@pytest.mark.parametrize("extra", [{}, {"supplier_name": "   "}])
def test_entrada_sem_fornecedor_e_recusada_com_mensagem_clara(extra):
    with pytest.raises(ValidationError, match="Informe o fornecedor"):
        StockEntryCreate(**BASE, **extra)


def test_entrada_com_nome_vazio_e_recusada():
    with pytest.raises(ValidationError):
        StockEntryCreate(**BASE, supplier_name="")


def test_item_aceita_supplier_id_opcional():
    com = EntryItemCreate(product_id=1, quantity_received=2, unit_cost=10, supplier_id=7)
    sem = EntryItemCreate(product_id=1, quantity_received=2, unit_cost=10)
    assert com.supplier_id == 7 and sem.supplier_id is None


@pytest.mark.parametrize(
    "a,b",
    [("Brás", "bras"), ("  BRÁS   Atacado ", "bras atacado"), ("São Paulo Modas", "sao paulo  modas")],
)
def test_nome_de_fornecedor_normalizado_ignora_acento_caixa_e_espacos(a, b):
    assert StockEntryService._norm_text(a) == StockEntryService._norm_text(b)


def test_nomes_diferentes_nao_se_confundem():
    assert StockEntryService._norm_text("Brás Atacado") != StockEntryService._norm_text("Brás Varejo")
