"""add product variants system

Revision ID: add_product_variants
Revises: 
Create Date: 2026-02-19 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision = 'add_product_variants'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create product_variants table and add variant_id to related tables."""
    
    # 1. Criar tabela product_variants
    op.create_table(
        'product_variants',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('sku', sa.String(50), nullable=False),
        sa.Column('size', sa.String(20), nullable=True),
        sa.Column('color', sa.String(50), nullable=True),
        sa.Column('price', sa.Numeric(10, 2), nullable=False),
        sa.Column('cost_price', sa.Numeric(10, 2), nullable=True),
        sa.Column('image_url', sa.String(500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    
    # Índices para product_variants
    op.create_index('ix_product_variants_sku', 'product_variants', ['sku'])
    op.create_index('ix_product_variants_product_id', 'product_variants', ['product_id'])
    op.create_index('ix_product_variants_tenant_id', 'product_variants', ['tenant_id'])
    
    # Constraints únicas para product_variants
    op.create_unique_constraint('uq_variant_product_size_color', 'product_variants', ['product_id', 'size', 'color'])
    op.create_unique_constraint('uq_variants_tenant_sku', 'product_variants', ['tenant_id', 'sku'])
    
    # 2. Adicionar coluna variant_id em entry_items
    op.add_column('entry_items', sa.Column('variant_id', sa.Integer(), nullable=True))
    op.create_index('ix_entry_items_variant_id', 'entry_items', ['variant_id'])
    op.create_foreign_key('fk_entry_items_variant_id', 'entry_items', 'product_variants', ['variant_id'], ['id'], ondelete='RESTRICT')
    
    # 3. Adicionar coluna variant_id em inventory
    op.add_column('inventory', sa.Column('variant_id', sa.Integer(), nullable=True))
    op.create_index('ix_inventory_variant_id', 'inventory', ['variant_id'])
    op.create_foreign_key('fk_inventory_variant_id', 'inventory', 'product_variants', ['variant_id'], ['id'], ondelete='CASCADE')
    
    # 4. Adicionar coluna variant_id em sale_items
    op.add_column('sale_items', sa.Column('variant_id', sa.Integer(), nullable=True))
    op.create_index('ix_sale_items_variant_id', 'sale_items', ['variant_id'])
    op.create_foreign_key('fk_sale_items_variant_id', 'sale_items', 'product_variants', ['variant_id'], ['id'], ondelete='RESTRICT')
    
    # 5. Adicionar coluna variant_id em return_items
    op.add_column('return_items', sa.Column('variant_id', sa.Integer(), nullable=True))
    op.create_index('ix_return_items_variant_id', 'return_items', ['variant_id'])
    op.create_foreign_key('fk_return_items_variant_id', 'return_items', 'product_variants', ['variant_id'], ['id'], ondelete='RESTRICT')
    
    # 6. Adicionar coluna base_price em products (novo campo)
    op.add_column('products', sa.Column('base_price', sa.Numeric(10, 2), nullable=True))
    
    # 7. Tornar product_id nullable nas tabelas relacionadas (compatibilidade durante migração)
    # SQLite não suporta ALTER COLUMN, então usamos batch operations
    with op.batch_alter_table('entry_items') as batch_op:
        batch_op.alter_column('product_id', nullable=True)
    
    with op.batch_alter_table('inventory') as batch_op:
        batch_op.alter_column('product_id', nullable=True)
    
    with op.batch_alter_table('sale_items') as batch_op:
        batch_op.alter_column('product_id', nullable=True)
    
    with op.batch_alter_table('return_items') as batch_op:
        batch_op.alter_column('product_id', nullable=True)
    
    # 8. Remover constraints únicas antigas de products (sku e barcode)
    # Nota: SQLite pode ter nomes diferentes para constraints
    try:
        with op.batch_alter_table('products') as batch_op:
            batch_op.drop_constraint('uq_products_tenant_sku', type_='unique')
    except:
        pass
    
    try:
        with op.batch_alter_table('products') as batch_op:
            batch_op.drop_constraint('uq_products_tenant_barcode', type_='unique')
    except:
        pass
    
    # 9. Remover índices antigos de barcode (não mais necessário)
    try:
        op.drop_index('ix_products_barcode', table_name='products')
    except:
        pass


def downgrade() -> None:
    """Remove product_variants table and variant_id from related tables."""
    
    # 1. Remover foreign keys e índices de variant_id
    op.drop_constraint('fk_return_items_variant_id', 'return_items', type_='foreignkey')
    op.drop_index('ix_return_items_variant_id', table_name='return_items')
    op.drop_column('return_items', 'variant_id')
    
    op.drop_constraint('fk_sale_items_variant_id', 'sale_items', type_='foreignkey')
    op.drop_index('ix_sale_items_variant_id', table_name='sale_items')
    op.drop_column('sale_items', 'variant_id')
    
    op.drop_constraint('fk_inventory_variant_id', 'inventory', type_='foreignkey')
    op.drop_index('ix_inventory_variant_id', table_name='inventory')
    op.drop_column('inventory', 'variant_id')
    
    op.drop_constraint('fk_entry_items_variant_id', 'entry_items', type_='foreignkey')
    op.drop_index('ix_entry_items_variant_id', table_name='entry_items')
    op.drop_column('entry_items', 'variant_id')
    
    # 2. Remover coluna base_price de products
    op.drop_column('products', 'base_price')
    
    # 3. Restaurar product_id como NOT NULL
    with op.batch_alter_table('entry_items') as batch_op:
        batch_op.alter_column('product_id', nullable=False)
    
    with op.batch_alter_table('inventory') as batch_op:
        batch_op.alter_column('product_id', nullable=False)
    
    with op.batch_alter_table('sale_items') as batch_op:
        batch_op.alter_column('product_id', nullable=False)
    
    with op.batch_alter_table('return_items') as batch_op:
        batch_op.alter_column('product_id', nullable=False)
    
    # 4. Restaurar constraints únicas de products
    try:
        with op.batch_alter_table('products') as batch_op:
            batch_op.create_unique_constraint('uq_products_tenant_sku', ['tenant_id', 'sku'])
            batch_op.create_unique_constraint('uq_products_tenant_barcode', ['tenant_id', 'barcode'])
    except:
        pass
    
    # 5. Remover tabela product_variants
    op.drop_index('ix_product_variants_tenant_id', table_name='product_variants')
    op.drop_index('ix_product_variants_product_id', table_name='product_variants')
    op.drop_index('ix_product_variants_sku', table_name='product_variants')
    op.drop_table('product_variants')