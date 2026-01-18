"""
Add neighborhood field to customers table

Revision ID: 010_add_customer_neighborhood
Revises: 009_add_scheduling
Create Date: 2025-01-22
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = "010_add_customer_neighborhood"
down_revision: str | None = "009_add_scheduling"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add neighborhood column to customers table."""
    op.add_column(
        'customers',
        sa.Column('neighborhood', sa.String(100), nullable=True, comment="Customer neighborhood")
    )


def downgrade() -> None:
    """Remove neighborhood column from customers table."""
    op.drop_column('customers', 'neighborhood')
