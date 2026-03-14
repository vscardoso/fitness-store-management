"""merge_heads

Revision ID: ea3615df1b12
Revises: add_product_variants, add_sale_returns
Create Date: 2026-03-11 15:48:45.877842

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ea3615df1b12'
down_revision: Union[str, None] = ('add_product_variants', 'add_sale_returns')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
