"""Fase 3 da ajuda e integridade: desconto de pagamento recriado, Histórico em português e produto com nome repetido."""
import pytest

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse: limpa a loja 1 depois de cada teste)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/payment-discounts"


async def test_remover_e_criar_de_novo_a_mesma_forma(test_client, async_session, test_user):
    _, h, *_ = await _cenario(async_session, test_user)
    for d in (await test_client.get(f"{API}/", headers=h)).json()["items"]:
        await test_client.delete(f"{API}/{d['id']}", headers=h)

    r = await test_client.post(f"{API}/", headers=h, json={"payment_method": "pix", "discount_percentage": "5"})
    assert r.status_code in (200, 201), r.text
    first_id = r.json()["id"]

    # mesma forma ativa: recusa com mensagem em português
    r = await test_client.post(f"{API}/", headers=h, json={"payment_method": "pix", "discount_percentage": "7"})
    assert r.status_code == 400 and "Já existe" in r.json()["detail"], r.text

    assert (await test_client.delete(f"{API}/{first_id}", headers=h)).status_code in (200, 204)
    assert all(d["payment_method"] != "pix" for d in (await test_client.get(f"{API}/", headers=h)).json()["items"])

    # criar de novo reaproveita a linha removida, com o percentual novo
    r = await test_client.post(f"{API}/", headers=h, json={"payment_method": "pix", "discount_percentage": "8", "description": "Volta"})
    assert r.status_code in (200, 201), r.text
    assert r.json()["id"] == first_id and float(r.json()["discount_percentage"]) == 8 and r.json()["is_active"] is True
    calc = (await test_client.post(f"{API}/calculate?payment_method=pix&amount=100", headers=h)).json()
    assert float(calc["discount_amount"]) == 8


async def test_historico_rotulos_em_portugues_e_hora_do_brasil(test_client, async_session, test_user):
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo
    from tests.test_troca import _vender
    _, h, p, va, _ = await _cenario(async_session, test_user)
    await _vender(test_client, h, p, va, 1, "100.00")
    agora_br = datetime.now(timezone.utc).astimezone(ZoneInfo("America/Sao_Paulo"))
    r = await test_client.get("/api/v1/reports/history?period=last_7_days", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    eventos = body["events"]
    vendas = [e for e in eventos if e["type"] == "sale"]
    entradas = [e for e in eventos if e["type"] == "entry"]
    assert vendas and vendas[0]["status"] == "Concluída" and vendas[0]["color"] == "#10B981"
    assert vendas[0]["date"] == agora_br.strftime("%d/%m/%Y")
    assert abs(int(vendas[0]["time"][:2]) - agora_br.hour) in (0, 1, 23)
    assert entradas and all(e["status"][0].isupper() for e in entradas), entradas


async def test_produto_com_nome_repetido_e_recusado(test_client, async_session, test_user):
    """#001 e #002 com o mesmo nome e as mesmas cores (PDF do estoque, 04/11): criar ou renomear para nome existente é recusado."""
    from tests.test_lot_costs import _loja_api, _produto
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, _ = await _produto(async_session, t_id, cat, "Macacao Tipo Meia")
    await async_session.commit()
    body = {"name": "  " + p.name.upper() + " ", "sku": "DUP-XYZ-1", "price": "50.00", "category_id": cat}
    r = await test_client.post("/api/v1/products/", headers=h, json=body)
    assert r.status_code == 400 and "Já existe o produto" in r.json()["detail"], r.text
    chk = (await test_client.get("/api/v1/products/name-check", headers=h, params={"name": " macacao tipo meia " + p.name.split()[-1]})).json()
    assert chk["exists"] is True and chk["product"]["id"] == p.id, chk
    assert (await test_client.get("/api/v1/products/name-check", headers=h, params={"name": "Nome que nao existe"})).json() == {"exists": False}
    r = await test_client.post("/api/v1/products/", headers=h, json={**body, "name": "Produto Novo Unico"})
    assert r.status_code in (200, 201), r.text
    novo = r.json()["id"]
    r = await test_client.put(f"/api/v1/products/{novo}", headers=h, json={"name": p.name})
    assert r.status_code == 400 and "Já existe o produto" in r.json()["detail"], r.text
    r = await test_client.put(f"/api/v1/products/{novo}", headers=h, json={"name": "Produto Novo Unico"})
    assert r.status_code == 200, r.text
