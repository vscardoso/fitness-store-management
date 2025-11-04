"""
Remove batch-related fields from products (batch_id, initial_quantity, batch_position).

Revision ID: 003_remove_batch_from_products
Revises: 
Create Date: 2025-11-03
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "003_remove_batch_from_products"
down_revision = "002_add_sale_sources"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # Verificação preventiva: não deve haver produtos com batch_id ainda presente
    try:
        result = conn.execute(sa.text("SELECT COUNT(*) FROM products WHERE batch_id IS NOT NULL"))
        count = result.scalar() or 0
        if count > 0:
            raise Exception(
                f"Migração abortada: {count} produtos ainda possuem batch_id. Migre os dados para StockEntry/EntryItem antes."
            )
    except Exception:
        # Em alguns bancos/estágios a coluna pode já não existir; seguir adiante
        pass

    # Remover colunas usando batch_alter_table para melhor compatibilidade (ex: SQLite)
    with op.batch_alter_table("products", recreate="auto") as batch_op:
        # Remover colunas se existirem
        try:
            batch_op.drop_column("batch_id")
        except Exception:
            pass
        try:
            batch_op.drop_column("initial_quantity")
        except Exception:
            pass
        try:
            batch_op.drop_column("batch_position")
        except Exception:
            pass


def downgrade():
    # Recriar colunas removidas
    with op.batch_alter_table("products", recreate="auto") as batch_op:
        try:
            batch_op.add_column(sa.Column("batch_id", sa.Integer(), nullable=True))
        except Exception:
            pass
        try:
            batch_op.add_column(sa.Column("initial_quantity", sa.Integer(), nullable=False, server_default="0"))
        except Exception:
            pass
        try:
            batch_op.add_column(sa.Column("batch_position", sa.Integer(), nullable=True))
        except Exception:
            pass

    # Nota: a FK de batch_id para batches.id foi removida definitivamente; não é recriada aqui
    # pois o sistema de Batch foi descontinuado.
