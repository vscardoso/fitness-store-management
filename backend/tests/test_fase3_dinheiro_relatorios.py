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


async def test_excluir_uma_variacao_com_estoque_zera_so_ela(test_client, async_session, test_user):
    """Conjunto Alô com 3 variações de 1 peça (04/11): excluir uma só, zerando o estoque dela; as outras ficam."""
    from sqlalchemy import select
    from app.models.entry_item import EntryItem
    from app.models.product_variant import ProductVariant
    from tests.test_lot_costs import _loja_api, _produto, _lote
    from tests.test_troca import _cenario
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await test_client.delete(f"/api/v1/product-variants/{va.id}", headers=h)
    assert r.status_code == 400 and "estoque" in r.json()["detail"], r.text
    r = await test_client.delete(f"/api/v1/product-variants/{va.id}?zerar_estoque=true", headers=h)
    assert r.status_code == 204, r.text
    async_session.expire_all()
    assert (await async_session.get(ProductVariant, va.id)).is_active is False
    restos = (await async_session.execute(select(EntryItem.quantity_remaining).where(EntryItem.variant_id == va.id))).scalars().all()
    assert restos and all(q == 0 for q in restos)
    outros = (await async_session.execute(select(EntryItem.quantity_remaining).where(EntryItem.variant_id == vb.id))).scalars().all()
    assert sum(outros) > 0 and (await async_session.get(ProductVariant, vb.id)).is_active is True


async def test_item_da_entrada_traz_o_codigo_da_etiqueta(test_client, async_session, test_user):
    """Busca '26' na entrada não achava o #026: o item agora traz variant_code."""
    from sqlalchemy import select
    from app.models.entry_item import EntryItem
    from app.models.product_variant import ProductVariant
    from tests.test_troca import _cenario
    _, h, p, va, _ = await _cenario(async_session, test_user)
    va_db = await async_session.get(ProductVariant, va.id)
    va_db.product_code, va_db.variant_number = 26, 1
    await async_session.commit()
    entry_id = (await async_session.execute(select(EntryItem.entry_id).where(EntryItem.variant_id == va.id))).scalars().first()
    r = await test_client.get(f"/api/v1/stock-entries/{entry_id}", headers=h)
    assert r.status_code == 200, r.text
    codes = [i.get("variant_code") for i in r.json()["entry_items"]]
    assert "#026-1" in codes, codes


def test_folha_a4_tem_espaco_entre_etiquetas_sem_perder_nenhuma():
    """Corte torto não pega a vizinha: a sobra da folha vira espaço entre colunas e linhas (até 8 mm)."""
    from decimal import Decimal
    from app.services.label_pdf_service import a4_grid, a4_spacing, build_pdf, LabelData
    assert a4_grid(60, 50) == (3, 5) and a4_spacing(60, 50) == (8, 8)
    assert a4_grid(50, 45) == (3, 6) and a4_spacing(50, 45) == (8, 3.4)   # padrão: tag da W.A
    assert a4_grid(50, 60) == (3, 4) and a4_spacing(50, 60) == (8, 8)     # 4 colunas ficariam coladas: vira 3
    for w, h in ((50, 45), (60, 50), (50, 60), (65, 55), (30, 30), (100, 100)):
        cols, rows = a4_grid(w, h)
        gx, gy = a4_spacing(w, h)
        assert cols * w + (cols - 1) * gx <= 200 + 1e-6 and rows * h + (rows - 1) * gy <= 287 + 1e-6, (w, h)
        assert (cols == 1 or gx >= 2) and (rows == 1 or gy >= 2), (w, h)   # nunca uma etiqueta encostada na outra
    pdf = build_pdf([LabelData(name="Blusa", color="Preto", size="M", price=Decimal("49.90"), code="#043-9", qr="PV#043-9")] * 19)
    assert pdf.startswith(b"%PDF") and pdf.count(b"/Type /Page") >= 2   # 18 por folha: 19 pedem 2 folhas
