"""Add scheduling fields to conditional shipments

Revision ID: 009_add_scheduling
Revises: 008_add_conditional_shipments
Create Date: 2025-12-03

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '009_add_scheduling'
down_revision = '008_add_conditional_shipments'
branch_labels = None
depends_on = None


def upgrade():
    # Add scheduling fields
    op.add_column('conditional_shipments', sa.Column('scheduled_ship_date', sa.DateTime(), nullable=True))
    op.add_column('conditional_shipments', sa.Column('deadline_type', sa.String(length=10), nullable=False, server_default='days'))
    op.add_column('conditional_shipments', sa.Column('deadline_value', sa.Integer(), nullable=False, server_default='7'))
    op.add_column('conditional_shipments', sa.Column('carrier', sa.String(length=100), nullable=True))
    op.add_column('conditional_shipments', sa.Column('tracking_code', sa.String(length=100), nullable=True))


def downgrade():
    # Remove scheduling fields
    op.drop_column('conditional_shipments', 'tracking_code')
    op.drop_column('conditional_shipments', 'carrier')
    op.drop_column('conditional_shipments', 'deadline_value')
    op.drop_column('conditional_shipments', 'deadline_type')
    op.drop_column('conditional_shipments', 'scheduled_ship_date')
