"""Limitador de tentativas compartilhado entre os workers (tabela rate_limit_hits)

Revision ID: 20261104_rate_limit_hits
Revises: 20261103_indices_desempenho

UNLOGGED (mais rápida; se o Postgres cair de forma anormal ela esvazia, e o limite só recomeça do zero: sem perda de dados
de negócio). Cada linha é uma tentativa (login falho, cadastro, esqueci a senha, scanner de IA).
"""
from alembic import op

revision = "20261104_rate_limit_hits"
down_revision = "20261103_indices_desempenho"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("CREATE UNLOGGED TABLE IF NOT EXISTS rate_limit_hits ("
               "id BIGSERIAL PRIMARY KEY, key TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL DEFAULT now())")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rate_limit_hits_key_ts ON rate_limit_hits (key, ts)")


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("DROP TABLE IF EXISTS rate_limit_hits")
