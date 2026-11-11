"""Compra sai da conta: de onde saiu o dinheiro da entrada (gaveta ou banco).

Revision ID: 20261130_entry_paid_account
Revises: 20261129_count_entry_scope

Aditiva: duas colunas novas em stock_entries (conta de onde saiu o dinheiro, vazia; "pago por fora", falso). Nada
existente muda: enquanto nenhuma compra tiver conta, o saldo das contas é o mesmo de antes.
"""
import sqlalchemy as sa
from alembic import op

revision = "20261130_entry_paid_account"
down_revision = "20261129_count_entry_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stock_entries", sa.Column(
        "paid_account_id", sa.Integer(), sa.ForeignKey("financial_accounts.id", ondelete="SET NULL"), nullable=True))
    op.add_column("stock_entries", sa.Column("paid_outside", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.create_index("ix_stock_entries_paid_account_id", "stock_entries", ["paid_account_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_entries_paid_account_id", table_name="stock_entries")
    op.drop_column("stock_entries", "paid_outside")
    op.drop_column("stock_entries", "paid_account_id")
