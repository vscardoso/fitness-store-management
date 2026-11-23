"""Estorno por erro de lançamento passa a ter marca própria (sale_returns.is_correction).

O relatório de vendas conta esse estorno no dia da venda apagada, não no dia em que o estorno foi feito. Antes a marca só existia
no texto do motivo; os estornos já feitos são marcados pelo prefixo do motivo.

Revision ID: 20261207_return_is_correction
Revises: 20261206_cash_move_nosession
"""
import sqlalchemy as sa
from alembic import op

revision = "20261207_return_is_correction"
down_revision = "20261206_cash_move_nosession"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sale_returns", sa.Column("is_correction", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE sale_returns SET is_correction = true WHERE reason LIKE 'Estorno por erro de lançamento:%'")


def downgrade() -> None:
    op.drop_column("sale_returns", "is_correction")
