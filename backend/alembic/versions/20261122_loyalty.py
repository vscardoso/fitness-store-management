"""Programa de fidelidade configurável por loja, com extrato de pontos e validade.

Revision ID: 20261122_loyalty
Revises: 20261121_month_closing

As lojas que já existem ficam com o programa LIGADO e a regra de hoje (1 ponto a cada R$ 10, sem validade, 1 ponto = R$ 0,10),
e o saldo de cada cliente vira um lançamento "Saldo anterior" sem validade: ninguém perde pontos.
"""
import sqlalchemy as sa
from alembic import op

revision = "20261122_loyalty"
down_revision = "20261121_month_closing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stores", sa.Column("loyalty_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("stores", sa.Column("loyalty_spend_per_point", sa.Numeric(10, 2), server_default="10", nullable=False))
    op.add_column("stores", sa.Column("loyalty_point_value", sa.Numeric(10, 4), server_default="0.10", nullable=False))
    op.add_column("stores", sa.Column("loyalty_min_redeem", sa.Numeric(10, 2), server_default="0", nullable=False))
    op.add_column("stores", sa.Column("loyalty_expiry_days", sa.Integer(), nullable=True))
    op.create_table(
        "loyalty_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=True, index=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False, index=True),
        sa.Column("sale_id", sa.Integer(), sa.ForeignKey("sales.id"), nullable=True, index=True),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("points", sa.Numeric(12, 2), nullable=False),
        sa.Column("remaining", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.String(200), nullable=True),
    )
    op.create_index("ix_loyalty_customer_remaining", "loyalty_entries", ["tenant_id", "customer_id", "remaining"])
    # quem já existe continua como era: programa ligado e o saldo atual como "saldo anterior"
    op.execute("UPDATE stores SET loyalty_enabled = true")
    op.execute("""
        INSERT INTO loyalty_entries (tenant_id, customer_id, kind, points, remaining, note, is_active, created_at, updated_at)
        SELECT tenant_id, id, 'opening', loyalty_points, loyalty_points, 'Saldo anterior ao programa configurável', true, now(), now()
        FROM customers WHERE loyalty_points > 0 AND is_active = true
    """)


def downgrade() -> None:
    op.drop_index("ix_loyalty_customer_remaining", table_name="loyalty_entries")
    op.drop_table("loyalty_entries")
    for col in ("loyalty_expiry_days", "loyalty_min_redeem", "loyalty_point_value", "loyalty_spend_per_point", "loyalty_enabled"):
        op.drop_column("stores", col)
