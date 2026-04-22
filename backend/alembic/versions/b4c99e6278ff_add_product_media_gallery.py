"""add product media gallery

Revision ID: b4c99e6278ff
Revises: add_audit_logs
Create Date: 2026-04-07 15:01:09.513346

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4c99e6278ff'
down_revision: Union[str, None] = 'add_audit_logs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'product_media',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('variant_id', sa.Integer(), nullable=True),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_cover', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('media_type', sa.String(length=20), nullable=False, server_default='photo'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['variant_id'], ['product_variants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_product_media_product_id', 'product_media', ['product_id'], unique=False)
    op.create_index('ix_product_media_variant_id', 'product_media', ['variant_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_product_media_variant_id', table_name='product_media')
    op.drop_index('ix_product_media_product_id', table_name='product_media')
    op.drop_table('product_media')
