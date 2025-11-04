"""
Scripts utilitários para o Fitness Store Management System

Scripts disponíveis:
- migration_status.py: Verifica status da migração Batch → StockEntry
- migrate_batch_to_entry.py: Executa migração de Batch para StockEntry
- validate_migration.py: Valida integridade da migração
- cleanup_batches.py: Remove batches após migração validada
- seed_db.py: Popula banco com dados de exemplo

Para mais informações, consulte: scripts/README.md
"""

__version__ = "1.0.0"
