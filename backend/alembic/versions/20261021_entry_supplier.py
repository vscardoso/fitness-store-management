"""stock_entries.supplier_id (fornecedor padrao da entrada)

Revision ID: 20261021_entry_supplier
Revises: 20260510_label_printing
Create Date: 2026-10-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261021_entry_supplier"
down_revision: Union[str, None] = "20260510_label_printing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = [c["name"] for c in inspector.get_columns("stock_entries")]
    if "supplier_id" not in cols:
        op.add_column(
            "stock_entries",
            sa.Column(
                "supplier_id",
                sa.Integer(),
                sa.ForeignKey("suppliers.id", ondelete="SET NULL"),
                nullable=True,
                comment="Fornecedor padrao da entrada (FK para suppliers)",
            ),
        )
        op.create_index("ix_stock_entries_supplier_id", "stock_entries", ["supplier_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_entries_supplier_id", table_name="stock_entries")
    op.drop_column("stock_entries", "supplier_id")
