"""Dinheiro colocado ou tirado da gaveta sem caixa aberto: cash_movements.session_id passa a aceitar nulo.

Revision ID: 20261206_cash_move_nosession
Revises: 20261205_finance_approver
"""
import sqlalchemy as sa
from alembic import op

revision = "20261206_cash_move_nosession"
down_revision = "20261205_finance_approver"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cash_movements") as b:
        b.alter_column("session_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM cash_movements WHERE session_id IS NULL")
    with op.batch_alter_table("cash_movements") as b:
        b.alter_column("session_id", existing_type=sa.Integer(), nullable=False)
