"""WhatsApp oficial (Cloud API da Meta): números, conversas e mensagens

Revision ID: 20261023_whatsapp_cloud
Revises: 20261023_lot_costs
"""
from alembic import op
import sqlalchemy as sa

revision = "20261023_whatsapp_cloud"
down_revision = "20261023_lot_costs"
branch_labels = None
depends_on = None


def _base_columns():
    return [
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "whatsapp_cloud_numbers",
        *_base_columns(),
        sa.Column("phone_number_id", sa.String(64), nullable=False),
        sa.Column("waba_id", sa.String(64), nullable=True),
        sa.Column("display_phone_number", sa.String(32), nullable=True),
        sa.Column("verified_name", sa.String(120), nullable=True),
    )
    op.create_index("ix_whatsapp_cloud_numbers_id", "whatsapp_cloud_numbers", ["id"])
    op.create_index("ix_whatsapp_cloud_numbers_tenant_id", "whatsapp_cloud_numbers", ["tenant_id"])
    op.create_index("ix_whatsapp_cloud_numbers_phone_number_id", "whatsapp_cloud_numbers", ["phone_number_id"], unique=True)

    op.create_table(
        "whatsapp_conversations",
        *_base_columns(),
        sa.Column("number_id", sa.Integer(), sa.ForeignKey("whatsapp_cloud_numbers.id"), nullable=False),
        sa.Column("contact_key", sa.String(160), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("wa_id", sa.String(32), nullable=True),
        sa.Column("bsuid", sa.String(150), nullable=True),
        sa.Column("profile_name", sa.String(255), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_inbound_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("unread_count", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("number_id", "contact_key", name="uq_whatsapp_conversation_contact"),
    )
    op.create_index("ix_whatsapp_conversations_id", "whatsapp_conversations", ["id"])
    op.create_index("ix_whatsapp_conversations_tenant_id", "whatsapp_conversations", ["tenant_id"])
    op.create_index("ix_whatsapp_conversations_number_id", "whatsapp_conversations", ["number_id"])
    op.create_index("ix_whatsapp_conversations_phone", "whatsapp_conversations", ["phone"])
    op.create_index("ix_whatsapp_conversations_bsuid", "whatsapp_conversations", ["bsuid"])

    op.create_table(
        "whatsapp_messages",
        *_base_columns(),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("whatsapp_conversations.id"), nullable=False),
        sa.Column("wamid", sa.String(255), nullable=False),
        sa.Column("direction", sa.String(3), nullable=False),
        sa.Column("msg_type", sa.String(30), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("status_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.create_index("ix_whatsapp_messages_id", "whatsapp_messages", ["id"])
    op.create_index("ix_whatsapp_messages_tenant_id", "whatsapp_messages", ["tenant_id"])
    op.create_index("ix_whatsapp_messages_conversation_id", "whatsapp_messages", ["conversation_id"])
    op.create_index("ix_whatsapp_messages_wamid", "whatsapp_messages", ["wamid"], unique=True)


def downgrade() -> None:
    op.drop_table("whatsapp_messages")
    op.drop_table("whatsapp_conversations")
    op.drop_table("whatsapp_cloud_numbers")
