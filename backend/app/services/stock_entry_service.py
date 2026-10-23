"""
Serviço de gerenciamento de entradas de estoque (StockEntry).
"""
from typing import List, Optional, Dict, Any
from decimal import Decimal
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import now_brazil, today_brazil
from app.models.stock_entry import StockEntry, EntryType
from app.models.entry_item import EntryItem
from app.services import lot_cost_service
from app.repositories.stock_entry_repository import StockEntryRepository
from app.repositories.entry_item_repository import EntryItemRepository
from app.repositories.trip_repository import TripRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.inventory_repository import InventoryRepository
from app.schemas.stock_entry import StockEntryCreate, StockEntryUpdate
from app.schemas.entry_item import EntryItemCreate
from app.services.inventory_service import InventoryService


class StockEntryService:
    """Serviço para operações de negócio com entradas de estoque."""
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço de entradas.
        
        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self.entry_repo = StockEntryRepository()
        self.item_repo = EntryItemRepository()
        self.trip_repo = TripRepository()
        self.product_repo = ProductRepository(db)
        self.inventory_repo = InventoryRepository(db)

    async def _generate_unique_entry_code(self, base_code: str, tenant_id: int) -> str:
        """
        Gera um código único para entrada, adicionando sufixo se necessário.

        Args:
            base_code: Código base fornecido
            tenant_id: ID do tenant

        Returns:
            str: Código único
        """
        await self._lock_catalog(tenant_id)
        # Verificar se código base já existe
        existing = await self.entry_repo.get_by_code(self.db, base_code, tenant_id=tenant_id)
        if not existing:
            return base_code

        # Adicionar sufixo numérico até encontrar código único
        counter = 1
        while True:
            new_code = f"{base_code}-{counter}"
            existing = await self.entry_repo.get_by_code(self.db, new_code, tenant_id=tenant_id)
            if not existing:
                return new_code
            counter += 1

            # Limite de segurança
            if counter > 1000:
                # Usar timestamp se falhar após 1000 tentativas
                timestamp = now_brazil().strftime("%Y%m%d%H%M%S")
                return f"{base_code}-{timestamp}"

    @staticmethod
    def _require_cost(cost, label: str, entry_type=None):
        """Custo é obrigatório: sem ele o lucro/FIFO fica errado. Zero só vale em entrada de doação."""
        from decimal import Decimal, InvalidOperation

        kind = str(getattr(entry_type, "value", entry_type) or "").lower()
        try:
            value = Decimal(str(cost)) if cost is not None else None
        except InvalidOperation:
            value = None
        if value is None or value < 0 or (value == 0 and kind != "donation"):
            raise ValueError(
                f"Informe o custo de {label}. Sem o custo, o lucro (FIFO) fica incorreto."
            )
        return value

    @staticmethod
    def _norm_text(value) -> str:
        """Nome normalizado para comparar fornecedores: sem acento, minúsculo, espaços únicos."""
        import re
        import unicodedata

        text_ = unicodedata.normalize("NFD", str(value or ""))
        text_ = "".join(ch for ch in text_ if unicodedata.category(ch) != "Mn")
        return re.sub(r"\s+", " ", text_).strip().casefold()

    async def _resolve_supplier(
        self,
        supplier_id,
        name,
        cnpj,
        contact,
        tenant_id: int,
    ):
        """Acha (ou cria) o fornecedor da loja.

        - `supplier_id` informado: precisa existir na loja e estar ativo.
        - só `name`: acha pelo nome normalizado (ou CNPJ); se não existe, cria o cadastro.
        Não faz commit (entra na transação da entrada).
        """
        import re
        from sqlalchemy import select
        from app.models.supplier import Supplier

        if supplier_id:
            supplier = (await self.db.execute(
                select(Supplier).where(
                    Supplier.id == supplier_id,
                    Supplier.tenant_id == tenant_id,
                    Supplier.is_active == True,
                )
            )).scalar_one_or_none()
            if not supplier:
                raise ValueError(f"Fornecedor {supplier_id} não encontrado")
            return supplier

        clean = re.sub(r"\s+", " ", (name or "")).strip()
        if not clean:
            return None

        wanted = self._norm_text(clean)
        digits = re.sub(r"\D", "", cnpj or "")
        rows = (await self.db.execute(
            select(Supplier).where(Supplier.tenant_id == tenant_id)
        )).scalars().all()
        for sup in rows:
            same_name = self._norm_text(sup.name) == wanted
            same_cnpj = bool(digits) and re.sub(r"\D", "", sup.cnpj or "") == digits
            if same_name or same_cnpj:
                if not sup.is_active:
                    sup.is_active = True  # reativa fornecedor arquivado
                return sup

        supplier = Supplier(
            name=clean,
            cnpj=(cnpj or None),
            phone=(contact or None),
            tenant_id=tenant_id,
        )
        self.db.add(supplier)
        await self.db.flush()
        return supplier

    async def _link_supplier_product(
        self,
        supplier_id: int,
        product_id: int,
        unit_cost,
        purchase_date,
        tenant_id: int,
    ) -> None:
        """Cria/atualiza o vínculo fornecedor x produto (último custo, nº de compras, data).
        Não faz commit."""
        from datetime import date as _date
        from sqlalchemy import select
        from app.models.supplier_product import SupplierProduct

        when = purchase_date or today_brazil()
        if isinstance(when, datetime):
            when = when.date()
        existing = (await self.db.execute(
            select(SupplierProduct).where(
                SupplierProduct.supplier_id == supplier_id,
                SupplierProduct.product_id == product_id,
                SupplierProduct.tenant_id == tenant_id,
            )
        )).scalar_one_or_none()
        if existing is None:
            self.db.add(SupplierProduct(
                supplier_id=supplier_id,
                product_id=product_id,
                last_unit_cost=unit_cost,
                purchase_count=1,
                last_purchase_date=when,
                tenant_id=tenant_id,
            ))
        else:
            existing.purchase_count += 1
            if not isinstance(existing.last_purchase_date, _date) or when >= existing.last_purchase_date:
                existing.last_unit_cost = unit_cost
                existing.last_purchase_date = when
            existing.is_active = True
        await self.db.flush()

    async def _apply_supplier_links(self, acc: dict, purchase_date, tenant_id: int) -> None:
        """Grava 1 vínculo por (fornecedor, produto) da entrada: conta UMA compra mesmo que o produto
        tenha várias variações, com custo médio ponderado pela quantidade."""
        for (supplier_id, product_id), (qty, total) in acc.items():
            avg = (total / qty) if qty else Decimal('0')
            await self._link_supplier_product(
                supplier_id, product_id, avg.quantize(Decimal('0.01')), purchase_date, tenant_id
            )

    @staticmethod
    def _variant_label(size, color, sku) -> str:
        parts = " / ".join(p for p in (size, color) if p) or "variação única"
        return f"{parts} (SKU {sku})" if sku else parts

    async def _lock_catalog(self, tenant_id: int) -> None:
        """
        Serializa a criação de produto/variação/entrada DA MESMA LOJA (Postgres): dois acessos ao mesmo tempo
        passam a esperar um ao outro, e o segundo já enxerga os SKUs e códigos que o primeiro criou.
        O bloqueio é liberado sozinho no commit/rollback.
        """
        from sqlalchemy import text

        if self.db.get_bind().dialect.name != "postgresql":
            return
        await self.db.execute(text("SELECT pg_advisory_xact_lock(CAST(:k AS bigint))"), {"k": 7_300_000_000 + int(tenant_id)})

    @staticmethod
    def _bump_sku(sku: str) -> str:
        """Próximo SKU livre na sequência: ...-001 vira ...-002 (mantém os zeros); sem número no fim, acrescenta -002."""
        import re

        m = re.match(r"^(.*?)(\d+)$", sku)
        if not m:
            return f"{sku}-002"
        num = m.group(2)
        return f"{m.group(1)}{int(num) + 1:0{len(num)}d}"

    async def _resolve_free_skus(self, skus, tenant_id: int) -> list:
        """
        Devolve os SKUs prontos para gravar. SKU que já existe na loja (ou repetido no mesmo envio) NÃO derruba
        a criação: recebe o próximo número livre. Isso acontece quando duas pessoas cadastram produtos parecidos
        ao mesmo tempo e o app de uma delas ainda não conhecia o SKU da outra. Os ajustes ficam no registro de erros.
        """
        from sqlalchemy import select, func
        from app.models.product_variant import ProductVariant
        from app.services.error_log_service import record_error

        await self._lock_catalog(tenant_id)
        wanted = [str(s).strip().upper() if s and str(s).strip() else None for s in skus]
        cache: dict = {}

        async def taken(cand: str) -> bool:
            if cand not in cache:
                row = await self.db.execute(
                    select(ProductVariant.id).where(
                        ProductVariant.tenant_id == tenant_id,
                        ProductVariant.is_active == True,  # noqa: E712
                        func.upper(ProductVariant.sku) == cand,
                    ).limit(1)
                )
                cache[cand] = row.first() is not None
            return cache[cand]

        chosen: set = set()
        out: list = []
        adjusted = []
        for w in wanted:
            if w is None:
                out.append(None)
                continue
            cand = w
            while cand in chosen or await taken(cand):
                cand = self._bump_sku(cand)
            if cand != w:
                adjusted.append({"pedido": w, "gravado": cand})
            chosen.add(cand)
            out.append(cand)
        if adjusted:
            await record_error(
                message=f"SKU ja existia; ajustado automaticamente ({len(adjusted)})", level="info", source="api",
                error_type="sku_ajustado", detail={"ajustes": adjusted}, tenant_id=tenant_id,
            )
        return out

    async def _ensure_skus_free(self, skus, tenant_id: int) -> None:
        """Recusa SKU já usado por outra variante ativa da loja (sem diferenciar maiúsculas)."""
        from sqlalchemy import select, func
        from app.models.product_variant import ProductVariant

        wanted = {str(s).strip().upper() for s in skus if s and str(s).strip()}
        if not wanted:
            return
        result = await self.db.execute(
            select(ProductVariant.sku).where(
                ProductVariant.tenant_id == tenant_id,
                ProductVariant.is_active == True,
                func.upper(ProductVariant.sku).in_(wanted),
            )
        )
        used = sorted({row[0] for row in result.all() if row[0]})
        if used:
            raise ValueError(f"SKU já existe em outro produto: {', '.join(used)}")

    async def _validate_variant_of_product(self, variant_id: int, product_id: int, tenant_id: int):
        """A variação do item tem que existir, estar ativa e pertencer ao produto do item."""
        from sqlalchemy import select as _select
        from app.models.product_variant import ProductVariant
        variant = (await self.db.execute(
            _select(ProductVariant).where(
                ProductVariant.id == variant_id,
                ProductVariant.tenant_id == tenant_id,
                ProductVariant.is_active == True,
            )
        )).scalar_one_or_none()
        if variant is None:
            raise ValueError(f"Variação {variant_id} não encontrada")
        if variant.product_id != product_id:
            raise ValueError(f"A variação {variant_id} não pertence ao produto {product_id}")
        return variant

    async def check_code_exists(self, entry_code: str, tenant_id: int) -> bool:
        """
        Verifica se um código de entrada já existe para o tenant.

        Args:
            entry_code: Código da entrada a verificar
            tenant_id: ID do tenant

        Returns:
            bool: True se código já existe, False caso contrário
        """
        existing = await self.entry_repo.get_by_code(self.db, entry_code, tenant_id=tenant_id)
        return existing is not None

    async def create_entry(
        self, 
        entry_data: StockEntryCreate,
        items: List[EntryItemCreate],
        user_id: int,
        *,
        tenant_id: int,
    ) -> StockEntry:
        """
        Cria uma nova entrada de estoque com seus itens em transação única.
        
        Args:
            entry_data: Dados da entrada
            items: Lista de itens da entrada
            user_id: ID do usuário que está criando
            tenant_id: ID do tenant
            
        Returns:
            StockEntry: Entrada criada com itens
            
        Raises:
            ValueError: Se entry_code já existe ou dados inválidos
        """
        try:
            # Gerar código único se necessário
            unique_code = await self._generate_unique_entry_code(entry_data.entry_code, tenant_id=tenant_id)
            entry_data.entry_code = unique_code
            
            # Validar trip_id se fornecido
            if entry_data.trip_id:
                trip = await self.trip_repo.get_by_id(self.db, entry_data.trip_id, tenant_id=tenant_id)
                if not trip:
                    raise ValueError(f"Trip {entry_data.trip_id} não encontrada")
                
                # Garantir que entry_type seja 'trip' se trip_id fornecido
                if entry_data.entry_type != EntryType.TRIP:
                    raise ValueError("entry_type deve ser 'trip' quando trip_id é fornecido")
            
            # Fornecedor padrão da entrada (cadastro): achado pelo id ou pelo nome, ou criado
            default_supplier = await self._resolve_supplier(
                entry_data.supplier_id, entry_data.supplier_name,
                entry_data.supplier_cnpj, entry_data.supplier_contact, tenant_id,
            )
            if default_supplier is None:
                raise ValueError("Informe o fornecedor da entrada")

            # VALIDA TUDO ANTES de criar a entrada: o repositório faz commit ao criar, então um erro
            # depois disso deixaria uma entrada vazia gravada. Aqui nada é persistido ainda.
            prepared_items = []
            for item_data in items or []:
                item_dict = item_data.model_dump(exclude_unset=True)

                product = await self.product_repo.get(self.db, item_dict['product_id'], tenant_id=tenant_id)
                if not product:
                    raise ValueError(f"Product {item_dict['product_id']} não encontrado")

                # Se produto é de catálogo, marcar como adicionado à loja
                if product.is_catalog:
                    product.is_catalog = False
                    # Commit será feito ao final da transação

                # Custo obrigatório (zero só em doação): sem ele o lucro/FIFO fica incorreto
                self._require_cost(item_dict.get('unit_cost'), product.name, entry_data.entry_type)

                # Garantir que quantity_remaining = quantity_received
                if 'quantity_remaining' not in item_dict:
                    item_dict['quantity_remaining'] = item_dict['quantity_received']

                # Se variant_id não veio no payload, auto-vincula quando o
                # produto tem exatamente 1 variante ativa (senão o estoque
                # fica órfão: invisível na soma por variante usada em
                # current_stock e nos alertas de estoque baixo).
                if item_dict.get('variant_id'):
                    await self._validate_variant_of_product(item_dict['variant_id'], item_dict['product_id'], tenant_id)
                if not item_dict.get('variant_id'):
                    from app.models.product_variant import ProductVariant
                    from sqlalchemy import select as _select
                    active_variants = (await self.db.execute(
                        _select(ProductVariant).where(
                            ProductVariant.product_id == item_dict['product_id'],
                            ProductVariant.tenant_id == tenant_id,
                            ProductVariant.is_active == True,
                        )
                    )).scalars().all()
                    if len(active_variants) == 1:
                        item_dict['variant_id'] = active_variants[0].id
                    elif len(active_variants) > 1:
                        # Sem a variação, o estoque ficaria órfão (conta no produto, mas em
                        # nenhuma variação). Exige que o item diga qual variação está entrando.
                        raise ValueError(
                            f"O produto {item_dict['product_id']} tem {len(active_variants)} variações: "
                            "informe a variação (variant_id) de cada item da entrada."
                        )

                # Fornecedor do item: o informado (validado) ou o padrão da entrada
                if item_dict.get('supplier_id'):
                    item_supplier = await self._resolve_supplier(item_dict['supplier_id'], None, None, None, tenant_id)
                    item_dict['supplier_id'] = item_supplier.id
                else:
                    item_dict['supplier_id'] = default_supplier.id

                prepared_items.append(item_dict)

            # Criar entrada (o fornecedor do cadastro é a fonte do nome exibido)
            entry_dict = entry_data.model_dump(exclude_unset=True)
            extra_costs = entry_dict.pop('extra_costs', None) or []
            entry_dict['supplier_id'] = default_supplier.id
            entry_dict['supplier_name'] = default_supplier.name
            entry_dict['total_cost'] = Decimal('0.00')  # Será calculado depois

            entry = await self.entry_repo.create(self.db, entry_dict, tenant_id=tenant_id)

            # Criar itens
            total_cost = Decimal('0.00')
            created_items = []
            supplier_acc: dict = {}

            for item_dict in prepared_items:
                item_dict['entry_id'] = entry.id

                # Extrair selling_price se fornecido (não é campo do EntryItem, é do Product)
                selling_price = item_dict.pop('selling_price', None)
                
                # EntryItem não tem tenant_id próprio, herda da StockEntry
                item_dict['tenant_id'] = tenant_id
                item = await self.item_repo.create(self.db, item_dict)
                created_items.append(item)

                # Acumula para o vinculo fornecedor x produto (gravado 1x por entrada, abaixo)
                _k = (item.supplier_id, item.product_id)
                _q, _t = supplier_acc.get(_k, (0, Decimal('0')))
                supplier_acc[_k] = (_q + item.quantity_received, _t + item.quantity_received * item.unit_cost)
                
                # Calcular custo total
                total_cost += item.quantity_received * item.unit_cost
                
                # Atualizar produto com selling_price e cost_price se fornecidos
                product = await self.product_repo.get(self.db, item.product_id, tenant_id=tenant_id)
                if product:
                    if selling_price is not None and selling_price > 0:
                        product.base_price = selling_price
                    # Commit será feito ao final
                
                # Atualizar estoque do produto
                await self._update_product_inventory(
                    item.product_id, 
                    item.quantity_received,
                    operation='add',
                    tenant_id=tenant_id,
                )
            
            # Vinculo fornecedor x produto (alimenta o card "Fornecedores" do produto)
            await self._apply_supplier_links(supplier_acc, entry.entry_date, tenant_id)

            # Atualizar total_cost da entrada
            entry.total_cost = total_cost
            await self.db.flush()
            await self._add_entry_costs(entry, extra_costs, tenant_id)
            await lot_cost_service.recompute_entries(self.db, [entry.id], tenant_id=tenant_id)
            await self.db.commit()
            await self.db.refresh(entry)
            
            # Recarregar com itens
            entry = await self.entry_repo.get_by_id(self.db, entry.id, include_items=True, tenant_id=tenant_id)

            # Rebuild incremental para cada produto inserido (garante inventário derivado do FIFO)
            inv_sync = InventoryService(self.db)
            product_ids = {it.product_id for it in created_items}
            for pid in product_ids:
                try:
                    delta = await inv_sync.rebuild_product_from_fifo(pid, tenant_id=tenant_id)
                    print(f"  [Inventory Sync ENTRY] Produto {pid}: fifo={delta['fifo_sum']} inv={delta['inventory_quantity']} created={delta['created']} updated={delta['updated']}")
                except Exception as sync_err:
                    print(f"  [Inventory Sync ENTRY] Falha sync produto {pid}: {sync_err}")
            
            return entry
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def _update_product_inventory(
        self,
        product_id: int,
        quantity: int,
        operation: str = 'add',
        *,
        tenant_id: int | None = None,
    ):
        """
        Atualiza o inventário de um produto.
        
        Args:
            product_id: ID do produto
            quantity: Quantidade a adicionar/remover
            operation: 'add' ou 'remove'
            tenant_id: ID do tenant
        """
        inventory = await self.inventory_repo.get_by_product(product_id, tenant_id=tenant_id)
        
        if not inventory:
            # Criar inventário se não existe
            inventory_data = {
                'product_id': product_id,
                'quantity': quantity if operation == 'add' else 0,
                'min_stock': 5,
                'is_active': True
            }
            await self.inventory_repo.create(self.db, inventory_data, tenant_id=tenant_id)
        else:
            # Atualizar quantidade
            if operation == 'add':
                inventory.quantity += quantity
            elif operation == 'remove':
                inventory.quantity = max(0, inventory.quantity - quantity)
            
            await self.db.commit()
    
    async def get_entry_details(
        self, 
        entry_id: int,
        *,
        tenant_id: int,
    ) -> Dict[str, Any]:
        """
        Obtém detalhes completos de uma entrada.
        
        Args:
            entry_id: ID da entrada
            tenant_id: ID do tenant
            
        Returns:
            Dict com detalhes da entrada
            
        Raises:
            ValueError: Se entrada não encontrada
        """
        entry = await self.entry_repo.get_by_id(self.db, entry_id, include_items=True, tenant_id=tenant_id)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")
        
        # Informações da viagem (se houver)
        trip_info = None
        if entry.trip:
            trip_info = {
                "trip_id": entry.trip.id,
                "trip_code": entry.trip.trip_code,
                "destination": entry.trip.destination,
                "trip_date": entry.trip.trip_date,
                "status": entry.trip.status,
            }
        
        # Informações dos itens
        items = []
        for item in entry.entry_items:
            items.append({
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product.name if item.product else None,
                "product_sku": item.product.sku if item.product else None,
                "product_price": float(item.product.price) if item.product else None,
                "quantity_received": item.quantity_received,
                "quantity_remaining": item.quantity_remaining,
                "quantity_sold": item.quantity_sold,
                "unit_cost": float(item.unit_cost),
                "total_cost": float(item.total_cost),
                "depletion_percentage": item.depletion_percentage,
                "is_depleted": item.is_depleted,
                "notes": item.notes,
            })
        
        return {
            "id": entry.id,
            "entry_code": entry.entry_code,
            "entry_date": entry.entry_date,
            "entry_type": entry.entry_type,
            "supplier_name": entry.supplier_name,
            "supplier_cnpj": entry.supplier_cnpj,
            "supplier_contact": entry.supplier_contact,
            "invoice_number": entry.invoice_number,
            "payment_method": entry.payment_method,
            "total_cost": float(entry.total_cost),
            "notes": entry.notes,
            "is_active": entry.is_active,
            "created_at": entry.created_at,
            "updated_at": entry.updated_at,
            "trip": trip_info,
            "items": items,
            "total_items": len(items),
            "total_quantity": entry.total_quantity,
        }
    
    async def get_entry_analytics(
        self, 
        entry_id: int,
        *,
        tenant_id: int,
    ) -> Dict[str, Any]:
        """
        Obtém análises e métricas de uma entrada.
        
        Args:
            entry_id: ID da entrada
            tenant_id: ID do tenant
            
        Returns:
            Dict com análises da entrada
            
        Raises:
            ValueError: Se entrada não encontrada
        """
        entry = await self.entry_repo.get_by_id(self.db, entry_id, include_items=True, tenant_id=tenant_id)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")
        
        # Calcular métricas
        total_received = 0
        total_remaining = 0
        total_sold = 0
        total_cost = Decimal('0.00')
        items_depleted = 0
        
        for item in entry.entry_items:
            if not item.is_active:
                continue
                
            total_received += item.quantity_received
            total_remaining += item.quantity_remaining
            total_sold += item.quantity_sold
            total_cost += item.total_cost
            
            if item.is_depleted:
                items_depleted += 1
        
        # Calcular sell-through rate
        sell_through_rate = 0.0
        if total_received > 0:
            sell_through_rate = (total_sold / total_received) * 100
        
        # Custos do lote: mercadoria + rateio (viagem e despesas do lote), já gravados por item
        extra_total = sum(
            (Decimal(str(i.quantity_received)) * Decimal(str(i.extra_unit_cost or 0))
             for i in entry.entry_items if i.is_active),
            Decimal('0.00'),
        )
        trip_travel_cost = Decimal('0.00')
        trip_cost_share = Decimal('0.00')
        own_costs = await lot_cost_service.entry_own_costs(self.db, entry.id)
        if entry.trip_id and entry.trip:
            trip_travel_cost = await lot_cost_service.trip_cost_pool(self.db, entry.trip)
            trip_cost_share = max(extra_total - own_costs, Decimal('0.00'))

        total_investment = total_cost + extra_total

        # Vendas reais deste lote (receita, custo posto e unidades, já líquidos de devolução)
        sold = await self._lot_sales_stats(entry, tenant_id=tenant_id)
        real_revenue = sold["revenue"]
        cost_of_sold = sold["cost"]
        gross_profit = real_revenue - cost_of_sold
        margin_pct = float(gross_profit / real_revenue * 100) if real_revenue > 0 else 0.0
        roi = float(gross_profit / cost_of_sold * 100) if cost_of_sold > 0 else 0.0

        # Estoque que sobrou, a custo posto, e quanto falta vender para cobrir tudo que foi investido
        stock_value_remaining = sum(
            (Decimal(str(i.quantity_remaining)) * i.landed_unit_cost for i in entry.entry_items if i.is_active),
            Decimal('0.00'),
        )
        potential_remaining_revenue = Decimal('0.00')
        for i in entry.entry_items:
            if i.is_active and i.quantity_remaining > 0:
                # preço de venda atual da variante (ou do produto); estimativa do que ainda falta vender
                price = (i.variant.price if i.variant and i.variant.price else None) or (
                    i.product.base_price if i.product else Decimal('0'))
                potential_remaining_revenue += Decimal(str(i.quantity_remaining)) * Decimal(str(price or 0))
        recovered_pct = float(real_revenue / total_investment * 100) if total_investment > 0 else 0.0
        projected_profit = real_revenue + potential_remaining_revenue - total_investment

        return {
            "entry_id": entry.id,
            "entry_code": entry.entry_code,
            "entry_type": entry.entry_type,
            "entry_date": entry.entry_date,
            "supplier_name": entry.supplier_name,

            "total_items": len(entry.entry_items),
            "items_depleted": items_depleted,
            "total_quantity_received": total_received,
            "total_quantity_remaining": total_remaining,
            "total_quantity_sold": sold["units"],

            # Custos
            "total_cost": float(total_cost),                  # mercadoria
            "trip_travel_cost": float(trip_travel_cost),      # custo total da viagem (todos os lotes dela)
            "trip_cost_share": float(trip_cost_share),        # parte da viagem que coube a este lote
            "own_costs": float(own_costs),                    # despesas ligadas a este lote
            "extra_costs_total": float(extra_total),          # viagem + despesas do lote
            "total_investment": float(total_investment),      # mercadoria + custos do lote

            # Resultado (vendas reais, líquidas de devolução)
            "real_revenue": float(real_revenue),
            "cost_of_sold": float(cost_of_sold),              # a custo posto (mercadoria + rateio)
            "gross_profit": float(gross_profit),
            "margin_pct": round(margin_pct, 2),               # lucro / receita
            "roi": round(roi, 2),                             # lucro / custo do vendido
            "recovered_pct": round(recovered_pct, 2),         # quanto do investido já voltou em receita
            "stock_value_remaining": float(stock_value_remaining),
            "potential_remaining_revenue": float(potential_remaining_revenue),
            "projected_profit_if_all_sold": float(projected_profit),  # estimativa, pelos preços atuais

            "sell_through_rate": round(sell_through_rate, 2),
            "depletion_rate": round(
                (items_depleted / len(entry.entry_items) * 100) if entry.entry_items else 0, 2
            ),
        }

    async def _add_entry_costs(self, entry: StockEntry, extra_costs, tenant_id: int) -> None:
        """
        Cria as despesas informadas junto com a entrada (antes do rateio, na mesma transação).
        Entrada de viagem: despesa da viagem (rateada entre as entradas dela). Outros tipos: despesa da entrada.
        """
        from app.models.expense import Expense

        for c in extra_costs or []:
            amount = Decimal(str(c["amount"]))
            description = str(c["description"]).strip()
            if amount <= 0 or not description:
                raise ValueError("Custo extra inválido: informe o que foi e um valor maior que zero")
            of_trip = entry.entry_type == EntryType.TRIP and entry.trip_id is not None
            self.db.add(Expense(
                amount=amount,
                description=description[:200],
                expense_date=entry.entry_date,
                tenant_id=tenant_id,
                trip_id=entry.trip_id if of_trip else None,
                stock_entry_id=None if of_trip else entry.id,
            ))
        await self.db.flush()

    async def get_entry_costs(self, entry_id: int, *, tenant_id: int) -> Dict[str, Any]:
        """Detalhamento dos custos do lote (o que explica a diferença entre custo da mercadoria e custo posto)."""
        from sqlalchemy import select
        from app.models.expense import Expense

        entry = await self.entry_repo.get_by_id(self.db, entry_id, include_items=True, tenant_id=tenant_id)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")

        merchandise = sum(
            (i.total_cost for i in entry.entry_items if i.is_active), Decimal('0.00')
        )
        extra_total = sum(
            (Decimal(str(i.quantity_received)) * Decimal(str(i.extra_unit_cost or 0))
             for i in entry.entry_items if i.is_active),
            Decimal('0.00'),
        )
        rows = (await self.db.execute(
            select(Expense).where(
                Expense.stock_entry_id == entry.id, Expense.is_active == True, Expense.tenant_id == tenant_id  # noqa: E712
            ).order_by(Expense.expense_date, Expense.id)
        )).scalars().all()
        own = sum((e.amount for e in rows), Decimal('0.00'))

        trip_info = None
        trip_share = Decimal('0.00')
        if entry.trip_id and entry.trip:
            trip = entry.trip
            pool = await lot_cost_service.trip_cost_pool(self.db, trip)
            trip_share = max(extra_total - own, Decimal('0.00'))
            trip_rows = (await self.db.execute(
                select(Expense).where(
                    Expense.trip_id == trip.id, Expense.is_active == True, Expense.tenant_id == tenant_id  # noqa: E712
                ).order_by(Expense.expense_date, Expense.id)
            )).scalars().all()
            trip_info = {
                "trip_id": trip.id,
                "trip_code": trip.trip_code,
                "travel_costs": {
                    "fuel": float(trip.travel_cost_fuel or 0), "food": float(trip.travel_cost_food or 0),
                    "toll": float(trip.travel_cost_toll or 0), "hotel": float(trip.travel_cost_hotel or 0),
                    "other": float(trip.travel_cost_other or 0), "total": float(trip.travel_cost_total or 0),
                },
                "trip_expenses": [
                    {"id": e.id, "description": e.description, "amount": float(e.amount), "date": e.expense_date}
                    for e in trip_rows
                ],
                "trip_total_cost": float(pool),
                "share_of_this_lot": float(trip_share),
            }

        return {
            "entry_id": entry.id,
            "entry_code": entry.entry_code,
            "merchandise_cost": float(merchandise),
            "trip": trip_info,
            "lot_expenses": [
                {"id": e.id, "description": e.description, "amount": float(e.amount), "date": e.expense_date}
                for e in rows
            ],
            "lot_expenses_total": float(own),
            "extra_costs_total": float(extra_total),
            "total_investment": float(merchandise + extra_total),
            "cost_increase_pct": float(extra_total / merchandise * 100) if merchandise > 0 else 0.0,
        }

    async def get_profit_ranking(self, *, skip: int, limit: int, tenant_id: int) -> List[Dict[str, Any]]:
        """Lotes com investimento, receita, lucro e margem, do maior lucro para o menor."""
        entries = await self.entry_repo.get_multi(
            self.db, skip=skip, limit=limit, tenant_id=tenant_id
        ) if hasattr(self.entry_repo, "get_multi") else []
        rows = []
        for e in entries:
            a = await self.get_entry_analytics(e.id, tenant_id=tenant_id)
            rows.append({
                k: a[k] for k in (
                    "entry_id", "entry_code", "entry_type", "entry_date", "supplier_name",
                    "total_investment", "extra_costs_total", "real_revenue", "cost_of_sold",
                    "gross_profit", "margin_pct", "roi", "recovered_pct", "sell_through_rate",
                    "projected_profit_if_all_sold",
                )
            })
        rows.sort(key=lambda r: r["gross_profit"], reverse=True)
        return rows

    async def _lot_sales_stats(self, entry: StockEntry, *, tenant_id: int) -> Dict[str, Any]:
        """
        Receita, custo (posto) e unidades vendidas A PARTIR DESTE LOTE, líquidas de devolução.
        Lê as fontes FIFO gravadas em cada item de venda (sale_sources) e nas devoluções (return_sources).
        Receita do item = subtotal - desconto do item, proporcional às unidades que saíram deste lote.
        """
        from sqlalchemy import select, or_
        from app.models.sale import Sale, SaleItem, SaleStatus
        from app.models.sale_return import ReturnItem

        variant_ids = {i.variant_id for i in entry.entry_items if i.is_active and i.variant_id}
        product_ids = {i.product_id for i in entry.entry_items if i.is_active and i.product_id}
        zero = Decimal('0.00')
        out = {"units": 0, "revenue": zero, "cost": zero}
        if not variant_ids and not product_ids:
            return out

        conds = []
        if variant_ids:
            conds.append(SaleItem.variant_id.in_(variant_ids))
        if product_ids:
            conds.append(SaleItem.product_id.in_(product_ids))
        stmt = (
            select(SaleItem)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(
                Sale.tenant_id == tenant_id,
                Sale.is_active == True,  # noqa: E712
                Sale.status.in_([SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED, SaleStatus.REFUNDED]),
                or_(*conds),
            )
        )
        sale_items = (await self.db.execute(stmt)).scalars().all()
        by_id = {}
        for si in sale_items:
            raw = si.sale_sources
            sources = raw.get("sources", []) if isinstance(raw, dict) else (raw or [])
            taken = [t for t in sources if t.get("entry_id") == entry.id]
            if not taken or not si.quantity:
                continue
            qty = sum(int(t["quantity_taken"]) for t in taken)
            net_item = Decimal(str(si.subtotal or 0)) - Decimal(str(si.discount_amount or 0))
            out["units"] += qty
            out["revenue"] += net_item * Decimal(qty) / Decimal(si.quantity)
            out["cost"] += sum(Decimal(str(t["quantity_taken"])) * Decimal(str(t["unit_cost"])) for t in taken)
            by_id[si.id] = si

        if by_id:
            rets = (await self.db.execute(
                select(ReturnItem).where(ReturnItem.sale_item_id.in_(list(by_id)))
            )).scalars().all()
            for r in rets:
                si = by_id.get(r.sale_item_id)
                if si is None or not r.quantity_returned:
                    continue
                raw = si.sale_sources
                sources = raw.get("sources", []) if isinstance(raw, dict) else (raw or [])
                # Mesma regra do return_service: a devolução volta às entradas de origem, na ordem das fontes
                remaining = r.quantity_returned
                qty_back = 0
                back_cost = Decimal('0.00')
                for src in sources:
                    if remaining <= 0:
                        break
                    take = min(int(src["quantity_taken"]), remaining)
                    if src.get("entry_id") == entry.id:
                        qty_back += take
                        back_cost += Decimal(take) * Decimal(str(src["unit_cost"]))
                    remaining -= take
                if qty_back:
                    out["units"] -= qty_back
                    out["revenue"] -= Decimal(str(r.refund_amount or 0)) * Decimal(qty_back) / Decimal(r.quantity_returned)
                    out["cost"] -= back_cost
        return out

    async def link_to_trip(
        self, 
        entry_id: int, 
        trip_id: int,
        *,
        tenant_id: int,
    ) -> StockEntry:
        """
        Vincula uma entrada a uma viagem.
        
        Args:
            entry_id: ID da entrada
            trip_id: ID da viagem
            tenant_id: ID do tenant
            
        Returns:
            StockEntry: Entrada atualizada
            
        Raises:
            ValueError: Se entrada ou viagem não encontradas
        """
        # Verificar entrada
        entry = await self.entry_repo.get_by_id(self.db, entry_id, tenant_id=tenant_id)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")
        
        # Verificar viagem
        trip = await self.trip_repo.get_by_id(self.db, trip_id, tenant_id=tenant_id)
        if not trip:
            raise ValueError(f"Trip {trip_id} não encontrada")
        
        # Atualizar entrada
        updated = await self.entry_repo.update(
            self.db, 
            entry_id, 
            {
                "trip_id": trip_id,
                "entry_type": EntryType.TRIP
            },
            tenant_id=tenant_id,
        )
        await lot_cost_service.recompute_trip(self.db, trip_id, tenant_id=tenant_id)
        await self.db.commit()
        
        return updated
    
    async def update_entry(
        self, 
        entry_id: int, 
        entry_data: StockEntryUpdate,
        *,
        tenant_id: int,
    ) -> StockEntry:
        """
        Atualiza uma entrada.
        
        Args:
            entry_id: ID da entrada
            entry_data: Dados para atualização
            tenant_id: ID do tenant
            
        Returns:
            StockEntry: Entrada atualizada
            
        Raises:
            ValueError: Se entrada não encontrada ou entry_code duplicado
        """
        entry = await self.entry_repo.get_by_id(self.db, entry_id, tenant_id=tenant_id)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")
        
        # Verificar entry_code único se está sendo alterado
        if entry_data.entry_code and entry_data.entry_code != entry.entry_code:
            existing = await self.entry_repo.get_by_code(self.db, entry_data.entry_code, tenant_id=tenant_id)
            if existing:
                raise ValueError(f"Entry code {entry_data.entry_code} já existe")
        
        # Validar trip_id se fornecido
        if entry_data.trip_id:
            trip = await self.trip_repo.get_by_id(self.db, entry_data.trip_id, tenant_id=tenant_id)
            if not trip:
                raise ValueError(f"Trip {entry_data.trip_id} não encontrada")
        
        # Atualizar
        old_trip_id = entry.trip_id
        entry_dict = entry_data.model_dump(exclude_unset=True)
        updated = await self.entry_repo.update(self.db, entry_id, entry_dict, tenant_id=tenant_id)

        # Mudou de viagem (ou saiu dela): refaz o rateio do lote e dos lotes da viagem antiga
        await lot_cost_service.recompute_entries(self.db, [entry_id], tenant_id=tenant_id)
        if old_trip_id and old_trip_id != getattr(updated, "trip_id", None):
            await lot_cost_service.recompute_trip(self.db, old_trip_id, tenant_id=tenant_id)
        await self.db.commit()
        
        return updated
    
    async def delete_entry(
        self,
        entry_id: int,
        *,
        tenant_id: int,
    ) -> dict:
        """
        Soft delete de uma entrada.

        ATENÇÃO:
        - Remove as quantidades do inventário
        - Exclui produtos órfãos (produtos que só existem nesta entrada)
        - NÃO permite exclusão de entradas que já tiveram vendas (rastreabilidade)

        Args:
            entry_id: ID da entrada
            tenant_id: ID do tenant

        Returns:
            dict: Informações sobre a exclusão (produtos excluídos, estoque removido)

        Raises:
            ValueError: Se a entrada não existe ou já teve vendas
        """
        from sqlalchemy import select, func
        from app.models.entry_item import EntryItem
        from app.models.product import Product

        entry = await self.entry_repo.get_by_id(self.db, entry_id, include_items=True, tenant_id=tenant_id)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")

        # VALIDAÇÃO CRÍTICA: Verificar se algum item teve vendas
        # Se quantity_sold > 0, a entrada é parte do histórico de vendas e não pode ser excluída
        items_with_sales = [
            item for item in entry.entry_items
            if item.is_active and item.quantity_sold > 0
        ]

        if items_with_sales:
            # Calcular total vendido para mensagem informativa
            total_sold = sum(item.quantity_sold for item in items_with_sales)
            products_sold = len(items_with_sales)

            raise ValueError(
                f"Não é possível excluir entrada com produtos já vendidos. "
                f"Esta entrada faz parte do histórico de vendas "
                f"({products_sold} produto(s) com {total_sold} unidade(s) vendida(s)). "
                f"A rastreabilidade e auditoria exigem que entradas com vendas sejam mantidas no sistema."
            )

        try:
            from app.models.product_variant import ProductVariant
            from app.models.inventory import Inventory

            orphan_products = []
            total_stock_removed = 0

            # Coletar product_ids afetados — suporta tanto product_id (legado)
            # quanto variant_id (novo sistema)
            affected_product_ids: set[int] = set()

            for item in entry.entry_items:
                if item.is_active:
                    total_stock_removed += item.quantity_remaining
                    # Resolver product_id via produto direto ou via variante
                    pid = item.product_id
                    if not pid and item.variant:
                        pid = item.variant.product_id
                    if pid:
                        affected_product_ids.add(pid)

            # Para cada produto afetado, verificar se é órfão
            # (sem outras entry_items ativas em outras entradas)
            products_to_delete: set[int] = set()

            for product_id in affected_product_ids:
                # Verificar via product_id (legado)
                count_via_product = (await self.db.execute(
                    select(func.count(EntryItem.id)).where(
                        EntryItem.product_id == product_id,
                        EntryItem.entry_id != entry_id,
                        EntryItem.is_active == True,
                        EntryItem.tenant_id == tenant_id,
                    )
                )).scalar() or 0

                # Verificar via variant_id (novo sistema)
                count_via_variant = (await self.db.execute(
                    select(func.count(EntryItem.id))
                    .join(ProductVariant, EntryItem.variant_id == ProductVariant.id)
                    .where(
                        ProductVariant.product_id == product_id,
                        EntryItem.entry_id != entry_id,
                        EntryItem.is_active == True,
                        EntryItem.tenant_id == tenant_id,
                    )
                )).scalar() or 0

                if count_via_product == 0 and count_via_variant == 0:
                    products_to_delete.add(product_id)

            # Liberar entry_code para reutilização e suprimir vínculo com tenant.
            # O commit interno do entry_repo.delete persiste essas mudanças junto.
            original_entry_code = entry.entry_code
            entry.entry_code = f"{entry.entry_code}_del_{entry_id}"
            entry.tenant_id = None

            # Soft delete da entrada (cascata para itens via is_active=False)
            _deleted_trip_id = entry.trip_id
            success = await self.entry_repo.delete(self.db, entry_id, tenant_id=tenant_id)

            # Flush para que o soft delete seja visível antes do rebuild
            await self.db.flush()

            # Suprimir tenant_id dos entry_items (vínculo com tenant)
            from sqlalchemy import update as sa_update
            await self.db.execute(
                sa_update(EntryItem)
                .where(EntryItem.entry_id == entry_id)
                .values(tenant_id=None)
            )

            # Excluir produtos órfãos varia conforme a origem:
            # - is_catalog=True  → ainda era template no catálogo: retornar ao pool global
            # - is_catalog=False → produto estava ativo: desativar + limpar SKU completamente
            for product_id in products_to_delete:
                product_result = await self.db.execute(
                    select(Product).where(
                        Product.id == product_id,
                        Product.tenant_id == tenant_id,
                    )
                )
                product = product_result.scalar_one_or_none()
                if not product:
                    continue

                # Buscar todas as variantes (ativas e inativas)
                variants_result = await self.db.execute(
                    select(ProductVariant).where(
                        ProductVariant.product_id == product_id,
                    )
                )
                product_variants = variants_result.scalars().all()

                # Zerar inventário e suprimir vínculo com tenant.
                # Busca por product_id (legado) E por variant_id (novo sistema).
                inv_via_product = (await self.db.execute(
                    select(Inventory).where(
                        Inventory.product_id == product_id,
                        Inventory.tenant_id == tenant_id,
                    )
                )).scalars().all()

                inv_via_variant = (await self.db.execute(
                    select(Inventory)
                    .join(ProductVariant, Inventory.variant_id == ProductVariant.id)
                    .where(
                        ProductVariant.product_id == product_id,
                        Inventory.tenant_id == tenant_id,
                    )
                )).scalars().all()

                for inv in list(inv_via_product) + list(inv_via_variant):
                    inv.quantity = 0
                    inv.tenant_id = None

                if product.is_catalog:
                    # Produto ainda no estado de catálogo (entrada foi deletada antes de ativá-lo):
                    # retornar ao pool global — remover vínculo com tenant.
                    # SKU preservado (NOT NULL) mas renomeado com sufixo para liberar o valor original.
                    product.tenant_id = None
                    for variant in product_variants:
                        # Renomear SKU com sufixo _del_{id} para liberar o valor original sem violar NOT NULL
                        if variant.sku and not variant.sku.endswith(f'_del_{variant.id}'):
                            variant.sku = f'{variant.sku}_del_{variant.id}'
                        variant.tenant_id = None
                    orphan_products.append({
                        'id': product.id,
                        'name': product.name,
                        'action': 'returned_to_catalog',
                    })
                else:
                    # Produto ativo (is_catalog=False): desativar completamente.
                    # SKU renomeado com sufixo _del_{id} para liberar o valor original sem violar NOT NULL.
                    product.is_active = False
                    product.tenant_id = None
                    for variant in product_variants:
                        variant.is_active = False
                        if variant.sku and not variant.sku.endswith(f'_del_{variant.id}'):
                            variant.sku = f'{variant.sku}_del_{variant.id}'
                        variant.tenant_id = None
                    orphan_products.append({
                        'id': product.id,
                        'name': product.name,
                        'action': 'deactivated',
                    })

            # Rebuild FIFO para produtos não-órfãos (têm outras entradas ativas)
            non_orphan_ids = affected_product_ids - products_to_delete
            inv_sync = InventoryService(self.db)
            for pid in non_orphan_ids:
                try:
                    delta = await inv_sync.rebuild_product_from_fifo(pid, tenant_id=tenant_id)
                    print(
                        f"  [Inventory Sync DELETE_ENTRY] Produto {pid}: "
                        f"fifo={delta['fifo_sum']} inv={delta['inventory_quantity']} "
                        f"updated={delta['updated']}"
                    )
                except Exception as sync_err:
                    print(f"  [Inventory Sync DELETE_ENTRY] Falha sync produto {pid}: {sync_err}")

            if _deleted_trip_id:
                await lot_cost_service.recompute_trip(self.db, _deleted_trip_id, tenant_id=tenant_id)
            await self.db.commit()

            return {
                'success': success,
                'orphan_products_deleted': len(orphan_products),
                'orphan_products': orphan_products,
                'total_stock_removed': total_stock_removed,
                'entry_code': original_entry_code,
            }

        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def get_entries_filtered(
        self,
        entry_type: Optional[EntryType] = None,
        trip_id: Optional[int] = None,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None,
        skip: int = 0,
        limit: int = 100,
        *,
        tenant_id: int | None = None,
    ) -> List[StockEntry]:
        """
        Lista entradas com filtros.
        
        Args:
            entry_type: Filtrar por tipo
            trip_id: Filtrar por viagem
            start_date: Data inicial
            end_date: Data final
            skip: Registros para pular
            limit: Limite de registros
            tenant_id: ID do tenant
            
        Returns:
            Lista de entradas filtradas
        """
        return await self.entry_repo.get_filtered(
            self.db,
            entry_type=entry_type,
            trip_id=trip_id,
            start_date=start_date,
            end_date=end_date,
            skip=skip,
            limit=limit,
            tenant_id=tenant_id,
        )
    
    async def get_slow_moving_products(
        self,
        threshold: float = 30.0,
        skip: int = 0,
        limit: int = 50,
        *,
        tenant_id: int | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Retorna produtos com venda lenta.
        
        Args:
            threshold: Limite de depleção (%) para considerar lento
            skip: Registros para pular
            limit: Limite de registros
            tenant_id: ID do tenant
            
        Returns:
            Lista de entry_items com venda lenta
        """
        items = await self.item_repo.get_slow_moving(
            self.db,
            threshold=threshold,
            skip=skip,
            limit=limit,
            tenant_id=tenant_id,
        )
        
        result = []
        for item in items:
            entry = await self.entry_repo.get_by_id(self.db, item.entry_id, tenant_id=tenant_id)  # ← Campo correto
            product = await self.product_repo.get(self.db, item.product_id, tenant_id=tenant_id)
            
            if entry and product:
                depletion_rate = ((item.quantity_received - item.quantity_remaining) / 
                                item.quantity_received * 100) if item.quantity_received > 0 else 0
                
                days_in_stock = (today_brazil() - entry.entry_date).days
                
                result.append({
                    "entry_item_id": item.id,
                    "entry_code": entry.entry_code,
                    "product_id": product.id,
                    "product_name": product.name,
                    "product_sku": product.sku,
                    "quantity_received": item.quantity_received,
                    "quantity_remaining": item.quantity_remaining,
                    "quantity_sold": item.quantity_received - item.quantity_remaining,
                    "depletion_rate": round(depletion_rate, 2),
                    "days_in_stock": days_in_stock,
                    "unit_cost": float(item.unit_cost)
                })
        
        return result
    
    async def get_best_performing_entries(
        self,
        skip: int = 0,
        limit: int = 20,
        *,
        tenant_id: int | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Retorna entradas com melhor performance.

        Args:
            skip: Registros para pular
            limit: Limite de registros
            tenant_id: ID do tenant

        Returns:
            Lista de entradas ordenadas por performance
        """
        entries = await self.entry_repo.get_multi(self.db, skip=skip, limit=limit * 3, tenant_id=tenant_id)  # Buscar mais para filtrar

        performance_list = []

        for entry in entries:
            # Buscar itens da entrada
            items = await self.item_repo.get_by_entry(self.db, entry.id, tenant_id)

            if not items:
                continue

            total_received = sum(item.quantity_received for item in items)
            total_remaining = sum(item.quantity_remaining for item in items)
            total_sold = total_received - total_remaining

            sell_through_rate = (total_sold / total_received * 100) if total_received > 0 else 0

            # Calcular ROI simplificado (sell_through como proxy de performance)
            # ROI real requer dados de venda que não temos aqui
            roi = sell_through_rate - 100  # Se vendeu 100%, ROI = 0; se vendeu 150%, ROI = 50

            performance_list.append({
                "entry_id": entry.id,
                "entry_code": entry.entry_code,
                "entry_date": entry.entry_date.isoformat() if entry.entry_date else None,
                "entry_type": entry.entry_type.value if entry.entry_type else None,
                "supplier_name": entry.supplier_name,
                "total_cost": float(entry.total_cost),
                "total_items": len(items),
                "sell_through_rate": round(sell_through_rate, 2),
                "total_quantity_sold": total_sold,
                "roi": round(roi, 2),
                "performance_score": round(sell_through_rate, 2)
            })

        # Ordenar por performance_score (depletion_rate)
        performance_list.sort(key=lambda x: x["performance_score"], reverse=True)

        # Aplicar paginação
        return performance_list[skip:skip+limit]

    async def update_entry_item(
        self,
        item_id: int,
        item_data: Dict[str, Any],
        *,
        tenant_id: int,
    ) -> EntryItem:
        """
        Atualiza um item de entrada com recálculo automático de inventário.

        VALIDAÇÕES:
        - Bloqueia edição se o item já teve vendas (quantity_sold > 0)
        - Garante que quantity_remaining <= quantity_received
        - Recalcula inventário automaticamente quando quantidade muda
        - Recalcula total_cost da entrada quando custo/quantidade mudam

        Args:
            item_id: ID do item a atualizar
            item_data: Dados para atualização (quantity_received, unit_cost, etc.)
            tenant_id: ID do tenant

        Returns:
            EntryItem atualizado

        Raises:
            ValueError: Se item não encontrado, tem vendas, ou dados inválidos
        """
        from app.schemas.entry_item import EntryItemUpdate

        # Buscar item com relações
        item = await self.item_repo.get_by_id(self.db, item_id, include_relations=True)
        if not item:
            raise ValueError(f"EntryItem {item_id} não encontrado")

        # Validar tenant (segurança multi-tenancy)
        if item.tenant_id != tenant_id:
            raise ValueError(f"EntryItem {item_id} não pertence a este tenant")

        # VALIDAÇÃO CRÍTICA: Bloquear edição se item já teve vendas
        if item.quantity_sold > 0:
            raise ValueError(
                f"Não é possível editar item que já teve vendas. "
                f"Este item já vendeu {item.quantity_sold} unidade(s). "
                f"A rastreabilidade FIFO exige que itens com vendas não sejam modificados."
            )

        # Guardar valores antigos para calcular delta
        old_quantity_received = item.quantity_received
        old_quantity_remaining = item.quantity_remaining
        old_unit_cost = item.unit_cost

        # Preparar update data
        update_data = {}

        # Atualizar quantity_received se fornecido
        if 'quantity_received' in item_data and item_data['quantity_received'] is not None:
            new_qty_received = item_data['quantity_received']
            if new_qty_received <= 0:
                raise ValueError("quantity_received deve ser maior que zero")

            # Se quantity_received mudou, ajustar quantity_remaining proporcionalmente
            # Mas apenas se o item ainda não foi vendido (já validamos acima)
            if new_qty_received != old_quantity_received:
                # Como não teve vendas, quantity_remaining = quantity_received
                update_data['quantity_received'] = new_qty_received
                update_data['quantity_remaining'] = new_qty_received

        # Atualizar unit_cost se fornecido
        if 'unit_cost' in item_data and item_data['unit_cost'] is not None:
            new_unit_cost = item_data['unit_cost']
            if new_unit_cost < 0:
                raise ValueError("unit_cost não pode ser negativo")
            update_data['unit_cost'] = new_unit_cost

            # Atualizar cost_price da variante usando ORM (suporta variant_id e product_id)
            from sqlalchemy import select as _select
            from app.models.product_variant import ProductVariant
            if item.variant_id:
                _stmt = _select(ProductVariant).where(
                    ProductVariant.id == item.variant_id,
                    ProductVariant.is_active == True,
                )
            elif item.product_id:
                _stmt = _select(ProductVariant).where(
                    ProductVariant.product_id == item.product_id,
                    ProductVariant.is_active == True,
                ).order_by(ProductVariant.id).limit(1)
            else:
                _stmt = None
            if _stmt is not None:
                _result = await self.db.execute(_stmt)
                _variant = _result.scalar_one_or_none()
                if _variant:
                    _variant.cost_price = Decimal(str(new_unit_cost))
                    await self.db.flush()

        # Atualizar notes se fornecido
        if 'notes' in item_data and item_data['notes'] is not None:
            update_data['notes'] = item_data['notes']

        # Atualizar sell_price do produto se fornecido
        sell_price_updated = False
        if 'sell_price' in item_data and item_data['sell_price'] is not None:
            new_sell_price = item_data['sell_price']
            if new_sell_price < 0:
                raise ValueError("sell_price não pode ser negativo")

            # Atualizar price da variante e base_price do produto usando ORM puro
            from sqlalchemy import select as _select
            from app.models.product_variant import ProductVariant
            _sell_variant = None
            if item.variant_id:
                _vstmt = _select(ProductVariant).where(
                    ProductVariant.id == item.variant_id,
                    ProductVariant.is_active == True,
                )
                _vr = await self.db.execute(_vstmt)
                _sell_variant = _vr.scalar_one_or_none()
            elif item.product_id:
                _vstmt = _select(ProductVariant).where(
                    ProductVariant.product_id == item.product_id,
                    ProductVariant.is_active == True,
                ).order_by(ProductVariant.id).limit(1)
                _vr = await self.db.execute(_vstmt)
                _sell_variant = _vr.scalar_one_or_none()
            if _sell_variant:
                _sell_variant.price = Decimal(str(new_sell_price))
                sell_price_updated = True
                await self.db.flush()
            # Atualizar base_price do produto pai também (campo de referência)
            if item.product_id:
                _product = await self.product_repo.get(self.db, item.product_id, tenant_id=tenant_id)
                if _product:
                    _product.base_price = Decimal(str(new_sell_price))
                    sell_price_updated = True
                    await self.db.flush()

        # Se não há nada para atualizar, commit se sell_price mudou e retornar
        if not update_data:
            if sell_price_updated:
                await self.db.commit()
            from sqlalchemy import select as _sel
            from sqlalchemy.orm import selectinload as _sil
            from app.models.product_variant import ProductVariant as _PV
            _stmt = (
                _sel(EntryItem)
                .where(EntryItem.id == item.id)
                .options(
                    _sil(EntryItem.product),
                    _sil(EntryItem.variant).selectinload(_PV.product),
                )
            )
            _result = await self.db.execute(_stmt)
            _refreshed = _result.scalar_one_or_none()
            return _refreshed if _refreshed is not None else item

        # Atualizar o item (sem commit ainda)
        for key, value in update_data.items():
            setattr(item, key, value)

        await self.db.flush()  # Flush sem commit para refletir mudanças na sessão

        # Calcular delta de inventário
        new_quantity = update_data.get('quantity_remaining', old_quantity_remaining)
        inventory_delta = new_quantity - old_quantity_remaining

        # Se quantidade mudou, recalcular inventário do produto
        if inventory_delta != 0:
            # Usar InventoryService para garantir consistência FIFO
            inv_service = InventoryService(self.db)
            await inv_service.rebuild_product_from_fifo(item.product_id, tenant_id=tenant_id)

            print(
                f"  [EntryItem Update] Produto {item.product_id}: "
                f"delta inventário = {inventory_delta:+d} "
                f"(de {old_quantity_remaining} para {new_quantity})"
            )

        # Se custo ou quantidade mudaram, recalcular total_cost da entrada
        if 'unit_cost' in update_data or 'quantity_received' in update_data:
            # Recalcular total_cost da entrada inteira
            entry = await self.entry_repo.get_by_id(self.db, item.entry_id, include_items=True, tenant_id=tenant_id)
            if entry:
                new_total_cost = Decimal('0.00')
                for entry_item in entry.entry_items:
                    if entry_item.is_active:
                        new_total_cost += entry_item.quantity_received * entry_item.unit_cost

                entry.total_cost = new_total_cost
                await self.db.flush()

                print(
                    f"  [EntryItem Update] Entrada {entry.entry_code}: "
                    f"total_cost recalculado = R$ {new_total_cost:.2f}"
                )

        # Quantidade/custo mudou: o rateio do lote muda junto
        await lot_cost_service.recompute_entries(self.db, [item.entry_id], tenant_id=tenant_id)

        # Commit final
        await self.db.commit()

        # Re-buscar item com todas as relações carregadas (variant + product)
        # necessário para serialização do EntryItemResponse pelo FastAPI
        from sqlalchemy import select as _sel
        from sqlalchemy.orm import selectinload as _sil
        from app.models.product_variant import ProductVariant as _PV
        _stmt = (
            _sel(EntryItem)
            .where(EntryItem.id == item.id)
            .options(
                _sil(EntryItem.product),
                _sil(EntryItem.variant).selectinload(_PV.product),
            )
        )
        _result = await self.db.execute(_stmt)
        _refreshed = _result.scalar_one_or_none()
        return _refreshed if _refreshed is not None else item

    async def add_variant_to_entry(self, entry_id: int, data: Dict[str, Any], *, tenant_id: int) -> Dict[str, Any]:
        """
        Lança numa entrada JÁ EXISTENTE uma peça de OUTRA variação (cor/tamanho) de um produto já cadastrado.
        Se a variação ainda não existe, ela é criada (SKU gerado e sem repetir); se já existe, só entra na entrada.
        Tudo numa transação: falhou em qualquer passo, nada fica gravado.
        """
        import re
        import unicodedata
        from decimal import Decimal
        from sqlalchemy import select
        from app.models.product_variant import ProductVariant
        from app.utils.variant_grid import normalize_color, normalize_size

        await self._lock_catalog(tenant_id)
        try:
            entry = await self.entry_repo.get_by_id(self.db, entry_id, tenant_id=tenant_id)
            if not entry:
                raise ValueError(f"Entrada {entry_id} não encontrada")
            product_id = data.get("product_id")
            product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id) if product_id else None
            if not product:
                raise ValueError(f"Produto {product_id} não encontrado")

            color = normalize_color(data.get("color")) or None
            size = normalize_size(data.get("size")) or None
            if not color and not size:
                raise ValueError("Informe a cor ou o tamanho da nova variação")
            quantity = int(data.get("quantity") or 0)
            if quantity <= 0:
                raise ValueError("A quantidade deve ser maior que zero")
            cost = Decimal(str(data.get("cost_price") if data.get("cost_price") is not None else -1))
            self._require_cost(cost, f"{product.name} ({color or ''} {size or ''})".strip(), entry.entry_type)

            siblings = (await self.db.execute(
                select(ProductVariant).where(
                    ProductVariant.product_id == product.id, ProductVariant.tenant_id == tenant_id
                ).order_by(ProductVariant.id)
            )).scalars().all()
            existing = next((v for v in siblings if (v.color or None) == color and (v.size or None) == size), None)

            created = False
            if existing is not None:
                variant = existing
                if not variant.is_active:
                    variant.is_active = True
                    created = True
            else:
                active = [v for v in siblings if v.is_active]
                price = data.get("price")
                if price is None:
                    price = (active[0].price if active else None) or product.base_price
                if price is None or Decimal(str(price)) <= 0:
                    raise ValueError("Informe o preço de venda da nova variação")
                sku = (data.get("sku") or "").strip().upper() or None
                if not sku:
                    ref = next((v.sku for v in active if v.sku), None)
                    base_sku = ref.split("-")[0] if ref else f"P{product.id}"

                    def part(text_):
                        t = unicodedata.normalize("NFD", text_ or "")
                        return re.sub(r"[^A-Za-z0-9]", "", re.sub(r"[\u0300-\u036f]", "", t)).upper()[:3]

                    sku = "-".join(x for x in (base_sku, part(color), part(size), "001") if x)
                sku = (await self._resolve_free_skus([sku], tenant_id))[0]
                variant = ProductVariant(
                    product_id=product.id, sku=sku, color=color, size=size, price=Decimal(str(price)),
                    cost_price=cost, tenant_id=tenant_id, is_active=True,
                )
                self.db.add(variant)
                created = True
            await self.db.flush()

            item = await self.add_item_to_entry(
                entry_id,
                {
                    "product_id": product.id, "variant_id": variant.id, "quantity_received": quantity,
                    "unit_cost": cost, "notes": f"Variação adicionada à entrada: {color or ''} {size or ''}".strip(),
                },
                tenant_id=tenant_id,
            )
            return {
                "item_id": item.id, "entry_id": entry_id, "product_id": product.id, "variant_id": variant.id,
                "sku": variant.sku, "color": variant.color, "size": variant.size,
                "quantity_received": quantity, "variant_created": created,
            }
        except Exception:
            await self.db.rollback()
            raise

    async def add_item_to_entry(
        self,
        entry_id: int,
        item_data: Dict[str, Any],
        *,
        tenant_id: int,
    ) -> EntryItem:
        """
        Adiciona um novo item a uma entrada de estoque existente.

        Este método permite vincular um produto do catálogo a uma entrada existente,
        criando o rastreamento FIFO necessário e atualizando o inventário.

        Args:
            entry_id: ID da entrada existente
            item_data: Dados do item (product_id, quantity_received, unit_cost, selling_price, notes)
            tenant_id: ID do tenant

        Returns:
            EntryItem criado

        Raises:
            ValueError: Se entrada não encontrada, produto não encontrado, ou dados inválidos
        """
        from decimal import Decimal

        # Buscar entrada
        entry = await self.entry_repo.get_by_id(self.db, entry_id, tenant_id=tenant_id)
        if not entry:
            raise ValueError(f"Entrada {entry_id} não encontrada")

        # Validar produto
        product_id = item_data.get('product_id')
        if not product_id:
            raise ValueError("product_id é obrigatório")

        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")

        # Validar quantidade
        quantity_received = item_data.get('quantity_received', 1)
        if quantity_received <= 0:
            raise ValueError("quantity_received deve ser maior que zero")

        # Validar custo
        unit_cost = item_data.get('unit_cost', 0)
        if unit_cost < 0:
            raise ValueError("unit_cost não pode ser negativo")
        # Custo obrigatório (zero só em doação): sem ele o lucro FIFO fica incorreto
        self._require_cost(unit_cost, product.name, entry.entry_type)

        # Se produto é de catálogo, marcar como adicionado à loja
        if product.is_catalog:
            product.is_catalog = False

        # Variação do item: a informada (validada) ou a única ativa do produto.
        # Produto com várias variações exige dizer qual (senão o estoque iria para a primeira).
        from app.models.product_variant import ProductVariant
        from sqlalchemy import select as _select
        requested_variant_id = item_data.get('variant_id')
        if requested_variant_id:
            default_variant = await self._validate_variant_of_product(requested_variant_id, product_id, tenant_id)
        else:
            active_variants = (await self.db.execute(
                _select(ProductVariant).where(
                    ProductVariant.product_id == product_id,
                    ProductVariant.tenant_id == tenant_id,
                    ProductVariant.is_active == True,
                )
            )).scalars().all()
            if len(active_variants) > 1:
                raise ValueError(
                    f"O produto {product_id} tem {len(active_variants)} variações: informe a variação (variant_id)."
                )
            default_variant = active_variants[0] if active_variants else None

        # Criar item da entrada
        new_item = EntryItem(
            entry_id=entry_id,
            product_id=product_id,
            variant_id=default_variant.id if default_variant else None,
            quantity_received=quantity_received,
            quantity_remaining=quantity_received,  # Novo, então todo estoque está disponível
            unit_cost=Decimal(str(unit_cost)),
            notes=item_data.get('notes', ''),
            tenant_id=tenant_id,
            is_active=True,
        )

        self.db.add(new_item)
        await self.db.flush()

        # Atualizar produto com preço se fornecido
        selling_price = item_data.get('selling_price')
        if selling_price is not None and selling_price > 0:
            product.base_price = selling_price

        # Atualizar total_cost da entrada
        item_total_cost = Decimal(str(quantity_received)) * Decimal(str(unit_cost))
        entry.total_cost = (entry.total_cost or Decimal('0')) + item_total_cost

        # Rebuild inventário via FIFO (fonte da verdade = entry_items)
        # Garante que Inventory.quantity == soma de quantity_remaining dos EntryItems ativos
        inv_sync = InventoryService(self.db)
        try:
            delta = await inv_sync.rebuild_product_from_fifo(product_id, tenant_id=tenant_id)
            print(
                f"  [Inventory Sync ADD_ITEM] Produto {product_id}: "
                f"fifo={delta['fifo_sum']} inv={delta['inventory_quantity']} "
                f"created={delta['created']} updated={delta['updated']}"
            )
        except Exception as sync_err:
            print(f"  [Inventory Sync ADD_ITEM] Falha sync produto {product_id}: {sync_err}")

        await self.db.flush()
        await lot_cost_service.recompute_entries(self.db, [entry_id], tenant_id=tenant_id)

        # Commit
        await self.db.commit()
        await self.db.refresh(new_item)

        return new_item
    
    async def create_entry_with_new_product(
        self,
        product_data: Dict[str, Any],
        entry_data: Dict[str, Any],
        quantity: int,
        user_id: int,
        *,
        tenant_id: int,
    ) -> StockEntry:
        """
        Cria um NOVO produto (com 1 variante padrão) e uma entrada de estoque em transação atômica.
        
        Garante atomicidade: se qualquer operação falhar, nada é criado.
        
        Args:
            product_data: Dados do novo produto (name, sku, price, etc.)
            entry_data: Dados da entrada (entry_code, supplier_name, etc.)
            quantity: Quantidade do produto na entrada
            user_id: ID do usuário criando
            tenant_id: ID do tenant
            
        Returns:
            StockEntry: Entrada criada com o novo produto vinculado
            
        Raises:
            ValueError: Se dados inválidos, SKU duplicado, etc.
        """
        from decimal import Decimal
        from app.schemas.stock_entry import StockEntryCreate
        from app.models.product_variant import ProductVariant
        
        try:
            # 1. Criar o novo produto (pai)
            from app.repositories.product_repository import ProductRepository
            
            product_repo = ProductRepository(self.db)
            
            # Validar dados do produto
            if not product_data.get('name') or not product_data.get('sku'):
                raise ValueError("Nome e SKU do produto são obrigatórios")
            
            product_data['sku'] = (await self._resolve_free_skus([product_data['sku']], tenant_id))[0]

            # Fornecedor da entrada (cadastro): achado pelo id/nome ou criado
            default_supplier = await self._resolve_supplier(
                entry_data.get('supplier_id'), entry_data.get('supplier_name'),
                entry_data.get('supplier_cnpj'), entry_data.get('supplier_contact'), tenant_id,
            )
            if default_supplier is None:
                raise ValueError("Informe o fornecedor da entrada")
            # Valida o custo ANTES de criar produto/entrada: se falhar, nada fica gravado pela metade
            self._require_cost(
                product_data.get('cost_price'),
                f"{product_data['name'].strip()} (SKU {product_data['sku'].strip().upper()})",
                entry_data.get('entry_type'),
            )

            # Criar produto pai com is_catalog=False (produto com estoque)
            # Nota: sku, barcode, price, cost_price foram movidos para ProductVariant
            product_dict = {
                'name': product_data['name'].strip(),
                'description': product_data.get('description'),
                'brand': product_data.get('brand'),
                'gender': product_data.get('gender'),
                'material': product_data.get('material'),
                'category_id': product_data.get('category_id'),
                'base_price': Decimal(str(product_data['price'])),
                'is_catalog': False,  # Produto já tem entrada, não é catálogo
                'is_active': True,
            }
            
            # Criar produto pai
            product = await product_repo.create(product_dict, tenant_id=tenant_id)
            await self.db.flush()
            
            # 2. Criar variante padrão (produto simples = 1 variante)
            variant = ProductVariant(
                product_id=product.id,
                sku=product_data['sku'].strip().upper(),
                color=product_data.get('color'),
                size=product_data.get('size'),
                price=Decimal(str(product_data['price'])),
                cost_price=Decimal(str(product_data['cost_price'])) if product_data.get('cost_price') is not None else None,
                is_active=True,
                tenant_id=tenant_id,
            )
            self.db.add(variant)
            await self.db.flush()
            
            # 3. Criar entrada de estoque
            unique_code = await self._generate_unique_entry_code(entry_data['entry_code'], tenant_id=tenant_id)
            entry_dict = StockEntryCreate(
                entry_code=unique_code,
                entry_date=entry_data.get('entry_date'),
                entry_type=entry_data.get('entry_type'),
                trip_id=entry_data.get('trip_id'),
                supplier_id=default_supplier.id,
                supplier_name=default_supplier.name,
                supplier_cnpj=entry_data.get('supplier_cnpj'),
                supplier_contact=entry_data.get('supplier_contact'),
                invoice_number=entry_data.get('invoice_number'),
                payment_method=entry_data.get('payment_method'),
                notes=entry_data.get('notes'),
            )
            
            entry_dict_dict = entry_dict.model_dump(exclude_unset=True)
            entry_dict_dict['total_cost'] = Decimal('0.00')
            
            entry = await self.entry_repo.create(self.db, entry_dict_dict, tenant_id=tenant_id)
            await self.db.flush()
            
            # 4. Criar item da entrada (vinculado à variante)
            unit_cost = self._require_cost(
                product_data.get('cost_price'),
                f"{product_data['name'].strip()} (SKU {product_data['sku'].strip().upper()})",
                entry_data.get('entry_type'),
            )
            item = EntryItem(
                entry_id=entry.id,
                product_id=product.id,
                variant_id=variant.id,  # Vincular à variante
                supplier_id=default_supplier.id,
                quantity_received=quantity,
                quantity_remaining=quantity,  # Todo estoque disponível
                unit_cost=unit_cost,
                notes=entry_data.get('notes', ''),
                tenant_id=tenant_id,
                is_active=True,
            )
            
            self.db.add(item)
            await self.db.flush()
            await self._link_supplier_product(
                default_supplier.id, product.id, unit_cost, entry.entry_date, tenant_id
            )
            
            # 5. Calcular e atualizar total_cost da entrada
            item_total_cost = Decimal(str(quantity)) * unit_cost
            entry.total_cost = item_total_cost
            
            # 6. Atualizar estoque do produto via rebuild FIFO
            inv_sync = InventoryService(self.db)
            try:
                delta = await inv_sync.rebuild_product_from_fifo(product.id, tenant_id=tenant_id)
                print(f"  [Inventory Sync NEW_PRODUCT] Produto {product.id}: fifo={delta['fifo_sum']} inv={delta['inventory_quantity']} created={delta['created']} updated={delta['updated']}")
            except Exception as sync_err:
                print(f"  [Inventory Sync NEW_PRODUCT] Falha sync produto {product.id}: {sync_err}")
            
            await self.db.flush()
            await self._add_entry_costs(entry, entry_data.get('extra_costs'), tenant_id)
            await lot_cost_service.recompute_entries(self.db, [entry.id], tenant_id=tenant_id)

            # 7. Commit de tudo (transação atômica)
            await self.db.commit()
            await self.db.refresh(entry)
            
            # Recarregar com itens
            entry = await self.entry_repo.get_by_id(self.db, entry.id, include_items=True, tenant_id=tenant_id)
            
            return entry
            
        except Exception as e:
            await self.db.rollback()
            raise e

    async def create_entry_with_new_product_variants(
        self,
        product_data: Dict[str, Any],
        variants_data: List[Dict[str, Any]],
        entry_data: Dict[str, Any],
        user_id: int,
        *,
        tenant_id: int,
    ) -> StockEntry:
        """
        Cria um NOVO produto com variantes e uma entrada de estoque em transação atômica.
        
        Garante atomicidade: se qualquer operação falhar, nada é criado.
        
        Args:
            product_data: Dados do novo produto (name, description, brand, category_id, base_price)
            variants_data: Lista de variantes com sku, color, size, price, cost_price, quantity
            entry_data: Dados da entrada (entry_code, supplier_name, etc.)
            user_id: ID do usuário criando
            tenant_id: ID do tenant
            
        Returns:
            StockEntry: Entrada criada com as variantes do novo produto vinculadas
            
        Raises:
            ValueError: Se dados inválidos, etc.
        """
        from decimal import Decimal
        from app.schemas.stock_entry import StockEntryCreate
        from app.models.product_variant import ProductVariant
        
        try:
            # 1. Criar o novo produto (pai)
            from app.repositories.product_repository import ProductRepository
            
            product_repo = ProductRepository(self.db)
            
            # Validar dados do produto
            if not product_data.get('name') or not product_data.get('category_id'):
                raise ValueError("Nome e categoria do produto são obrigatórios")
            
            for _v, _sku in zip(variants_data, await self._resolve_free_skus([v.get('sku') for v in variants_data], tenant_id)):
                _v['sku'] = _sku

            # Fornecedor da entrada (cadastro): achado pelo id/nome ou criado
            default_supplier = await self._resolve_supplier(
                entry_data.get('supplier_id'), entry_data.get('supplier_name'),
                entry_data.get('supplier_cnpj'), entry_data.get('supplier_contact'), tenant_id,
            )
            if default_supplier is None:
                raise ValueError("Informe o fornecedor da entrada")
            # Valida o custo de toda variante com quantidade ANTES de criar produto/variantes/entrada:
            # se falhar, nada fica gravado pela metade (e o usuário pode corrigir e reenviar).
            for v in variants_data:
                if (v.get('quantity') or 0) > 0:
                    self._require_cost(
                        v.get('cost_price'),
                        f"{product_data['name'].strip()}, variação "
                        f"{self._variant_label(v.get('size'), v.get('color'), v.get('sku'))}",
                        entry_data.get('entry_type'),
                    )

            # Criar produto pai com is_catalog=False (produto com estoque)
            product_dict = {
                'name': product_data['name'].strip(),
                'description': product_data.get('description'),
                'brand': product_data.get('brand'),
                'gender': product_data.get('gender'),
                'material': product_data.get('material'),
                'category_id': product_data.get('category_id'),
                'base_price': Decimal(str(product_data['base_price'])),
                'is_catalog': False,  # Produto já tem entrada, não é catálogo
                'is_active': True,
            }
            
            # Criar produto pai
            product = await product_repo.create(product_dict, tenant_id=tenant_id)
            await self.db.flush()
            
            # 2. Criar variantes
            created_variants = []
            for variant_dict in variants_data:
                variant = ProductVariant(
                    product_id=product.id,
                    sku=variant_dict.get('sku'),
                    color=variant_dict.get('color'),
                    size=variant_dict.get('size'),
                    price=Decimal(str(variant_dict['price'] if variant_dict.get('price') is not None else product_data['base_price'])),
                    cost_price=Decimal(str(variant_dict['cost_price'])) if variant_dict.get('cost_price') is not None else None,
                    is_active=True,
                    tenant_id=tenant_id,
                )
                self.db.add(variant)
                await self.db.flush()
                created_variants.append(variant)
            
            # 3. Criar entrada de estoque
            unique_code = await self._generate_unique_entry_code(entry_data['entry_code'], tenant_id=tenant_id)
            entry_dict = StockEntryCreate(
                entry_code=unique_code,
                entry_date=entry_data.get('entry_date'),
                entry_type=entry_data.get('entry_type'),
                trip_id=entry_data.get('trip_id'),
                supplier_id=default_supplier.id,
                supplier_name=default_supplier.name,
                supplier_cnpj=entry_data.get('supplier_cnpj'),
                supplier_contact=entry_data.get('supplier_contact'),
                invoice_number=entry_data.get('invoice_number'),
                payment_method=entry_data.get('payment_method'),
                notes=entry_data.get('notes'),
            )
            
            entry_dict_dict = entry_dict.model_dump(exclude_unset=True)
            entry_dict_dict['total_cost'] = Decimal('0.00')
            
            entry = await self.entry_repo.create(self.db, entry_dict_dict, tenant_id=tenant_id)
            await self.db.flush()
            
            # 4. Criar itens da entrada para cada variante
            total_cost = Decimal('0.00')
            variants_acc: dict = {}
            for i, variant in enumerate(created_variants):
                # Obter quantidade da variante (está em variants_data, não em variant_quantities)
                variant_dict = variants_data[i]
                quantity = variant_dict.get('quantity', 0)
                if quantity <= 0:
                    continue  # Pular variantes sem quantidade
                
                unit_cost = self._require_cost(
                    variant_dict.get('cost_price'),
                    f"{product_data['name'].strip()}, variação "
                    f"{self._variant_label(variant.size, variant.color, variant.sku)}",
                    entry_data.get('entry_type'),
                )
                
                item = EntryItem(
                    entry_id=entry.id,
                    product_id=product.id,
                    variant_id=variant.id,
                    supplier_id=default_supplier.id,
                    quantity_received=quantity,
                    quantity_remaining=quantity,
                    unit_cost=unit_cost,
                    tenant_id=tenant_id,
                    is_active=True,
                )
                self.db.add(item)
                await self.db.flush()
                _q, _t = variants_acc.get((default_supplier.id, product.id), (0, Decimal('0')))
                variants_acc[(default_supplier.id, product.id)] = (_q + quantity, _t + Decimal(str(quantity)) * unit_cost)
                
                total_cost += Decimal(str(quantity)) * unit_cost
            
            entry.total_cost = total_cost
            await self._apply_supplier_links(variants_acc, entry.entry_date, tenant_id)
            
            # 5. Atualizar estoque do produto via rebuild FIFO
            inv_sync = InventoryService(self.db)
            try:
                delta = await inv_sync.rebuild_product_from_fifo(product.id, tenant_id=tenant_id)
                print(f"  [Inventory Sync NEW_PRODUCT_VARIANTS] Produto {product.id}: fifo={delta['fifo_sum']} inv={delta['inventory_quantity']} created={delta['created']} updated={delta['updated']}")
            except Exception as sync_err:
                print(f"  [Inventory Sync NEW_PRODUCT_VARIANTS] Falha sync produto {product.id}: {sync_err}")
            
            await self.db.flush()
            await self._add_entry_costs(entry, entry_data.get('extra_costs'), tenant_id)
            await lot_cost_service.recompute_entries(self.db, [entry.id], tenant_id=tenant_id)

            # 6. Commit de tudo (transação atômica)
            await self.db.commit()
            await self.db.refresh(entry)
            
            # Recarregar com itens
            entry = await self.entry_repo.get_by_id(self.db, entry.id, include_items=True, tenant_id=tenant_id)
            
            return entry
            
        except Exception as e:
            await self.db.rollback()
            raise e

    async def add_new_product_to_entry(
        self,
        entry_id: int,
        product_data: Dict[str, Any],
        variants_data: List[Dict[str, Any]],
        *,
        tenant_id: int,
    ) -> Dict[str, Any]:
        """
        Cria um NOVO produto (com variações) e o lança numa entrada JÁ EXISTENTE, tudo numa transação.

        Produto simples = 1 variação. Só variações com quantidade > 0 entram na entrada, mas todas
        são criadas. Se qualquer passo falhar, nada é gravado (rollback): o produto não existe
        enquanto a entrada não o contiver.
        """
        from decimal import Decimal
        from app.models.product_variant import ProductVariant
        from app.repositories.product_repository import ProductRepository

        try:
            entry = await self.entry_repo.get_by_id(self.db, entry_id, include_items=True, tenant_id=tenant_id)
            if not entry:
                raise ValueError(f"Entrada {entry_id} não encontrada")
            if not product_data.get('name') or not product_data.get('category_id'):
                raise ValueError("Nome e categoria do produto são obrigatórios")
            if not variants_data:
                raise ValueError("Informe ao menos uma variação")
            if not any((v.get('quantity') or 0) > 0 for v in variants_data):
                raise ValueError("Informe a quantidade de ao menos uma variação")

            for _v, _sku in zip(variants_data, await self._resolve_free_skus([v.get('sku') for v in variants_data], tenant_id)):
                _v['sku'] = _sku
            entry_type = entry.entry_type
            name = product_data['name'].strip()
            for v in variants_data:
                if (v.get('quantity') or 0) > 0:
                    self._require_cost(
                        v.get('cost_price'),
                        f"{name}, variação {self._variant_label(v.get('size'), v.get('color'), v.get('sku'))}",
                        entry_type,
                    )

            base_price = Decimal(str(product_data.get('base_price') or 0))
            product = await ProductRepository(self.db).create({
                'name': name,
                'description': product_data.get('description'),
                'brand': product_data.get('brand'),
                'gender': product_data.get('gender'),
                'material': product_data.get('material'),
                'category_id': product_data.get('category_id'),
                'base_price': base_price,
                'is_catalog': False,
                'is_active': True,
            }, tenant_id=tenant_id)
            await self.db.flush()

            supplier_id = entry.supplier_id
            added_cost = Decimal('0')
            acc: dict = {}
            for v in variants_data:
                sku = (v.get('sku') or '').strip().upper() or None
                variant = ProductVariant(
                    product_id=product.id,
                    sku=sku,
                    color=v.get('color'),
                    size=v.get('size'),
                    price=Decimal(str(v['price'] if v.get('price') is not None else base_price)),
                    cost_price=Decimal(str(v['cost_price'])) if v.get('cost_price') is not None else None,
                    is_active=True,
                    tenant_id=tenant_id,
                )
                self.db.add(variant)
                await self.db.flush()
                qty = v.get('quantity') or 0
                if qty <= 0:
                    continue
                unit_cost = self._require_cost(
                    v.get('cost_price'),
                    f"{name}, variação {self._variant_label(v.get('size'), v.get('color'), v.get('sku'))}",
                    entry_type,
                )
                self.db.add(EntryItem(
                    entry_id=entry.id,
                    product_id=product.id,
                    variant_id=variant.id,
                    supplier_id=supplier_id,
                    quantity_received=qty,
                    quantity_remaining=qty,
                    unit_cost=unit_cost,
                    tenant_id=tenant_id,
                    is_active=True,
                ))
                await self.db.flush()
                added_cost += Decimal(str(qty)) * unit_cost
                if supplier_id:
                    q0, t0 = acc.get((supplier_id, product.id), (0, Decimal('0')))
                    acc[(supplier_id, product.id)] = (q0 + qty, t0 + Decimal(str(qty)) * unit_cost)

            entry.total_cost = (entry.total_cost or Decimal('0')) + added_cost
            if acc:
                await self._apply_supplier_links(acc, entry.entry_date, tenant_id)
            try:
                await InventoryService(self.db).rebuild_product_from_fifo(product.id, tenant_id=tenant_id)
            except Exception as sync_err:
                print(f"  [Inventory Sync ADD_NEW_PRODUCT] Falha sync produto {product.id}: {sync_err}")

            product_id, entry_id_out, total_out = product.id, entry.id, entry.total_cost
            await self.db.flush()
            await lot_cost_service.recompute_entries(self.db, [entry.id], tenant_id=tenant_id)
            await self.db.commit()
            return {"entry_id": entry_id_out, "product_id": product_id, "total_cost": float(total_out or 0)}
        except Exception:
            await self.db.rollback()
            raise

    async def correct_entry_item(
        self,
        item_id: int,
        quantity_diff: int,
        reason: str,
        tenant_id: int,
        user_id: int,
    ) -> dict:
        """
        Corrige um item de entrada com auditoria, mesmo após vendas.

        diff > 0: adiciona unidades (cria EntryItem corretivo na mesma entrada)
        diff < 0: remove unidades (reduz quantity_remaining se houver saldo)

        Preserva FIFO e histórico de vendas intactos.
        """
        from app.core.timezone import now_brazil

        item = await self.item_repo.get_by_id(self.db, item_id, include_relations=True)
        if not item:
            raise ValueError(f"EntryItem {item_id} não encontrado")
        if item.tenant_id != tenant_id:
            raise ValueError("EntryItem não pertence a este tenant")
        if quantity_diff == 0:
            raise ValueError("quantity_diff não pode ser zero")

        now_str = now_brazil().strftime("%d/%m/%Y %H:%M")
        audit_note = f"[CORREÇÃO {now_str} user#{user_id}]: {reason}"
        product_id = item.product_id or (item.variant.product_id if item.variant else None)
        original_sold = item.quantity_sold

        corrective_item_id = None

        if quantity_diff > 0:
            # Adicionar unidades no próprio item (mantendo vendido invariável)
            new_remaining = item.quantity_remaining + quantity_diff
            new_received = new_remaining + original_sold
            existing_notes = item.notes or ""

            item.quantity_received = new_received
            item.quantity_remaining = new_remaining
            item.notes = f"{existing_notes}\n{audit_note}".strip()
            await self.db.flush()

            # Segurança extra: vendido deve permanecer exatamente igual
            if item.quantity_sold != original_sold:
                raise ValueError(
                    "Correção inválida: a quantidade vendida não pode ser alterada por ajuste de estoque."
                )

        else:
            # Remover unidades: reduzir quantity_remaining do item original
            remove = abs(quantity_diff)
            if remove > item.quantity_remaining:
                raise ValueError(
                    f"Não é possível remover {remove} unidade(s): apenas {item.quantity_remaining} disponível(is) "
                    f"(já foram vendidas {item.quantity_sold})."
                )
            new_remaining = item.quantity_remaining - remove
            # Regra: correção negativa não altera vendidos (sold = received - remaining)
            new_received = new_remaining + original_sold
            existing_notes = item.notes or ""
            item.quantity_received = new_received
            item.quantity_remaining = new_remaining
            item.notes = f"{existing_notes}\n{audit_note}".strip()
            await self.db.flush()

            # Segurança extra: vendido deve permanecer exatamente igual
            if item.quantity_sold != original_sold:
                raise ValueError(
                    "Correção inválida: a quantidade vendida não pode ser alterada por ajuste de estoque."
                )

        # Recalcular total_cost da entrada após correção (positiva ou negativa)
        entry = await self.entry_repo.get_by_id(self.db, item.entry_id, include_items=True, tenant_id=tenant_id)
        if entry:
            new_total_cost = Decimal('0.00')
            for entry_item in entry.entry_items:
                if entry_item.is_active:
                    new_total_cost += entry_item.quantity_received * entry_item.unit_cost
            entry.total_cost = new_total_cost
            await self.db.flush()

        # Estoque SEMPRE derivado do FIFO (entry_items), sem ajuste manual de inventory
        if product_id is None:
            raise ValueError("Item sem produto associado para rebuild de inventário FIFO")
        inv_service = InventoryService(self.db)
        await inv_service.rebuild_product_from_fifo(product_id, tenant_id=tenant_id)

        await self.db.flush()
        await lot_cost_service.recompute_entries(self.db, [item.entry_id], tenant_id=tenant_id)
        await self.db.commit()

        return {
            "message": f"Correção aplicada: {'+' if quantity_diff > 0 else ''}{quantity_diff} unidade(s)",
            "original_item_id": item_id,
            "quantity_diff": quantity_diff,
            "new_quantity_remaining": new_remaining,
            "reason": reason,
            "corrective_item_id": corrective_item_id,
        }
