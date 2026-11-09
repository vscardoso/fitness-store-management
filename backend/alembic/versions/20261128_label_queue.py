"""Fila de etiquetas e histórico de impressão: label_queue_items e label_print_jobs.

Revision ID: 20261128_label_queue
Revises: 20261127_gifts

Aditiva: só tabelas novas (nada existente muda).
"""
import sqlalchemy as sa
from alembic import op

revision = "20261128_label_queue"
down_revision = "20261127_gifts"
branch_labels = None
depends_on = None


def _base():
    return [
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False, index=True),
    ]


def upgrade() -> None:
    op.create_table(
        "label_print_jobs", *_base(),
        sa.Column("layout", sa.String(10), nullable=False),
        sa.Column("width_mm", sa.Float(), nullable=False),
        sa.Column("height_mm", sa.Float(), nullable=False),
        sa.Column("start_position", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("next_position", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("printed_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("printed_by_name", sa.String(120), nullable=True),
    )
    op.create_table(
        "label_queue_items", *_base(),
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("entry_id", sa.Integer(), sa.ForeignKey("stock_entries.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("added_by_name", sa.String(120), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("label_queue_items")
    op.drop_table("label_print_jobs")
