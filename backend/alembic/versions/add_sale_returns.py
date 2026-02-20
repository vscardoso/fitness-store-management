"""add sale_returns and return_items tables

Revision ID: add_sale_returns
Revises: 
Create Date: 2026-02-19 09:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_sale_returns'
down_revision: Union[str, None] = '014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create sale_returns table
    op.create_table(
        'sale_returns',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('return_number', sa.String(50), nullable=False),
        sa.Column('sale_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='completed'),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('total_refund', sa.Numeric(10, 2), nullable=False),
        sa.Column('refund_method', sa.String(20), nullable=False, server_default='original'),
        sa.Column('processed_by_id', sa.Integer(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('tenant_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['processed_by_id'], ['users.id'], ondelete='RESTRICT'),
    )
    op.create_index('ix_sale_returns_return_number', 'sale_returns', ['return_number'])
    op.create_index('ix_sale_returns_sale_id', 'sale_returns', ['sale_id'])
    
    # Create return_items table
    op.create_table(
        'return_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sale_item_id', sa.Integer(), nullable=False),
        sa.Column('return_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('quantity_returned', sa.Integer(), nullable=False),
        sa.Column('unit_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('unit_cost', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('refund_amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('return_sources', sa.JSON(), nullable=True),
        sa.Column('tenant_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['sale_item_id'], ['sale_items.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['return_id'], ['sale_returns.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='RESTRICT'),
    )
    op.create_index('ix_return_items_sale_item_id', 'return_items', ['sale_item_id'])
    op.create_index('ix_return_items_return_id', 'return_items', ['return_id'])
    op.create_index('ix_return_items_product_id', 'return_items', ['product_id'])


def downgrade() -> None:
    op.drop_index('ix_return_items_product_id', 'return_items')
    op.drop_index('ix_return_items_return_id', 'return_items')
    op.drop_index('ix_return_items_sale_item_id', 'return_items')
    op.drop_table('return_items')
    
    op.drop_index('ix_sale_returns_sale_id', 'sale_returns')
    op.drop_index('ix_sale_returns_return_number', 'sale_returns')
    op.drop_table('sale_returns')