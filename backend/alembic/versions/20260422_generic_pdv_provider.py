"""add provider and provider_config to pdv_terminals, provider to pix_transactions

Revision ID: f9e8d7c6b5a4
Revises: None (standalone — idempotent)
Create Date: 2026-04-22 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = 'f9e8d7c6b5a4'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    return any(c["name"] == column for c in insp.get_columns(table))


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    return table in insp.get_table_names()


def upgrade() -> None:
    # pdv_terminals: add provider column
    if _table_exists('pdv_terminals') and not _column_exists('pdv_terminals', 'provider'):
        op.add_column('pdv_terminals', sa.Column(
            'provider', sa.String(length=50),
            nullable=False, server_default='mercadopago',
            comment='Provider: mercadopago, cielo, stone, rede, getnet, pagseguro, sumup, manual',
        ))

    # pdv_terminals: add provider_config JSON column
    if _table_exists('pdv_terminals') and not _column_exists('pdv_terminals', 'provider_config'):
        op.add_column('pdv_terminals', sa.Column(
            'provider_config', sa.JSON(),
            nullable=False, server_default='{}',
            comment='Configurações específicas do provider (JSON)',
        ))

    # pix_transactions: add provider column
    if _table_exists('pix_transactions') and not _column_exists('pix_transactions', 'provider'):
        op.add_column('pix_transactions', sa.Column(
            'provider', sa.String(length=50),
            nullable=False, server_default='mercadopago',
            comment='Provider: mercadopago (futuro: outros PSPs)',
        ))


def downgrade() -> None:
    if _table_exists('pix_transactions') and _column_exists('pix_transactions', 'provider'):
        op.drop_column('pix_transactions', 'provider')

    if _table_exists('pdv_terminals') and _column_exists('pdv_terminals', 'provider_config'):
        op.drop_column('pdv_terminals', 'provider_config')

    if _table_exists('pdv_terminals') and _column_exists('pdv_terminals', 'provider'):
        op.drop_column('pdv_terminals', 'provider')
