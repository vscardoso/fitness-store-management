"""add image_url to products

Revision ID: 014
Revises: 013
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '014'
down_revision: Union[str, None] = '013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Adicionar coluna image_url à tabela products
    op.add_column('products', sa.Column('image_url', sa.String(500), nullable=True))


def downgrade() -> None:
    # Remover coluna image_url
    op.drop_column('products', 'image_url')
