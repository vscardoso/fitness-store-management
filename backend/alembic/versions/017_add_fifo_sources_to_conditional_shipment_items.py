"""add fifo_sources to conditional_shipment_items

Revision ID: 017_fifo_sources_cs
Revises: 016_merge_heads
Create Date: 2026-03-24

Adiciona coluna fifo_sources (JSON) a conditional_shipment_items para
rastrear de quais entry_items o estoque foi reservado via FIFO.
Permite reverter exatamente os mesmos entry_items ao processar devoluções.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '017_fifo_sources_cs'
down_revision: Union[str, None] = '016_merge_heads'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'conditional_shipment_items',
        sa.Column('fifo_sources', sa.JSON(), nullable=True,
                  comment='Fontes FIFO usadas na reserva de estoque')
    )


def downgrade() -> None:
    op.drop_column('conditional_shipment_items', 'fifo_sources')
