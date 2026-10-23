"""Troca e prazo de devolução por loja: colunas novas, aditivas (default mantém o comportamento atual)."""
from alembic import op
import sqlalchemy as sa

revision = "20261026_returns_exchange"
down_revision = "20261025_entry_discount"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stores", sa.Column("return_window_days", sa.Integer(), nullable=False, server_default="7"))
    op.add_column("stores", sa.Column("allow_money_refund", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("sale_returns", sa.Column("exchange_sale_id", sa.Integer(), sa.ForeignKey("sales.id", ondelete="SET NULL"), nullable=True))
    op.add_column("sale_returns", sa.Column("net_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("sale_returns", sa.Column("settlement_method", sa.String(20), nullable=True))
    op.add_column("return_items", sa.Column("restock", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("return_items", sa.Column("replacement_variant_id", sa.Integer(), sa.ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True))


def downgrade() -> None:
    op.drop_column("return_items", "replacement_variant_id")
    op.drop_column("return_items", "restock")
    op.drop_column("sale_returns", "settlement_method")
    op.drop_column("sale_returns", "net_amount")
    op.drop_column("sale_returns", "exchange_sale_id")
    op.drop_column("stores", "allow_money_refund")
    op.drop_column("stores", "return_window_days")
