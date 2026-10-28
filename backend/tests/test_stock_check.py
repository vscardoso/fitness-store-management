"""Relatório de conferência de estoque: quantidade do sistema por variação, sem custo, por loja e por papel."""
import itertools

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, get_password_hash
from tests.test_lot_costs import _limpa_loja_1, _loja_api, _lote  # noqa: F401
from tests.test_team_limit import _nova_loja

pytestmark = pytest.mark.asyncio
_n = itertools.count(1)


async def _produto_com_variacoes(db, tenant_id, cat_id, nome, variacoes):
    """variacoes: [(cor, tamanho, quantidade_em_estoque)]. Cria produto, variações e UMA entrada com os itens."""
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    n = next(_n)
    p = Product(name=f"{nome} {n}", category_id=cat_id, tenant_id=tenant_id, base_price=100)
    db.add(p)
    await db.flush()
    itens = []
    for k, (cor, tam, qtd) in enumerate(variacoes):
        v = ProductVariant(product_id=p.id, sku=f"SC-{n}-{k}", color=cor, size=tam, price=100, tenant_id=tenant_id)
        db.add(v)
        await db.flush()
        if qtd:
            itens.append((v, p, qtd, 10))
    if itens:
        await _lote(db, tenant_id, itens)
    return p


async def test_relatorio_traz_a_quantidade_do_sistema_por_variacao(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    p = await _produto_com_variacoes(async_session, t_id, cat, "Legging Conf", [("Preto", "M", 5), ("Preto", "G", 0), ("Preto", "P", 2)])
    nome = p.name
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    r = await test_client.get(f"/api/v1/reports/stock-check?category_id={cat}", headers=h)
    assert r.status_code == 200, r.text
    corpo = r.json()
    linhas = [x for x in corpo["rows"] if x["product_name"] == nome]
    assert [(x["size"], x["system_quantity"]) for x in linhas] == [("P", 2), ("M", 5), ("G", 0)]   # tamanhos em ordem natural
    assert corpo["total_variants"] == 3 and corpo["total_pieces"] == 7
    # nada de custo ou preço na lista (ela circula na contagem)
    assert all(not ({"unit_cost", "cost_price", "price", "landed_unit_cost"} & set(x)) for x in corpo["rows"])
    # só com estoque
    r = await test_client.get(f"/api/v1/reports/stock-check?category_id={cat}&only_in_stock=true", headers=h)
    assert [x["size"] for x in r.json()["rows"]] == ["P", "M"]


async def test_venda_e_entrada_apagada_mudam_a_quantidade_e_variacao_inativa_some(test_client, async_session, test_user):
    from app.models.entry_item import EntryItem
    from app.models.product_variant import ProductVariant
    from app.models.stock_entry import StockEntry
    t_id, token, cat = await _loja_api(async_session, test_user)
    p = await _produto_com_variacoes(async_session, t_id, cat, "Top Conf", [("Azul", "M", 4), ("Rosa", "M", 3)])
    nome = p.name
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    # simula venda de 1 peça (FIFO baixa o restante) e desativa a variação Rosa
    item = (await async_session.execute(select(EntryItem).join(ProductVariant, ProductVariant.id == EntryItem.variant_id).where(
        ProductVariant.color == "Azul", ProductVariant.sku.like("SC-%")).order_by(EntryItem.id.desc()))).scalars().first()
    item.quantity_remaining -= 1
    rosa = (await async_session.execute(select(ProductVariant).where(ProductVariant.color == "Rosa").order_by(ProductVariant.id.desc()))).scalars().first()
    rosa.is_active = False
    await async_session.commit()
    linhas = [x for x in (await test_client.get(f"/api/v1/reports/stock-check?category_id={cat}", headers=h)).json()["rows"] if x["product_name"] == nome]
    assert [(x["color"], x["system_quantity"]) for x in linhas] == [("Azul", 3)]
    # entrada desativada tira o estoque do relatório
    entrada = (await async_session.execute(select(StockEntry).where(StockEntry.id == item.entry_id))).scalar_one()
    entrada.is_active = False
    await async_session.commit()
    linhas = [x for x in (await test_client.get(f"/api/v1/reports/stock-check?category_id={cat}", headers=h)).json()["rows"] if x["product_name"] == nome]
    assert [x["system_quantity"] for x in linhas] == [0]


async def test_relatorio_e_so_da_propria_loja_e_so_para_gerente(test_client, async_session, test_user):
    from app.api.deps import get_current_tenant_id
    from app.main import app
    from app.models.user import User, UserRole
    t_id, token_a, cat = await _loja_api(async_session, test_user)
    p = await _produto_com_variacoes(async_session, t_id, cat, "Exclusivo Loja A", [("Verde", "M", 2)])
    nome = p.name
    await async_session.commit()
    # outra loja (o conftest força a loja 1; aqui vale a resolução real)
    app.dependency_overrides.pop(get_current_tenant_id, None)
    tenant_b, _, token_b = await _nova_loja(async_session, "pro")
    r = await test_client.get("/api/v1/reports/stock-check", headers={"Authorization": f"Bearer {token_b}"})
    assert r.status_code == 200 and all(x["product_name"] != nome for x in r.json()["rows"])
    # caixa não acessa (relatórios são de gerente para cima)
    u = User(email=f"caixa.conf.{next(_n)}@example.com", full_name="Caixa Conf", hashed_password=get_password_hash("Senha1234"),
             role=UserRole.CASHIER, is_active=True, tenant_id=tenant_b)
    async_session.add(u)
    await async_session.commit()
    await async_session.refresh(u)
    r = await test_client.get("/api/v1/reports/stock-check", headers={"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"})
    assert r.status_code == 403


async def test_alerta_de_estoque_com_nome_enorme_cabe_na_coluna(async_session, test_user):
    """Produto com nome de ~300 letras gerava título > 255 e o Postgres recusava (o app via 422 em unread-count)."""
    from app.models.inventory import Inventory
    from app.models.notification import AppNotification
    from app.services.app_notification_service import AppNotificationService
    t_id, _token, cat = await _loja_api(async_session, test_user)
    p = await _produto_com_variacoes(async_session, t_id, cat, "N" * 300, [("Preto", "M", 3)])
    pid = p.id
    async_session.add(Inventory(product_id=pid, quantity=0, min_stock=2, tenant_id=t_id))
    await async_session.commit()
    await AppNotificationService().sync_stock_alerts(async_session, t_id)
    await async_session.commit()
    rows = (await async_session.execute(select(AppNotification).where(AppNotification.product_id == pid))).scalars().all()
    assert rows and all(len(r.title) <= 255 for r in rows), [len(r.title) for r in rows]
