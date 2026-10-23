"""Registro de erros (error_logs): tabela nova, aditiva.

Guarda os erros da API e do app para diagnóstico (sem senha/token/chave).
"""
from alembic import op
import sqlalchemy as sa

revision = "20261024_error_logs"
down_revision = "20261023_whatsapp_cloud"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "error_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True, index=True),
        sa.Column("level", sa.String(10), nullable=False, server_default="error"),
        sa.Column("source", sa.String(10), nullable=False, server_default="api"),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("method", sa.String(10), nullable=True),
        sa.Column("path", sa.String(300), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("error_type", sa.String(120), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("app_version", sa.String(40), nullable=True),
    )
    op.create_index("ix_error_logs_user_id", "error_logs", ["user_id"])
    op.create_index("ix_error_logs_status_code", "error_logs", ["status_code"])
    op.create_index("ix_error_logs_created_at", "error_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_error_logs_created_at", table_name="error_logs")
    op.drop_index("ix_error_logs_status_code", table_name="error_logs")
    op.drop_index("ix_error_logs_user_id", table_name="error_logs")
    op.drop_table("error_logs")
