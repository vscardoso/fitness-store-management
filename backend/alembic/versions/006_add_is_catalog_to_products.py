"""add is_catalog to products

Revision ID: 006_add_is_catalog
Revises: 005_add_subscription_system
Create Date: 2025-01-19 20:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006_add_is_catalog'
down_revision = '005_add_subscription_system'
branch_labels = None
depends_on = None


def upgrade():
    # Add is_catalog column to products table
    op.add_column('products',
        sa.Column('is_catalog', sa.Boolean(), nullable=False, server_default='false')
    )

    # Mark seed products (FIT-*) as catalog templates
    # These are the 115 products created during signup
    op.execute("""
        UPDATE products
        SET is_catalog = true
        WHERE sku LIKE 'FIT-%'
    """)


def downgrade():
    op.drop_column('products', 'is_catalog')
