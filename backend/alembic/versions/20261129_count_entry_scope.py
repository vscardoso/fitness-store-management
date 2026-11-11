"""Conferência de estoque que também serve para uma entrada (Conferir recebimento) e lembra os lotes já aplicados.

Revision ID: 20261129_count_entry_scope
Revises: 20261128_label_queue

Aditiva: duas colunas novas, vazias, em stock_counts (nada existente muda).
"""
import sqlalchemy as sa
from alembic import op

revision = "20261129_count_entry_scope"
down_revision = "20261128_label_queue"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stock_counts", sa.Column("entry_id", sa.Integer(), sa.ForeignKey("stock_entries.id", ondelete="SET NULL"), nullable=True))
    op.add_column("stock_counts", sa.Column("recent_batches", sa.JSON(), nullable=True))
    op.create_index("ix_stock_counts_entry_id", "stock_counts", ["entry_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_counts_entry_id", table_name="stock_counts")
    op.drop_column("stock_counts", "recent_batches")
    op.drop_column("stock_counts", "entry_id")
