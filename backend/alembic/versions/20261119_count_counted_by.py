"""Conferência compartilhada: quem contou por último cada peça.

Revision ID: 20261119_count_counted_by
Revises: 20261118_wa_coexistence
"""
import sqlalchemy as sa
from alembic import op

revision = "20261119_count_counted_by"
down_revision = "20261118_wa_coexistence"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("stock_count_items", sa.Column("counted_by_name", sa.String(120), nullable=True))


def downgrade():
    op.drop_column("stock_count_items", "counted_by_name")
