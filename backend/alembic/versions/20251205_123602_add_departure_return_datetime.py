"""Add departure_datetime and return_datetime to conditional_shipments

Revision ID: 20251205_123602
Revises: (auto)
Create Date: 2025-12-05 12:36:02

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251205_123602'
down_revision = '010_add_customer_neighborhood'  # Previous migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add departure_datetime and return_datetime columns"""
    # Add new columns
    op.add_column('conditional_shipments', sa.Column('departure_datetime', sa.DateTime(), nullable=True))
    op.add_column('conditional_shipments', sa.Column('return_datetime', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Remove departure_datetime and return_datetime columns"""
    op.drop_column('conditional_shipments', 'return_datetime')
    op.drop_column('conditional_shipments', 'departure_datetime')
