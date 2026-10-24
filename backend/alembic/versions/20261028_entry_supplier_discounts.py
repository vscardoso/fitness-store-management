"""Desconto por fornecedor dentro da entrada (entry_supplier_discounts): tabela nova, aditiva."""
from alembic import op
import sqlalchemy as sa

revision = "20261028_entry_supplier_discounts"
down_revision = "20261027_supplier_returns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entry_supplier_discounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True, index=True),
        sa.Column("entry_id", sa.Integer(), sa.ForeignKey("stock_entries.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.UniqueConstraint("entry_id", "supplier_id", name="uq_entry_supplier_discount"),
    )


def downgrade() -> None:
    op.drop_table("entry_supplier_discounts")
