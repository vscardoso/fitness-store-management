"""
Script de migração: Batches → StockEntries + EntryItems

Migra dados do sistema antigo de Batches para o novo sistema de Trip/StockEntry.
Preserva todos os dados históricos e mantém batches originais para rollback.

Executar com: python scripts/migrate_batch_to_entry.py
"""

import sys
import asyncio
from pathlib import Path
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Tuple

# Adicionar o diretório raiz ao path
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import async_session_maker, engine
from app.models import Batch, Product, Inventory, StockEntry, EntryItem
from app.models.stock_entry import EntryType


class MigrationLogger:
    """Logger para acompanhar progresso da migração"""
    
    def __init__(self):
        self.start_time = datetime.now()
        self.batches_processed = 0
        self.entries_created = 0
        self.items_created = 0
        self.errors = []
        self.warnings = []
    
    def info(self, message: str):
        """Log informação"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] ℹ️  {message}")
    
    def success(self, message: str):
        """Log sucesso"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] ✅ {message}")
    
    def warning(self, message: str):
        """Log aviso"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] ⚠️  {message}")
        self.warnings.append(message)
    
    def error(self, message: str):
        """Log erro"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] ❌ {message}")
        self.errors.append(message)
    
    def summary(self):
        """Exibe resumo da migração"""
        duration = (datetime.now() - self.start_time).total_seconds()
        print("\n" + "="*70)
        print("📊 RESUMO DA MIGRAÇÃO")
        print("="*70)
        print(f"Duração: {duration:.2f}s")
        print(f"Batches processados: {self.batches_processed}")
        print(f"StockEntries criados: {self.entries_created}")
        print(f"EntryItems criados: {self.items_created}")
        print(f"Avisos: {len(self.warnings)}")
        print(f"Erros: {len(self.errors)}")
        print("="*70)
        
        if self.warnings:
            print("\n⚠️  AVISOS:")
            for warning in self.warnings:
                print(f"  - {warning}")
        
        if self.errors:
            print("\n❌ ERROS:")
            for error in self.errors:
                print(f"  - {error}")


async def check_migration_prerequisites(logger: MigrationLogger) -> bool:
    """
    Verifica se é seguro executar a migração.
    
    Returns:
        True se pode prosseguir, False caso contrário
    """
    logger.info("Verificando pré-requisitos...")
    
    async with async_session_maker() as session:
        # Verificar se já existem stock_entries
        result = await session.execute(select(func.count(StockEntry.id)))
        entry_count = result.scalar()
        
        if entry_count > 0:
            logger.warning(f"Já existem {entry_count} StockEntries no banco. Continuar sobrescreverá dados.")
            response = input("Deseja continuar? (s/n): ").strip().lower()
            if response != 's':
                logger.info("Migração cancelada pelo usuário.")
                return False
        
        # Verificar se existem batches para migrar
        result = await session.execute(
            select(func.count(Batch.id)).where(Batch.is_active == True)
        )
        batch_count = result.scalar()
        
        if batch_count == 0:
            logger.error("Nenhum batch ativo encontrado para migrar.")
            return False
        
        logger.info(f"✓ Encontrados {batch_count} batches para migrar")
        return True


async def get_product_current_quantity(session, product: Product) -> int:
    """
    Obtém quantidade atual do produto no estoque.
    
    Args:
        session: Sessão do banco
        product: Produto para consultar
    
    Returns:
        Quantidade atual em estoque
    """
    if product.inventory:
        return product.inventory.quantity
    
    # Se não tem registro de inventory, buscar
    result = await session.execute(
        select(Inventory)
        .where(Inventory.product_id == product.id)
        .where(Inventory.is_active == True)
    )
    inventory = result.scalar_one_or_none()
    
    return inventory.quantity if inventory else 0


async def migrate_batch_to_entry(
    session,
    batch: Batch,
    logger: MigrationLogger
) -> Tuple[StockEntry | None, List[EntryItem]]:
    """
    Migra um batch para StockEntry + EntryItems.
    
    Args:
        session: Sessão do banco
        batch: Batch a ser migrado
        logger: Logger para registro
    
    Returns:
        Tupla (StockEntry criado, Lista de EntryItems criados)
    """
    try:
        # 1. Criar StockEntry correspondente
        stock_entry = StockEntry(
            entry_code=batch.batch_code,
            entry_date=batch.purchase_date,
            entry_type=EntryType.TRIP,  # Padrão para migração
            supplier_name=batch.supplier_name,
            supplier_cnpj=batch.supplier_cnpj,
            invoice_number=batch.invoice_number,
            notes=batch.notes,
            total_cost=batch.total_cost or 0.0,
            created_at=batch.created_at,
            updated_at=batch.updated_at,
            is_active=batch.is_active
        )
        
        session.add(stock_entry)
        await session.flush()  # Para obter o ID
        
        logger.info(f"  ✓ StockEntry criado: {stock_entry.entry_code}")
        
        # 2. Buscar produtos do batch com relacionamentos
        result = await session.execute(
            select(Product)
            .where(Product.batch_id == batch.id)
            .where(Product.is_active == True)
            .options(selectinload(Product.inventory))
        )
        products = result.scalars().all()
        
        if not products:
            logger.warning(f"  ⚠️  Batch {batch.batch_code} não possui produtos ativos")
            return stock_entry, []
        
        # 3. Criar EntryItems para cada produto
        entry_items = []
        for product in products:
            try:
                # Quantidade recebida = initial_quantity do produto
                quantity_received = product.initial_quantity or 0
                
                # Quantidade restante = estoque atual
                quantity_remaining = await get_product_current_quantity(session, product)
                
                # Custo unitário = cost_price do produto
                unit_cost = float(product.cost_price) if product.cost_price else 0.0
                
                # Validar dados
                if quantity_received <= 0:
                    logger.warning(
                        f"  ⚠️  Produto {product.sku} ({product.name}) tem initial_quantity = {quantity_received}, "
                        f"pulando..."
                    )
                    continue
                
                if quantity_remaining > quantity_received:
                    logger.warning(
                        f"  ⚠️  Produto {product.sku}: quantity_remaining ({quantity_remaining}) > "
                        f"quantity_received ({quantity_received}). Ajustando para {quantity_received}"
                    )
                    quantity_remaining = quantity_received
                
                # Criar EntryItem
                entry_item = EntryItem(
                    stock_entry_id=stock_entry.id,
                    product_id=product.id,
                    quantity_received=quantity_received,
                    quantity_remaining=quantity_remaining,
                    unit_cost=unit_cost,
                    created_at=product.created_at,
                    updated_at=product.updated_at,
                    is_active=product.is_active
                )
                
                session.add(entry_item)
                entry_items.append(entry_item)
                
                logger.info(
                    f"    ✓ EntryItem: {product.sku} - "
                    f"Recebido: {quantity_received}, Restante: {quantity_remaining}, "
                    f"Custo: R$ {unit_cost:.2f}"
                )
                
            except Exception as e:
                logger.error(
                    f"  ❌ Erro ao criar EntryItem para produto {product.id} ({product.sku}): {e}"
                )
                continue
        
        # 4. Atualizar total_cost do StockEntry baseado nos itens
        if entry_items:
            calculated_cost = sum(
                item.quantity_received * item.unit_cost 
                for item in entry_items
            )
            
            # Se o batch tinha um total_cost diferente, logar discrepância
            if batch.total_cost and abs(calculated_cost - batch.total_cost) > 0.01:
                logger.warning(
                    f"  ⚠️  Discrepância de custo no batch {batch.batch_code}: "
                    f"Batch={batch.total_cost:.2f}, Calculado={calculated_cost:.2f}"
                )
            
            stock_entry.total_cost = calculated_cost
        
        await session.flush()
        
        logger.success(
            f"✓ Batch {batch.batch_code} migrado: "
            f"{len(entry_items)} itens, Total: R$ {stock_entry.total_cost:.2f}"
        )
        
        return stock_entry, entry_items
    
    except Exception as e:
        logger.error(f"❌ Erro ao migrar batch {batch.id} ({batch.batch_code}): {e}")
        raise


async def migrate_all_batches():
    """
    Função principal de migração.
    Executa em uma transaction para poder fazer rollback se falhar.
    """
    logger = MigrationLogger()
    
    logger.info("🚀 INICIANDO MIGRAÇÃO BATCH → STOCK ENTRY")
    logger.info("="*70)
    
    # Verificar pré-requisitos
    if not await check_migration_prerequisites(logger):
        return
    
    async with async_session_maker() as session:
        try:
            # Buscar todos os batches ativos
            result = await session.execute(
                select(Batch)
                .where(Batch.is_active == True)
                .options(selectinload(Batch.products))
                .order_by(Batch.purchase_date)
            )
            batches = result.scalars().all()
            
            logger.info(f"\n📦 Processando {len(batches)} batches...\n")
            
            # Migrar cada batch
            for i, batch in enumerate(batches, 1):
                logger.info(f"[{i}/{len(batches)}] Processando batch: {batch.batch_code}")
                
                try:
                    stock_entry, entry_items = await migrate_batch_to_entry(
                        session, batch, logger
                    )
                    
                    logger.batches_processed += 1
                    if stock_entry:
                        logger.entries_created += 1
                    logger.items_created += len(entry_items)
                    
                except Exception as e:
                    logger.error(f"Erro ao processar batch {batch.batch_code}: {e}")
                    # Continua para o próximo batch
                    continue
                
                print()  # Linha em branco entre batches
            
            # Commit da transação
            await session.commit()
            logger.success("\n✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!")
            logger.info("⚠️  Os batches originais foram MANTIDOS para possível rollback.")
            logger.info("💡 Para remover batches após validação, execute: python scripts/cleanup_batches.py")
            
        except Exception as e:
            await session.rollback()
            logger.error(f"\n💥 ERRO CRÍTICO: {e}")
            logger.error("❌ Migração revertida (rollback). Nenhum dado foi alterado.")
            raise
    
    # Exibir resumo
    logger.summary()


async def main():
    """Entry point do script"""
    try:
        await migrate_all_batches()
    except KeyboardInterrupt:
        print("\n\n⚠️  Migração cancelada pelo usuário.")
    except Exception as e:
        print(f"\n💥 Erro fatal: {e}")
        sys.exit(1)
    finally:
        # Fechar conexões
        await engine.dispose()


if __name__ == "__main__":
    print("\n" + "="*70)
    print("🔄 SCRIPT DE MIGRAÇÃO: BATCH → STOCK ENTRY")
    print("="*70)
    print("\n⚠️  ATENÇÃO:")
    print("  • Este script irá criar novos registros de StockEntry e EntryItem")
    print("  • Os batches originais serão MANTIDOS (não deletados)")
    print("  • A migração é executada em uma transação (pode fazer rollback)")
    print("  • Recomenda-se fazer backup antes de executar")
    print("\n" + "="*70 + "\n")
    
    # Confirmar execução
    response = input("Deseja prosseguir com a migração? (s/n): ").strip().lower()
    if response != 's':
        print("\n❌ Migração cancelada pelo usuário.")
        sys.exit(0)
    
    print()
    asyncio.run(main())
