"""Compra paga com a Gaveta e o resto de uma conta: guarda quanto saiu da gaveta

Revision ID: 20261202_purchase_cash_part
Revises: 20261130_entry_paid_account

Aditiva: uma coluna nova, vazia, em stock_entries (nada existente muda).
"""
import sqlalchemy as sa
from alembic import op

revision = "20261202_purchase_cash_part"
down_revision = "20261130_entry_paid_account"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stock_entries", sa.Column("paid_cash_amount", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("stock_entries", "paid_cash_amount")
