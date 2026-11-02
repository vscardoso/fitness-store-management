"""Feed do catálogo para a Meta: token por loja em stores.catalog_feed_token

Revision ID: 20261112_catalog_feed
Revises: 20261111_cash_register

Aditiva: uma coluna nula e um índice único. Nulo = a loja não publicou o feed.
"""
import sqlalchemy as sa
from alembic import op

revision = "20261112_catalog_feed"
down_revision = "20261111_cash_register"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stores", sa.Column("catalog_feed_token", sa.String(64), nullable=True))
    op.create_index("uq_stores_catalog_feed_token", "stores", ["catalog_feed_token"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_stores_catalog_feed_token", table_name="stores")
    op.drop_column("stores", "catalog_feed_token")
