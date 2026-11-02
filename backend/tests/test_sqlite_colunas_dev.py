"""SQLite de desenvolvimento antigo: toda coluna nova de um modelo precisa estar em _SQLITE_EXTRA_COLUMNS, senão a rota que lê a tabela dá 500."""
from sqlalchemy import create_engine, inspect

from app.core import database as d
from app.models.base import Base
import app.models  # noqa: F401


def test_todas_as_colunas_de_modelo_tem_cobertura_para_banco_sqlite_antigo():
    # bancos antigos nasceram sem estas colunas: cada uma precisa constar no ajuste automático
    cobertas = {(t, n) for t, cols in d._SQLITE_EXTRA_COLUMNS.items() for n, _ in cols}
    for par in [("stores", "catalog_feed_token"), ("stores", "allow_stock_writeoff"), ("expenses", "stock_entry_id"),
                ("expenses", "trip_id"), ("entry_items", "extra_unit_cost")]:
        assert par in cobertas, par


def test_ajuste_acrescenta_colunas_que_faltam_em_loja_antiga():
    eng = create_engine("sqlite://")
    with eng.begin() as c:
        c.exec_driver_sql("create table stores (id integer primary key, name text)")
        c.exec_driver_sql("create table expenses (id integer primary key)")
        c.exec_driver_sql("create table entry_items (id integer primary key)")
        d._ensure_sqlite_columns(c)
        lojas = {x["name"] for x in inspect(c).get_columns("stores")}
        gastos = {x["name"] for x in inspect(c).get_columns("expenses")}
    assert {"catalog_feed_token", "allow_stock_writeoff"} <= lojas
    assert {"stock_entry_id", "trip_id"} <= gastos
