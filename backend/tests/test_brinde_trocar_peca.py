"""scripts/corrigir_brinde_peca.py: troca a peça de um item de brinde já dado, sem mudar número, data nem quem deu.
Prova: a peça errada volta à camada de origem, a certa sai pelo FIFO, totais do brinde batem com a soma dos itens, a auditoria
guarda os dois lados, a simulação não grava nada e a falta de estoque da peça nova não deixa nada pela metade."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from tests.test_brinde import _dar, _auditoria
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _estoque

pytestmark = pytest.mark.asyncio
SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "corrigir_brinde_peca.py"


def _mod():
    spec = importlib.util.spec_from_file_location("corrigir_brinde_peca_teste", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _args(t_id, gift, item, var, uid, apply):
    return SimpleNamespace(tenant=t_id, gift=gift, item=item, nova_variacao=var, usuario=uid, apply=apply, motivo="Peça errada no brinde")


async def test_troca_a_peca_do_brinde_mantendo_numero_e_integridade(test_client, async_session, test_user):
    from app.models.gift import Gift, GiftItem
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    uid = test_user.id
    g = (await _dar(test_client, h, [{"variant_id": va.id, "quantity": 1}])).json()
    gid, numero, item_id = g["id"], g["gift_number"], g["items"][0]["id"]
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 9 and await _estoque(async_session, vb.id) == 10
    mod = _mod()

    # simulação: mostra o resultado e não grava nada
    r = await mod.corrigir(async_session, _args(t_id, gid, item_id, vb.id, uid, False))
    assert r["custo"] == (40.0, 40.0)
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 9 and await _estoque(async_session, vb.id) == 10
    assert (await async_session.get(GiftItem, item_id)).variant_id == va.id

    # aplicar
    await mod.corrigir(async_session, _args(t_id, gid, item_id, vb.id, uid, True))
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 10      # a peça errada voltou
    assert await _estoque(async_session, vb.id) == 9       # a certa saiu
    gift = await async_session.get(Gift, gid)
    it = await async_session.get(GiftItem, item_id)
    assert gift.gift_number == numero and gift.status == "given"
    assert it.variant_id == vb.id and it.quantity == 1 and float(it.unit_cost) == 40.0
    assert float(gift.total_cost) == 40.0 and float(gift.list_value) == float(it.list_price)
    assert it.sale_sources["sources"][0]["quantity_taken"] == 1
    from app.models.entry_item import EntryItem
    for src in it.sale_sources["sources"]:
        e = await async_session.get(EntryItem, src["entry_item_id"])
        assert e.variant_id == vb.id and 0 <= e.quantity_remaining <= e.quantity_received

    (reg,) = await _auditoria(async_session, t_id, "GIFT_ITEM_CORRECTED")
    assert reg[0].entity_id == gid and reg[1]["de"]["variant_id"] == va.id and reg[1]["para"]["variant_id"] == vb.id
    assert reg[1]["custo_antes"] == 40.0 and reg[1]["custo_depois"] == 40.0


async def test_sem_estoque_da_peca_nova_nada_fica_pela_metade(test_client, async_session, test_user):
    from app.models.gift import GiftItem
    t_id, h, p, va, vb = await _cenario(async_session, test_user, stock_b=0)
    uid = test_user.id
    g = (await _dar(test_client, h, [{"variant_id": va.id, "quantity": 1}])).json()
    gid, item_id = g["id"], g["items"][0]["id"]
    async_session.expire_all()
    from app.services.gift_service import GiftError
    with pytest.raises(GiftError):
        await _mod().corrigir(async_session, _args(t_id, gid, item_id, vb.id, uid, True))
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 9                         # continua baixada, como antes
    assert (await async_session.get(GiftItem, item_id)).variant_id == va.id
    assert await _auditoria(async_session, t_id, "GIFT_ITEM_CORRECTED") == []
