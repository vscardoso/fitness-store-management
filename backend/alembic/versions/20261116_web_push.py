"""Notificações do app instalado (Web Push): uma inscrição por aparelho.

Revision ID: 20261116_web_push
Revises: 20261115_cash_transfer
"""
import sqlalchemy as sa
from alembic import op

revision = "20261116_web_push"
down_revision = "20261115_cash_transfer"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "web_push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("endpoint_hash", sa.String(64), nullable=False),
        sa.Column("p256dh", sa.String(255), nullable=False),
        sa.Column("auth", sa.String(255), nullable=False),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_web_push_subscriptions_user_id", "web_push_subscriptions", ["user_id"])
    op.create_index("ix_web_push_subscriptions_tenant_id", "web_push_subscriptions", ["tenant_id"])
    op.create_index("ix_web_push_subscriptions_endpoint_hash", "web_push_subscriptions", ["endpoint_hash"], unique=True)


def downgrade():
    op.drop_table("web_push_subscriptions")
