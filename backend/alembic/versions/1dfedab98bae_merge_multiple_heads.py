"""merge multiple heads

Revision ID: 1dfedab98bae
Revises: 20260409_pix_tx, f9e8d7c6b5a4, 8e65d9fb558f
Create Date: 2026-04-22 15:34:04.559974

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1dfedab98bae'
down_revision: Union[str, None] = ('20260409_pix_tx', 'f9e8d7c6b5a4', '8e65d9fb558f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
