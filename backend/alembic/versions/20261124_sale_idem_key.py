"""Chave de idempotência da venda (POST /sales/ com Idempotency-Key).

Revision ID: 20261124_sale_idem_key
Revises: 20261123_item_events

Aditiva: coluna nula e restrição única por (loja, chave). Várias vendas sem chave convivem (nulos não colidem).
"""
import sqlalchemy as sa
from alembic import op

revision = "20261124_sale_idem_key"
down_revision = "20261123_item_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("sales") as batch:
        batch.add_column(sa.Column("idempotency_key", sa.String(80), nullable=True))
        batch.add_column(sa.Column("idempotency_hash", sa.String(64), nullable=True))
        batch.create_unique_constraint("uq_sales_tenant_idem_key", ["tenant_id", "idempotency_key"])


def downgrade() -> None:
    with op.batch_alter_table("sales") as batch:
        batch.drop_constraint("uq_sales_tenant_idem_key", type_="unique")
        batch.drop_column("idempotency_hash")
        batch.drop_column("idempotency_key")
