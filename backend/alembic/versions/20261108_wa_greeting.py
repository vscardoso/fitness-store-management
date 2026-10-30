"""WhatsApp oficial: saudação automática por número (texto e liga/desliga) e trava por conversa

Revision ID: 20261108_wa_greeting
Revises: 20261107_wa_message_pricing
"""
from alembic import op
import sqlalchemy as sa

revision = "20261108_wa_greeting"
down_revision = "20261107_wa_message_pricing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("whatsapp_cloud_numbers", sa.Column("greeting_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("whatsapp_cloud_numbers", sa.Column("greeting_text", sa.Text(), nullable=True))
    op.add_column("whatsapp_conversations", sa.Column("last_greeting_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("whatsapp_conversations", "last_greeting_at")
    op.drop_column("whatsapp_cloud_numbers", "greeting_text")
    op.drop_column("whatsapp_cloud_numbers", "greeting_enabled")
