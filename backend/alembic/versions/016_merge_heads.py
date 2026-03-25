"""merge heads: 7789d0400d1f + 015

Revision ID: 016_merge_heads
Revises: 7789d0400d1f, 015
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '016_merge_heads'
down_revision: Union[str, None] = ('7789d0400d1f', '015')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
