"""Despesas e contas a pagar juntas: conta a pagar que é despesa da loja vira despesa ao ser paga.

Revision ID: 20261117_payable_expense
Revises: 20261116_web_push
"""
import sqlalchemy as sa
from alembic import op

revision = "20261117_payable_expense"
down_revision = "20261116_web_push"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("payables", sa.Column("counts_as_expense", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("payables", sa.Column("expense_category_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_payables_expense_category", "payables", "expense_categories", ["expense_category_id"], ["id"])
    op.add_column("expenses", sa.Column("payable_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_expenses_payable", "expenses", "payables", ["payable_id"], ["id"], ondelete="SET NULL")


def downgrade():
    op.drop_constraint("fk_expenses_payable", "expenses", type_="foreignkey")
    op.drop_column("expenses", "payable_id")
    op.drop_constraint("fk_payables_expense_category", "payables", type_="foreignkey")
    op.drop_column("payables", "expense_category_id")
    op.drop_column("payables", "counts_as_expense")
