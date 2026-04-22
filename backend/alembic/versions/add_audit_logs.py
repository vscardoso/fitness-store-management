"""add audit_logs table

Revision ID: add_audit_logs
Revises: 79daf688a77d
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa

revision = 'add_audit_logs'
down_revision = '20260407_090000'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('tenant_id', sa.Integer(), nullable=True, index=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('user_email', sa.String(255), nullable=True),
        sa.Column('action', sa.String(100), nullable=False, index=True),
        sa.Column('entity', sa.String(100), nullable=True),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, index=True),
    )


def downgrade():
    op.drop_table('audit_logs')
