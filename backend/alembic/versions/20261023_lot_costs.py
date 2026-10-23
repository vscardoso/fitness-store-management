"""Custo por lote: rateio por unidade nos itens da entrada e despesa ligada a lote ou viagem.

Aditiva e sem perda: entry_items.extra_unit_cost começa em 0 (custo posto = custo da mercadoria, igual a hoje);
expenses.stock_entry_id e expenses.trip_id são opcionais (despesas existentes continuam gerais).
"""
from alembic import op
import sqlalchemy as sa

revision = "20261023_lot_costs"
down_revision = "20261022_app_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("entry_items", sa.Column("extra_unit_cost", sa.Numeric(12, 4), nullable=False, server_default="0"))
    op.add_column("expenses", sa.Column("stock_entry_id", sa.Integer(), nullable=True))
    op.add_column("expenses", sa.Column("trip_id", sa.Integer(), nullable=True))
    op.create_index("ix_expenses_stock_entry_id", "expenses", ["stock_entry_id"])
    op.create_index("ix_expenses_trip_id", "expenses", ["trip_id"])
    op.create_foreign_key("fk_expenses_stock_entry", "expenses", "stock_entries", ["stock_entry_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_expenses_trip", "expenses", "trips", ["trip_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_expenses_trip", "expenses", type_="foreignkey")
    op.drop_constraint("fk_expenses_stock_entry", "expenses", type_="foreignkey")
    op.drop_index("ix_expenses_trip_id", table_name="expenses")
    op.drop_index("ix_expenses_stock_entry_id", table_name="expenses")
    op.drop_column("expenses", "trip_id")
    op.drop_column("expenses", "stock_entry_id")
    op.drop_column("entry_items", "extra_unit_cost")
