"""WhatsApp: guarda quando vence a autorização que a loja deu à Meta (whatsapp_cloud_numbers.token_expires_at).

Revision ID: 20261209_wa_token_expiry
Revises: 20261208_sale_discount_share
"""
import sqlalchemy as sa
from alembic import op

revision = "20261209_wa_token_expiry"
down_revision = "20261208_sale_discount_share"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("whatsapp_cloud_numbers", sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("whatsapp_cloud_numbers", "token_expires_at")
