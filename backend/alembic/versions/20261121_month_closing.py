"""Saídas que não são despesa (retirada de sócio, empréstimo, fatura do cartão) e Fechamento do mês.

Revision ID: 20261121_month_closing
Revises: 20261120_receivables
"""
import sqlalchemy as sa
from alembic import op

revision = "20261121_month_closing"
down_revision = "20261120_receivables"
branch_labels = None
depends_on = None


def _base():
    return [
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=True, index=True),
    ]


def upgrade() -> None:
    op.create_table(
        "month_closings", *_base(),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("expected_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("counted_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("difference", sa.Numeric(12, 2), nullable=False),
        sa.Column("snapshot", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("closed_by_name", sa.String(120), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("uq_month_closing", "month_closings", ["tenant_id", "year", "month"], unique=True,
                    postgresql_where=sa.text("is_active = true"), sqlite_where=sa.text("is_active = 1"))
    op.create_table(
        "account_entries", *_base(),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("financial_accounts.id"), nullable=False, index=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("person", sa.String(120), nullable=True),
        sa.Column("description", sa.String(200), nullable=True),
        sa.Column("created_by_name", sa.String(120), nullable=True),
        sa.Column("closing_id", sa.Integer(), sa.ForeignKey("month_closings.id"), nullable=True, index=True),
    )


def downgrade() -> None:
    op.drop_table("account_entries")
    op.drop_index("uq_month_closing", table_name="month_closings")
    op.drop_table("month_closings")
