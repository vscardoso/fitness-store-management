"""Financeiro: contas (gaveta, bancos, maquininha), transferências, contas a pagar, data de corte e conta da despesa.

Revision ID: 20261114_finance
Revises: 20261113_media_tenant
"""
import sqlalchemy as sa
from alembic import op

revision = "20261114_finance"
down_revision = "20261113_media_tenant"
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
    op.add_column("stores", sa.Column("finance_start_date", sa.Date(), nullable=True))
    op.create_table(
        "financial_accounts", *_base(),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("opening_balance", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("receives_pix", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.create_index("uq_fin_account_one_cash", "financial_accounts", ["tenant_id"], unique=True,
                    postgresql_where=sa.text("kind = 'cash' AND is_active = true"))
    op.create_index("uq_fin_account_one_card", "financial_accounts", ["tenant_id"], unique=True,
                    postgresql_where=sa.text("kind = 'card' AND is_active = true"))
    op.create_index("uq_fin_account_one_pix", "financial_accounts", ["tenant_id"], unique=True,
                    postgresql_where=sa.text("receives_pix = true AND is_active = true"))
    op.create_table(
        "account_transfers", *_base(),
        sa.Column("from_account_id", sa.Integer(), sa.ForeignKey("financial_accounts.id"), nullable=True),
        sa.Column("to_account_id", sa.Integer(), sa.ForeignKey("financial_accounts.id"), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("description", sa.String(200), nullable=True),
        sa.Column("created_by_name", sa.String(120), nullable=True),
    )
    op.create_table(
        "payables", *_base(),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=True),
        sa.Column("supplier_name", sa.String(120), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(10), server_default="open", nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=True),
        sa.Column("paid_account_id", sa.Integer(), sa.ForeignKey("financial_accounts.id"), nullable=True),
        sa.Column("origin", sa.String(12), server_default="manual", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_payables_tenant_status_due", "payables", ["tenant_id", "status", "due_date"])
    op.add_column("expenses", sa.Column("account_id", sa.Integer(), sa.ForeignKey("financial_accounts.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("expenses", "account_id")
    op.drop_index("ix_payables_tenant_status_due", table_name="payables")
    op.drop_table("payables")
    op.drop_table("account_transfers")
    op.drop_index("uq_fin_account_one_pix", table_name="financial_accounts")
    op.drop_index("uq_fin_account_one_card", table_name="financial_accounts")
    op.drop_index("uq_fin_account_one_cash", table_name="financial_accounts")
    op.drop_table("financial_accounts")
    op.drop_column("stores", "finance_start_date")
