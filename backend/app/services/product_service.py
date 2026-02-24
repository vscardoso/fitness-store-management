"""
Serviço de gerenciamento de produtos.
"""
from typing import List, Optional
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.entry_item_repository import EntryItemRepository
from app.schemas.product import ProductCreate, ProductUpdate, ProductStatusResponse
from app.core.timezone import now_brazil

# Logger global do módulo
logger = logging.getLogger(__name__)


class ProductService:
    """Serviço para operações de negócio com produtos."""
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço de produtos.
        
        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self.product_repo = ProductRepository(db)
        self.inventory_repo = InventoryRepository(db)
        self.entry_item_repo = EntryItemRepository()
    
    async def create_product(
        self,
        product_data: ProductCreate,
        initial_quantity: int = 0,
        min_stock: int = 5,
        *,
        tenant_id: int,
        user_id: int,
    ) -> Product:
        """
        Cria um novo produto SEM estoque inicial (FIFO strict).

        REGRA FIFO: Produto NÃO pode ser criado com estoque inicial.
        Todo estoque DEVE vir de uma StockEntry (source traceável).

        Args:
            product_data: Dados do produto a ser criado
            initial_quantity: Quantidade inicial em estoque (DEVE ser 0)
            min_stock: Estoque mínimo (padrão: 5, sobrescrito por product_data.min_stock)
            tenant_id: ID do tenant
            user_id: ID do usuário que está criando

        Returns:
            Product: Produto criado sem estoque (pendente de entrada)

        Raises:
            ValueError: Se SKU já existe ou dados inválidos
        """
        import logging
        from datetime import date
        from decimal import Decimal
        from app.models.stock_entry import EntryType
        from app.repositories.stock_entry_repository import StockEntryRepository
        from app.repositories.entry_item_repository import EntryItemRepository

        logger = logging.getLogger(__name__)
        
        # REGRA FIFO STRICT: category_id é OBRIGATÓRIO
        # Todo produto deve estar categorizado para organização do inventário
        if not product_data.category_id:
            raise ValueError(
                "REGRA FIFO STRICT: category_id é obrigatório. "
                "Todo produto deve estar vinculado a uma categoria válida."
            )
        
        # Verificar se categoria existe
        from app.models.category import Category
        category = await self.db.execute(
            select(Category).where(Category.id == product_data.category_id)
        )
        if not category.scalar_one_or_none():
            raise ValueError(
                f"Categoria {product_data.category_id} não encontrada. "
                "Por favor, selecione uma categoria válida."
            )

        # Verificar SKU único
        existing = await self.product_repo.get_by_sku(product_data.sku, tenant_id=tenant_id)
        if existing:
            raise ValueError(f"SKU {product_data.sku} já existe")

        # Verificar barcode único se fornecido
        if product_data.barcode:
            existing_barcode = await self.product_repo.get_by_barcode(product_data.barcode, tenant_id=tenant_id)
            if existing_barcode:
                raise ValueError(f"Código de barras {product_data.barcode} já existe")

        # Usar valores de product_data ou padrões
        initial_stock = product_data.initial_stock if product_data.initial_stock is not None else initial_quantity
        min_stock_value = product_data.min_stock if product_data.min_stock is not None else min_stock

        # Remover campos específicos de estoque, alias e campos que agora pertencem à ProductVariant
        product_dict = product_data.model_dump(exclude={
            "initial_stock", "min_stock", "sale_price",
            "sku", "barcode", "price", "cost_price", "size", "color"
        })
        
        # Guardar dados da variante para criar depois
        variant_data = {
            "sku": product_data.sku,
            "barcode": product_data.barcode,
            "price": product_data.price,
            "cost_price": product_data.cost_price,
            "size": product_data.size,
            "color": product_data.color,
        }

        # REGRA FIFO STRICT: Produto NÃO pode ser criado com estoque inicial
        # Todo estoque DEVE vir de uma StockEntry (source traceável)
        if initial_stock is not None and initial_stock > 0:
            raise ValueError(
                "REGRA FIFO STRICT: Produto não pode ser criado com estoque inicial. "
                "Para adicionar estoque, crie uma StockEntry e vincule ao produto. "
                "Isso garante rastreabilidade completa do inventário."
            )
        
        # REGRA DE NEGÓCIO: is_catalog é determinado pelo campo enviado pelo cliente.
        # Se o cliente enviou is_catalog explicitamente, respeitar esse valor.
        # Fallback: se is_catalog não foi enviado (None no dict), inferir pelo initial_stock
        # para manter compatibilidade com chamadas legadas que não enviam o campo.
        #
        # IMPORTANTE: O wizard mobile envia is_catalog=True para produtos novos.
        # O backend vira is_catalog=False automaticamente quando a entrada de
        # estoque é criada (create_entry / add_item_to_entry).
        # Isso garante que produto sem entrada NUNCA aparece como ativo (FIFO STRICT).
        client_is_catalog = product_dict.get("is_catalog")
        if client_is_catalog is None:
            # Fallback legado: inferir pelo estoque
            product_dict["is_catalog"] = True
            logger.info(f"Produto sera criado no CATALOGO (sem estoque inicial, fallback legado)")
        else:
            # Cliente enviou is_catalog explicitamente — respeitar
            logger.info(
                f"Produto sera criado com is_catalog={client_is_catalog} "
                f"(definido pelo cliente, initial_stock={initial_stock})"
            )

        # REGRA FIFO STRICT: Produtos NÃO podem ser criados sem estoque.
        #
        # SOLUÇÃO PARA UX:
        # 1. App DEVE criar StockEntry e EntryItem junto com o produto
        # 2. Se usuário cancelar/sair, deletar StockEntry (produto órfão é deletado automaticamente)
        # 3. Garante FIFO 100% consistente sem produtos pendentes
        #
        # FLUXO CORRETO:
        # App: POST /products com entry_id e quantity
        # Backend: Cria produto + vincula à entrada existente
        # Resultado: Produto sempre tem EntryItems, 100% rastreável
        #
        # SE NÃO HOUVER ENTRY:
        # Raise error exigindo que crie entrada primeiro
        
        # Criar produto no repositório
        product = await self.product_repo.create(product_dict, tenant_id=tenant_id)
        logger.info(f"Produto criado - ID: {product.id}, is_catalog: {product.is_catalog}")
        
        # Criar primeira variante com os dados do produto
        from app.services.product_variant_service import ProductVariantService
        from app.schemas.product_variant import ProductVariantCreate
        
        variant_service = ProductVariantService(self.db)
        variant_create = ProductVariantCreate(
            sku=variant_data["sku"],
            barcode=variant_data["barcode"],
            price=variant_data["price"] or product_data.price,
            cost_price=variant_data["cost_price"],
            size=variant_data["size"],
            color=variant_data["color"],
        )
        
        variant = await variant_service.create_variant(
            product_id=product.id,
            variant_data=variant_create,
            tenant_id=tenant_id
        )
        logger.info(f"Variante criada - ID: {variant.id}, SKU: {variant.sku}")

        # Se há estoque inicial, criar entrada automática do tipo INITIAL_INVENTORY
        if initial_stock and initial_stock > 0:
            try:
                entry_repo = StockEntryRepository()
                item_repo = EntryItemRepository()

                # Criar entrada de estoque inicial
                from app.schemas.stock_entry import StockEntryCreate
                from app.schemas.entry_item import EntryItemCreate

                entry_data = StockEntryCreate(
                    entry_code=f"INIT-{variant.sku}-{date.today().strftime('%Y%m%d')}",
                    entry_date=date.today(),
                    entry_type=EntryType.INITIAL_INVENTORY,
                    supplier_name="Estoque Inicial do Sistema",
                    notes=f"Entrada automática criada na adição do produto {product.name}",
                )

                # Criar entrada com assinatura correta (db, data, tenant_id)
                entry = await entry_repo.create(self.db, entry_data.model_dump(), tenant_id=tenant_id)
                logger.info(f" Entrada inicial criada - ID: {entry.id}, Code: {entry.entry_code}")

                # Criar item da entrada
                item_data = EntryItemCreate(
                    product_id=product.id,
                    quantity_received=initial_stock,
                    unit_cost=product.cost_price or Decimal("0.00"),
                    notes="Item de estoque inicial",
                )
                # Incluir entry_id nos dados do item e usar assinatura correta (db, data)
                item_dict = item_data.model_dump(exclude={"selling_price"})
                item_dict["entry_id"] = entry.id
                item = await item_repo.create(self.db, item_dict)
                logger.info(f" Item de entrada criado - ID: {item.id}, Qty: {initial_stock}")

                # Atualizar total_cost da entrada
                entry.total_cost = item.total_cost
                await self.db.commit()

                logger.info(f" Produto {variant.sku} vinculado à entrada {entry.entry_code}")

                # Rebuild inventário via FIFO (fonte da verdade = entry_items)
                # Garante que Inventory.quantity == soma de quantity_remaining dos EntryItems ativos
                # Isso substitui a criação manual do Inventory com quantity=initial_stock
                from app.services.inventory_service import InventoryService
                inv_sync = InventoryService(self.db)
                try:
                    delta = await inv_sync.rebuild_product_from_fifo(product.id, tenant_id=tenant_id)
                    # Após o rebuild, garantir que min_stock está correto
                    inventory = await self.inventory_repo.get_by_product(product.id, tenant_id=tenant_id)
                    if inventory and inventory.min_stock != min_stock_value:
                        inventory.min_stock = min_stock_value
                        await self.db.commit()
                    logger.info(
                        f" Inventory sincronizado via FIFO - "
                        f"fifo_sum={delta['fifo_sum']} qty={delta['inventory_quantity']} "
                        f"created={delta['created']} updated={delta['updated']}"
                    )
                except Exception as sync_err:
                    logger.error(f"Erro ao sincronizar inventory via FIFO para produto {product.id}: {sync_err}")

            except Exception as entry_err:
                logger.error(f"Erro ao criar entrada inicial para o produto {product.id}: {entry_err}")
                # Não falhar a criação do produto por causa da entrada
                raise ValueError(f"Produto criado mas falhou ao vincular entrada inicial: {entry_err}")

        else:
            # Sem estoque inicial: garantir que existe registro de inventory com quantity=0
            # (necessário para consultas de low-stock e dashboard)
            try:
                inventory = await self.inventory_repo.get_by_product(product.id, tenant_id=tenant_id)
                if not inventory:
                    inventory_data = {
                        "product_id": product.id,
                        "quantity": 0,
                        "min_stock": min_stock_value,
                    }
                    await self.inventory_repo.create(self.db, inventory_data, tenant_id=tenant_id)
                    logger.info(f" Inventory criado (sem estoque) - Min stock: {min_stock_value}")
                else:
                    if inventory.min_stock != min_stock_value:
                        inventory.min_stock = min_stock_value
                        await self.db.commit()
                    logger.info(f" Min stock atualizado: {min_stock_value}")
            except Exception as inv_err:
                logger.error(f"Erro ao criar inventory vazio para o produto {product.id}: {inv_err}")

        return product
    
    async def update_product(
        self, 
        product_id: int, 
        product_data: ProductUpdate,
        *,
        tenant_id: int,
    ) -> Product:
        """
        Atualiza um produto existente.
        
        Args:
            product_id: ID do produto
            product_data: Dados para atualização
            
        Returns:
            Product: Produto atualizado
            
        Raises:
            ValueError: Se produto não encontrado ou SKU duplicado
        """
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError("Produto não encontrado")
        
        # Verificar SKU único se estiver sendo alterado
        # Usa exists_by_sku com exclude_id=product_id para excluir as próprias variantes do produto.
        # A comparação product_data.sku != product.sku é insuficiente para produtos com múltiplas
        # variantes pois product.sku retorna apenas a primeira variante ativa.
        if product_data.sku:
            if await self.product_repo.exists_by_sku(product_data.sku, exclude_id=product_id, tenant_id=tenant_id):
                raise ValueError(f"SKU {product_data.sku} já existe")
        
        # Verificar barcode único se estiver sendo alterado
        if product_data.barcode and product_data.barcode != product.barcode:
            existing_barcode = await self.product_repo.get_by_barcode(product_data.barcode, tenant_id=tenant_id)
            if existing_barcode:
                raise ValueError(f"Código de barras {product_data.barcode} já existe")
        
        update_dict = product_data.model_dump(exclude_unset=True)

        # Campos que existem como colunas diretas na tabela 'products'
        PRODUCT_COLUMNS = {
            "name", "description", "brand", "gender", "material",
            "is_digital", "is_activewear", "is_catalog", "image_url",
            "category_id", "is_active",
        }
        # Campos que pertencem a ProductVariant (são @property sem setter no Product)
        VARIANT_FIELDS = {"sku", "barcode", "price", "cost_price", "size", "color"}

        # Separar update por destino
        product_update = {k: v for k, v in update_dict.items() if k in PRODUCT_COLUMNS}
        variant_update = {k: v for k, v in update_dict.items() if k in VARIANT_FIELDS}

        # Tratar sale_price como alias de price para variante
        if "sale_price" in update_dict and "price" not in variant_update:
            variant_update["price"] = update_dict["sale_price"]

        # Sincronizar base_price no produto pai quando price muda (campo de referência)
        if "price" in variant_update:
            product_update["base_price"] = variant_update["price"]

        # Atualizar colunas diretas do produto (se houver)
        if product_update:
            updated_product = await self.product_repo.update(
                self.db, id=product_id, obj_in=product_update, tenant_id=tenant_id
            )
        else:
            updated_product = product

        # Atualizar primeira variante ativa (campos de variante)
        if variant_update:
            from sqlalchemy import select as _sel
            from app.models.product_variant import ProductVariant
            _vstmt = (
                _sel(ProductVariant)
                .where(
                    ProductVariant.product_id == product_id,
                    ProductVariant.tenant_id == tenant_id,
                    ProductVariant.is_active == True,
                )
                .order_by(ProductVariant.id)
                .limit(1)
            )
            _vresult = await self.db.execute(_vstmt)
            _variant = _vresult.scalar_one_or_none()
            if _variant:
                for _vfield, _vval in variant_update.items():
                    setattr(_variant, _vfield, _vval)
                await self.db.flush()

        # FIFO INVARIANT: cost_price atualizado na variante acima já resolve o sugerido
        # para novas entradas; EntryItems existentes NÃO são modificados.
        if "cost_price" in variant_update:
            logger.info(
                f"[update_product] cost_price atualizado para produto {product_id}: "
                f"variante → {variant_update['cost_price']}. "
                f"EntryItems existentes NÃO foram alterados (FIFO invariant)."
            )

        # Commit das alterações
        await self.db.commit()
        await self.db.refresh(updated_product)

        return updated_product

    async def adjust_product_quantity(
        self,
        product_id: int,
        *,
        new_quantity: int,
        reason: str | None = None,
        unit_cost: float | None = None,
        tenant_id: int,
    ) -> dict:
        """Ajusta a quantidade total do produto com rastreabilidade FIFO.

        Regras:
        - Se aumentar (delta > 0): cria uma StockEntry do tipo ADJUSTMENT com um EntryItem
          contendo quantity_received=delta e unit_cost informado (ou cost_price do produto).
        - Se diminuir (delta < 0): reduz quantity_remaining dos EntryItems disponíveis seguindo FIFO.
        - Ao final, reconcilia Inventory a partir do FIFO (rebuild_product_from_fifo).

        Retorna metadados do ajuste (anterior, novo, delta).
        """
        from decimal import Decimal
        from datetime import date, datetime
        from sqlalchemy import select, and_
        from app.models.entry_item import EntryItem
        from app.models.stock_entry import StockEntry, EntryType
        from app.repositories.stock_entry_repository import StockEntryRepository
        from app.repositories.entry_item_repository import EntryItemRepository
        from app.services.inventory_service import InventoryService

        # Validar produto e tenant
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError("Produto não encontrado")

        if new_quantity < 0:
            raise ValueError("Nova quantidade não pode ser negativa")

        # Quantidade atual baseada no FIFO (EntryItems)
        stmt_sum = (
            select((EntryItem.quantity_remaining))
            .where(
                and_(
                    EntryItem.product_id == product_id,
                    EntryItem.is_active == True,
                    EntryItem.tenant_id == tenant_id,
                )
            )
        )
        rows = (await self.db.execute(stmt_sum)).scalars().all()
        current_qty = int(sum(int(r or 0) for r in rows))

        if new_quantity == current_qty:
            return {
                "product_id": product_id,
                "previous_quantity": current_qty,
                "new_quantity": new_quantity,
                "delta": 0,
                "movement": "none",
                "message": "Quantidade já está no valor desejado",
            }

        delta = new_quantity - current_qty
        movement = "increase" if delta > 0 else "decrease"

        try:
            if delta > 0:
                # AUMENTAR: criar StockEntry ADJUSTMENT + EntryItem
                if unit_cost is None:
                    # fallback para cost_price do produto
                    if product.cost_price is None:
                        raise ValueError("unit_cost é obrigatório ao aumentar estoque (sem cost_price definido)")
                    unit_cost = float(product.cost_price)  # type: ignore

                entry_repo = StockEntryRepository()
                item_repo = EntryItemRepository()

                code_ts = now_brazil().strftime("%Y%m%d%H%M%S")
                entry_payload = {
                    "entry_code": f"ADJ-{product.sku or product.id}-{code_ts}",
                    "entry_date": date.today(),
                    "entry_type": EntryType.ADJUSTMENT,
                    "supplier_name": "Ajuste de Inventário",
                    "notes": (reason or "Ajuste manual de estoque"),
                    "total_cost": Decimal("0.00"),
                }
                entry = await entry_repo.create(self.db, entry_payload, tenant_id=tenant_id)

                item_payload = {
                    "entry_id": entry.id,
                    "product_id": product_id,
                    "quantity_received": int(delta),
                    "quantity_remaining": int(delta),
                    "unit_cost": Decimal(str(unit_cost)),
                    "tenant_id": tenant_id,
                    "notes": (reason or "Ajuste manual de estoque"),
                }
                await item_repo.create(self.db, item_payload)

                # Atualizar total da entrada (custo item)
                entry.total_cost = Decimal(str(unit_cost)) * Decimal(str(int(delta)))
                await self.db.commit()

            else:
                # DIMINUIR: consumir FIFO dos EntryItems disponíveis
                take = abs(int(delta))
                # Buscar itens disponíveis FIFO (mais antigos primeiro)
                from sqlalchemy import join
                from app.models.stock_entry import StockEntry as SE

                q = (
                    select(EntryItem)
                    .join(SE, EntryItem.entry_id == SE.id)
                    .where(
                        and_(
                            EntryItem.product_id == product_id,
                            EntryItem.quantity_remaining > 0,
                            EntryItem.is_active == True,
                            EntryItem.tenant_id == tenant_id,
                            SE.is_active == True,
                        )
                    )
                    .order_by(SE.entry_date.asc(), EntryItem.created_at.asc())
                )
                items = (await self.db.execute(q)).scalars().all()

                remaining = take
                for it in items:
                    if remaining <= 0:
                        break
                    can_take = min(it.quantity_remaining, remaining)
                    it.quantity_remaining -= int(can_take)
                    remaining -= int(can_take)

                if remaining > 0:
                    # Não deveria acontecer, pois new_quantity < current_qty
                    raise ValueError("Estoque insuficiente para ajuste de redução")

                await self.db.commit()

            # Reconciliar Inventory com FIFO
            inv_sync = InventoryService(self.db)
            await inv_sync.rebuild_product_from_fifo(product_id, tenant_id=tenant_id)

            return {
                "product_id": product_id,
                "previous_quantity": current_qty,
                "new_quantity": new_quantity,
                "delta": int(delta),
                "movement": movement,
            }
        except Exception as e:
            await self.db.rollback()
            raise
    
    async def delete_product(self, product_id: int, *, tenant_id: int) -> bool:
        """
        Deleta um produto (soft delete).
        
        IMPORTANTE: Limpa SKU e barcode das variantes para evitar conflitos futuros.
        
        Args:
            product_id: ID do produto
            
        Returns:
            bool: True se deletado com sucesso
            
        Raises:
            ValueError: Se produto não encontrado ou possui estoque
        """
        from sqlalchemy import select, update
        from app.models.product_variant import ProductVariant
        
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError("Produto não encontrado")
        
        # Verificar se há estoque — usa entry_items como fonte da verdade (FIFO real)
        # A coluna inventory.quantity pode estar desincronizada quando entry_items são
        # removidos manualmente. Recalculamos do FIFO e sincronizamos antes de bloquear.
        from sqlalchemy import text as _text
        fifo_sum_row = await self.db.execute(
            _text(
                "SELECT COALESCE(SUM(ei.quantity_remaining), 0) "
                "FROM entry_items ei "
                "WHERE ei.product_id = :pid AND ei.tenant_id = :tid AND ei.is_active = 1"
            ),
            {"pid": product_id, "tid": tenant_id},
        )
        fifo_total: int = int(fifo_sum_row.scalar() or 0)

        # Também somar via variantes (para produtos com variant_id nos entry_items)
        fifo_variant_row = await self.db.execute(
            _text(
                "SELECT COALESCE(SUM(ei.quantity_remaining), 0) "
                "FROM entry_items ei "
                "JOIN product_variants pv ON ei.variant_id = pv.id "
                "WHERE pv.product_id = :pid AND ei.tenant_id = :tid AND ei.is_active = 1"
            ),
            {"pid": product_id, "tid": tenant_id},
        )
        fifo_variant_total: int = int(fifo_variant_row.scalar() or 0)
        real_stock = fifo_total + fifo_variant_total

        inventory = await self.inventory_repo.get_by_product(product_id, tenant_id=tenant_id)

        if real_stock > 0:
            raise ValueError(
                f"Não é possível deletar produto com estoque "
                f"(quantidade atual: {real_stock})"
            )

        # Se inventory estava desincronizado (entry_items zerados mas inventory > 0), corrigir
        if inventory and inventory.quantity > 0:
            logger.warning(
                f"Produto {product_id}: inventory.quantity={inventory.quantity} mas FIFO real=0. "
                f"Sincronizando para 0 antes da deleção."
            )
            await self.db.execute(
                _text(
                    "UPDATE inventory SET quantity = 0 WHERE product_id = :pid AND tenant_id = :tid"
                ),
                {"pid": product_id, "tid": tenant_id},
            )
        
        # Desativar variantes E renomear SKUs para liberar o UNIQUE constraint.
        # A tabela product_variants tem UNIQUE(tenant_id, sku), então apenas setar
        # is_active=False não é suficiente — o SKU permanece bloqueado para novos registros.
        # Estratégia: renomear para "<sku>_del_<id>" antes de desativar.
        active_variants = (
            await self.db.execute(
                select(ProductVariant).where(
                    ProductVariant.product_id == product_id,
                    ProductVariant.tenant_id == tenant_id,
                )
            )
        ).scalars().all()

        for variant in active_variants:
            # Só renomear se ainda não foi renomeado (idempotência)
            new_sku = variant.sku if variant.sku.endswith(f"_del_{variant.id}") else f"{variant.sku}_del_{variant.id}"
            await self.db.execute(
                update(ProductVariant)
                .where(ProductVariant.id == variant.id)
                .values(sku=new_sku, is_active=False)
            )
        logger.info(f"Variantes do produto {product_id} desativadas e SKUs renomeados (_del_<id>)")

        # Soft delete do produto
        await self.product_repo.update(self.db, id=product_id, obj_in={'is_active': False}, tenant_id=tenant_id)
        
        await self.db.commit()
        return True
    
    async def get_product(self, product_id: int, *, tenant_id: int) -> Optional[Product]:
        """
        Busca um produto por ID.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Optional[Product]: Produto encontrado ou None
        """
        return await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
    
    async def get_product_by_sku(self, sku: str, *, tenant_id: int) -> Optional[Product]:
        """
        Busca um produto por SKU.
        
        Args:
            sku: SKU do produto
            
        Returns:
            Optional[Product]: Produto encontrado ou None
        """
        return await self.product_repo.get_by_sku(sku, tenant_id=tenant_id)
    
    async def get_product_by_barcode(self, barcode: str, *, tenant_id: int) -> Optional[Product]:
        """
        Busca um produto por código de barras.
        
        Args:
            barcode: Código de barras do produto
            
        Returns:
            Optional[Product]: Produto encontrado ou None
        """
        return await self.product_repo.get_by_barcode(barcode, tenant_id=tenant_id)
    
    async def search_products(
        self, 
        query: str, 
        skip: int = 0, 
        limit: int = 100,
        *,
        tenant_id: int,
    ) -> List[Product]:
        """
        Busca produtos por termo de pesquisa.
        
        Busca em: nome, descrição, marca e SKU.
        
        Args:
            query: Termo de pesquisa
            skip: Número de registros para pular (paginação)
            limit: Número máximo de registros
            
        Returns:
            List[Product]: Lista de produtos encontrados
        """
        return await self.product_repo.search(query, tenant_id=tenant_id)
    
    async def get_products_by_category(
        self, 
        category_id: int,
        skip: int = 0,
        limit: int = 100,
        *,
        tenant_id: int,
    ) -> List[Product]:
        """
        Lista produtos de uma categoria.
        
        Args:
            category_id: ID da categoria
            skip: Número de registros para pular
            limit: Número máximo de registros
            
        Returns:
            List[Product]: Lista de produtos da categoria
        """
        return await self.product_repo.get_by_category(category_id, tenant_id=tenant_id)
    
    async def get_products_by_brand(
        self, 
        brand: str,
        skip: int = 0,
        limit: int = 100,
        *,
        tenant_id: int,
    ) -> List[Product]:
        """
        Lista produtos de uma marca.
        
        Args:
            brand: Nome da marca
            skip: Número de registros para pular
            limit: Número máximo de registros
            
        Returns:
            List[Product]: Lista de produtos da marca
        """
        return await self.product_repo.get_by_brand(brand, tenant_id=tenant_id)
    
    async def list_products(
        self, 
        skip: int = 0, 
        limit: int = 100,
        active_only: bool = True,
        *,
        tenant_id: int,
    ) -> List[Product]:
        """
        Lista produtos com paginação.
        
        Args:
            skip: Número de registros para pular
            limit: Número máximo de registros
            active_only: Se deve retornar apenas produtos ativos
            
        Returns:
            List[Product]: Lista de produtos
        """
        products = await self.product_repo.get_multi(self.db, skip=skip, limit=limit, tenant_id=tenant_id)
        
        if active_only:
            products = [p for p in products if p.is_active]
        
        return products
    
    async def get_product_with_inventory(self, product_id: int, *, tenant_id: int) -> Optional[Product]:
        """
        Busca produto com informações de estoque carregadas.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Optional[Product]: Produto com estoque ou None
        """
        return await self.product_repo.get_with_inventory(product_id, tenant_id=tenant_id)
    
    async def get_low_stock_products(self, threshold: int = None, *, tenant_id: int) -> List[Product]:
        """
        Lista produtos com estoque baixo.
        
        Args:
            threshold: Limite de estoque (usa min_stock se não fornecido)
            
        Returns:
            List[Product]: Lista de produtos com estoque baixo
        """
        low_stock_inventory = await self.inventory_repo.get_low_stock_products(threshold, tenant_id=tenant_id)
        
        # Buscar produtos correspondentes
        product_ids = [inv.product_id for inv in low_stock_inventory]
        products = []
        
        for product_id in product_ids:
            product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
            if product and product.is_active:
                products.append(product)
        
        return products
    
    async def activate_product(self, product_id: int, *, tenant_id: int) -> bool:
        """
        Ativa um produto desativado.
        
        Args:
            product_id: ID do produto
            
        Returns:
            bool: True se ativado com sucesso
            
        Raises:
            ValueError: Se produto não encontrado
        """
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError("Produto não encontrado")
        
        await self.product_repo.update(self.db, id=product_id, obj_in={'is_active': True}, tenant_id=tenant_id)
        return True
    
    async def update_product_price(
        self, 
        product_id: int, 
        new_price: float,
        new_cost_price: float = None,
        *,
        tenant_id: int,
    ) -> Product:
        """
        Atualiza preço de um produto.
        
        Args:
            product_id: ID do produto
            new_price: Novo preço de venda
            new_cost_price: Novo preço de custo (opcional)
            
        Returns:
            Product: Produto atualizado
            
        Raises:
            ValueError: Se produto não encontrado ou preço inválido
        """
        if new_price <= 0:
            raise ValueError("Preço deve ser maior que zero")
        
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError("Produto não encontrado")
        
        # price e cost_price estão na ProductVariant, não no Product
        from sqlalchemy import select as _sel
        from app.models.product_variant import ProductVariant
        _vstmt = (
            _sel(ProductVariant)
            .where(
                ProductVariant.product_id == product_id,
                ProductVariant.tenant_id == tenant_id,
                ProductVariant.is_active == True,
            )
            .order_by(ProductVariant.id)
            .limit(1)
        )
        _vresult = await self.db.execute(_vstmt)
        _variant = _vresult.scalar_one_or_none()
        if _variant:
            _variant.price = new_price
            if new_cost_price is not None:
                if new_cost_price < 0:
                    raise ValueError("Preço de custo não pode ser negativo")
                _variant.cost_price = new_cost_price
        # Sincronizar base_price no produto pai
        product.base_price = new_price
        await self.db.flush()

        await self.db.commit()
        await self.db.refresh(product)
        return product

    async def get_catalog_products(
        self,
        *,
        tenant_id: int,
        category_id: Optional[int] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Product]:
        """
        Lista produtos do CATÁLOGO (templates globais) com suas variantes.

        Estes são os produtos padrão que aparecem para TODAS as lojas.
        O catálogo é GLOBAL - todos os usuários veem os mesmos templates.
        O usuário pode "ativar" produtos do catálogo para adicionar à sua loja.

        Args:
            tenant_id: ID do tenant (IGNORADO - catálogo é global)
            category_id: Filtrar por categoria (opcional)
            search: Buscar por nome/marca (opcional)
            skip: Paginação - registros a pular
            limit: Paginação - máximo de registros

        Returns:
            Lista de produtos do catálogo (global) com variantes carregadas
        """
        from sqlalchemy import select, and_, or_
        from sqlalchemy.orm import selectinload

        # Buscar produtos do catálogo (is_catalog=true) com variantes
        stmt = select(Product).options(
            selectinload(Product.variants),
            selectinload(Product.category)
        ).where(
            and_(
                Product.is_catalog == True,      # GLOBAL: catálogo é para todos os tenants
                Product.is_active == True
            )
        )

        # Filtrar por categoria
        if category_id is not None:
            stmt = stmt.where(Product.category_id == category_id)

        # Buscar por nome/marca/cor/tamanho (inclui busca em variantes)
        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Product.name.ilike(search_pattern),
                    Product.brand.ilike(search_pattern)
                )
            )

        stmt = stmt.order_by(Product.name).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        products = list(result.scalars().all())
        
        # Garantir que variantes estejam ordenadas
        for product in products:
            if product.variants:
                product.variants.sort(key=lambda v: (v.size or "", v.color or ""))
        
        return products

    async def get_active_products(
        self,
        *,
        tenant_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[Product]:
        """
        Lista produtos ATIVOS da loja (não catálogo) com EntryItems.

        FIFO STRICT: Produtos órfãos (sem EntryItems) NÃO aparecem.
        Apenas produtos com rastreabilidade FIFO são retornados.

        Estes são produtos que o lojista já adicionou à sua loja
        (ativados do catálogo ou criados manualmente) E que têm estoque
        vinculado através de EntryItems.

        Args:
            tenant_id: ID do tenant
            skip: Paginação - registros a pular
            limit: Paginação - máximo de registros

        Returns:
            Lista de produtos ativos com EntryItems
        """
        from sqlalchemy import select, and_
        from sqlalchemy.orm import selectinload

        # Buscar IDs de produtos com EntryItems (não órfãos)
        products_with_entries = await self.entry_item_repo.get_products_with_entries(self.db, tenant_id)
        
        if not products_with_entries:
            return []

        # Buscar produtos filtrando por IDs com EntryItems
        stmt = select(Product).where(
            and_(
                Product.tenant_id == tenant_id,
                Product.is_catalog == False,  # Apenas produtos ativos (não catálogo)
                Product.is_active == True,
                Product.id.in_(products_with_entries)  # FIFO STRICT: apenas com EntryItems
            )
        ).options(
            selectinload(Product.category),
            selectinload(Product.inventory),
            selectinload(Product.variants)  # Carregar variantes para propriedades de compatibilidade
        ).order_by(Product.name).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def activate_catalog_product(
        self,
        catalog_product_id: int,
        *,
        tenant_id: int,
        user_id: int,
        custom_price: Optional[float] = None,
        entry_id: Optional[int] = None,
        quantity: Optional[int] = None
    ) -> Product:
        """
        Ativa um produto do catálogo, criando uma cópia para a loja do usuário.

        Fluxo:
        1. Busca produto do catálogo (is_catalog=true)
        2. Cria CÓPIA com is_catalog=false
        3. Gera novo SKU único para a loja
        4. Usa preço customizado ou mantém sugerido
        5. Se entry_id e quantity forem fornecidos, vincula à entrada (rastreabilidade)

        Args:
            catalog_product_id: ID do produto no catálogo
            tenant_id: ID do tenant (loja)
            user_id: ID do usuário que está ativando o produto
            custom_price: Preço personalizado (opcional, usa o do catálogo se None)
            entry_id: ID da entrada de estoque para vincular (opcional)
            quantity: Quantidade inicial para adicionar (opcional)

        Returns:
            Produto ativado (cópia)

        Raises:
            ValueError: Se produto não existe ou não é catálogo
        """
        # Buscar produto do catálogo
        # IMPORTANTE: produtos de catálogo são GLOBAIS (tenant_id do seed, não do usuário).
        # NÃO filtrar por tenant_id aqui — o catálogo pertence a todos os tenants.
        from sqlalchemy import select, and_
        from sqlalchemy.orm import selectinload
        catalog_result = await self.db.execute(
            select(Product)
            .options(selectinload(Product.variants))
            .where(
                Product.id == catalog_product_id,
                Product.is_catalog == True,
                Product.is_active == True,
            )
        )
        catalog_product = catalog_result.scalar_one_or_none()

        if not catalog_product:
            raise ValueError("Produto não encontrado no catálogo")

        if not catalog_product.is_catalog:
            raise ValueError("Este produto não é um template do catálogo")

        # Gerar SKU único para a loja
        # Usar formato: MARCA-NOME-COR-TAMANHO-XXX (ex: NIKE-LEGGIN-ROS-M-001)
        import re
        import uuid
        from app.services.sku_generator_service import SKUGeneratorService

        # Usar serviço de geração de SKU que já tem lógica de unicidade
        sku_service = SKUGeneratorService(self.db)
        
        # Gerar SKU único considerando produtos existentes do tenant
        new_sku = await sku_service.generate_unique_sku(
            name=catalog_product.name,
            brand=catalog_product.brand,
            color=catalog_product.color,
            size=catalog_product.size,
            tenant_id=tenant_id
        )
        
        logger.info(f"SKU gerado para ativação de catálogo: {new_sku}")

        # Verificar se o barcode do catálogo já existe no tenant do usuário.
        # Se sim, não copiar o barcode (evita duplicata ao ativar o mesmo produto 2x).
        catalog_barcode = catalog_product.barcode
        if catalog_barcode:
            existing_barcode = await self.product_repo.get_by_barcode(catalog_barcode, tenant_id=tenant_id)
            if existing_barcode:
                catalog_barcode = None  # Não copiar barcode duplicado

        # Criar cópia do produto como ativo
        product_data = ProductCreate(
            name=catalog_product.name,
            description=catalog_product.description,
            sku=new_sku,
            barcode=catalog_barcode,
            price=custom_price if custom_price is not None else catalog_product.price,
            cost_price=catalog_product.cost_price,
            category_id=catalog_product.category_id,
            brand=catalog_product.brand,
            color=catalog_product.color,
            size=catalog_product.size,
            gender=catalog_product.gender,
            material=catalog_product.material,
            is_digital=catalog_product.is_digital,
            is_activewear=catalog_product.is_activewear,
            is_catalog=False,  # produto ativo da loja (nao e template de catalogo) é produto ATIVO
            initial_stock=0,  # Sem estoque inicial
            min_stock=5
        )

        # Criar produto ativo
        new_product = await self.create_product(
            product_data,
            initial_quantity=0,
            min_stock=5,
            tenant_id=tenant_id,
            user_id=user_id
        )

        # Se entry_id e quantity foram fornecidos, vincular à entrada
        if entry_id is not None and quantity is not None and quantity > 0:
            from app.models.entry_item import EntryItem
            from app.models.stock_entry import StockEntry
            from app.services.inventory_service import InventoryService
            from decimal import Decimal
            from sqlalchemy import select

            # Buscar entrada (pertencente ao tenant)
            result = await self.db.execute(
                select(StockEntry).where(
                    StockEntry.id == entry_id,
                    StockEntry.tenant_id == tenant_id,
                    StockEntry.is_active == True
                )
            )
            stock_entry = result.scalar_one_or_none()

            if not stock_entry:
                raise ValueError(f"Entrada de estoque {entry_id} não encontrada")

            # Criar EntryItem vinculando produto à entrada
            unit_cost_val = Decimal(str(new_product.cost_price)) if new_product.cost_price else Decimal("0")
            entry_item = EntryItem(
                entry_id=entry_id,
                product_id=new_product.id,
                quantity_received=quantity,
                quantity_remaining=quantity,
                unit_cost=unit_cost_val,
                tenant_id=tenant_id,
                is_active=True
            )
            self.db.add(entry_item)

            # Atualizar total_cost da entrada
            item_total_cost = Decimal(str(quantity)) * unit_cost_val
            stock_entry.total_cost = (stock_entry.total_cost or Decimal("0.00")) + item_total_cost

            # Flush para que o EntryItem tenha ID antes do rebuild
            await self.db.flush()

            # Rebuild inventário via FIFO (fonte da verdade = entry_items)
            # Substitui qualquer manipulação direta de Inventory.quantity
            inv_sync = InventoryService(self.db)
            try:
                delta = await inv_sync.rebuild_product_from_fifo(new_product.id, tenant_id=tenant_id)
                # Garantir min_stock correto após rebuild
                inventory = await self.inventory_repo.get_by_product(new_product.id, tenant_id=tenant_id)
                if inventory and inventory.min_stock != 5:
                    inventory.min_stock = 5
                logger.info(
                    f" [activate_catalog] Inventory sincronizado via FIFO - "
                    f"produto={new_product.id} fifo_sum={delta['fifo_sum']} "
                    f"created={delta['created']} updated={delta['updated']}"
                )
            except Exception as sync_err:
                logger.error(f"Erro ao sincronizar inventory via FIFO para produto {new_product.id}: {sync_err}")

            await self.db.commit()
            await self.db.refresh(new_product)
            await self.db.refresh(stock_entry)

        return new_product

    async def get_products_status(
        self,
        *,
        tenant_id: int,
        include_catalog: bool = False,
    ) -> List[ProductStatusResponse]:
        """Retorna status de estoque para produtos do tenant.

        Flags:
        - in_stock: possui estoque atual (>0)
        - depleted: já teve entrada mas estoque atual == 0
        - never_stocked: nunca teve entrada (sem EntryItems)
        """
        # Seleciona produtos do tenant
        from sqlalchemy import select, and_

        stmt = select(Product).where(
            and_(
                Product.tenant_id == tenant_id,
                Product.is_active == True,
            )
        )
        if not include_catalog:
            stmt = stmt.where(Product.is_catalog == False)

        result = await self.db.execute(stmt)
        products = list(result.scalars().all())

        statuses: List[ProductStatusResponse] = []
        for p in products:
            inv = await self.inventory_repo.get_by_product(p.id, tenant_id=tenant_id)
            stock = int(inv.quantity) if inv else 0
            entries_count = await self.entry_item_repo.count_by_product(self.db, p.id, tenant_id=tenant_id)
            has_entries = entries_count > 0
            statuses.append(
                ProductStatusResponse(
                    product_id=p.id,
                    name=p.name,
                    sku=p.sku,
                    current_stock=stock,
                    in_stock=stock > 0,
                    depleted=(has_entries and stock == 0),
                    never_stocked=(not has_entries),
                )
            )

        return statuses
