"""Caixa dentro do Financeiro: movimento do caixa pode estar ligado a uma transferência (sangria para o banco).

Revision ID: 20261115_cash_transfer
Revises: 20261114_finance
"""
import sqlalchemy as sa
from alembic import op

revision = "20261115_cash_transfer"
down_revision = "20261114_finance"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cash_movements", sa.Column("transfer_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_cash_movements_transfer", "cash_movements", "account_transfers", ["transfer_id"], ["id"], ondelete="SET NULL")


def downgrade():
    op.drop_constraint("fk_cash_movements_transfer", "cash_movements", type_="foreignkey")
    op.drop_column("cash_movements", "transfer_id")
