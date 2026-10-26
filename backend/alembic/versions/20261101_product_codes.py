"""codigo da etiqueta por produto e variacao (#101-1)

Revision ID: 20261101_product_codes
Revises: 20261031_short_codes

Aditiva: produtos e variações existentes ficam sem número até rodar scripts/short_codes_backfill.py.
O short_code antigo (por variação) continua existindo e continua achando a peça.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261101_product_codes"
down_revision = "20261031_short_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("code_number", sa.Integer(), nullable=True,
                                        comment="Número do produto na etiqueta, por loja (sem repetir nem reaproveitar)"))
    op.create_index("ix_products_code_number", "products", ["code_number"])
    op.create_unique_constraint("uq_product_tenant_code_number", "products", ["tenant_id", "code_number"])

    op.add_column("product_variants", sa.Column("product_code", sa.Integer(), nullable=True,
                                                comment="Número do produto na etiqueta (cópia de products.code_number)"))
    op.add_column("product_variants", sa.Column("variant_number", sa.Integer(), nullable=True,
                                                comment="Número da variação dentro do produto (1, 2, 3...)"))
    op.create_index("ix_product_variants_product_code", "product_variants", ["product_code"])
    op.create_unique_constraint("uq_variant_product_number", "product_variants", ["product_id", "variant_number"])

    op.add_column("catalog_counters", sa.Column("next_product_code", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    op.drop_column("catalog_counters", "next_product_code")
    op.drop_constraint("uq_variant_product_number", "product_variants", type_="unique")
    op.drop_index("ix_product_variants_product_code", table_name="product_variants")
    op.drop_column("product_variants", "variant_number")
    op.drop_column("product_variants", "product_code")
    op.drop_constraint("uq_product_tenant_code_number", "products", type_="unique")
    op.drop_index("ix_products_code_number", table_name="products")
    op.drop_column("products", "code_number")
