"""add store branding fields

Revision ID: 2b11b803c2c2
Revises: 019_add_expense_module
Create Date: 2026-03-28 09:17:55.338837

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b11b803c2c2'
down_revision: Union[str, None] = '019_add_expense_module'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('stores', sa.Column('tagline', sa.String(length=255), nullable=True, comment='Slogan da loja'))
    op.add_column('stores', sa.Column('primary_color', sa.String(length=7), nullable=True, comment='Cor principal (hex)'))
    op.add_column('stores', sa.Column('secondary_color', sa.String(length=7), nullable=True, comment='Cor secundária (hex)'))
    op.add_column('stores', sa.Column('accent_color', sa.String(length=7), nullable=True, comment='Cor de destaque (hex)'))
    op.add_column('stores', sa.Column('logo_path', sa.String(length=500), nullable=True, comment='Caminho do logo no servidor'))


def downgrade() -> None:
    op.drop_column('stores', 'logo_path')
    op.drop_column('stores', 'accent_color')
    op.drop_column('stores', 'secondary_color')
    op.drop_column('stores', 'primary_color')
    op.drop_column('stores', 'tagline')
