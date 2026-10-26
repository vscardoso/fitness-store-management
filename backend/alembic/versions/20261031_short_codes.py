"""codigo curto da etiqueta por variacao (product_variants.short_code) e contador por loja

Revision ID: 20261031_short_codes
Revises: 20261030_legal_acceptances

Aditiva: as variações existentes ficam sem número até rodar scripts/short_codes_backfill.py.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261031_short_codes"
down_revision = "20261030_legal_acceptances"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("product_variants", sa.Column("short_code", sa.Integer(), nullable=True,
                                                comment="Código curto da etiqueta, por loja (sem repetir nem reaproveitar)"))
    op.create_index("ix_product_variants_short_code", "product_variants", ["short_code"])
    op.create_unique_constraint("uq_variant_tenant_short_code", "product_variants", ["tenant_id", "short_code"])

    op.create_table(
        "catalog_counters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("next_short_code", sa.Integer(), nullable=False),
        sa.UniqueConstraint("tenant_id", name="uq_catalog_counter_tenant"),
    )
    op.create_index("ix_catalog_counters_id", "catalog_counters", ["id"])
    op.create_index("ix_catalog_counters_tenant_id", "catalog_counters", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("catalog_counters")
    op.drop_constraint("uq_variant_tenant_short_code", "product_variants", type_="unique")
    op.drop_index("ix_product_variants_short_code", table_name="product_variants")
    op.drop_column("product_variants", "short_code")
