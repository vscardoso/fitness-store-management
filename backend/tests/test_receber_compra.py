"""Receber compra (POST /stock-entries/receive): a compra inteira entra numa transação só, o FIFO fecha e nada fica pela metade."""
import itertools
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models.entry_item import EntryItem
from app.models.inventory import Inventory
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.stock_entry import StockEntry
from app.models.supplier import Supplier
from tests.test_lot_costs import _loja_api, _limpa_loja_1  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
API = "/api/v1/stock-entries"
_n = itertools.count(1)


async def _produto_existente(test_client, async_session, h, cat, nome, cor="Preto", tam="P", qtd=1, custo=20):
    """Produto já cadastrado, criado pela rota antiga (com uma entrada qualquer)."""
    n = next(_n)
    r = await test_client.post(f"{API}/with-new-product-variants", headers=h, json={
        "entry_code": f"BASE-{n:05d}", "entry_date": date.today().isoformat(), "entry_type": "local", "supplier_name": "Fornecedor Base",
        "product_name": nome, "product_category_id": cat, "base_price": 50,
        "variants": [{"sku": f"BASE{n}-{cor[:3].upper()}-{tam}", "color": cor, "size": tam, "price": 50, "cost_price": custo, "quantity": qtd}]})
    assert r.status_code in (200, 201), r.text
    p = (await async_session.execute(select(Product).where(Product.name == nome))).scalars().first()
    v = (await async_session.execute(select(ProductVariant).where(ProductVariant.product_id == p.id))).scalars().first()
    return p.id, v.id


async def _estado(async_session, t_id):
    return {
        "entradas": (await async_session.execute(select(func.count()).select_from(StockEntry).where(StockEntry.tenant_id == t_id))).scalar(),
        "produtos": (await async_session.execute(select(func.count()).select_from(Product).where(Product.tenant_id == t_id))).scalar(),
        "variacoes": (await async_session.execute(select(func.count()).select_from(ProductVariant).where(ProductVariant.tenant_id == t_id))).scalar(),
        "itens": (await async_session.execute(select(func.count()).select_from(EntryItem).where(EntryItem.tenant_id == t_id))).scalar(),
        "fornecedores": (await async_session.execute(select(func.count()).select_from(Supplier).where(Supplier.tenant_id == t_id))).scalar(),
    }


def _compra(cat, pid_existente, vid_existente, **extra):
    base = {
        "client_request_id": str(uuid.uuid4()), "entry_date": date.today().isoformat(), "supplier": {"name": "Fornecedor A"},
        "freight": "25,50", "supplier_discounts": [{"supplier": {"name": "Rua 25"}, "amount": "10"}],
        "items": [
            {"product_id": pid_existente, "unit_cost": "22", "lines": [{"variant_id": vid_existente, "quantity": 1}, {"color": "Rosa", "size": "M", "quantity": 2}]},
            {"new_product": {"name": f"Conjunto Teste {next(_n)}", "category_id": cat, "base_price": "90"}, "supplier": {"name": "Rua 25", "phone": "(11) 99999-0000"},
             "unit_cost": "30", "lines": [{"color": "Preto", "size": "P", "quantity": 2}, {"color": "Preto", "size": "M", "quantity": 3}]},
        ],
    }
    base.update(extra)
    return base


async def test_compra_completa_cria_tudo_e_o_fifo_fecha(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    pid, vid = await _produto_existente(test_client, async_session, h, cat, f"Legging Base {next(_n)}")
    antes = await _estado(async_session, t_id)
    r = await test_client.post(f"{API}/receive", headers=h, json=_compra(cat, pid, vid))
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["replay"] is False and j["total_pieces"] == 8 and j["products"] == 2
    assert len(j["items"]) == 4
    depois = await _estado(async_session, t_id)
    assert depois["entradas"] == antes["entradas"] + 1                      # UMA entrada para a compra inteira
    assert depois["produtos"] == antes["produtos"] + 1                      # só o produto novo
    assert depois["variacoes"] == antes["variacoes"] + 3                    # Rosa M (do existente) + Preto P e M (do novo)
    assert depois["fornecedores"] == antes["fornecedores"] + 2              # Fornecedor A e Rua 25 (novos); o Base já existia

    # FIFO fecha: estoque de cada produto = soma do que sobra nos itens de entrada
    await async_session.rollback()
    for p_id in {i["product_id"] for i in j["items"]}:
        fifo = (await async_session.execute(select(func.coalesce(func.sum(EntryItem.quantity_remaining), 0)).where(
            EntryItem.product_id == p_id, EntryItem.is_active == True))).scalar()  # noqa: E712
        inv = (await async_session.execute(select(Inventory.quantity).where(Inventory.product_id == p_id, Inventory.tenant_id == t_id))).scalar()
        assert inv == fifo, (p_id, inv, fifo)

    # o item do produto novo guarda o fornecedor dele (Rua 25), os do existente o da compra (Fornecedor A)
    rua = (await async_session.execute(select(Supplier).where(Supplier.tenant_id == t_id, Supplier.name == "Rua 25"))).scalar_one()
    assert rua.phone == "(11) 99999-0000"
    itens = (await async_session.execute(select(EntryItem).where(EntryItem.entry_id == j["entry_id"]))).scalars().all()
    assert sorted(i.supplier_id == rua.id for i in itens) == [False, False, True, True]
    # frete (25,50) menos desconto da Rua 25 (10) = 15,50 rateado nas 8 peças
    extra = sum(Decimal(i.extra_unit_cost or 0) * i.quantity_received for i in itens)
    assert abs(extra - Decimal("15.50")) < Decimal("0.10"), extra
    # código curto e SKU nasceram sozinhos nas variações novas
    novas = [i for i in j["items"] if i["product_id"] != pid]
    assert all(i["sku"] and i["display_code"] for i in novas)
    novo = (await async_session.execute(select(Product).where(Product.id == novas[0]["product_id"]))).scalar_one()
    assert novo.is_catalog is False and novo.is_active is True


async def test_erro_no_meio_da_compra_nao_grava_nada(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    pid, vid = await _produto_existente(test_client, async_session, h, cat, f"Calca Base {next(_n)}")
    nome_repetido = (await async_session.execute(select(Product.name).where(Product.id == pid))).scalar()
    antes = await _estado(async_session, t_id)
    pay = _compra(cat, pid, vid)
    # 2º produto novo com o NOME de um produto ativo da loja: falha na hora de gravar, depois de o 1º já ter sido criado
    pay["items"].append({"new_product": {"name": nome_repetido, "category_id": cat, "base_price": "50"}, "supplier": {"name": "Fornecedor Fantasma"},
                         "unit_cost": "10", "lines": [{"color": "Azul", "size": "G", "quantity": 1}]})
    r = await test_client.post(f"{API}/receive", headers=h, json=pay)
    assert r.status_code == 400, r.text
    await async_session.rollback()
    assert await _estado(async_session, t_id) == antes                      # nenhuma entrada, produto, variação, item nem fornecedor


async def test_repetir_o_envio_nao_lanca_duas_vezes(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    pid, vid = await _produto_existente(test_client, async_session, h, cat, f"Short Base {next(_n)}")
    pay = _compra(cat, pid, vid)
    r1 = await test_client.post(f"{API}/receive", headers=h, json=pay)
    antes = await _estado(async_session, t_id)
    r2 = await test_client.post(f"{API}/receive", headers=h, json=pay)      # toque duplo / rede que caiu depois de gravar
    assert r1.status_code == 201 and r2.status_code == 201, (r1.text, r2.text)
    assert r2.json()["replay"] is True and r2.json()["entry_id"] == r1.json()["entry_id"]
    await async_session.rollback()
    assert await _estado(async_session, t_id) == antes


async def test_recusas_com_mensagem_clara(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    pid, vid = await _produto_existente(test_client, async_session, h, cat, f"Top Base {next(_n)}")
    antes = await _estado(async_session, t_id)

    def com(**mud):
        p = _compra(cat, pid, vid)
        p.update(mud)
        return p

    casos = [
        (com(items=[]), "pelo menos uma peça"),
        (com(supplier={}), "fornecedor"),
        (com(entry_date=(date.today() + timedelta(days=2)).isoformat()), "futuro"),
        (com(supplier_discounts=[{"supplier": {"name": "Ninguém"}, "amount": "5"}]), "não tem peças"),
        (com(items=[{"product_id": pid, "unit_cost": "", "lines": [{"variant_id": vid, "quantity": 1}]}]), "custo"),
        (com(items=[{"product_id": pid, "unit_cost": "10", "lines": [{"variant_id": vid, "quantity": 0}]}]), "maior que zero"),
        (com(items=[{"product_id": 99999999, "unit_cost": "10", "lines": [{"variant_id": vid, "quantity": 1}]}]), "não existe"),
        (com(items=[{"new_product": {"name": "X Novo", "category_id": cat}, "unit_cost": "10", "lines": [{"color": "Azul", "quantity": 1}]}]), "preço"),
        (com(items=[{"new_product": {"name": "Y Novo", "base_price": "30"}, "unit_cost": "10", "lines": [{"color": "Azul", "quantity": 1}]}]), "categoria"),
        (com(items=[{"product_id": pid, "unit_cost": "10", "lines": [{"variant_id": vid, "quantity": 1}, {"variant_id": vid, "quantity": 2}]}]), "mais de uma vez"),
        (com(items=[{"product_id": pid, "unit_cost": "10", "lines": [{"variant_id": 99999999, "quantity": 1}]}]), "variações não pertence"),
    ]
    for payload, trecho in casos:
        r = await test_client.post(f"{API}/receive", headers=h, json=payload)
        assert r.status_code == 400, (trecho, r.status_code, r.text)
        assert trecho.lower() in r.json()["detail"].lower(), (trecho, r.json())
    await async_session.rollback()
    assert await _estado(async_session, t_id) == antes                      # nenhuma das recusas deixou rastro


async def test_produto_desativado_nao_recebe_entrada(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    pid, vid = await _produto_existente(test_client, async_session, h, cat, f"Vestido Base {next(_n)}")
    p = (await async_session.execute(select(Product).where(Product.id == pid))).scalar_one()
    p.is_active = False
    await async_session.commit()
    antes = await _estado(async_session, t_id)
    r = await test_client.post(f"{API}/receive", headers=h, json=_compra(cat, pid, vid))
    assert r.status_code == 400 and "desativado" in r.json()["detail"], r.text
    await async_session.rollback()
    assert await _estado(async_session, t_id) == antes


async def test_sem_login_e_recusado(test_client):
    r = await test_client.post(f"{API}/receive", json={"items": []})
    assert r.status_code in (401, 403)
