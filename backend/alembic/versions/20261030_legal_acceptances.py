"""aceite dos termos de uso e da politica de privacidade

Revision ID: 20261030_legal_acceptances
Revises: 20261029_item_list_price
"""
from alembic import op
import sqlalchemy as sa

revision = "20261030_legal_acceptances"
down_revision = "20261029_item_list_price"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "legal_acceptances",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.UniqueConstraint("user_id", "version", name="uq_legal_acceptance_user_version"),
    )
    op.create_index("ix_legal_acceptances_id", "legal_acceptances", ["id"])
    op.create_index("ix_legal_acceptances_tenant_id", "legal_acceptances", ["tenant_id"])
    op.create_index("ix_legal_acceptances_user_id", "legal_acceptances", ["user_id"])


def downgrade() -> None:
    op.drop_table("legal_acceptances")
