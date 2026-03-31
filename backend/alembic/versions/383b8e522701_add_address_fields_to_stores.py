"""add address fields to stores

Revision ID: 383b8e522701
Revises: a1b2c3d4e5f6
Create Date: 2026-03-30 15:04:08.331968

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '383b8e522701'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('stores', sa.Column('zip_code', sa.String(length=10), nullable=True, comment='CEP da loja'))
    op.add_column('stores', sa.Column('street', sa.String(length=255), nullable=True, comment='Rua/Avenida'))
    op.add_column('stores', sa.Column('number', sa.String(length=20), nullable=True, comment='Número'))
    op.add_column('stores', sa.Column('complement', sa.String(length=100), nullable=True, comment='Complemento'))
    op.add_column('stores', sa.Column('neighborhood', sa.String(length=100), nullable=True, comment='Bairro'))
    op.add_column('stores', sa.Column('city', sa.String(length=100), nullable=True, comment='Cidade'))
    op.add_column('stores', sa.Column('state', sa.String(length=2), nullable=True, comment='UF do estado'))


def downgrade() -> None:
    op.drop_column('stores', 'state')
    op.drop_column('stores', 'city')
    op.drop_column('stores', 'neighborhood')
    op.drop_column('stores', 'complement')
    op.drop_column('stores', 'number')
    op.drop_column('stores', 'street')
    op.drop_column('stores', 'zip_code')
