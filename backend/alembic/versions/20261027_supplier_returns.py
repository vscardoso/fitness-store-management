"""Devolução ao fornecedor (supplier_returns): tabela nova, aditiva."""
from alembic import op
import sqlalchemy as sa

revision = "20261027_supplier_returns"
down_revision = "20261026_returns_exchange"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "supplier_returns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True, index=True),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("entry_id", sa.Integer(), sa.ForeignKey("stock_entries.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("entry_item_id", sa.Integer(), sa.ForeignKey("entry_items.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("return_item_id", sa.Integer(), sa.ForeignKey("return_items.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(10, 2), nullable=False),
        sa.Column("from_stock", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="sent"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("credit_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column("replacement_entry_item_id", sa.Integer(), sa.ForeignKey("entry_items.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("supplier_returns")
