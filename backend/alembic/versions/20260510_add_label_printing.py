"""add label printing system (Elgin L42 Pro)

Revision ID: 20260510_label_printing
Revises: eb4d9bbde072
Create Date: 2026-05-10

Tabelas criadas:
  - label_printers: cadastro de impressoras (Ethernet/USB/Serial, ZPL)
  - print_jobs:     histórico de jobs de impressão com ZPL gerado
"""
from alembic import op
import sqlalchemy as sa

revision = "20260510_label_printing"
down_revision = "eb4d9bbde072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "label_printers",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id", ondelete="RESTRICT"), nullable=True, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("model", sa.String(100), nullable=False, server_default="Elgin L42 Pro"),
        sa.Column(
            "connection_type",
            sa.Enum("usb", "ethernet", "serial", name="connectiontype"),
            nullable=False,
            server_default="ethernet",
        ),
        sa.Column(
            "protocol",
            sa.Enum("zpl", "cpcl", "esc_pos", name="printerprotocol"),
            nullable=False,
            server_default="zpl",
        ),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column("port", sa.Integer(), nullable=False, server_default="9100"),
        sa.Column("serial_port", sa.String(50), nullable=True),
        sa.Column("baud_rate", sa.Integer(), nullable=False, server_default="9600"),
        sa.Column("usb_device", sa.String(100), nullable=True),
        sa.Column("label_width_mm", sa.Integer(), nullable=False, server_default="55"),
        sa.Column("label_height_mm", sa.Integer(), nullable=False, server_default="65"),
        sa.Column("dpi", sa.Integer(), nullable=False, server_default="203"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
    )

    op.create_table(
        "print_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id", ondelete="RESTRICT"), nullable=True, index=True),
        sa.Column("printer_id", sa.Integer(), sa.ForeignKey("label_printers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "status",
            sa.Enum("queued", "printing", "done", "error", "cancelled", name="printjobstatus"),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("zpl_content", sa.Text(), nullable=True),
        sa.Column("product_name", sa.String(200), nullable=True),
        sa.Column("sku", sa.String(50), nullable=True),
        sa.Column("variant_label", sa.String(100), nullable=True),
        sa.Column("price", sa.String(20), nullable=True),
        sa.Column("show_price", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("show_sku", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_table("print_jobs")
    op.drop_table("label_printers")
    op.execute("DROP TYPE IF EXISTS printjobstatus")
    op.execute("DROP TYPE IF EXISTS connectiontype")
    op.execute("DROP TYPE IF EXISTS printerprotocol")
