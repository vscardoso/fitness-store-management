"""Desconto do fornecedor na entrada (stock_entries.discount_amount): coluna nova, aditiva."""
from alembic import op
import sqlalchemy as sa

revision = "20261025_entry_discount"
down_revision = "20261024_error_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stock_entries",
        sa.Column("discount_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("stock_entries", "discount_amount")
