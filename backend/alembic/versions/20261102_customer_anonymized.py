"""LGPD: customers.anonymized_at (cliente anonimizado a pedido do titular)

Revision ID: 20261102_customer_anonymized
Revises: 20261101_product_codes

Aditiva: nulo para todos os clientes existentes.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261102_customer_anonymized"
down_revision = "20261101_product_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("anonymized_at", sa.DateTime(), nullable=True,
                                         comment="Quando os dados pessoais foram anonimizados (LGPD)"))


def downgrade() -> None:
    op.drop_column("customers", "anonymized_at")
