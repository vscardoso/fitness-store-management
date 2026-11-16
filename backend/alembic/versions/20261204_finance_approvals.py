"""Pedidos de aprovação dos administradores para mexer no saldo de um banco

Revision ID: 20261204_finance_approvals
Revises: 20261202_purchase_cash_part

Aditiva: duas tabelas novas e vazias (nada existente muda).
"""
import sqlalchemy as sa
from alembic import op

revision = "20261204_finance_approvals"
down_revision = "20261202_purchase_cash_part"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "finance_approvals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=True),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("summary", sa.String(400), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("params", sa.Text(), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("financial_accounts.id"), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("dedupe_key", sa.String(80), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("rule", sa.String(12), nullable=False, server_default="all_admins"),
        sa.Column("requested_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("requested_by_name", sa.String(120), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_message", sa.Text(), nullable=True),
    )
    op.create_index("ix_finance_approvals_id", "finance_approvals", ["id"])
    op.create_index("ix_finance_approvals_tenant_id", "finance_approvals", ["tenant_id"])
    op.create_index("ix_finance_approvals_dedupe_key", "finance_approvals", ["dedupe_key"])
    op.create_index("ix_finance_approvals_status", "finance_approvals", ["status"])

    op.create_table(
        "finance_approval_votes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=True),
        sa.Column("approval_id", sa.Integer(), sa.ForeignKey("finance_approvals.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("user_name", sa.String(120), nullable=True),
        sa.Column("vote", sa.String(8), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
    )
    op.create_index("ix_finance_approval_votes_id", "finance_approval_votes", ["id"])
    op.create_index("ix_finance_approval_votes_tenant_id", "finance_approval_votes", ["tenant_id"])
    op.create_index("ix_finance_approval_votes_approval_id", "finance_approval_votes", ["approval_id"])
    op.create_index("uq_finance_approval_vote", "finance_approval_votes", ["approval_id", "user_id"], unique=True)


def downgrade() -> None:
    op.drop_table("finance_approval_votes")
    op.drop_table("finance_approvals")
