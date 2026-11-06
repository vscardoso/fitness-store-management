"""Fiado: parcelas a receber de clientes, recebimentos, forma de pagamento "fiado" e abatimento na devolução.

Revision ID: 20261120_receivables
Revises: 20261119_count_counted_by
"""
import sqlalchemy as sa
from alembic import op

revision = "20261120_receivables"
down_revision = "20261119_count_counted_by"
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
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # valor novo de enum não pode ser usado na mesma transação em que nasce: sobe fora dela
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'ON_ACCOUNT'")
    op.create_table(
        "receivables", *_base(),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False, index=True),
        sa.Column("sale_id", sa.Integer(), sa.ForeignKey("sales.id"), nullable=True, index=True),
        sa.Column("origin", sa.String(10), server_default="sale", nullable=False),
        sa.Column("installment_number", sa.Integer(), server_default="1", nullable=False),
        sa.Column("installments_total", sa.Integer(), server_default="1", nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("received_amount", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("abated_amount", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(10), server_default="open", nullable=False),
        sa.Column("description", sa.String(200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_name", sa.String(120), nullable=True),
    )
    op.create_index("ix_receivables_tenant_status_due", "receivables", ["tenant_id", "status", "due_date"])
    op.create_table(
        "receivable_payments", *_base(),
        sa.Column("receivable_id", sa.Integer(), sa.ForeignKey("receivables.id"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", sa.String(20), nullable=False),
        sa.Column("received_on", sa.Date(), nullable=False),
        sa.Column("created_by_name", sa.String(120), nullable=True),
    )
    op.add_column("sale_returns", sa.Column("receivable_abated", sa.Numeric(10, 2), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("sale_returns", "receivable_abated")
    op.drop_table("receivable_payments")
    op.drop_index("ix_receivables_tenant_status_due", table_name="receivables")
    op.drop_table("receivables")
    # o valor ON_ACCOUNT fica no tipo paymentmethod (Postgres não remove valor de enum); sem uso, não atrapalha
