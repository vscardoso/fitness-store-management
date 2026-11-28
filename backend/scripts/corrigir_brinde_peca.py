"""Troca a peça de um item de brinde já dado (lançada por engano), mantendo número, data e quem deu o brinde.

Por quê: o cancelamento do brinde apaga o número e refazer cria outro com a data de hoje. Aqui a peça errada volta às MESMAS
camadas do estoque de onde saiu (FIFO), a peça certa sai pelo FIFO normal e o item do brinde passa a apontar para ela, com o
custo real da camada, o preço de vitrine e as camadas guardadas. Totais do brinde são refeitos pela soma dos itens e a troca
fica na auditoria com os dois lados.

Uso (dentro do container do backend, nunca com a loja gravando: rodar antes `deploy/guarda_publicacao.py --status`):
    python scripts/corrigir_brinde_peca.py --tenant 2 --gift 3 --item 4 --nova-variacao 312 --usuario 4          # só simula
    python scripts/corrigir_brinde_peca.py --tenant 2 --gift 3 --item 4 --nova-variacao 312 --usuario 4 --apply  # grava

Sem `--apply` tudo é feito e DESFEITO (rollback) para mostrar o resultado. Tudo ou nada.
"""
from __future__ import annotations

import argparse
import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.core.database import async_session_maker
from app.core.timezone import today_brazil
from app.models.entry_item import EntryItem
from app.models.gift import GIFT_GIVEN, Gift, GiftItem
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.user import User
from app.services.fifo_service import FIFOService
from app.services.gift_service import GiftConflict, GiftError, GiftService, _q
from app.services.stock_lock import lock_stock


async def _saldo(db, ids):
    rows = (await db.execute(select(EntryItem.id, EntryItem.variant_id, EntryItem.quantity_received, EntryItem.quantity_remaining)
                             .where(EntryItem.id.in_(ids)))).all()
    return {r[0]: (r[1], r[2], r[3]) for r in rows}


async def corrigir(db, a) -> dict:
    """`a` tem tenant, gift, item, nova_variacao, usuario, motivo, apply. Devolve o resumo; com apply=False desfaz tudo."""
    if True:
        svc = GiftService(db)
        gift = await svc._gift(a.tenant, a.gift)
        if gift.status != GIFT_GIVEN:
            raise GiftConflict("Este brinde está cancelado.")
        item = (await db.execute(select(GiftItem).where(GiftItem.id == a.item, GiftItem.gift_id == gift.id,
                                                         GiftItem.is_active == True))).scalar_one_or_none()  # noqa: E712
        if item is None:
            raise GiftError("Item do brinde não encontrado.")
        if item.quantity != 1:
            raise GiftError("Este script só troca item de 1 peça.")
        user = (await db.execute(select(User).where(User.id == a.usuario, User.tenant_id == a.tenant))).scalar_one_or_none()
        if user is None:
            raise GiftError("Usuário não encontrado nesta loja.")
        v = (await db.execute(select(ProductVariant).where(ProductVariant.id == a.nova_variacao, ProductVariant.tenant_id == a.tenant,
                                                            ProductVariant.is_active == True))).scalar_one_or_none()  # noqa: E712
        if v is None:
            raise GiftError("Peça nova não encontrada.")
        p = (await db.execute(select(Product).where(Product.id == v.product_id, Product.tenant_id == a.tenant,
                                                     Product.is_active == True))).scalar_one_or_none()  # noqa: E712
        if p is None:
            raise GiftError("Produto novo não encontrado.")
        await svc._ensure_open_month(a.tenant, today_brazil())
        await svc._ensure_open_month(a.tenant, gift.created_at.date())

        old_sources = (item.sale_sources or {}).get("sources", [])
        old_entry_items = [s["entry_item_id"] for s in old_sources]
        antes_old = await _saldo(db, old_entry_items)
        old = dict(product_id=item.product_id, variant_id=item.variant_id, nome=item.product_name, rotulo=item.variant_label,
                   custo=float(item.unit_cost), vitrine=float(_q(item.list_price)))
        total_antes = (float(_q(gift.total_cost)), float(_q(gift.list_value)))

        await lock_stock(db, variant_ids=[item.variant_id, v.id])
        fifo = FIFOService(db)
        ref = f"gift:{gift.id}"
        try:
            await fifo.reverse_sale(sources=old_sources, reason="brinde_volta", ref=ref, user_id=user.id)
            try:
                sources = await fifo.process_sale(p.id, 1, variant_id=v.id, tenant_id=a.tenant, reason="brinde", ref=ref, user_id=user.id)
            except ValueError as e:
                raise GiftError(f"Sem estoque da peça nova: {e}")
            cost = sum((Decimal(str(s["quantity_taken"])) * Decimal(str(s["unit_cost"])) for s in sources), Decimal("0"))
            price = Decimal(str(v.price if v.price is not None else (p.base_price or 0)))
            label = " / ".join(x for x in (v.color, v.size) if x)
            item.product_id, item.variant_id, item.product_name = p.id, v.id, p.name
            item.variant_label, item.unit_cost, item.list_price = (label or None), cost, price
            item.sale_sources = {"sources": sources}
            await db.flush()
            itens = await svc._items(gift.id)
            gift.total_cost = _q(sum((Decimal(str(i.unit_cost)) * i.quantity for i in itens), Decimal("0")))
            gift.list_value = _q(sum((Decimal(str(i.list_price)) * i.quantity for i in itens), Decimal("0")))
            await db.flush()
            novo = dict(product_id=p.id, variant_id=v.id, nome=p.name, rotulo=label, custo=float(cost), vitrine=float(price))
            await svc._audit(a.tenant, user, "GIFT_ITEM_CORRECTED", gift.id, {
                "numero": gift.gift_number, "item": item.id, "motivo": a.motivo, "de": old, "para": novo,
                "custo_antes": total_antes[0], "custo_depois": float(gift.total_cost),
                "vitrine_antes": total_antes[1], "vitrine_depois": float(gift.list_value)})
            depois_old = await _saldo(db, old_entry_items)
            depois_new = await _saldo(db, [s["entry_item_id"] for s in sources])
            resumo = {"de": old, "para": novo, "camada_antiga_antes": antes_old, "camada_antiga_depois": depois_old,
                      "camada_nova_depois": depois_new, "custo": (total_antes[0], float(gift.total_cost)),
                      "vitrine": (total_antes[1], float(gift.list_value))}
            for k, v_ in resumo.items():
                print(f"{k}: {v_}")
            assert all(depois_old[k][2] == antes_old[k][2] + 1 for k in antes_old), "peça antiga não voltou ao estoque"
            assert all(0 <= x[2] <= x[1] for x in {**depois_old, **depois_new}.values()), "saldo fora de 0..recebido"
            if not a.apply:
                await db.rollback()
                print("SIMULAÇÃO: nada foi gravado (rollback).")
                return resumo
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        await svc._sync_inventory([old["product_id"], p.id], a.tenant)
        print("GRAVADO.")
        return resumo


async def main(a) -> None:
    async with async_session_maker() as db:
        await corrigir(db, a)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tenant", type=int, required=True)
    ap.add_argument("--gift", type=int, required=True)
    ap.add_argument("--item", type=int, required=True)
    ap.add_argument("--nova-variacao", type=int, required=True, dest="nova_variacao")
    ap.add_argument("--usuario", type=int, required=True)
    ap.add_argument("--motivo", default="Peça lançada por engano no brinde; a peça dada era outra")
    ap.add_argument("--apply", action="store_true")
    asyncio.run(main(ap.parse_args()))
