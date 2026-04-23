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
    from sqlalchemy import text
    bind = op.get_bind()

    # Remover tabela refresh_tokens — IF EXISTS é idempotente no PostgreSQL
    # (try/except não funciona: DDL abortado deixa toda a transação em estado de erro)
    bind.execute(text("DROP INDEX IF EXISTS ix_refresh_tokens_last_used_at"))
    bind.execute(text("DROP INDEX IF EXISTS ix_refresh_tokens_token_hash"))
    bind.execute(text("DROP INDEX IF EXISTS ix_refresh_tokens_user_id"))
    bind.execute(text("DROP TABLE IF EXISTS refresh_tokens"))

    # Índice supplier_id em entry_items — IF NOT EXISTS evita DuplicateObject
    bind.execute(text("CREATE INDEX IF NOT EXISTS ix_entry_items_supplier_id ON entry_items (supplier_id)"))


def downgrade() -> None:
    pass
