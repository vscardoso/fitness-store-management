"""Add trip, stock_entry and entry_item tables

Revision ID: 001_add_trip_system
Revises: 
Create Date: 2025-11-03 09:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = '001_add_trip_system'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create trips, stock_entries, and entry_items tables."""
    
    # Create trips table
    op.create_table('trips',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('trip_code', sa.String(length=50), nullable=False),
        sa.Column('trip_date', sa.Date(), nullable=False),
        sa.Column('destination', sa.String(length=255), nullable=False),
        sa.Column('departure_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('return_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('travel_cost_fuel', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
        sa.Column('travel_cost_food', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
        sa.Column('travel_cost_toll', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
        sa.Column('travel_cost_hotel', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
        sa.Column('travel_cost_other', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
        sa.Column('travel_cost_total', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='planned'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('trip_code')
    )
    op.create_index('ix_trips_id', 'trips', ['id'])
    op.create_index('ix_trips_trip_code', 'trips', ['trip_code'])
    
    # Create stock_entries table
    op.create_table('stock_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('entry_code', sa.String(length=50), nullable=False),
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column('entry_type', sa.String(length=20), nullable=False),
        sa.Column('trip_id', sa.Integer(), nullable=True),
        sa.Column('supplier_name', sa.String(length=255), nullable=False),
        sa.Column('supplier_cnpj', sa.String(length=18), nullable=True),
        sa.Column('supplier_contact', sa.String(length=255), nullable=True),
        sa.Column('invoice_number', sa.String(length=100), nullable=True),
        sa.Column('payment_method', sa.String(length=50), nullable=True),
        sa.Column('total_cost', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('entry_code')
    )
    op.create_index('ix_stock_entries_id', 'stock_entries', ['id'])
    op.create_index('ix_stock_entries_entry_code', 'stock_entries', ['entry_code'])
    op.create_index('ix_stock_entries_trip_id', 'stock_entries', ['trip_id'])
    
    # Create entry_items table
    op.create_table('entry_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('entry_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('quantity_received', sa.Integer(), nullable=False),
        sa.Column('quantity_remaining', sa.Integer(), nullable=False),
        sa.Column('unit_cost', sa.Numeric(10, 2), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.CheckConstraint('quantity_received > 0', name='check_quantity_received_positive'),
        sa.CheckConstraint('quantity_remaining >= 0', name='check_quantity_remaining_non_negative'),
        sa.CheckConstraint('quantity_remaining <= quantity_received', name='check_remaining_lte_received'),
        sa.CheckConstraint('unit_cost >= 0', name='check_unit_cost_non_negative'),
        sa.ForeignKeyConstraint(['entry_id'], ['stock_entries.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_entry_items_id', 'entry_items', ['id'])
    op.create_index('ix_entry_items_entry_id', 'entry_items', ['entry_id'])
    op.create_index('ix_entry_items_product_id', 'entry_items', ['product_id'])


def downgrade() -> None:
    """Drop trips, stock_entries, and entry_items tables."""
    
    op.drop_index('ix_entry_items_product_id', table_name='entry_items')
    op.drop_index('ix_entry_items_entry_id', table_name='entry_items')
    op.drop_index('ix_entry_items_id', table_name='entry_items')
    op.drop_table('entry_items')
    
    op.drop_index('ix_stock_entries_trip_id', table_name='stock_entries')
    op.drop_index('ix_stock_entries_entry_code', table_name='stock_entries')
    op.drop_index('ix_stock_entries_id', table_name='stock_entries')
    op.drop_table('stock_entries')
    
    op.drop_index('ix_trips_trip_code', table_name='trips')
    op.drop_index('ix_trips_id', table_name='trips')
    op.drop_table('trips')
