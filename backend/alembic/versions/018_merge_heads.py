"""merge heads: 017_fifo_sources_cs + cffaeb3a4d37

Revision ID: 018_merge_heads
Revises: 017_fifo_sources_cs, cffaeb3a4d37
Create Date: 2026-03-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '018_merge_heads'
down_revision: Union[str, None] = ('017_fifo_sources_cs', 'cffaeb3a4d37')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
