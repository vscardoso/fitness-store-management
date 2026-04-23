"""add supplier catalog

Revision ID: 7aae58f87c66
Revises: 383b8e522701
Create Date: 2026-04-06 15:25:11.906858

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7aae58f87c66'
down_revision: Union[str, None] = '383b8e522701'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    from sqlalchemy import inspect as sa_inspect, text
    inspector = sa_inspect(bind)
    existing_tables = inspector.get_table_names()

    # ── Tabela de fornecedores ──────────────────────────────────────────────────
    if 'suppliers' not in existing_tables:
        op.create_table(
            'suppliers',
            # Sem index=True nas colunas — índices criados explicitamente abaixo
            sa.Column('id', sa.Integer(), primary_key=True, comment='Primary key'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, comment='Record creation timestamp'),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, comment='Record last update timestamp'),
            sa.Column('is_active', sa.Boolean(), nullable=False, default=True, comment='Soft delete flag'),
            sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('stores.id', ondelete='RESTRICT'), nullable=True, comment='Tenant/Store identifier'),
            sa.Column('name', sa.String(255), nullable=False, comment='Nome do fornecedor'),
            sa.Column('cnpj', sa.String(18), nullable=True, comment='CNPJ do fornecedor'),
            sa.Column('phone', sa.String(20), nullable=True, comment='Telefone de contato'),
            sa.Column('email', sa.String(255), nullable=True, comment='E-mail de contato'),
            sa.Column('notes', sa.Text(), nullable=True, comment='Observações livres'),
        )

    # Índices idempotentes (IF NOT EXISTS evita falha em re-execução)
    bind.execute(text("CREATE INDEX IF NOT EXISTS ix_suppliers_id ON suppliers (id)"))
    bind.execute(text("CREATE INDEX IF NOT EXISTS ix_suppliers_name ON suppliers (name)"))
    bind.execute(text("CREATE INDEX IF NOT EXISTS ix_suppliers_tenant_id ON suppliers (tenant_id)"))

    # ── Tabela pivot fornecedor x produto ──────────────────────────────────────
    if 'supplier_products' not in existing_tables:
        op.create_table(
            'supplier_products',
            sa.Column('id', sa.Integer(), primary_key=True, comment='Primary key'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, comment='Record creation timestamp'),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, comment='Record last update timestamp'),
            sa.Column('is_active', sa.Boolean(), nullable=False, default=True, comment='Soft delete flag'),
            sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('stores.id', ondelete='RESTRICT'), nullable=True, comment='Tenant/Store identifier'),
            sa.Column('supplier_id', sa.Integer(), sa.ForeignKey('suppliers.id', ondelete='CASCADE'), nullable=False, comment='Fornecedor'),
            sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id', ondelete='CASCADE'), nullable=False, comment='Produto'),
            sa.Column('last_unit_cost', sa.Numeric(10, 2), nullable=False, comment='Ultimo custo unitario pago'),
            sa.Column('purchase_count', sa.Integer(), nullable=False, default=1, comment='Numero de compras'),
            sa.Column('last_purchase_date', sa.Date(), nullable=False, comment='Data da ultima compra'),
            sa.UniqueConstraint('supplier_id', 'product_id', 'tenant_id', name='uq_supplier_product_tenant'),
        )

    bind.execute(text("CREATE INDEX IF NOT EXISTS ix_supplier_products_id ON supplier_products (id)"))
    bind.execute(text("CREATE INDEX IF NOT EXISTS ix_supplier_products_supplier_id ON supplier_products (supplier_id)"))
    bind.execute(text("CREATE INDEX IF NOT EXISTS ix_supplier_products_product_id ON supplier_products (product_id)"))
    bind.execute(text("CREATE INDEX IF NOT EXISTS ix_supplier_products_tenant_id ON supplier_products (tenant_id)"))

    # ── Coluna supplier_id em entry_items ──────────────────────────────────────
    entry_cols = [c['name'] for c in inspector.get_columns('entry_items')]
    if 'supplier_id' not in entry_cols:
        with op.batch_alter_table('entry_items') as batch_op:
            batch_op.add_column(
                sa.Column(
                    'supplier_id',
                    sa.Integer(),
                    nullable=True,
                    comment='Fornecedor deste item (FK para suppliers)',
                )
            )
            batch_op.create_index('ix_entry_items_supplier_id', ['supplier_id'], unique=False)
            batch_op.create_foreign_key(
                'fk_entry_items_supplier_id',
                'suppliers',
                ['supplier_id'],
                ['id'],
                ondelete='SET NULL',
            )


def downgrade() -> None:
    with op.batch_alter_table('entry_items') as batch_op:
        batch_op.drop_constraint('fk_entry_items_supplier_id', type_='foreignkey')
        batch_op.drop_index('ix_entry_items_supplier_id')
        batch_op.drop_column('supplier_id')

    op.drop_index('ix_supplier_products_tenant_id', table_name='supplier_products')
    op.drop_index('ix_supplier_products_product_id', table_name='supplier_products')
    op.drop_index('ix_supplier_products_supplier_id', table_name='supplier_products')
    op.drop_index('ix_supplier_products_id', table_name='supplier_products')
    op.drop_table('supplier_products')

    op.drop_index('ix_suppliers_tenant_id', table_name='suppliers')
    op.drop_index('ix_suppliers_name', table_name='suppliers')
    op.drop_index('ix_suppliers_id', table_name='suppliers')
    op.drop_table('suppliers')
