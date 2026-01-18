"""add push notifications

Revision ID: 011
Revises: 20251205_123602
Create Date: 2025-12-05

"""
from alembic import op
import sqlalchemy as sa

revision = '011'
down_revision = '20251205_123602'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Push Tokens
    op.create_table('push_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=255), nullable=False),
        sa.Column('device_type', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['stores.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token')
    )
    op.create_index('ix_push_tokens_tenant_id', 'push_tokens', ['tenant_id'])
    op.create_index('ix_push_tokens_token', 'push_tokens', ['token'])
    op.create_index('ix_push_tokens_user_id', 'push_tokens', ['user_id'])

    # Notification Logs
    op.create_table('notification_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('data', sa.Text(), nullable=True),
        sa.Column('sent_at', sa.DateTime(), nullable=False),
        sa.Column('success', sa.Boolean(), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['stores.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_notification_logs_tenant_id', 'notification_logs', ['tenant_id'])
    op.create_index('ix_notification_logs_user_id', 'notification_logs', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_notification_logs_user_id', table_name='notification_logs')
    op.drop_index('ix_notification_logs_tenant_id', table_name='notification_logs')
    op.drop_table('notification_logs')
    op.drop_index('ix_push_tokens_user_id', table_name='push_tokens')
    op.drop_index('ix_push_tokens_token', table_name='push_tokens')
    op.drop_index('ix_push_tokens_tenant_id', table_name='push_tokens')
    op.drop_table('push_tokens')
