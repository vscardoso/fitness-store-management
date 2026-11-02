"""Caixa da loja: turnos (cash_sessions) e movimentos manuais (cash_movements)

Revision ID: 20261111_cash_register
Revises: 20261110_stock_writeoff

Aditiva: duas tabelas novas. O dinheiro das vendas não é copiado: o esperado é calculado dos pagamentos.
"""
import sqlalchemy as sa
from alembic import op

revision = "20261111_cash_register"
down_revision = "20261110_stock_writeoff"
branch_labels = None
depends_on = None


def _base():
    return [
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean()),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id", ondelete="RESTRICT"), nullable=True, index=True),
    ]


def upgrade() -> None:
    op.create_table(
        "cash_sessions",
        *_base(),
        sa.Column("status", sa.String(10), nullable=False, server_default="open"),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("opened_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("opened_by_name", sa.String(120), nullable=True),
        sa.Column("opening_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("opening_note", sa.Text(), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("closed_by_name", sa.String(120), nullable=True),
        sa.Column("closing_note", sa.Text(), nullable=True),
        sa.Column("counted_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("expected_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("difference", sa.Numeric(12, 2), nullable=True),
        sa.Column("cash_sales", sa.Numeric(12, 2), nullable=True),
        sa.Column("cash_refunds", sa.Numeric(12, 2), nullable=True),
        sa.Column("supplies_total", sa.Numeric(12, 2), nullable=True),
        sa.Column("withdrawals_total", sa.Numeric(12, 2), nullable=True),
        sa.Column("sales_count", sa.Integer(), nullable=True),
        sa.Column("other_methods", sa.Text(), nullable=True),
    )
    op.create_index(
        "uq_cash_sessions_one_open", "cash_sessions", ["tenant_id"], unique=True,
        postgresql_where=sa.text("status = 'open'"), sqlite_where=sa.text("status = 'open'"),
    )
    op.create_table(
        "cash_movements",
        *_base(),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("cash_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reason", sa.String(20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_name", sa.String(120), nullable=True),
    )
    op.create_index("ix_cash_movements_session", "cash_movements", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_cash_movements_session", table_name="cash_movements")
    op.drop_table("cash_movements")
    op.drop_index("uq_cash_sessions_one_open", table_name="cash_sessions")
    op.drop_table("cash_sessions")
