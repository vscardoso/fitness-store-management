"""Custo obrigatório nas entradas: ausente ou zero é recusado; zero só vale em doação."""
from decimal import Decimal

import pytest

from app.models.stock_entry import EntryType
from app.services.stock_entry_service import StockEntryService

exige = StockEntryService._require_cost


@pytest.mark.parametrize("custo", [None, 0, "0", Decimal("0"), -1, "abc"])
def test_custo_ausente_zero_ou_invalido_e_recusado(custo):
    with pytest.raises(ValueError, match="Informe o custo de Legging P"):
        exige(custo, "Legging P", EntryType.LOCAL)


def test_mensagem_explica_o_motivo():
    with pytest.raises(ValueError, match="lucro \\(FIFO\\) fica incorreto"):
        exige(None, "Legging P", "local")


@pytest.mark.parametrize("tipo", [EntryType.LOCAL, EntryType.TRIP, EntryType.ONLINE, "local", None])
def test_custo_positivo_e_aceito(tipo):
    assert exige(35.5, "Legging P", tipo) == Decimal("35.5")


@pytest.mark.parametrize("tipo", [EntryType.DONATION, "donation"])
def test_zero_so_vale_em_doacao(tipo):
    assert exige(0, "Brinde", tipo) == Decimal("0")


def test_doacao_continua_recusando_custo_ausente():
    with pytest.raises(ValueError):
        exige(None, "Brinde", EntryType.DONATION)


def test_rotulo_da_variacao():
    f = StockEntryService._variant_label
    assert f("P", "Preto", "L-1") == "P / Preto (SKU L-1)"
    assert f(None, None, None) == "variação única"
    assert f("M", None, None) == "M"
