"""Despesa: guarda quem lançou (expenses.created_by_name).

Revision ID: 20261210_expense_created_by
Revises: 20261209_wa_token_expiry
"""
import sqlalchemy as sa
from alembic import op

revision = "20261210_expense_created_by"
down_revision = "20261209_wa_token_expiry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("expenses", sa.Column("created_by_name", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("expenses", "created_by_name")
