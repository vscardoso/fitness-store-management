"""WhatsApp oficial: cobrança por mensagem (campo `pricing` dos status da Meta)

Revision ID: 20261107_wa_message_pricing
Revises: 20261106_stock_count_status
"""
from alembic import op
import sqlalchemy as sa

revision = "20261107_wa_message_pricing"
down_revision = "20261106_stock_count_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("whatsapp_messages", sa.Column("pricing_billable", sa.Boolean(), nullable=True))
    op.add_column("whatsapp_messages", sa.Column("pricing_category", sa.String(40), nullable=True))
    op.add_column("whatsapp_messages", sa.Column("pricing_type", sa.String(40), nullable=True))
    op.add_column("whatsapp_messages", sa.Column("pricing_model", sa.String(16), nullable=True))
    op.add_column("whatsapp_messages", sa.Column("pricing_raw", sa.Text(), nullable=True))


def downgrade() -> None:
    for col in ("pricing_raw", "pricing_model", "pricing_type", "pricing_category", "pricing_billable"):
        op.drop_column("whatsapp_messages", col)
