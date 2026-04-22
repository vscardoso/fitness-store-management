"""add mp oauth fields to stores

Revision ID: bb740ad8689b
Revises: 1dfedab98bae
Create Date: 2026-04-22 15:34:37.243570

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bb740ad8689b'
down_revision: Union[str, None] = '1dfedab98bae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('stores', sa.Column('mp_access_token', sa.String(length=500), nullable=True, comment='Access token OAuth do lojista no Mercado Pago'))
    op.add_column('stores', sa.Column('mp_refresh_token', sa.String(length=500), nullable=True, comment='Refresh token OAuth do lojista no Mercado Pago'))
    op.add_column('stores', sa.Column('mp_token_expires_at', sa.DateTime(timezone=True), nullable=True, comment='Expiração do access token MP OAuth'))
    op.add_column('stores', sa.Column('pix_provider', sa.String(length=50), server_default='mock', nullable=False, comment='Provider PIX ativo para este tenant: mock, mercadopago'))


def downgrade() -> None:
    op.drop_column('stores', 'pix_provider')
    op.drop_column('stores', 'mp_token_expires_at')
    op.drop_column('stores', 'mp_refresh_token')
    op.drop_column('stores', 'mp_access_token')
