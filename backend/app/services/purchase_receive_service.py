"""Receber compra: lança uma COMPRA INTEIRA numa transação só (decisão do Victor, 10/11/2026).

Uma compra tem vários produtos (novos e já cadastrados), de vários fornecedores, com a grade de cores e tamanhos de cada um.
Tudo vira UMA entrada de estoque com itens FIFO: produto novo, variações, itens, vínculo com fornecedor, estoque, frete e desconto
de fornecedor nascem juntos. Qualquer erro em qualquer linha desfaz tudo (nenhum produto, fornecedor ou entrada fica pela metade).

Regra de rastreio: nunca existe estoque sem entrada. Produto novo nunca é criado antes da entrada: só aqui, junto com ela.

Idempotência: o app manda um `client_request_id` por compra. Repetir o mesmo envio (toque duplo, rede que caiu depois de gravar)
devolve a mesma compra em vez de lançar duas vezes. A marca fica em `notes` como `[compra:<id>]`.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.core.timezone import today_brazil
from app.models.entry_item import EntryItem
from app.models.product_variant import ProductVariant
from app.models.stock_entry import StockEntry
from app.repositories.base import BaseRepository
from app.schemas.stock_entry import StockEntryCreate
from app.services import lot_cost_service
from app.services.inventory_service import InventoryService
from app.services.stock_entry_service import InvalidEntryData, StockEntryService
from app.utils.variant_grid import normalize_color, normalize_gender, normalize_size

logger = logging.getLogger(__name__)

MAX_ITEMS = 300
MAX_LINES = 100
MAX_QTY = 1_000_000
_MARK = re.compile(r"\[compra:([A-Za-z0-9\-]{8,64})\]")


def _money(value: Any, label: str, *, allow_none: bool = False) -> Optional[Decimal]:
    if value is None or value == "":
        if allow_none:
            return None
        raise InvalidEntryData(f"Informe {label}")
    try:
        d = Decimal(str(value).replace(",", "."))
    except InvalidOperation:
        raise InvalidEntryData(f"Valor inválido em {label}")
    if d < 0 or d > Decimal("99999999"):
        raise InvalidEntryData(f"Valor inválido em {label}")
    return d.quantize(Decimal("0.01"))


def _qty(value: Any, label: str) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise InvalidEntryData(f"Quantidade inválida em {label}")
    if n <= 0:
        raise InvalidEntryData(f"A quantidade de {label} deve ser maior que zero")
    if n > MAX_QTY:
        raise InvalidEntryData(f"Quantidade grande demais em {label}")
    return n


def _supplier_ref(raw: Any) -> Dict[str, Any]:
    """{"id": 3} ou {"name": "Rua 25", "phone": "...", "doc": "..."}; texto puro também vale como nome."""
    if raw is None or raw == "":
        return {}
    if isinstance(raw, (str, int)) and not isinstance(raw, bool):
        return {"id": raw} if isinstance(raw, int) else {"name": str(raw)}
    if not isinstance(raw, dict):
        raise InvalidEntryData("Fornecedor inválido")
    return {"id": raw.get("id") or raw.get("supplier_id"), "name": raw.get("name") or raw.get("supplier_name"),
            "phone": raw.get("phone"), "doc": raw.get("doc") or raw.get("cnpj")}


class PurchaseReceiveService(StockEntryService):
    """Reaproveita os helpers privados do serviço de entradas (SKU, fornecedor, rateio de custo, FIFO)."""

    # ------------------------------------------------------------------ validação (sem tocar no banco)
    def _validate(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise InvalidEntryData("Compra inválida")
        items = payload.get("items") or []
        if not isinstance(items, list) or not items:
            raise InvalidEntryData("Informe pelo menos uma peça na compra")
        if len(items) > MAX_ITEMS:
            raise InvalidEntryData(f"No máximo {MAX_ITEMS} produtos por compra")

        entry_type = str(payload.get("entry_type") or "local").lower()
        if entry_type not in ("local", "online", "donation"):
            raise InvalidEntryData("Tipo de entrada inválido para uma compra")

        raw_date = payload.get("entry_date")
        if raw_date:
            try:
                entry_date = raw_date if isinstance(raw_date, date) else datetime.strptime(str(raw_date)[:10], "%Y-%m-%d").date()
            except ValueError:
                raise InvalidEntryData("Data da compra inválida")
        else:
            entry_date = today_brazil()
        if entry_date > today_brazil():
            raise InvalidEntryData("A data da compra não pode ser no futuro")

        default_supplier = _supplier_ref(payload.get("supplier"))
        if not (default_supplier.get("id") or (default_supplier.get("name") or "").strip()):
            raise InvalidEntryData("Informe o fornecedor da compra")

        freight = _money(payload.get("freight"), "o frete", allow_none=True) or Decimal("0")

        seen_variants: set = set()
        seen_new_names: set = set()
        clean_items: List[Dict[str, Any]] = []
        for n, it in enumerate(items, start=1):
            if not isinstance(it, dict):
                raise InvalidEntryData(f"Produto {n} inválido")
            product_id = it.get("product_id")
            new_product = it.get("new_product")
            if bool(product_id) == bool(new_product):
                raise InvalidEntryData(f"Produto {n}: informe um produto cadastrado OU os dados de um produto novo")
            label = f"produto {n}"
            base_price = None
            if new_product:
                if not isinstance(new_product, dict):
                    raise InvalidEntryData(f"Produto {n} inválido")
                name = " ".join(str(new_product.get("name") or "").split())
                if len(name) < 2:
                    raise InvalidEntryData(f"Produto {n}: informe o nome da peça")
                if not new_product.get("category_id"):
                    raise InvalidEntryData(f"{name}: escolha a categoria")
                base_price = _money(new_product.get("base_price"), f"o preço de venda de {name}")
                if base_price <= 0:
                    raise InvalidEntryData(f"{name}: informe o preço de venda")
                key = name.lower()
                if key in seen_new_names:
                    raise InvalidEntryData(f"{name} aparece duas vezes como produto novo")
                seen_new_names.add(key)
                label = name
            cost = self._require_cost(it.get("unit_cost"), label, entry_type)
            list_cost = _money(it.get("list_unit_cost"), f"o preço de tabela de {label}", allow_none=True)
            self._check_list_price(list_cost, cost)
            if list_cost is not None and list_cost == cost:
                list_cost = None
            price = _money(it.get("price"), f"o preço de venda de {label}", allow_none=True)

            lines = it.get("lines") or []
            if not isinstance(lines, list) or not lines:
                raise InvalidEntryData(f"{label}: informe a quantidade de pelo menos uma peça")
            if len(lines) > MAX_LINES:
                raise InvalidEntryData(f"{label}: no máximo {MAX_LINES} variações")
            clean_lines = []
            seen_item: set = set()
            for ln in lines:
                if not isinstance(ln, dict):
                    raise InvalidEntryData(f"{label}: variação inválida")
                color = normalize_color(ln.get("color")) or None
                size = normalize_size(ln.get("size")) or None
                variant_id = ln.get("variant_id")
                if new_product and variant_id:
                    raise InvalidEntryData(f"{label}: produto novo não tem variação existente")
                if not variant_id and not color and not size:
                    raise InvalidEntryData(f"{label}: informe a cor ou o tamanho de cada variação")
                key = ("v", int(variant_id)) if variant_id else ("c", product_id or label.lower(), color, size)
                if key in seen_item:
                    raise InvalidEntryData(f"{label}: a variação {color or ''} {size or ''} aparece mais de uma vez".replace("  ", " "))
                seen_item.add(key)
                if key in seen_variants:
                    raise InvalidEntryData(f"{label}: a variação {color or ''} {size or ''} já está em outro produto desta compra".replace("  ", " "))
                seen_variants.add(key)
                clean_lines.append({"variant_id": int(variant_id) if variant_id else None, "color": color, "size": size,
                                    "quantity": _qty(ln.get("quantity"), f"{label} {color or ''} {size or ''}".strip())})
            clean_items.append({
                "product_id": int(product_id) if product_id else None,
                "new_product": ({
                    "name": " ".join(str(new_product.get("name")).split()), "category_id": int(new_product["category_id"]),
                    "base_price": base_price, "brand": (new_product.get("brand") or None),
                    "gender": normalize_gender(new_product.get("gender")) if new_product.get("gender") else None,
                    "description": new_product.get("description") or None,
                } if new_product else None),
                "supplier": _supplier_ref(it.get("supplier")), "unit_cost": cost, "list_unit_cost": list_cost, "price": price,
                "lines": clean_lines, "label": label,
            })

        discounts = []
        for d in payload.get("supplier_discounts") or []:
            ref = _supplier_ref(d.get("supplier") if isinstance(d, dict) else None)
            amount = _money(d.get("amount") if isinstance(d, dict) else None, "o desconto do fornecedor", allow_none=True) or Decimal("0")
            if not (ref.get("id") or ref.get("name")):
                raise InvalidEntryData("Desconto sem fornecedor")
            if amount > 0:
                discounts.append({"ref": ref, "amount": amount})

        request_id = str(payload.get("client_request_id") or "").strip()
        if request_id and not re.fullmatch(r"[A-Za-z0-9\-]{8,64}", request_id):
            raise InvalidEntryData("Identificador da compra inválido")
        return {"items": clean_items, "entry_type": entry_type, "entry_date": entry_date, "supplier": default_supplier,
                "freight": freight, "discounts": discounts, "request_id": request_id,
                "entry_code": (payload.get("entry_code") or "").strip(), "notes": (payload.get("notes") or "").strip() or None,
                "payment_method": payload.get("payment_method") or None}

    # ------------------------------------------------------------------ resultado
    async def _result(self, entry_id: int, tenant_id: int, replay: bool = False) -> Dict[str, Any]:
        entry = (await self.db.execute(select(StockEntry).where(StockEntry.id == entry_id, StockEntry.tenant_id == tenant_id))).scalar_one()
        rows = (await self.db.execute(
            select(EntryItem, ProductVariant).join(ProductVariant, ProductVariant.id == EntryItem.variant_id)
            .where(EntryItem.entry_id == entry_id, EntryItem.tenant_id == tenant_id, EntryItem.is_active == True)  # noqa: E712
            .order_by(EntryItem.id)
        )).all()
        items = [{
            "entry_item_id": ei.id, "product_id": ei.product_id, "variant_id": v.id, "sku": v.sku, "color": v.color, "size": v.size,
            "display_code": getattr(v, "display_code", None), "quantity": ei.quantity_received, "unit_cost": float(ei.unit_cost),
            "supplier_id": ei.supplier_id,
        } for ei, v in rows]
        return {"entry_id": entry.id, "entry_code": entry.entry_code, "entry_date": entry.entry_date.isoformat(),
                "total_cost": float(entry.total_cost), "total_pieces": sum(i["quantity"] for i in items),
                "products": len({i["product_id"] for i in items}), "items": items, "replay": replay}

    # ------------------------------------------------------------------ gravação
    async def receive(self, payload: Dict[str, Any], user_id: int, *, tenant_id: int) -> Dict[str, Any]:
        plan = self._validate(payload)
        await self._lock_catalog(tenant_id)
        try:
            marker = f"[compra:{plan['request_id']}]" if plan["request_id"] else None
            if marker:
                dup = (await self.db.execute(select(StockEntry.id).where(
                    StockEntry.tenant_id == tenant_id, StockEntry.is_active == True,  # noqa: E712
                    StockEntry.notes.contains(marker)))).scalar_one_or_none()
                if dup:
                    await self.db.rollback()
                    return await self._result(dup, tenant_id, replay=True)

            sup_cache: Dict[Any, Any] = {}

            async def supplier_of(ref: Dict[str, Any], *, required: bool, create: bool = True):
                key = ("id", ref.get("id")) if ref.get("id") else ("n", self._norm_text(ref.get("name") or ""))
                if key in sup_cache:
                    return sup_cache[key]
                if not ref.get("id") and not create:
                    # só procura entre os já usados na compra (desconto não cria fornecedor)
                    for s in sup_cache.values():
                        if self._norm_text(s.name) == key[1]:
                            return s
                    return None
                s = await self._resolve_supplier(ref.get("id"), ref.get("name"), ref.get("doc"), ref.get("phone"), tenant_id)
                if s is None and required:
                    raise InvalidEntryData("Informe o fornecedor")
                if s is not None:
                    sup_cache[key] = s
                    sup_cache[("id", s.id)] = s
                    sup_cache[("n", self._norm_text(s.name))] = s
                return s

            default_supplier = await supplier_of(plan["supplier"], required=True)

            base_code = plan["entry_code"] or f"COMPRA-{plan['entry_date']:%Y%m%d}"
            unique_code = await self._generate_unique_entry_code(base_code, tenant_id=tenant_id)
            notes = " ".join(x for x in (plan["notes"], marker) if x) or None
            data = StockEntryCreate(
                entry_code=unique_code, entry_date=plan["entry_date"], entry_type=plan["entry_type"],
                supplier_id=default_supplier.id, supplier_name=default_supplier.name,
                payment_method=plan["payment_method"], notes=notes,
            ).model_dump(exclude_unset=True)
            data["total_cost"] = Decimal("0.00")
            # BaseRepository.create só dá flush; o create do repositório de entradas faria COMMIT no meio da compra
            entry = await BaseRepository.create(self.entry_repo, self.db, data, tenant_id=tenant_id)

            total = Decimal("0.00")
            acc: Dict[Any, Any] = {}
            product_ids: List[int] = []
            for it in plan["items"]:
                supplier = (await supplier_of(it["supplier"], required=False)) if (it["supplier"].get("id") or it["supplier"].get("name")) else default_supplier
                supplier = supplier or default_supplier
                if it["new_product"]:
                    np_ = it["new_product"]
                    await self._assert_category(np_["category_id"], tenant_id)
                    product = await self.product_repo.create({
                        "name": np_["name"], "description": np_["description"], "brand": np_["brand"], "gender": np_["gender"],
                        "category_id": np_["category_id"], "base_price": np_["base_price"], "is_catalog": False, "is_active": True,
                    }, tenant_id=tenant_id)
                    await self.db.flush()
                    vdata = [{"sku": None, "color": ln["color"], "size": ln["size"], "quantity": ln["quantity"]} for ln in it["lines"]]
                    await self._fill_missing_skus(product.id, vdata, tenant_id)
                    for ln, vd in zip(it["lines"], vdata):
                        variant = ProductVariant(
                            product_id=product.id, sku=vd["sku"], color=ln["color"], size=ln["size"],
                            price=it["price"] if it["price"] is not None else np_["base_price"], cost_price=it["unit_cost"],
                            is_active=True, tenant_id=tenant_id,
                        )
                        self.db.add(variant)
                        await self.db.flush()
                        ln["_variant"] = variant
                else:
                    product = await self.product_repo.get(self.db, it["product_id"], tenant_id=tenant_id)
                    if product is None:
                        raise InvalidEntryData("Um dos produtos não existe nesta loja")
                    if not product.is_active:
                        raise InvalidEntryData(f"O produto {product.name} está desativado. Restaure o cadastro antes de dar entrada.")
                    for ln in it["lines"]:
                        if ln["variant_id"]:
                            variant = (await self.db.execute(select(ProductVariant).where(
                                ProductVariant.id == ln["variant_id"], ProductVariant.product_id == product.id,
                                ProductVariant.tenant_id == tenant_id, ProductVariant.is_active == True))).scalar_one_or_none()  # noqa: E712
                            if variant is None:
                                raise InvalidEntryData(f"Uma das variações não pertence a {product.name}")
                        else:
                            variant, _created = await self._get_or_create_variant(
                                product, ln["color"], ln["size"], price=it["price"], cost=it["unit_cost"], sku=None, tenant_id=tenant_id)
                            await self.db.flush()
                        ln["_variant"] = variant
                product_ids.append(product.id)
                for ln in it["lines"]:
                    v = ln["_variant"]
                    self.db.add(EntryItem(
                        entry_id=entry.id, product_id=product.id, variant_id=v.id, supplier_id=supplier.id,
                        list_unit_cost=it["list_unit_cost"], quantity_received=ln["quantity"], quantity_remaining=ln["quantity"],
                        unit_cost=it["unit_cost"], notes=None, tenant_id=tenant_id, is_active=True,
                    ))
                    await self.db.flush()
                    q0, t0 = acc.get((supplier.id, product.id), (0, Decimal("0")))
                    acc[(supplier.id, product.id)] = (q0 + ln["quantity"], t0 + Decimal(ln["quantity"]) * it["unit_cost"])
                    total += Decimal(ln["quantity"]) * it["unit_cost"]

            entry.total_cost = total
            await self.db.flush()
            await self.db.refresh(entry, attribute_names=["entry_items"])   # a relação foi carregada VAZIA na criação da entrada
            await self._apply_supplier_links(acc, entry.entry_date, tenant_id)
            inv = InventoryService(self.db)
            for pid in dict.fromkeys(product_ids):
                try:
                    await inv.rebuild_product_from_fifo(pid, tenant_id=tenant_id, commit=False)   # commit=False: nada grava antes do fim
                except Exception as sync_err:  # o saldo é refeito do FIFO na conferência; não derruba a compra
                    logger.warning("Falha ao sincronizar o saldo do produto %s: %s", pid, sync_err)
            await self.db.flush()

            if plan["freight"] > 0:
                await self._add_entry_costs(entry, [{"description": "Frete da compra", "amount": plan["freight"]}], tenant_id)
            if plan["discounts"]:
                resolved = []
                for d in plan["discounts"]:
                    s = await supplier_of(d["ref"], required=False, create=False)
                    if s is None:
                        raise InvalidEntryData("O fornecedor do desconto não tem peças nesta compra")
                    resolved.append({"supplier_id": s.id, "amount": d["amount"]})
                await self._set_supplier_discounts(entry.id, resolved, tenant_id)
            await lot_cost_service.recompute_entries(self.db, [entry.id], tenant_id=tenant_id)
            entry_id = entry.id
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return await self._result(entry_id, tenant_id)
