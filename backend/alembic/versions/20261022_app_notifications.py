"""caixa de alertas da loja (app_notifications)

Revision ID: 20261022_app_notifications
Revises: 20261021_entry_supplier
"""
from alembic import op
import sqlalchemy as sa

revision = "20261022_app_notifications"
down_revision = "20261021_entry_supplier"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("dedupe_key", sa.String(120), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_app_notifications_tenant_id", "app_notifications", ["tenant_id"])
    op.create_index("ix_app_notifications_kind", "app_notifications", ["kind"])
    op.create_index("ix_app_notifications_dedupe_key", "app_notifications", ["dedupe_key"])


def downgrade() -> None:
    op.drop_table("app_notifications")
