"""
DEPRECATED MODULE: app.models.batch

Este módulo foi descontinuado e substituído por StockEntry/EntryItem.
Foi mantido apenas para compatibilidade temporária caso ainda haja importações
residuais. Qualquer tentativa de importar este módulo em runtime levantará um
erro explícito para orientar a migração.
"""

raise RuntimeError(
    "app.models.batch foi descontinuado. Use app.models.stock_entry e app.models.entry_item."
)