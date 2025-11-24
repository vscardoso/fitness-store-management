"""
Initialize multi-tenancy: add stores table, tenant_id to models, and per-tenant uniques.

Revision ID: 004_multi_tenant_init
Revises: 003_remove_batch_from_products
Create Date: 2025-11-17
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = "004_multi_tenant_init"
down_revision: str | None = "003_remove_batch_from_products"
branch_labels = None
depends_on = None


def _add_tenant_id(table: str) -> None:
    try:
        op.add_column(
            table,
            sa.Column(
                "tenant_id",
                sa.Integer(),
                nullable=True,
                comment="Tenant/Store identifier",
            ),
        )
        op.create_index(f"ix_{table}_tenant_id", table, ["tenant_id"])  # safe in most dialects
        op.create_foreign_key(
            f"fk_{table}_tenant_id_stores",
            source_table=table,
            referent_table="stores",
            local_cols=["tenant_id"],
            remote_cols=["id"],
            ondelete="RESTRICT",
        )
    except Exception:
        # Column or index may already exist in some environments
        pass


def upgrade() -> None:
    # 1) Create stores table first
    op.create_table(
        "stores",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        # self-referential tenant_id (nullable) to align with BaseModel design
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_stores_slug"),
        sa.ForeignKeyConstraint(["tenant_id"], ["stores.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_stores_id", "stores", ["id"])  # consistency with other tables
    op.create_index("ix_stores_slug", "stores", ["slug"])  # duplicates unique for query perf

    # 2) Add tenant_id to existing tables (nullable for backfill)
    tables_to_patch = [
        "products",
        "categories",
        "customers",
        "sales",
        "sale_items",
        "payments",
        "inventory",
        "inventory_movements",
        "stock_entries",
        "entry_items",
        "trips",
        "users",
    ]
    for t in tables_to_patch:
        _add_tenant_id(t)

    # 3) Replace global unique constraints with per-tenant uniques
    # Use batch_alter_table for SQLite compatibility
    # products: (tenant_id, sku) and (tenant_id, barcode)
    try:
        with op.batch_alter_table("products", recreate="auto") as batch_op:
            # Drop old uniques if present
            try:
                batch_op.drop_constraint("uq_products_sku", type_="unique")
            except Exception:
                pass
            try:
                batch_op.drop_constraint("uq_products_barcode", type_="unique")
            except Exception:
                pass
            # Ensure columns are indexed (non-unique)
            try:
                batch_op.create_unique_constraint("uq_products_tenant_sku", ["tenant_id", "sku"])
            except Exception:
                pass
            try:
                batch_op.create_unique_constraint("uq_products_tenant_barcode", ["tenant_id", "barcode"])
            except Exception:
                pass
    except Exception:
        pass

    # categories: (tenant_id, slug)
    try:
        with op.batch_alter_table("categories", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("uq_categories_slug", type_="unique")
            except Exception:
                pass
            try:
                batch_op.create_unique_constraint("uq_categories_tenant_slug", ["tenant_id", "slug"])
            except Exception:
                pass
    except Exception:
        pass

    # customers: (tenant_id, email) and (tenant_id, document_number)
    try:
        with op.batch_alter_table("customers", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("uq_customers_email", type_="unique")
            except Exception:
                pass
            try:
                batch_op.drop_constraint("uq_customers_document", type_="unique")
            except Exception:
                pass
            try:
                batch_op.create_unique_constraint("uq_customers_tenant_email", ["tenant_id", "email"])
            except Exception:
                pass
            try:
                batch_op.create_unique_constraint("uq_customers_tenant_document", ["tenant_id", "document_number"])
            except Exception:
                pass
    except Exception:
        pass

    # sales: (tenant_id, sale_number)
    try:
        with op.batch_alter_table("sales", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("uq_sales_sale_number", type_="unique")
            except Exception:
                pass
            try:
                batch_op.create_unique_constraint("uq_sales_tenant_number", ["tenant_id", "sale_number"])
            except Exception:
                pass
    except Exception:
        pass

    # stock_entries: (tenant_id, entry_code)
    try:
        with op.batch_alter_table("stock_entries", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("stock_entries_entry_code_key", type_="unique")
            except Exception:
                pass
            try:
                batch_op.drop_constraint("uq_stock_entries_entry_code", type_="unique")
            except Exception:
                pass
            try:
                batch_op.create_unique_constraint("uq_stock_entries_tenant_code", ["tenant_id", "entry_code"])
            except Exception:
                pass
    except Exception:
        pass

    # trips: (tenant_id, trip_code)
    try:
        with op.batch_alter_table("trips", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("trips_trip_code_key", type_="unique")
            except Exception:
                pass
            try:
                batch_op.drop_constraint("uq_trips_trip_code", type_="unique")
            except Exception:
                pass
            try:
                batch_op.create_unique_constraint("uq_trips_tenant_code", ["tenant_id", "trip_code"])
            except Exception:
                pass
    except Exception:
        pass

    # users: optional per-tenant uniqueness; if global unique existed, keep or relax based on SAAS strategy
    try:
        with op.batch_alter_table("users", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("users_email_key", type_="unique")
            except Exception:
                pass
            # If you want per-tenant emails, uncomment below
            # try:
            #     batch_op.create_unique_constraint("uq_users_tenant_email", ["tenant_id", "email"])
            # except Exception:
            #     pass
    except Exception:
        pass

    # 4) Seed a default store and backfill tenant_id
    conn = op.get_bind()
    result = conn.execute(sa.text(
        """
        INSERT INTO stores (name, slug, domain, is_default, is_active)
        VALUES (:name, :slug, :domain, 1, 1)
        RETURNING id
        """
    ), {"name": "Default Store", "slug": "default", "domain": None})

    default_store_id = None
    try:
        default_store_id = result.scalar()
    except Exception:
        # SQLite older versions do not support RETURNING; fallback to select
        conn.execute(sa.text(
            "INSERT INTO stores (name, slug, domain, is_default, is_active) VALUES (:name, :slug, :domain, 1, 1)"
        ), {"name": "Default Store", "slug": "default", "domain": None})
        default_store_id = conn.execute(sa.text("SELECT id FROM stores WHERE slug = 'default' LIMIT 1")).scalar()

    # Backfill all tables' tenant_id to default where NULL
    for t in tables_to_patch:
        try:
            conn.execute(sa.text(f"UPDATE {t} SET tenant_id = :tid WHERE tenant_id IS NULL"), {"tid": default_store_id})
        except Exception:
            pass


def downgrade() -> None:
    # Best-effort downgrade: remove per-tenant uniques and tenant_id columns, then drop stores
    # Remove unique constraints we added
    try:
        with op.batch_alter_table("trips", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("uq_trips_tenant_code", type_="unique")
            except Exception:
                pass
    except Exception:
        pass
    try:
        with op.batch_alter_table("stock_entries", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("uq_stock_entries_tenant_code", type_="unique")
            except Exception:
                pass
    except Exception:
        pass
    try:
        with op.batch_alter_table("sales", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("uq_sales_tenant_number", type_="unique")
            except Exception:
                pass
    except Exception:
        pass
    try:
        with op.batch_alter_table("customers", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("uq_customers_tenant_email", type_="unique")
            except Exception:
                pass
            try:
                batch_op.drop_constraint("uq_customers_tenant_document", type_="unique")
            except Exception:
                pass
    except Exception:
        pass
    try:
        with op.batch_alter_table("categories", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("uq_categories_tenant_slug", type_="unique")
            except Exception:
                pass
    except Exception:
        pass
    try:
        with op.batch_alter_table("products", recreate="auto") as batch_op:
            try:
                batch_op.drop_constraint("uq_products_tenant_sku", type_="unique")
            except Exception:
                pass
            try:
                batch_op.drop_constraint("uq_products_tenant_barcode", type_="unique")
            except Exception:
                pass
    except Exception:
        pass

    # Drop tenant_id FKs and columns
    tables_to_patch = [
        "products",
        "categories",
        "customers",
        "sales",
        "sale_items",
        "payments",
        "inventory",
        "inventory_movements",
        "stock_entries",
        "entry_items",
        "trips",
        "users",
    ]
    for t in tables_to_patch:
        try:
            op.drop_constraint(f"fk_{t}_tenant_id_stores", table_name=t, type_="foreignkey")
        except Exception:
            pass
        try:
            op.drop_index(f"ix_{t}_tenant_id", table_name=t)
        except Exception:
            pass
        try:
            op.drop_column(t, "tenant_id")
        except Exception:
            pass

    # Finally drop stores table
    try:
        op.drop_index("ix_stores_slug", table_name="stores")
    except Exception:
        pass
    try:
        op.drop_index("ix_stores_id", table_name="stores")
    except Exception:
        pass
    op.drop_table("stores")
