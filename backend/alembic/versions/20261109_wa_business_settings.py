"""WhatsApp oficial: ausência com horário comercial, respostas rápidas e etiquetas

Revision ID: 20261109_wa_business_settings
Revises: 20261108_wa_greeting
"""
from alembic import op
import sqlalchemy as sa

revision = "20261109_wa_business_settings"
down_revision = "20261108_wa_greeting"
branch_labels = None
depends_on = None


def _base_columns():
    return [
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
    ]


def upgrade() -> None:
    op.add_column("whatsapp_cloud_numbers", sa.Column("away_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("whatsapp_cloud_numbers", sa.Column("away_text", sa.Text(), nullable=True))
    op.add_column("whatsapp_cloud_numbers", sa.Column("business_hours", sa.Text(), nullable=True))
    op.add_column("whatsapp_conversations", sa.Column("last_away_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "whatsapp_quick_replies", *_base_columns(),
        sa.Column("shortcut", sa.String(40), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.UniqueConstraint("tenant_id", "shortcut", name="uq_whatsapp_quick_reply_shortcut"),
    )
    op.create_index("ix_whatsapp_quick_replies_id", "whatsapp_quick_replies", ["id"])
    op.create_index("ix_whatsapp_quick_replies_tenant_id", "whatsapp_quick_replies", ["tenant_id"])

    op.create_table(
        "whatsapp_labels", *_base_columns(),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("color_key", sa.String(20), nullable=False),
        sa.UniqueConstraint("tenant_id", "name", name="uq_whatsapp_label_name"),
    )
    op.create_index("ix_whatsapp_labels_id", "whatsapp_labels", ["id"])
    op.create_index("ix_whatsapp_labels_tenant_id", "whatsapp_labels", ["tenant_id"])

    op.create_table(
        "whatsapp_conversation_labels", *_base_columns(),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("whatsapp_conversations.id"), nullable=False),
        sa.Column("label_id", sa.Integer(), sa.ForeignKey("whatsapp_labels.id"), nullable=False),
        sa.UniqueConstraint("conversation_id", "label_id", name="uq_whatsapp_conversation_label"),
    )
    op.create_index("ix_whatsapp_conversation_labels_id", "whatsapp_conversation_labels", ["id"])
    op.create_index("ix_whatsapp_conversation_labels_tenant_id", "whatsapp_conversation_labels", ["tenant_id"])
    op.create_index("ix_whatsapp_conversation_labels_conversation_id", "whatsapp_conversation_labels", ["conversation_id"])
    op.create_index("ix_whatsapp_conversation_labels_label_id", "whatsapp_conversation_labels", ["label_id"])


def downgrade() -> None:
    op.drop_table("whatsapp_conversation_labels")
    op.drop_table("whatsapp_labels")
    op.drop_table("whatsapp_quick_replies")
    op.drop_column("whatsapp_conversations", "last_away_at")
    op.drop_column("whatsapp_cloud_numbers", "business_hours")
    op.drop_column("whatsapp_cloud_numbers", "away_text")
    op.drop_column("whatsapp_cloud_numbers", "away_enabled")
