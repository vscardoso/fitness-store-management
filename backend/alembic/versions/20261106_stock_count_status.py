"""Conferência de estoque: em andamento ou finalizada, com revisão

Revision ID: 20261106_stock_count_status
Revises: 20261105_stock_counts

Aditiva: as conferências já salvas ficam como finalizadas (era uma fotografia fechada).
"""
from alembic import op
import sqlalchemy as sa

revision = "20261106_stock_count_status"
down_revision = "20261105_stock_counts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stock_counts", sa.Column("status", sa.String(20), nullable=False, server_default="finished"))
    op.add_column("stock_counts", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("stock_counts", sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE stock_counts SET finished_at = created_at WHERE finished_at IS NULL")


def downgrade() -> None:
    op.drop_column("stock_counts", "finished_at")
    op.drop_column("stock_counts", "revision")
    op.drop_column("stock_counts", "status")
