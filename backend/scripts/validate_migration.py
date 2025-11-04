"""
Script de validação: Verifica integridade da migração Batch → StockEntry

Compara dados originais dos batches com os dados migrados para garantir
que a migração foi executada corretamente.

Executar com: python scripts/validate_migration.py
"""

import sys
import asyncio
from pathlib import Path
from decimal import Decimal
from typing import Dict, List

# Adicionar o diretório raiz ao path
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import async_session_maker, engine
from app.models import Batch, Product, StockEntry, EntryItem


class ValidationReport:
    """Relatório de validação da migração"""
    
    def __init__(self):
        self.total_batches = 0
        self.migrated_entries = 0
        self.matched = 0
        self.mismatched = 0
        self.issues = []
        self.warnings = []
    
    def add_issue(self, message: str):
        """Adiciona problema encontrado"""
        self.issues.append(message)
        print(f"  ❌ {message}")
    
    def add_warning(self, message: str):
        """Adiciona aviso"""
        self.warnings.append(message)
        print(f"  ⚠️  {message}")
    
    def add_match(self, message: str):
        """Adiciona correspondência válida"""
        self.matched += 1
        print(f"  ✓ {message}")
    
    def print_summary(self):
        """Imprime resumo da validação"""
        print("\n" + "="*70)
        print("📊 RESUMO DA VALIDAÇÃO")
        print("="*70)
        print(f"Total de Batches: {self.total_batches}")
        print(f"StockEntries encontrados: {self.migrated_entries}")
        print(f"Correspondências válidas: {self.matched}")
        print(f"Problemas encontrados: {len(self.issues)}")
        print(f"Avisos: {len(self.warnings)}")
        print("="*70)
        
        if self.issues:
            print("\n❌ PROBLEMAS ENCONTRADOS:")
            for issue in self.issues:
                print(f"  • {issue}")
        
        if self.warnings:
            print("\n⚠️  AVISOS:")
            for warning in self.warnings:
                print(f"  • {warning}")
        
        if not self.issues:
            print("\n✅ VALIDAÇÃO CONCLUÍDA COM SUCESSO!")
            print("   A migração está correta e pode prosseguir para limpeza.")
        else:
            print("\n❌ VALIDAÇÃO FALHOU!")
            print("   Corrija os problemas antes de executar a limpeza.")


async def validate_batch_entry_mapping(
    batch: Batch,
    stock_entry: StockEntry | None,
    report: ValidationReport
) -> bool:
    """
    Valida se um batch foi corretamente migrado para stock_entry.
    
    Args:
        batch: Batch original
        stock_entry: StockEntry correspondente
        report: Relatório de validação
    
    Returns:
        True se válido, False caso contrário
    """
    batch_code = batch.batch_code
    is_valid = True
    
    if not stock_entry:
        report.add_issue(f"Batch {batch_code} não possui StockEntry correspondente")
        return False
    
    print(f"\n🔍 Validando: {batch_code}")
    
    # Validar campos básicos
    if stock_entry.entry_code != batch.batch_code:
        report.add_issue(
            f"{batch_code}: entry_code não corresponde "
            f"(esperado: {batch.batch_code}, encontrado: {stock_entry.entry_code})"
        )
        is_valid = False
    else:
        report.add_match(f"entry_code: {stock_entry.entry_code}")
    
    if stock_entry.entry_date != batch.purchase_date:
        report.add_issue(
            f"{batch_code}: entry_date não corresponde "
            f"(esperado: {batch.purchase_date}, encontrado: {stock_entry.entry_date})"
        )
        is_valid = False
    else:
        report.add_match(f"entry_date: {stock_entry.entry_date}")
    
    if stock_entry.supplier_name != batch.supplier_name:
        report.add_warning(
            f"{batch_code}: supplier_name diferente "
            f"(batch: {batch.supplier_name}, entry: {stock_entry.supplier_name})"
        )
    
    # Validar custo total (com tolerância de R$ 0.01)
    cost_diff = abs((stock_entry.total_cost or 0) - (batch.total_cost or 0))
    if cost_diff > 0.01:
        report.add_warning(
            f"{batch_code}: total_cost diferente "
            f"(batch: R$ {batch.total_cost:.2f}, entry: R$ {stock_entry.total_cost:.2f}, "
            f"diferença: R$ {cost_diff:.2f})"
        )
    else:
        report.add_match(f"total_cost: R$ {stock_entry.total_cost:.2f}")
    
    return is_valid


async def validate_entry_items(
    session,
    batch: Batch,
    stock_entry: StockEntry,
    report: ValidationReport
) -> bool:
    """
    Valida se os produtos do batch foram corretamente migrados para entry_items.
    
    Args:
        session: Sessão do banco
        batch: Batch original
        stock_entry: StockEntry correspondente
        report: Relatório de validação
    
    Returns:
        True se válido, False caso contrário
    """
    batch_code = batch.batch_code
    is_valid = True
    
    # Buscar produtos do batch
    result = await session.execute(
        select(Product)
        .where(Product.batch_id == batch.id)
        .where(Product.is_active == True)
    )
    products = result.scalars().all()
    
    # Buscar entry_items do stock_entry
    result = await session.execute(
        select(EntryItem)
        .where(EntryItem.stock_entry_id == stock_entry.id)
        .where(EntryItem.is_active == True)
    )
    entry_items = result.scalars().all()
    
    # Comparar contagens
    product_count = len(products)
    item_count = len(entry_items)
    
    if product_count != item_count:
        report.add_warning(
            f"{batch_code}: Quantidade de itens diferente "
            f"(produtos no batch: {product_count}, entry_items: {item_count})"
        )
    
    # Criar mapa de entry_items por product_id
    items_by_product: Dict[int, EntryItem] = {
        item.product_id: item for item in entry_items
    }
    
    # Validar cada produto
    for product in products:
        entry_item = items_by_product.get(product.id)
        
        if not entry_item:
            report.add_issue(
                f"{batch_code}: Produto {product.sku} ({product.id}) não possui EntryItem"
            )
            is_valid = False
            continue
        
        # Validar quantity_received
        expected_received = product.initial_quantity or 0
        if entry_item.quantity_received != expected_received:
            report.add_issue(
                f"{batch_code}/{product.sku}: quantity_received incorreto "
                f"(esperado: {expected_received}, encontrado: {entry_item.quantity_received})"
            )
            is_valid = False
        
        # Validar unit_cost
        expected_cost = float(product.cost_price) if product.cost_price else 0.0
        if abs(entry_item.unit_cost - expected_cost) > 0.01:
            report.add_warning(
                f"{batch_code}/{product.sku}: unit_cost diferente "
                f"(produto: R$ {expected_cost:.2f}, entry_item: R$ {entry_item.unit_cost:.2f})"
            )
    
    if is_valid:
        report.add_match(f"Todos os {item_count} itens validados")
    
    return is_valid


async def validate_migration():
    """
    Função principal de validação.
    Compara todos os batches com seus stock_entries correspondentes.
    """
    report = ValidationReport()
    
    print("\n" + "="*70)
    print("🔍 VALIDAÇÃO DA MIGRAÇÃO BATCH → STOCK ENTRY")
    print("="*70)
    
    async with async_session_maker() as session:
        # Buscar todos os batches
        result = await session.execute(
            select(Batch)
            .where(Batch.is_active == True)
            .options(selectinload(Batch.products))
        )
        batches = result.scalars().all()
        report.total_batches = len(batches)
        
        print(f"\n📦 Encontrados {report.total_batches} batches para validar\n")
        
        # Buscar todos os stock_entries
        result = await session.execute(
            select(StockEntry)
            .where(StockEntry.is_active == True)
        )
        stock_entries = result.scalars().all()
        report.migrated_entries = len(stock_entries)
        
        # Criar mapa de stock_entries por entry_code
        entries_by_code = {entry.entry_code: entry for entry in stock_entries}
        
        # Validar cada batch
        for batch in batches:
            stock_entry = entries_by_code.get(batch.batch_code)
            
            # Validar mapeamento batch → entry
            batch_valid = await validate_batch_entry_mapping(batch, stock_entry, report)
            
            # Validar itens
            if stock_entry:
                items_valid = await validate_entry_items(
                    session, batch, stock_entry, report
                )
                
                if batch_valid and items_valid:
                    report.matched += 1
                else:
                    report.mismatched += 1
    
    # Exibir resumo
    report.print_summary()
    
    return len(report.issues) == 0


async def main():
    """Entry point do script"""
    try:
        success = await validate_migration()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Validação cancelada pelo usuário.")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Erro fatal: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
