"""Baixa de estoque pela Conferência de Estoque: configuração da loja (padrão desligado)

Revision ID: 20261110_stock_writeoff
Revises: 20261109_wa_business_settings
"""
import sqlalchemy as sa
from alembic import op

revision = "20261110_stock_writeoff"
down_revision = "20261109_wa_business_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stores", sa.Column("allow_stock_writeoff", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("stores", "allow_stock_writeoff")
