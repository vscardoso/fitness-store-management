"""Gênero do produto na criação/atualização: normaliza, mantém quando não enviado e limpa com vazio."""
import pytest

from app.schemas.product import ProductCreate, ProductUpdate


@pytest.mark.parametrize("entrada,saida", [("feminina", "Feminino"), ("MASCULINO", "Masculino"),
                                           ("Unissex", "Unissex"), ("  ", None), ("", None)])
def test_update_normaliza_genero(entrada, saida):
    assert ProductUpdate(gender=entrada).gender == saida


def test_update_sem_genero_nao_toca_no_campo():
    assert "gender" not in ProductUpdate(brand="X").model_dump(exclude_unset=True)


def test_update_com_genero_vazio_envia_none_para_limpar():
    assert ProductUpdate(gender="").model_dump(exclude_unset=True) == {"gender": None}


def test_create_normaliza_genero():
    p = ProductCreate(name="Legging QA", sku="L-1", price=10, category_id=1, gender="feminina")
    assert p.gender == "Feminino"
