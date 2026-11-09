"""Brindes: gifts, gift_items e gift_returns.

Revision ID: 20261127_gifts
Revises: 20261126_card_auto

Aditiva: só tabelas novas (nada existente muda).
"""
import sqlalchemy as sa
from alembic import op

revision = "20261127_gifts"
down_revision = "20261126_card_auto"
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
        "gifts", *_base(),
        sa.Column("gift_number", sa.String(40), nullable=False, index=True),
        sa.Column("status", sa.String(12), nullable=False, server_default="given"),
        sa.Column("reason_type", sa.String(20), nullable=False),
        sa.Column("reason_note", sa.Text(), nullable=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recipient_name", sa.String(120), nullable=True),
        sa.Column("related_sale_id", sa.Integer(), sa.ForeignKey("sales.id", ondelete="SET NULL"), nullable=True),
        sa.Column("given_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("given_by_name", sa.String(120), nullable=True),
        sa.Column("total_cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("list_value", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_by_name", sa.String(120), nullable=True),
        sa.Column("cancel_reason", sa.Text(), nullable=True),
    )
    op.create_table(
        "gift_items", *_base(),
        sa.Column("gift_id", sa.Integer(), sa.ForeignKey("gifts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("product_name", sa.String(200), nullable=True),
        sa.Column("variant_label", sa.String(120), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("quantity_returned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unit_cost", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("list_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("sale_sources", sa.JSON(), nullable=True),
    )
    op.create_table(
        "gift_returns", *_base(),
        sa.Column("gift_id", sa.Integer(), sa.ForeignKey("gifts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("gift_item_id", sa.Integer(), sa.ForeignKey("gift_items.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_name", sa.String(120), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("gift_returns")
    op.drop_table("gift_items")
    op.drop_table("gifts")
