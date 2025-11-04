"""Add sale_sources JSON field to sale_items

Revision ID: 002_add_sale_sources
Revises: 001_add_trip_system
Create Date: 2025-11-03 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = '002_add_sale_sources'
down_revision: Union[str, None] = '001_add_trip_system'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add sale_sources JSON column to sale_items table for FIFO tracking."""
    
    # Add sale_sources column
    # SQLite doesn't have native JSON type, stores as TEXT
    op.add_column('sale_items',
        sa.Column('sale_sources', sa.JSON(), nullable=True,
                  comment='JSON with FIFO sources: [{entry_id, entry_item_id, quantity_taken, unit_cost, total_cost, entry_code, entry_date}]')
    )


def downgrade() -> None:
    """Remove sale_sources column from sale_items table."""
    
    op.drop_column('sale_items', 'sale_sources')
