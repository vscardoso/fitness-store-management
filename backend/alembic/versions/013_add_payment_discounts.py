"""add payment discounts table

Revision ID: 013
Revises: 012
Create Date: 2026-01-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import Numeric

revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Payment Discounts Table
    op.create_table('payment_discounts',
        sa.Column('id', sa.Integer(), nullable=False, comment='Primary key'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False, comment='Record creation timestamp'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False, comment='Record last update timestamp'),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True, comment='Soft delete flag'),
        sa.Column('tenant_id', sa.Integer(), nullable=True, comment='Tenant/Store identifier'),
        sa.Column('payment_method', sa.String(length=50), nullable=False, comment='Payment method (PIX, CASH, DEBIT_CARD, etc)'),
        sa.Column('discount_percentage', Numeric(5, 2), nullable=False, comment='Discount percentage (10.00 = 10%)'),
        sa.Column('description', sa.String(length=255), nullable=True, comment='Optional description'),
        sa.ForeignKeyConstraint(['tenant_id'], ['stores.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'payment_method', name='uq_payment_discounts_tenant_method')
    )
    
    # Create indexes
    op.create_index('ix_payment_discounts_id', 'payment_discounts', ['id'])
    op.create_index('ix_payment_discounts_tenant_id', 'payment_discounts', ['tenant_id'])
    op.create_index('ix_payment_discounts_payment_method', 'payment_discounts', ['payment_method'])


def downgrade() -> None:
    op.drop_index('ix_payment_discounts_payment_method', table_name='payment_discounts')
    op.drop_index('ix_payment_discounts_tenant_id', table_name='payment_discounts')
    op.drop_index('ix_payment_discounts_id', table_name='payment_discounts')
    op.drop_table('payment_discounts')
