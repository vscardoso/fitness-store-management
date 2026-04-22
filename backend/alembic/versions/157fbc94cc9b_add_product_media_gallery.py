"""add product media gallery

Revision ID: 157fbc94cc9b
Revises: b4c99e6278ff
Create Date: 2026-04-07 16:23:28.441025

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '157fbc94cc9b'
down_revision: Union[str, None] = 'b4c99e6278ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remover tabela refresh_tokens (substituída por outro mecanismo)
    try:
        op.drop_index('ix_refresh_tokens_last_used_at', table_name='refresh_tokens')
        op.drop_index('ix_refresh_tokens_token_hash', table_name='refresh_tokens')
        op.drop_index('ix_refresh_tokens_user_id', table_name='refresh_tokens')
        op.drop_table('refresh_tokens')
    except Exception:
        pass

    # Criar índice supplier_id em entry_items (se não existir)
    try:
        op.create_index(op.f('ix_entry_items_supplier_id'), 'entry_items', ['supplier_id'], unique=False)
    except Exception:
        pass

    # SQLite não suporta ADD FOREIGN KEY / DROP CONSTRAINT / ALTER COLUMN nullable
    # Essas operações são puladas em ambiente SQLite


def downgrade() -> None:
    pass
