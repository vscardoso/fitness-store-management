"""Compra com vários fornecedores (viagem ao Brás): a entrada não tem fornecedor próprio, cada produto leva o seu.

O app manda o texto reservado "Vários fornecedores" (sem id). O servidor NUNCA transforma esse texto em cadastro de fornecedor
(antes ele criava um fornecedor falso com esse nome) e recusa produto sem fornecedor nesse caso."""
import pytest
from sqlalchemy import select

from app.models.supplier import Supplier
from tests.test_desconto_fornecedor import _entrada_dois_fornecedores, _limpa_extras  # noqa: F401  (fixture autouse)
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
API = "/api/v1"
ROTULO = "Vários fornecedores"


def _corpo(ids, codigo, supplier_name, item_a=None, item_b=None, supplier_id=None):
    from datetime import date
    corpo = {"entry_code": codigo, "entry_date": date.today().isoformat(), "entry_type": "local", "supplier_name": supplier_name,
             "items": [{"product_id": ids.p, "variant_id": ids.va, "quantity_received": 2, "unit_cost": "10.00", **({"supplier_id": item_a} if item_a else {})},
                       {"product_id": ids.p, "variant_id": ids.vb, "quantity_received": 3, "unit_cost": "20.00", **({"supplier_id": item_b} if item_b else {})}]}
    if supplier_id:
        corpo["supplier_id"] = supplier_id
    return corpo


async def _fornecedores_com_nome(db, tenant_id):
    return (await db.execute(select(Supplier).where(Supplier.tenant_id == tenant_id, Supplier.name.ilike("%varios%")))).scalars().all()


async def test_varios_fornecedores_nao_cria_cadastro_falso_e_cada_item_leva_o_seu(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    r = await test_client.post(f"{API}/stock-entries/", headers=h, json=_corpo(ids, "MULTI-0001", ROTULO, ids.sa, ids.sb))
    assert r.status_code in (200, 201), r.text
    e = (await test_client.get(f"{API}/stock-entries/{r.json()['id']}", headers=h)).json()
    assert e["supplier_name"] == ROTULO and e.get("supplier_id") is None
    assert sorted(i["supplier_id"] for i in e["entry_items"]) == sorted([ids.sa, ids.sb])
    assert await _fornecedores_com_nome(async_session, ids.t) == []          # nenhum fornecedor "Vários fornecedores" no cadastro


async def test_texto_reservado_vale_sem_diferenciar_acento_e_caixa(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    r = await test_client.post(f"{API}/stock-entries/", headers=h, json=_corpo(ids, "MULTI-0002", "VARIOS FORNECEDORES", ids.sa, ids.sb))
    assert r.status_code in (200, 201), r.text
    assert await _fornecedores_com_nome(async_session, ids.t) == []


async def test_varios_fornecedores_com_produto_sem_fornecedor_e_recusado(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    r = await test_client.post(f"{API}/stock-entries/", headers=h, json=_corpo(ids, "MULTI-0003", ROTULO, ids.sa, None))
    assert r.status_code == 400 and "fornecedor de cada produto" in r.text, r.text
    assert await _fornecedores_com_nome(async_session, ids.t) == []


async def test_entrada_de_um_fornecedor_so_continua_igual(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    r = await test_client.post(f"{API}/stock-entries/", headers=h, json=_corpo(ids, "UNICO-0001", "qualquer", None, None, supplier_id=ids.sa))
    assert r.status_code in (200, 201), r.text
    e = (await test_client.get(f"{API}/stock-entries/{r.json()['id']}", headers=h)).json()
    assert e["supplier_id"] == ids.sa and all(i["supplier_id"] == ids.sa for i in e["entry_items"])
