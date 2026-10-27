"""Desempenho: índices que faltavam para as listas e a busca (Fase 3 do docs/PLANO_DESEMPENHO.md)

Revision ID: 20261103_indices_desempenho
Revises: 20261102_customer_anonymized

Só índices (nenhum dado muda). `IF NOT EXISTS` deixa rodar de novo sem erro. O trigrama (busca por parte do nome)
depende da extensão pg_trgm: se o banco não deixar criá-la, os índices de trigrama são pulados e o resto segue.
"""
from alembic import op

revision = "20261103_indices_desempenho"
down_revision = "20261102_customer_anonymized"
branch_labels = None
depends_on = None

_INDICES = [
    # estoque mínimo por produto (a lista de produtos busca por product_id; só havia índice por variant_id)
    "CREATE INDEX IF NOT EXISTS ix_inventory_product_tenant ON inventory (product_id, tenant_id)",
    # lista ordenada por nome, por loja, só ativos
    "CREATE INDEX IF NOT EXISTS ix_products_tenant_ativo_nome ON products (tenant_id, is_active, name)",
    # entradas recentes por loja
    "CREATE INDEX IF NOT EXISTS ix_stock_entries_tenant_ativo_data ON stock_entries (tenant_id, is_active, entry_date DESC)",
    # variações ativas de um produto (montagem da lista e do detalhe)
    "CREATE INDEX IF NOT EXISTS ix_product_variants_produto_ativo ON product_variants (product_id, is_active)",
    # itens com saldo (consultas de estoque ignoram o que já zerou)
    "CREATE INDEX IF NOT EXISTS ix_entry_items_com_saldo ON entry_items (variant_id) WHERE is_active AND quantity_remaining > 0",
    "CREATE INDEX IF NOT EXISTS ix_entry_items_produto_ativo ON entry_items (product_id, is_active)",
]

_TRIGRAMA = [
    "CREATE INDEX IF NOT EXISTS ix_products_name_trgm ON products USING gin (name gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS ix_products_brand_trgm ON products USING gin (brand gin_trgm_ops)",
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for sql in _INDICES:
        op.execute(sql)
    # a extensão pode exigir permissão: tenta, e só cria os índices se ela existir
    op.execute("""
        DO $$ BEGIN
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
        EXCEPTION WHEN others THEN
            RAISE NOTICE 'pg_trgm indisponivel, indices de trigrama pulados: %', SQLERRM;
        END $$;
    """)
    existe = bind.exec_driver_sql("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'").first()
    if existe:
        for sql in _TRIGRAMA:
            op.execute(sql)


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for nome in ("ix_products_brand_trgm", "ix_products_name_trgm", "ix_entry_items_produto_ativo", "ix_entry_items_com_saldo",
                 "ix_product_variants_produto_ativo", "ix_stock_entries_tenant_ativo_data", "ix_products_tenant_ativo_nome",
                 "ix_inventory_product_tenant"):
        op.execute(f"DROP INDEX IF EXISTS {nome}")
