"""WhatsApp oficial: coexistência (celular da loja + Cloud API no mesmo número), Embedded Signup e agenda

Revision ID: 20261118_wa_coexistence
Revises: 20261117_payable_expense
"""
from alembic import op
import sqlalchemy as sa

revision = "20261118_wa_coexistence"
down_revision = "20261117_payable_expense"
branch_labels = None
depends_on = None


def _number_columns():
    return [
        sa.Column("is_coexistence", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("business_id", sa.String(64), nullable=True),
        sa.Column("access_token_encrypted", sa.Text(), nullable=True),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("connection_status", sa.String(20), nullable=True),
        sa.Column("connection_event", sa.String(60), nullable=True),
        sa.Column("connection_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("connection_detail", sa.Text(), nullable=True),
        sa.Column("contacts_sync_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("history_sync_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("history_sync_status", sa.String(20), nullable=True),
        sa.Column("history_sync_progress", sa.Integer(), nullable=True),
        sa.Column("history_sync_phase", sa.Integer(), nullable=True),
    ]


def upgrade() -> None:
    for col in _number_columns():
        op.add_column("whatsapp_cloud_numbers", col)
    op.add_column("whatsapp_conversations", sa.Column("contact_name", sa.String(255), nullable=True))
    op.add_column("whatsapp_messages", sa.Column("source", sa.String(12), nullable=True))

    op.create_table(
        "whatsapp_contacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("number_id", sa.Integer(), sa.ForeignKey("whatsapp_cloud_numbers.id"), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("first_name", sa.String(120), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("number_id", "phone", name="uq_whatsapp_contact_phone"),
    )
    op.create_index("ix_whatsapp_contacts_id", "whatsapp_contacts", ["id"])
    op.create_index("ix_whatsapp_contacts_tenant_id", "whatsapp_contacts", ["tenant_id"])
    op.create_index("ix_whatsapp_contacts_number_id", "whatsapp_contacts", ["number_id"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_contacts_number_id", table_name="whatsapp_contacts")
    op.drop_index("ix_whatsapp_contacts_tenant_id", table_name="whatsapp_contacts")
    op.drop_index("ix_whatsapp_contacts_id", table_name="whatsapp_contacts")
    op.drop_table("whatsapp_contacts")
    op.drop_column("whatsapp_messages", "source")
    op.drop_column("whatsapp_conversations", "contact_name")
    for col in reversed(_number_columns()):
        op.drop_column("whatsapp_cloud_numbers", col.name)
