"""add conditional shipments tables

Revision ID: 008_add_conditional_shipments
Revises: 007_add_unit_cost
Create Date: 2025-12-01 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite


# revision identifiers, used by Alembic.
revision = '008_add_conditional_shipments'
down_revision = '007_add_unit_cost'
branch_labels = None
depends_on = None


def upgrade():
    # Create conditional_shipments table
    op.create_table(
        'conditional_shipments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('customer_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='PENDING'),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('deadline', sa.DateTime(), nullable=True),
        sa.Column('returned_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('shipping_address', sa.Text(), nullable=False),
        
        # BaseModel fields
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['stores.id'], name='fk_conditional_shipments_tenant'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name='fk_conditional_shipments_customer'),
    )
    
    # Create indexes
    op.create_index('ix_conditional_shipments_tenant_id', 'conditional_shipments', ['tenant_id'])
    op.create_index('ix_conditional_shipments_customer_id', 'conditional_shipments', ['customer_id'])
    op.create_index('ix_conditional_shipments_status', 'conditional_shipments', ['status'])
    
    # Create conditional_shipment_items table
    op.create_table(
        'conditional_shipment_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('shipment_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('quantity_sent', sa.Integer(), nullable=False),
        sa.Column('quantity_kept', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('quantity_returned', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='SENT'),
        sa.Column('unit_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        
        # BaseModel fields
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['shipment_id'], ['conditional_shipments.id'], name='fk_conditional_items_shipment'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], name='fk_conditional_items_product'),
    )
    
    # Create indexes
    op.create_index('ix_conditional_shipment_items_shipment_id', 'conditional_shipment_items', ['shipment_id'])
    op.create_index('ix_conditional_shipment_items_product_id', 'conditional_shipment_items', ['product_id'])


def downgrade():
    # Drop tables in reverse order
    op.drop_index('ix_conditional_shipment_items_product_id', table_name='conditional_shipment_items')
    op.drop_index('ix_conditional_shipment_items_shipment_id', table_name='conditional_shipment_items')
    op.drop_table('conditional_shipment_items')
    
    op.drop_index('ix_conditional_shipments_status', table_name='conditional_shipments')
    op.drop_index('ix_conditional_shipments_customer_id', table_name='conditional_shipments')
    op.drop_index('ix_conditional_shipments_tenant_id', table_name='conditional_shipments')
    op.drop_table('conditional_shipments')
