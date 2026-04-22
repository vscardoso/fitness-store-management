"""Add damaged/lost quantities to conditional shipment items

Revision ID: 20260407_090000
Revises: 7aae58f87c66
Create Date: 2026-04-07 09:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260407_090000'
down_revision = '7aae58f87c66'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('conditional_shipment_items') as batch_op:
        batch_op.add_column(sa.Column('quantity_damaged', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('quantity_lost', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('conditional_shipment_items', 'quantity_lost')
    op.drop_column('conditional_shipment_items', 'quantity_damaged')