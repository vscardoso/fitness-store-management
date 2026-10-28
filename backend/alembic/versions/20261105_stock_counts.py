"""Conferência de estoque salva (stock_counts e stock_count_items)

Revision ID: 20261105_stock_counts
Revises: 20261104_rate_limit_hits

Aditiva: duas tabelas novas, sem tocar em estoque.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261105_stock_counts"
down_revision = "20261104_rate_limit_hits"
branch_labels = None
depends_on = None


def _base():
    return [
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean()),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id", ondelete="RESTRICT"), nullable=True, index=True),
    ]


def upgrade() -> None:
    op.create_table(
        "stock_counts",
        *_base(),
        sa.Column("name", sa.String(120), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("category_name", sa.String(120), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_name", sa.String(120), nullable=True),
        sa.Column("total_variants", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("counted_variants", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ok_variants", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("diff_variants", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("short_pieces", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("over_pieces", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("system_pieces", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("counted_pieces", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_stock_counts_tenant_created", "stock_counts", ["tenant_id", "created_at"])
    op.create_table(
        "stock_count_items",
        *_base(),
        sa.Column("count_id", sa.Integer(), sa.ForeignKey("stock_counts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("category_name", sa.String(120), nullable=True),
        sa.Column("color", sa.String(60), nullable=True),
        sa.Column("size", sa.String(20), nullable=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("display_code", sa.String(30), nullable=True),
        sa.Column("system_quantity", sa.Integer(), nullable=False),
        sa.Column("counted_quantity", sa.Integer(), nullable=False),
        sa.Column("difference", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("stock_count_items")
    op.drop_index("ix_stock_counts_tenant_created", table_name="stock_counts")
    op.drop_table("stock_counts")
