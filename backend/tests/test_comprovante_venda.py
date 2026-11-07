"""Comprovante da venda para a cliente: PDF (58/80/A6) e texto do WhatsApp. Nunca mostra custo; não é documento fiscal."""
import pytest

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio


def _texto_pdf(content: bytes) -> str:
    from tests.test_short_codes import _pdf_text
    return _pdf_text(content)


def _largura_mm(content: bytes) -> float:
    import re
    w = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", content)
    return float(w.group(1)) * 25.4 / 72


async def _venda(client, h, p, v, qtd=2, preco="100.00", cliente_id=None, desconto="0"):
    body = {"payment_method": "cash", "discount_amount": desconto,
            "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": preco}],
            "payments": [{"amount": str(float(preco) * qtd - float(desconto)), "payment_method": "cash"}]}
    if cliente_id:
        body["customer_id"] = cliente_id
    r = await client.post("/api/v1/sales/", headers=h, json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def test_comprovante_pdf_texto_e_sem_custo(test_client, async_session, test_user):
    from tests.test_troca import _cenario
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sid = await _venda(test_client, h, p, va, 2, "100.00")

    for size, largura in (("58", 58), ("80", 80), ("a6", 105)):
        r = await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf?size={size}", headers=h)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")
        assert abs(_largura_mm(r.content) - largura) < 0.5            # largura exata do papel
        t = _texto_pdf(r.content)
        assert "Legging Troca" in t and "R$ 200,00" in t and "Dinheiro" in t
        assert "Sem valor fiscal" in t
        assert "R$ 40,00" not in t and "custo" not in t.lower()        # custo nunca aparece

    r = await test_client.get(f"/api/v1/sales/{sid}/receipt", headers=h)
    assert r.status_code == 200
    j = r.json()
    assert "Total: R$ 200,00" in j["text"] and "2x Legging Troca" in j["text"] and "sem valor fiscal" in j["text"]
    assert "R$ 40,00" not in j["text"]
    assert j["whatsapp_url"] is None                                   # sem cliente, sem link
    assert j["receipt"]["pieces"] == 2


async def test_comprovante_com_cliente_desconto_troco_e_link(test_client, async_session, test_user):
    from tests.test_troca import _cenario
    from app.models.customer import Customer
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = Customer(full_name="Maria da Silva", phone="(34) 99650-0091", tenant_id=t_id)
    async_session.add(c)
    await async_session.commit()
    sid = await _venda(test_client, h, p, va, 3, "100.00", cliente_id=c.id, desconto="30")

    j = (await test_client.get(f"/api/v1/sales/{sid}/receipt?change=10", headers=h)).json()
    assert "Desconto: -R$ 30,00" in j["text"] and "Total: R$ 270,00" in j["text"] and "Troco: R$ 10,00" in j["text"]
    assert "Cliente: Maria da Silva" in j["text"]
    assert j["whatsapp_url"].startswith("https://wa.me/5534996500091?text=")
    assert "Maria%20da%20Silva" in j["whatsapp_url"]

    pdf = await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf?size=80&change=10", headers=h)
    t = _texto_pdf(pdf.content)
    assert "Maria da Silva" in t and "Troco" in t and "R$ 270,00" in t


async def test_comprovante_telefone_invalido_nao_gera_link(test_client, async_session, test_user):
    from tests.test_troca import _cenario
    from app.models.customer import Customer
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = Customer(full_name="Sem Fone", phone="123", tenant_id=t_id)
    async_session.add(c)
    await async_session.commit()
    sid = await _venda(test_client, h, p, va, 1, "100.00", cliente_id=c.id)
    j = (await test_client.get(f"/api/v1/sales/{sid}/receipt", headers=h)).json()
    assert j["whatsapp_url"] is None and "Cliente: Sem Fone" in j["text"]


async def test_comprovante_de_venda_cancelada_avisa(test_client, async_session, test_user):
    from tests.test_troca import _cenario
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sid = await _venda(test_client, h, p, va, 1, "100.00")
    assert (await test_client.post(f"/api/v1/sales/{sid}/cancel?reason=teste", headers=h)).status_code == 200
    j = (await test_client.get(f"/api/v1/sales/{sid}/receipt", headers=h)).json()
    assert "VENDA CANCELADA" in j["text"]
    assert "VENDA CANCELADA" in _texto_pdf((await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf", headers=h)).content)


async def test_comprovante_de_outra_loja_e_inexistente_dao_404_e_tamanho_invalido_422(test_client, async_session, test_user):
    from tests.test_troca import _cenario
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    assert (await test_client.get("/api/v1/sales/99999999/receipt", headers=h)).status_code == 404
    assert (await test_client.get("/api/v1/sales/99999999/receipt/pdf", headers=h)).status_code == 404
    sid = await _venda(test_client, h, p, va, 1, "100.00")
    assert (await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf?size=999", headers=h)).status_code == 422
    assert (await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf")).status_code in (401, 403)


async def test_listar_por_numero_devolve_so_a_venda_pedida(test_client, async_session, test_user):
    """Antes o filtro `sale_number` era ignorado sem período e vinha a venda mais recente (comprovante da venda errada)."""
    from tests.test_troca import _cenario
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    a = await _venda(test_client, h, p, va, 1, "100.00")
    b = await _venda(test_client, h, p, va, 1, "100.00")
    num_a = (await test_client.get(f"/api/v1/sales/{a}", headers=h)).json()["sale_number"]
    r = await test_client.get(f"/api/v1/sales/?sale_number={num_a}", headers=h)
    assert r.status_code == 200
    assert [x["id"] for x in r.json()] == [a]
    assert (await test_client.get("/api/v1/sales/?sale_number=NAO-EXISTE", headers=h)).json() == []
