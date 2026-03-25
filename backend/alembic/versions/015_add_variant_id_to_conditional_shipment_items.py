"""add variant_id to conditional_shipment_items

Revision ID: 015
Revises: 014
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '015'
down_revision: Union[str, None] = '014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Adicionar variant_id à tabela conditional_shipment_items
    op.add_column(
        'conditional_shipment_items',
        sa.Column('variant_id', sa.Integer(), nullable=True)
    )
    op.create_index(
        'ix_conditional_shipment_items_variant_id',
        'conditional_shipment_items',
        ['variant_id']
    )
    # Nota: FK constraint não é adicionada via ALTER em SQLite
    # A integridade é garantida pela ORM (relationship)


def downgrade() -> None:
    op.drop_index(
        'ix_conditional_shipment_items_variant_id',
        table_name='conditional_shipment_items'
    )
    op.drop_column('conditional_shipment_items', 'variant_id')
