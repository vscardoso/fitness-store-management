"""Livro de movimentos por lote (entry_item_events).

Revision ID: 20261123_item_events
Revises: 20261122_loyalty

Só cria a tabela (aditivo). Os lotes que já existem ganham o histórico depois, por `scripts/ledger_backfill.py`.
"""
import sqlalchemy as sa
from alembic import op

revision = "20261123_item_events"
down_revision = "20261122_loyalty"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entry_item_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=True, index=True),
        sa.Column("entry_item_id", sa.Integer(), sa.ForeignKey("entry_items.id"), nullable=False, index=True),
        sa.Column("variant_id", sa.Integer(), nullable=True, index=True),
        sa.Column("product_id", sa.Integer(), nullable=True, index=True),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("before", sa.Integer(), nullable=False),
        sa.Column("after", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("ref", sa.String(60), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("reconstructed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.create_index("ix_entry_item_events_item", "entry_item_events", ["entry_item_id", "id"])


def downgrade() -> None:
    op.drop_index("ix_entry_item_events_item", table_name="entry_item_events")
    op.drop_table("entry_item_events")
