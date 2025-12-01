"""add unit_cost to sale_items

Revision ID: 007_add_unit_cost
Revises: 006_add_is_catalog
Create Date: 2025-01-19 23:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite


# revision identifiers, used by Alembic.
revision = '007_add_unit_cost'
down_revision = '006_add_is_catalog'
branch_labels = None
depends_on = None


def upgrade():
    # Add unit_cost column to sale_items table
    op.add_column('sale_items',
        sa.Column('unit_cost', sa.Numeric(10, 2), nullable=False, server_default='0')
    )


def downgrade():
    op.drop_column('sale_items', 'unit_cost')
