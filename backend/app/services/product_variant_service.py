"""
Serviço de gerenciamento de variantes de produto.
"""
from typing import List, Optional
from decimal import Decimal
import logging
import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.repositories.product_variant_repository import ProductVariantRepository
from app.repositories.product_repository import ProductRepository
from app.schemas.product_variant import (
    ProductVariantCreate,
    ProductVariantUpdate,
    ProductWithVariantsCreate,
    BulkVariantCreate,
)

logger = logging.getLogger(__name__)


class ProductVariantService:
    """
    Serviço para operações de negócio com variantes de produto.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.variant_repo = ProductVariantRepository()
        self.product_repo = ProductRepository(db)
        self.sku_service = None  # Inicializado lazy
    
    async def create_variant(
        self,
        product_id: int,
        variant_data: ProductVariantCreate,
        tenant_id: int
    ) -> ProductVariant:
        """
        Cria uma nova variante para um produto existente.
        
        Args:
            product_id: ID do produto pai
            variant_data: Dados da variante
            tenant_id: ID do tenant
            
        Returns:
            ProductVariant criada
            
        Raises:
            ValueError: Se produto não encontrado ou SKU duplicado
        """
        # Verificar se produto existe
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")
        
        # SKU repetido (cadastro simultâneo, lista desatualizada no app) recebe o próximo número livre
        from app.services import sku_service
        variant_data.sku = (await sku_service.resolve_free_skus(self.db, [variant_data.sku], tenant_id))[0]
        
        # Verificar se já existe variante com mesmo tamanho/cor
        existing = await self.variant_repo.get_by_size_color(
            self.db, product_id, variant_data.size, variant_data.color, tenant_id
        )
        if existing:
            raise ValueError(
                f"Já existe variante com tamanho={variant_data.size} e cor={variant_data.color}"
            )
        
        # Criar variante
        variant = await self.variant_repo.create_variant(
            self.db,
            product_id=product_id,
            sku=variant_data.sku,
            price=float(variant_data.price),
            tenant_id=tenant_id,
            size=variant_data.size,
            color=variant_data.color,
            cost_price=float(variant_data.cost_price) if variant_data.cost_price else None,
            image_url=variant_data.image_url,
        )
        
        await self.db.commit()
        await self.db.refresh(variant)
        
        logger.info(f"Variante criada: {variant.sku} (produto {product_id})")
        return variant
    
    async def create_product_with_variants(
        self,
        data: ProductWithVariantsCreate,
        tenant_id: int,
        user_id: int
    ) -> Product:
        """
        Cria um produto com múltiplas variantes de uma vez.
        
        Args:
            data: Dados do produto e variantes
            tenant_id: ID do tenant
            user_id: ID do usuário
            
        Returns:
            Product criado com variantes
        """
        # Dois cadastros da mesma loja ao mesmo tempo esperam um ao outro (SKU não repete)
        from app.services import sku_service
        await sku_service.lock_catalog(self.db, tenant_id)

        # Criar produto pai
        product_dict = data.model_dump(exclude={'variants'})
        
        # Usar preço da primeira variante como base_price se não informado
        if not product_dict.get('base_price') and data.variants:
            product_dict['base_price'] = data.variants[0].price
        
        product = await self.product_repo.create(product_dict, tenant_id=tenant_id)
        logger.info(f"Produto pai criado: {product.name} (ID: {product.id})")
        
        # Criar variantes
        for variant_data in data.variants:
            # Verificar SKU único
            if await self.variant_repo.exists_by_sku(self.db, variant_data.sku, tenant_id):
                # Gerar SKU único
                variant_data.sku = await self._generate_unique_sku(
                    product, variant_data.size, variant_data.color, tenant_id
                )
            
            variant = await self.variant_repo.create_variant(
                self.db,
                product_id=product.id,
                sku=variant_data.sku,
                price=float(variant_data.price),
                tenant_id=tenant_id,
                size=variant_data.size,
                color=variant_data.color,
                cost_price=float(variant_data.cost_price) if variant_data.cost_price else None,
                image_url=variant_data.image_url,
            )
            logger.info(f"Variante criada: {variant.sku}")
        
        await self.db.commit()
        await self.db.refresh(product)
        
        return product
    
    async def create_bulk_variants(
        self,
        data: BulkVariantCreate,
        tenant_id: int
    ) -> List[ProductVariant]:
        """
        Cria múltiplas variantes a partir de listas de tamanhos e cores.
        
        Gera uma variante para cada combinação de tamanho × cor.
        
        Args:
            data: Dados para criação em massa
            tenant_id: ID do tenant
            
        Returns:
            Lista de variantes criadas
        """
        # Verificar se produto existe
        product = await self.product_repo.get(self.db, data.product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {data.product_id} não encontrado")
        
        variants = []
        
        for color in data.colors:
            for size in data.sizes:
                # Verificar se já existe
                existing = await self.variant_repo.get_by_size_color(
                    self.db, data.product_id, size, color, tenant_id
                )
                if existing:
                    logger.warning(f"Variante já existe: {size}/{color}, pulando...")
                    continue
                
                # Gerar SKU
                sku = await self._generate_unique_sku(product, size, color, tenant_id, data.sku_prefix)
                
                # Calcular preço com ajustes
                price = data.base_price
                if data.price_adjustments:
                    if size in data.price_adjustments:
                        price += data.price_adjustments[size]
                    if color in data.price_adjustments:
                        price += data.price_adjustments[color]
                
                # Criar variante
                variant = await self.variant_repo.create_variant(
                    self.db,
                    product_id=data.product_id,
                    sku=sku,
                    price=float(price),
                    tenant_id=tenant_id,
                    size=size,
                    color=color,
                )
                variants.append(variant)
                logger.info(f"Variante criada: {sku} ({color} · {size})")
        
        await self.db.commit()
        return variants
    
    async def update_variant(
        self,
        variant_id: int,
        variant_data: ProductVariantUpdate,
        tenant_id: int
    ) -> ProductVariant:
        """
        Atualiza uma variante existente.
        
        Args:
            variant_id: ID da variante
            variant_data: Dados para atualização
            tenant_id: ID do tenant
            
        Returns:
            ProductVariant atualizada
        """
        variant = await self.variant_repo.get(self.db, variant_id, tenant_id=tenant_id)
        if not variant:
            raise ValueError(f"Variante {variant_id} não encontrada")
        
        # Verificar SKU único se estiver sendo alterado
        if variant_data.sku and variant_data.sku != variant.sku:
            if await self.variant_repo.exists_by_sku(
                self.db, variant_data.sku, tenant_id, exclude_id=variant_id
            ):
                raise ValueError(f"SKU {variant_data.sku} já existe")
        
        # Verificar tamanho/cor únicos se estiver sendo alterado
        new_size = variant_data.size if variant_data.size is not None else variant.size
        new_color = variant_data.color if variant_data.color is not None else variant.color
        
        if new_size != variant.size or new_color != variant.color:
            existing = await self.variant_repo.get_by_size_color(
                self.db, variant.product_id, new_size, new_color, tenant_id
            )
            if existing and existing.id != variant_id:
                raise ValueError(
                    f"Já existe variante com tamanho={new_size} e cor={new_color}"
                )
        
        # Atualizar
        update_dict = variant_data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(variant, key, value)
        
        await self.db.commit()
        await self.db.refresh(variant)
        
        logger.info(f"Variante atualizada: {variant.sku}")
        return variant
    
    async def update_variants_bulk(self, product_id: int, items, tenant_id: int) -> List[int]:
        """Grava as alterações de várias variações do MESMO produto numa transação só (tudo ou nada).

        A conferência de tamanho x cor e de SKU é feita no estado FINAL de todas as variações do produto,
        então trocar tamanhos entre duas variações funciona; qualquer conflito recusa tudo antes de gravar.
        (05/11/2026: salvar uma por uma deixou o Macaquinho Tipo Lupo pela metade quando a 3ª deu conflito.)
        """
        from sqlalchemy import select, func as sa_func

        rows = (await self.db.execute(select(ProductVariant).where(
            ProductVariant.product_id == product_id, ProductVariant.tenant_id == tenant_id,
        ))).scalars().all()
        by_id = {v.id: v for v in rows}
        seen = set()
        for it in items:
            if it.id not in by_id or not by_id[it.id].is_active:
                raise ValueError("Variação não encontrada neste produto.")
            if it.id in seen:
                raise ValueError("A mesma variação veio duas vezes.")
            seen.add(it.id)
        merges = {it.id: it.merge_into for it in items if it.merge_into}
        changes = {it.id: it.model_dump(exclude_unset=True, exclude={"id", "merge_into"})
                   for it in items if not it.merge_into}
        for src, dst in merges.items():
            if dst == src or dst not in by_id or not by_id[dst].is_active or dst in merges:
                raise ValueError("Não dá para juntar: a variação de destino não é válida.")

        def label(v, size, color):
            code = f" ({v.display_code})" if getattr(v, "display_code", None) else ""
            return f"{color or 'sem cor'} · {size or 'ÚNICO'}{code}"

        # estado final de tamanho x cor (inclui variações excluídas: a restrição do banco vale para elas também)
        final = {}
        for v in rows:
            if v.id in merges:
                continue   # vai ser desativada: não conta como repetida
            ch = changes.get(v.id, {})
            final[v.id] = (ch.get("size", v.size), ch.get("color", v.color))
        taken = {}
        for vid, (size, color) in final.items():
            key = ((size or "").upper(), (color or "").upper())
            if key in taken:
                a, b = by_id[taken[key]], by_id[vid]
                if not a.is_active or not b.is_active:
                    raise ValueError(f"{color or 'Sem cor'} · {size or 'ÚNICO'} já foi usada numa variação excluída deste produto. Escolha outro tamanho ou cor.")
                raise ValueError(f"Duas variações ficariam iguais: {label(a, size, color)} e {label(b, size, color)}. "
                                 f"Mude o tamanho ou a cor de uma delas.")
            taken[key] = vid

        # SKU: único na loja, conferido no estado final
        new_skus = {vid: ch["sku"].strip().upper() for vid, ch in changes.items() if ch.get("sku")}
        if len(set(new_skus.values())) != len(new_skus):
            raise ValueError("Duas variações ficariam com o mesmo SKU.")
        for vid, sku in new_skus.items():
            if sku == (by_id[vid].sku or "").upper():
                continue
            other = (await self.db.execute(select(ProductVariant.id).where(
                ProductVariant.tenant_id == tenant_id, sa_func.upper(ProductVariant.sku) == sku,
                ProductVariant.id.notin_(list(new_skus.keys())),
            ))).first()
            if other:
                raise ValueError(f"O SKU {sku} já existe em outra peça da loja.")

        if merges:
            from app.models.conditional_shipment import ConditionalShipment, ConditionalShipmentItem
            from app.models.entry_item import EntryItem
            from app.services.stock_lock import lock_stock
            from sqlalchemy import update as sa_update
            await lock_stock(self.db, variant_ids=list(merges) + list(merges.values()))
            aberto = (await self.db.execute(
                select(ConditionalShipmentItem.id)
                .join(ConditionalShipment, ConditionalShipment.id == ConditionalShipmentItem.shipment_id)
                .where(ConditionalShipmentItem.variant_id.in_(list(merges)),
                       ConditionalShipment.status.in_(["PENDING", "SENT", "OVERDUE"]))
            )).first()
            if aberto:
                raise ValueError("Esta variação está num envio condicional em aberto. Feche o envio antes de juntar.")

        try:
            # juntar: as entradas da variação repetida passam para a outra (custo, data e entrada de cada peça
            # ficam iguais, o FIFO continua o mesmo); a repetida é desativada e o SKU dela é liberado
            for src, dst in merges.items():
                await self.db.execute(sa_update(EntryItem).where(EntryItem.variant_id == src).values(variant_id=dst))
                v = by_id[src]
                v.is_active = False
                if not (v.sku or "").endswith(f"_del_{src}"):
                    v.sku = f"{v.sku}_del_{src}"
            # 1ª passada: tira do caminho tamanho e SKU de quem muda (troca entre variações não bate na restrição)
            for vid, ch in changes.items():
                v = by_id[vid]
                if "size" in ch or "color" in ch:
                    v.size = f"~{vid}"[:20]
                if vid in new_skus and new_skus[vid] != (v.sku or "").upper():
                    v.sku = f"~TMP{vid}"
            await self.db.flush()
            for vid, ch in changes.items():
                v = by_id[vid]
                v.size = final[vid][0]
                v.color = final[vid][1]
                for key, value in ch.items():
                    if key in ("size", "color"):
                        continue
                    setattr(v, key, value.strip().upper() if key == "sku" and isinstance(value, str) else value)
            await self.db.flush()
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        logger.info("Variações do produto %s atualizadas em lote: %s; juntadas: %s", product_id, list(changes), merges)
        return list(changes) + list(merges)

    async def get_variant(
        self,
        variant_id: int,
        tenant_id: int
    ) -> Optional[ProductVariant]:
        """Busca uma variante por ID."""
        return await self.variant_repo.get_with_stock(self.db, variant_id, tenant_id)
    
    async def get_variant_by_sku(
        self,
        sku: str,
        tenant_id: int
    ) -> Optional[ProductVariant]:
        """Busca uma variante por SKU."""
        return await self.variant_repo.get_by_sku(self.db, sku, tenant_id)
    
    async def get_variant_by_short_code(self, code: str, tenant_id: int) -> Optional[ProductVariant]:
        """Busca pelo código da etiqueta: aceita 'PV#0123' (QR), '#0123', '0123' ou '123'."""
        from app.services.short_code_service import parse_short_code, parse_variant_code
        pair = parse_variant_code(code)
        if pair is not None:
            return await self.variant_repo.get_by_variant_code(self.db, pair[0], pair[1], tenant_id)
        n = parse_short_code(code)
        if n is None:
            return None
        return await self.variant_repo.get_by_short_code(self.db, n, tenant_id)

    async def get_product_variants(
        self,
        product_id: int,
        tenant_id: int
    ) -> List[ProductVariant]:
        """Busca todas as variantes de um produto."""
        return await self.variant_repo.get_by_product(self.db, product_id, tenant_id)
    
    async def search_variants(
        self,
        query: str,
        tenant_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[ProductVariant]:
        """Busca variantes por termo."""
        return await self.variant_repo.search(self.db, query, tenant_id, skip, limit)
    
    async def delete_variant(
        self,
        variant_id: int,
        tenant_id: int,
        *,
        zero_stock: bool = False,
        user_id: int | None = None,
    ) -> bool:
        """
        Desativa uma variante (soft delete).

        Com estoque, só com zero_stock=True: as peças restantes saem por baixa FIFO com motivo 'ajuste' (a mesma da
        conferência: movimento de estoque registrado, histórico de entradas e vendas continua). Sem isso, recusa.
        """
        variant = await self.variant_repo.get_with_stock(self.db, variant_id, tenant_id)
        if not variant:
            raise ValueError(f"Variante {variant_id} não encontrada")
        
        # Verificar estoque
        current_stock = variant.get_current_stock()
        if current_stock > 0 and zero_stock:
            from app.services.stock_writeoff_service import StockWriteoffService
            await StockWriteoffService(self.db).write_off(
                tenant_id=tenant_id, user_id=user_id, reason="ajuste", note=f"variação {variant.sku} excluída",
                merged={variant_id: current_stock}, label="Baixa ao excluir variação", ledger_reason="variacao_excluida",
            )
            logger.info(f"Variante {variant_id}: baixa FIFO de {current_stock} peça(s) para excluir")
        elif current_stock > 0:
            raise ValueError(
                f"Não é possível desativar variante com estoque "
                f"(quantidade atual: {current_stock})"
            )
        
        await self.variant_repo.deactivate_variant(self.db, variant_id, tenant_id)
        await self.db.commit()
        
        logger.info(f"Variante desativada: {variant.sku}")
        return True
    
    def _get_sku_service(self):
        """Obtém o serviço de geração de SKU (lazy initialization)."""
        if self.sku_service is None:
            from app.services.sku_generator_service import SKUGeneratorService
            self.sku_service = SKUGeneratorService(self.db)
        return self.sku_service

    async def _generate_unique_sku(
        self,
        product: Product,
        size: Optional[str],
        color: Optional[str],
        tenant_id: int,
        prefix: Optional[str] = None
    ) -> str:
        """Gera um SKU único para a variante usando o serviço de geração."""
        sku_service = self._get_sku_service()
        return await sku_service.generate_unique_sku(
            name=product.name,
            brand=prefix or product.brand,
            color=color,
            size=size,
            tenant_id=tenant_id
        )
