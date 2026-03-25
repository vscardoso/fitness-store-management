"""add installments to payments

Revision ID: cffaeb3a4d37
Revises: 016_merge_heads
Create Date: 2026-03-24 21:21:50.322965

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cffaeb3a4d37'
down_revision: Union[str, None] = '016_merge_heads'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('payments', sa.Column(
        'installments', sa.Integer(), nullable=False,
        server_default='1',
        comment='Number of installments for credit card (1 = à vista)'
    ))


def downgrade() -> None:
    op.drop_column('payments', 'installments')
