"""add pix_transactions

Revision ID: 20260409_pix_tx
Revises:
Create Date: 2026-04-09
"""
from alembic import op
import sqlalchemy as sa

revision = "20260409_pix_tx"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pix_transactions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("payment_id", sa.String(255), nullable=False),
        sa.Column("sale_id", sa.Integer(), sa.ForeignKey("sales.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount_expected", sa.Numeric(10, 2), nullable=False),
        sa.Column("amount_paid", sa.Numeric(10, 2), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("mp_external_reference", sa.String(255), nullable=False),
        sa.Column("payer_email", sa.String(255), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_by", sa.String(50), nullable=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.UniqueConstraint("payment_id", name="uq_pix_payment_id"),
    )
    op.create_index("ix_pix_transactions_sale_id", "pix_transactions", ["sale_id"])
    op.create_index("ix_pix_transactions_status", "pix_transactions", ["status"])
    op.create_index("ix_pix_transactions_payment_id", "pix_transactions", ["payment_id"])


def downgrade() -> None:
    op.drop_table("pix_transactions")
