"""add pdv terminals and mp store fields

Revision ID: 8e65d9fb558f
Revises: 157fbc94cc9b
Create Date: 2026-04-09 10:52:24.736375

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '8e65d9fb558f'
down_revision: Union[str, None] = '157fbc94cc9b'
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
    # Cria tabela de terminais PDV (idempotente)
    if not _table_exists('pdv_terminals'):
        op.create_table(
            'pdv_terminals',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False, comment='Nome do caixa'),
            sa.Column('external_id', sa.String(length=50), nullable=False, comment='ID externo único MP'),
            sa.Column('mp_pos_id', sa.String(length=50), nullable=True),
            sa.Column('mp_qr_image', sa.String(length=500), nullable=True),
            sa.Column('mp_qr_template_document', sa.String(length=500), nullable=True),
            sa.Column('is_configured', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('stores.id', ondelete='RESTRICT'), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_pdv_terminals_id', 'pdv_terminals', ['id'], unique=False)
        op.create_index('ix_pdv_terminals_tenant_id', 'pdv_terminals', ['tenant_id'], unique=False)

    # Adiciona campos MP na tabela stores (idempotente)
    if not _column_exists('stores', 'mp_user_id'):
        op.add_column('stores', sa.Column('mp_user_id', sa.String(length=50), nullable=True, comment='ID do usuário no Mercado Pago'))
    if not _column_exists('stores', 'mp_store_id'):
        op.add_column('stores', sa.Column('mp_store_id', sa.String(length=50), nullable=True, comment='ID da loja criada no MP'))


def downgrade() -> None:
    op.drop_column('stores', 'mp_store_id')
    op.drop_column('stores', 'mp_user_id')
    op.drop_index('ix_pdv_terminals_tenant_id', table_name='pdv_terminals')
    op.drop_index('ix_pdv_terminals_id', table_name='pdv_terminals')
    op.drop_table('pdv_terminals')
