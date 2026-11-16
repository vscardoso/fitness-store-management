"""Administrador que aprova os pedidos de mudança de saldo (o dono pode só acompanhar)

Revision ID: 20261205_finance_approver
Revises: 20261204_finance_approvals

Aditiva: uma coluna nova em users, verdadeira para todos (nada muda até alguém ser marcado como só acompanha).
"""
import sqlalchemy as sa
from alembic import op

revision = "20261205_finance_approver"
down_revision = "20261204_finance_approvals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("finance_approver", sa.Boolean(), nullable=False, server_default=sa.text("true")))


def downgrade() -> None:
    op.drop_column("users", "finance_approver")
