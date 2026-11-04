"""Estoque atual em PDF com a cadeia entrada > fornecedor > produto."""
import shutil
import subprocess

import pytest

from tests.test_lot_costs import _loja_api, _limpa_loja_1, D  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio


async def test_cadeia_lista_so_o_que_resta_e_acompanha_a_venda(test_client, async_session, test_user):
    from tests.test_troca import _cenario, _vender
    from app.services.stock_chain_pdf_service import load_stock_chain
    t_id, h, p, va, vb = await _cenario(async_session, test_user)

    entradas = await load_stock_chain(async_session, t_id)
    itens = [i for e in entradas for i in e["items"] if i["product"].startswith("Legging Troca")]
    assert sorted(i["remaining"] for i in itens) == [10, 10]

    await _vender(test_client, h, p, va, 10, "100.00")   # A esgota: sai do PDF
    async_session.expire_all()
    entradas = await load_stock_chain(async_session, t_id)
    itens = [i for e in entradas for i in e["items"] if i["product"].startswith("Legging Troca")]
    assert [i["remaining"] for i in itens] == [10]
    assert itens[0]["variant"] == "Azul · M" and itens[0]["unit_cost"] == D("40")

    r = await test_client.get("/api/v1/reports/stock-chain/pdf", headers=h)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")
    if shutil.which("pdftotext"):
        txt = subprocess.run(["pdftotext", "-layout", "-", "-"], input=r.content, capture_output=True).stdout.decode()
        assert "Legging Troca" in txt and "Azul · M" in txt and "Fornecedor" in txt


async def test_pdf_do_estoque_sem_login_e_recusado(test_client):
    r = await test_client.get("/api/v1/reports/stock-chain/pdf")
    assert r.status_code in (401, 403)
