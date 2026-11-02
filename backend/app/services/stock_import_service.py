"""
Importação de estoque por planilha (loja que já tem peças quando começa a usar o Provador).

- Entrada: CSV (`;`, `,` ou tab), texto colado do Excel ou XLSX. Colunas: Produto, Categoria, Cor, Tamanho,
  Quantidade, Custo, Preço (Marca é opcional). Aceita 1.234,56, R$ 12,50 e 12.5.
- `preview` só lê e confere (nada é gravado). `commit` grava TUDO numa transação ou NADA: qualquer linha com erro
  recusa a importação inteira, para a planilha ser corrigida e enviada de novo.
- Tudo entra numa única entrada do tipo "Estoque inicial" (FIFO normal: o custo da planilha vira o custo das peças).
- Produto que já existe (mesmo nome, sem diferenciar acento/maiúsculas) recebe as variações; variação que já existe
  só soma peças. Planilha idêntica já importada é recusada (evita dobrar o estoque por engano).
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
import unicodedata
import zipfile
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import today_brazil
from app.models.category import Category
from app.models.entry_item import EntryItem
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.stock_entry import EntryType, StockEntry
from app.services import lot_cost_service
from app.services.inventory_service import InventoryService
from app.services.stock_entry_service import StockEntryService
from app.utils.variant_grid import normalize_color, normalize_size

MAX_ROWS = 1500
MAX_UNZIPPED = 60 * 1024 * 1024
MAX_QTY = 1_000_000
MAX_MONEY = Decimal("100000")
DEFAULT_CATEGORY = "Sem categoria"
HASH_TAG = "[planilha:"

TEMPLATE_HEADER = ["Produto", "Categoria", "Cor", "Tamanho", "Quantidade", "Custo", "Preço", "Marca"]
TEMPLATE_EXAMPLES = [
    ["Legging Cintura Alta", "Leggings", "Preto", "P", "3", "38,00", "89,90", "Marca X"],
    ["Legging Cintura Alta", "Leggings", "Preto", "M", "5", "38,00", "89,90", "Marca X"],
    ["Top Faixa", "Tops", "Rosa", "ÚNICO", "4", "22,50", "59,90", ""],
]

# nome normalizado da coluna -> campo
_HEADERS = {
    "produto": "name", "nome": "name", "descricao": "name", "item": "name",
    "categoria": "category", "grupo": "category",
    "cor": "color",
    "tamanho": "size", "tam": "size",
    "quantidade": "quantity", "qtd": "quantity", "qtde": "quantity", "estoque": "quantity", "quant": "quantity",
    "custo": "cost", "custounitario": "cost", "precodecusto": "cost", "valordecusto": "cost", "custounit": "cost",
    "preco": "price", "precodevenda": "price", "valor": "price", "venda": "price", "precovenda": "price",
    "valordevenda": "price",
    "marca": "brand",
}
_REQUIRED = ("name", "quantity", "cost", "price")
_LABEL = {"name": "Produto", "quantity": "Quantidade", "cost": "Custo", "price": "Preço"}


class StockImportError(ValueError):
    """Importação recusada (a mensagem é mostrada à pessoa)."""


def _fold(text_: Any) -> str:
    t = unicodedata.normalize("NFD", str(text_ or ""))
    t = re.sub(r"[̀-ͯ]", "", t)
    return re.sub(r"\s+", " ", t).strip().lower()


def _col_key(text_: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", _fold(text_))


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def parse_number(value: Any) -> Optional[Decimal]:
    """'1.234,56' | 'R$ 12,50' | '12.5' | '1.500' (milhar) -> Decimal; vazio -> None; lixo -> InvalidOperation."""
    if value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value))
    s = str(value).strip()
    s = re.sub(r"(?i)r\$|\s", "", s)
    if not s:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")
    if not re.fullmatch(r"-?\d+(\.\d+)?", s):
        raise InvalidOperation(s)
    return Decimal(s)


def _table_from_text(text_: str) -> List[List[str]]:
    text_ = text_.strip("﻿\r\n ")
    if not text_.strip():
        return []
    sample = text_[:4000]
    counts = {d: sample.count(d) for d in ("\t", ";", ",")}
    delim = max(counts, key=lambda d: counts[d]) if any(counts.values()) else ";"
    return [row for row in csv.reader(io.StringIO(text_), delimiter=delim)]


def _table_from_xlsx(raw: bytes) -> List[List[str]]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover
        raise StockImportError("Este servidor não lê XLSX. Envie em CSV ou cole as linhas da planilha.") from exc
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as z:         # XLSX é um zip: recusa o que descompacta em tamanho absurdo
            if sum(i.file_size for i in z.infolist()) > MAX_UNZIPPED:
                raise StockImportError("A planilha é grande demais depois de aberta. Divida em partes menores.")
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except StockImportError:
        raise
    except Exception as exc:
        raise StockImportError("Não consegui abrir a planilha. Salve como XLSX ou CSV e tente de novo.") from exc
    ws = wb.worksheets[0]
    rows: List[List[str]] = []
    for r in ws.iter_rows(values_only=True, max_col=12):
        rows.append(["" if c is None else (str(c) if not isinstance(c, float) or c != int(c) else str(int(c))) for c in r])
        if len(rows) > MAX_ROWS + 50:                       # o resto só serviria para estourar a memória: o limite de linhas recusa
            break
    return rows


def read_table(text_: Optional[str] = None, file_bytes: Optional[bytes] = None, filename: Optional[str] = None) -> List[List[str]]:
    if file_bytes:
        name = (filename or "").lower()
        if name.endswith((".xlsx", ".xlsm")) or file_bytes[:2] == b"PK":
            return _table_from_xlsx(file_bytes)
        if name.endswith(".xls"):
            raise StockImportError("Arquivo .xls antigo não é lido. Salve como XLSX ou CSV.")
        return _table_from_text(_decode(file_bytes))
    return _table_from_text(text_ or "")


@dataclass
class Row:
    line: int
    name: str = ""
    category: str = ""
    color: Optional[str] = None
    size: Optional[str] = None
    quantity: int = 0
    cost: Optional[Decimal] = None
    price: Optional[Decimal] = None
    brand: Optional[str] = None
    status: str = "erro"        # novo_produto | nova_variacao | soma | ignorada | erro
    message: str = ""
    # preenchido pelo plano
    product_id: Optional[int] = None
    variant_id: Optional[int] = None

    def public(self) -> Dict[str, Any]:
        return {
            "line": self.line, "product": self.name, "category": self.category, "color": self.color, "size": self.size,
            "quantity": self.quantity, "cost": float(self.cost) if self.cost is not None else None,
            "price": float(self.price) if self.price is not None else None, "brand": self.brand,
            "status": self.status, "message": self.message,
        }


@dataclass
class Plan:
    rows: List[Row] = field(default_factory=list)
    fatal: Optional[str] = None
    new_categories: List[str] = field(default_factory=list)
    digest: str = ""

    @property
    def errors(self) -> List[Row]:
        return [r for r in self.rows if r.status == "erro"]

    @property
    def usable(self) -> List[Row]:
        return [r for r in self.rows if r.status in ("novo_produto", "nova_variacao", "soma")]


def parse_rows(table: List[List[str]]) -> Tuple[List[Row], Optional[str]]:
    """Lê o cabeçalho e valida cada linha (sem olhar o banco). Devolve (linhas, erro geral)."""
    table = [r for r in table if any(str(c).strip() for c in r)]
    if not table:
        return [], "A planilha está vazia. Cole as linhas ou envie o arquivo."
    header = table[0]
    cols: Dict[str, int] = {}
    for i, h in enumerate(header):
        f = _HEADERS.get(_col_key(h))
        if f and f not in cols:
            cols[f] = i
    faltam = [_LABEL[f] for f in _REQUIRED if f not in cols]
    if faltam:
        return [], (
            "Não achei as colunas: " + ", ".join(faltam) + ". A primeira linha precisa ter os títulos "
            "(Produto, Categoria, Cor, Tamanho, Quantidade, Custo, Preço). Baixe o modelo para conferir."
        )
    body = table[1:]
    if not body:
        return [], "Só há o cabeçalho, nenhuma linha de peça."
    if len(body) > MAX_ROWS:
        return [], f"A planilha passa de {MAX_ROWS} linhas; envie no máximo {MAX_ROWS} por vez (divida em partes)."

    def cell(r: List[str], f: str) -> str:
        i = cols.get(f)
        return str(r[i]).strip() if i is not None and i < len(r) and r[i] is not None else ""

    rows: List[Row] = []
    seen: Dict[Tuple[str, str, str], int] = {}
    for n, r in enumerate(body, start=2):          # linha 2 = primeira peça (como no Excel)
        row = Row(line=n)
        row.name = re.sub(r"\s+", " ", cell(r, "name"))
        row.category = re.sub(r"\s+", " ", cell(r, "category")) or DEFAULT_CATEGORY
        row.brand = re.sub(r"\s+", " ", cell(r, "brand")) or None
        row.color = normalize_color(cell(r, "color")) or None
        row.size = normalize_size(cell(r, "size")) or None
        errs: List[str] = []
        if not row.name:
            errs.append("falta o nome do produto")
        elif len(row.name) > 200:
            errs.append("nome com mais de 200 letras")
        if len(row.category) > 100:
            errs.append("categoria com mais de 100 letras")
        try:
            q = parse_number(cell(r, "quantity"))
        except InvalidOperation:
            q = None
            errs.append(f"quantidade inválida ({cell(r, 'quantity')})")
        else:
            if q is None or q == 0:
                row.status, row.message = "ignorada", "quantidade vazia ou zero: linha ignorada"
            elif q < 0 or q != q.to_integral_value():
                errs.append("quantidade precisa ser um número inteiro maior que zero")
            elif q > MAX_QTY:
                errs.append(f"quantidade acima de {MAX_QTY:,}".replace(",", "."))
            else:
                row.quantity = int(q)
        for f, label in (("cost", "custo"), ("price", "preço")):
            try:
                v = parse_number(cell(r, f))
            except InvalidOperation:
                errs.append(f"{label} inválido ({cell(r, f)})")
                continue
            if row.status == "ignorada":
                setattr(row, f, v)
                continue
            if v is None or v <= 0:
                errs.append(
                    f"informe o {label}" + (" (sem o custo o lucro fica errado)" if f == "cost" else "")
                )
            elif v > MAX_MONEY:
                errs.append(f"{label} acima de R$ 100.000")
            else:
                setattr(row, f, v.quantize(Decimal("0.01")))
        if errs and row.status != "ignorada":
            row.status, row.message = "erro", "; ".join(errs)
        elif row.status != "ignorada":
            row.status = "novo_produto"                       # refinado pelo plano
            key = (_fold(row.name), row.color or "", row.size or "")
            if key in seen:
                row.status = "erro"
                row.message = f"repete a linha {seen[key]} (mesmo produto, cor e tamanho): junte numa linha só"
            else:
                seen[key] = n
        rows.append(row)
    return rows, None


async def build_plan(db: AsyncSession, tenant_id: int, table: List[List[str]]) -> Plan:
    plan = Plan()
    rows, fatal = parse_rows(table)
    plan.rows, plan.fatal = rows, fatal
    if fatal:
        return plan
    usable = [r for r in rows if r.status == "novo_produto"]
    if not usable and not plan.errors:
        plan.fatal = "Nenhuma linha com quantidade. Preencha a coluna Quantidade."
        return plan

    # produtos e variações que já existem
    prods = (await db.execute(
        select(Product.id, Product.name).where(Product.tenant_id == tenant_id, Product.is_active == True)  # noqa: E712
    )).all()
    by_name: Dict[str, int] = {}
    for pid, pname in prods:
        by_name.setdefault(_fold(pname), pid)
    variants_by_product: Dict[int, Dict[Tuple[str, str], int]] = {}
    ids = {by_name[_fold(r.name)] for r in usable if _fold(r.name) in by_name}
    if ids:
        for vid, pid, color, size in (await db.execute(
            select(ProductVariant.id, ProductVariant.product_id, ProductVariant.color, ProductVariant.size).where(
                ProductVariant.tenant_id == tenant_id, ProductVariant.is_active == True,  # noqa: E712
                ProductVariant.product_id.in_(ids),
            )
        )).all():
            variants_by_product.setdefault(pid, {})[(_fold(color), _fold(size))] = vid

    cats = {_fold(n) for (n,) in (await db.execute(
        select(Category.name).where(Category.tenant_id == tenant_id, Category.is_active == True)  # noqa: E712
    )).all()}
    new_cats: Dict[str, str] = {}
    for r in usable:
        pid = by_name.get(_fold(r.name))
        r.product_id = pid
        if pid is None:
            r.status = "novo_produto"
        else:
            vid = variants_by_product.get(pid, {}).get((_fold(r.color), _fold(r.size)))
            r.variant_id = vid
            r.status = "soma" if vid else "nova_variacao"
            if vid:
                r.message = "a peça já existe: as unidades serão somadas ao estoque"
        if pid is None and _fold(r.category) not in cats:
            new_cats.setdefault(_fold(r.category), r.category)
    plan.new_categories = sorted(new_cats.values(), key=_fold)

    canon = "|".join(
        f"{_fold(r.name)},{r.color or ''},{r.size or ''},{r.quantity},{r.cost},{r.price}"
        for r in sorted(usable, key=lambda x: (_fold(x.name), x.color or "", x.size or ""))
    )
    plan.digest = hashlib.sha256(canon.encode()).hexdigest()[:12]
    return plan


def summarize(plan: Plan) -> Dict[str, Any]:
    usable = plan.usable
    total = sum((r.cost or Decimal("0")) * r.quantity for r in usable)
    products_new = {_fold(r.name) for r in usable if r.status == "novo_produto"}
    products_old = {r.product_id for r in usable if r.product_id}
    return {
        "lines": len(plan.rows),
        "pieces": sum(r.quantity for r in usable),
        "variants": len(usable),
        "products_new": len(products_new),
        "products_existing": len(products_old),
        "variants_added_to_existing": sum(1 for r in usable if r.status == "soma"),
        "categories_new": plan.new_categories,
        "ignored": sum(1 for r in plan.rows if r.status == "ignorada"),
        "errors": len(plan.errors),
        "total_cost": float(total),
        "total_sale": float(sum((r.price or Decimal("0")) * r.quantity for r in usable)),
        "digest": plan.digest,
    }


class StockImportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def preview(self, tenant_id: int, table: List[List[str]]) -> Dict[str, Any]:
        plan = await build_plan(self.db, tenant_id, table)
        if plan.fatal:
            return {"can_import": False, "fatal": plan.fatal, "summary": None, "rows": []}
        already = await self._already_imported(tenant_id, plan.digest) if plan.digest else None
        out = {
            "can_import": not plan.errors and not already and bool(plan.usable),
            "fatal": already,
            "summary": summarize(plan),
            "rows": [r.public() for r in plan.rows],
        }
        return out

    async def _already_imported(self, tenant_id: int, digest: str) -> Optional[str]:
        found = (await self.db.execute(
            select(StockEntry.entry_date, StockEntry.entry_code).where(
                StockEntry.tenant_id == tenant_id, StockEntry.is_active == True,  # noqa: E712
                StockEntry.notes.like(f"%{HASH_TAG}{digest}]%"),
            )
        )).first()
        if not found:
            return None
        return (
            f"Esta planilha já foi importada (entrada {found[1]}, {found[0].strftime('%d/%m/%Y')}). "
            "Importar de novo dobraria o estoque."
        )

    async def commit(self, tenant_id: int, table: List[List[str]], *, entry_date: Optional[date] = None) -> Dict[str, Any]:
        plan = await build_plan(self.db, tenant_id, table)
        if plan.fatal:
            raise StockImportError(plan.fatal)
        if plan.errors:
            first = plan.errors[0]
            raise StockImportError(
                f"{len(plan.errors)} linha(s) com erro, nada foi gravado. Primeira: linha {first.line}, {first.message}."
            )
        usable = plan.usable
        if not usable:
            raise StockImportError("Nenhuma linha com quantidade para importar.")
        already = await self._already_imported(tenant_id, plan.digest)
        if already:
            raise StockImportError(already)
        day = entry_date or today_brazil()
        if day > today_brazil():
            raise StockImportError("A data do estoque inicial não pode ser no futuro.")

        svc = StockEntryService(self.db)
        try:
            await svc._lock_catalog(tenant_id)
            # a trava serializa a importação: confere de novo o que a loja já tem (outra importação pode ter rodado)
            plan = await build_plan(self.db, tenant_id, table)
            if plan.errors or plan.fatal:
                raise StockImportError("O cadastro mudou durante a importação. Confira a planilha e tente de novo.")
            usable = plan.usable
            already = await self._already_imported(tenant_id, plan.digest)
            if already:
                raise StockImportError(already)

            categories = await self._ensure_categories(tenant_id, usable)
            code = await svc._generate_unique_entry_code(f"ESTOQUE-INICIAL-{day.strftime('%Y%m%d')}", tenant_id=tenant_id)
            entry = StockEntry(
                entry_code=code, entry_date=day, entry_type=EntryType.INITIAL_INVENTORY,
                supplier_name="Estoque inicial", total_cost=Decimal("0.00"),
                notes=f"Importação de planilha {HASH_TAG}{plan.digest}]", tenant_id=tenant_id, is_active=True,
            )
            self.db.add(entry)
            await self.db.flush()

            groups: Dict[str, List[Row]] = {}
            for r in usable:
                groups.setdefault(_fold(r.name), []).append(r)
            total = Decimal("0.00")
            touched: List[int] = []
            created_products = created_variants = 0
            for rows in groups.values():
                first = rows[0]
                product: Optional[Product] = None
                if first.product_id:
                    product = (await self.db.execute(
                        select(Product).where(Product.id == first.product_id, Product.tenant_id == tenant_id)
                    )).scalar_one()
                else:
                    product = Product(
                        name=first.name, category_id=categories[_fold(first.category)],
                        brand=next((x.brand for x in rows if x.brand), None),
                        base_price=min(x.price for x in rows), is_catalog=False, is_active=True, tenant_id=tenant_id,
                    )
                    self.db.add(product)
                    await self.db.flush()
                    created_products += 1
                touched.append(product.id)
                for r in rows:
                    if r.variant_id:
                        variant, created = (await self.db.execute(
                            select(ProductVariant).where(ProductVariant.id == r.variant_id, ProductVariant.tenant_id == tenant_id)
                        )).scalar_one(), False
                    else:
                        variant, created = await svc._get_or_create_variant(
                            product, r.color, r.size, price=r.price, cost=r.cost, sku=None, tenant_id=tenant_id
                        )
                    created_variants += 1 if created else 0
                    self.db.add(EntryItem(
                        entry_id=entry.id, product_id=product.id, variant_id=variant.id,
                        quantity_received=r.quantity, quantity_remaining=r.quantity, unit_cost=r.cost,
                        notes="Estoque inicial (planilha)", tenant_id=tenant_id, is_active=True,
                    ))
                    total += r.cost * r.quantity
                await self.db.flush()

            entry.total_cost = total
            inv = InventoryService(self.db)
            for pid in touched:
                await inv.rebuild_product_from_fifo(pid, tenant_id=tenant_id)
            await lot_cost_service.recompute_entries(self.db, [entry.id], tenant_id=tenant_id)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return {
            "entry_id": entry.id, "entry_code": entry.entry_code, "pieces": sum(r.quantity for r in usable),
            "products_created": created_products, "variants_created": created_variants,
            "products_touched": len(touched), "total_cost": float(total),
            "categories_created": plan.new_categories,
        }

    async def _ensure_categories(self, tenant_id: int, rows: List[Row]) -> Dict[str, int]:
        """Id da categoria de cada nome (cria as que faltam, com slug livre na loja)."""
        existing = (await self.db.execute(
            select(Category).where(Category.tenant_id == tenant_id, Category.is_active == True)  # noqa: E712
        )).scalars().all()
        by_fold = {_fold(c.name): c.id for c in existing}
        slugs = {c.slug for c in (await self.db.execute(
            select(Category).where(Category.tenant_id == tenant_id)
        )).scalars().all()}
        for r in rows:
            if r.product_id or _fold(r.category) in by_fold:
                continue
            base = re.sub(r"[-\s]+", "-", re.sub(r"[^\w\s-]", "", _fold(r.category))) or "categoria"
            slug, i = base, 2
            while slug in slugs:
                slug, i = f"{base}-{i}", i + 1
            slugs.add(slug)
            cat = Category(name=r.category, slug=slug, tenant_id=tenant_id, is_active=True)
            self.db.add(cat)
            await self.db.flush()
            by_fold[_fold(r.category)] = cat.id
        return by_fold


def template_xlsx() -> bytes:
    """Modelo em Excel (.xlsx): cabeçalho em negrito e centralizado, números de verdade nas colunas de valor."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font

    wb = Workbook()
    ws = wb.active
    ws.title = "Estoque"
    ws.append(TEMPLATE_HEADER)
    for ex in TEMPLATE_EXAMPLES:
        qtd, custo, preco = int(ex[4]), float(ex[5].replace(",", ".")), float(ex[6].replace(",", "."))
        ws.append([ex[0], ex[1], ex[2], ex[3], qtd, custo, preco, ex[7]])
    for c in ws[1]:
        c.font = Font(bold=True)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for col, w in zip("ABCDEFGH", (28, 16, 12, 10, 12, 10, 10, 14)):
        ws.column_dimensions[col].width = w
    for row in ws.iter_rows(min_row=2, min_col=6, max_col=7):
        for c in row:
            c.number_format = "#,##0.00"
    ws.freeze_panes = "A2"
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
