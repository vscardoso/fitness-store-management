"""
Add subscription system: subscriptions table + new Store fields

Revision ID: 005_add_subscription_system
Revises: 004_multi_tenant_init
Create Date: 2025-01-21
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from datetime import datetime, timedelta

# revision identifiers
revision: str = "005_add_subscription_system"
down_revision: str | None = "004_multi_tenant_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Criar tabela subscriptions
    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('stores.id'), nullable=False, unique=True),
        
        # Plan e status
        sa.Column('plan', sa.String(20), nullable=False, server_default='trial'),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        
        # Trial tracking
        sa.Column('is_trial', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('trial_started_at', sa.DateTime(), nullable=True),
        sa.Column('trial_ends_at', sa.DateTime(), nullable=True),
        
        # Billing periods
        sa.Column('current_period_start', sa.DateTime(), nullable=True),
        sa.Column('current_period_end', sa.DateTime(), nullable=True),
        
        # Limits per plan
        sa.Column('max_products', sa.Integer(), nullable=False, server_default='100'),
        sa.Column('max_users', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('max_sales_per_month', sa.Integer(), nullable=True),
        
        # Feature flags
        sa.Column('feature_advanced_reports', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('feature_multi_store', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('feature_api_access', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('feature_custom_fields', sa.Boolean(), nullable=False, server_default='0'),
        
        # Payment provider integration (opcional)
        sa.Column('payment_provider', sa.String(50), nullable=True),
        sa.Column('payment_customer_id', sa.String(255), nullable=True),
        sa.Column('payment_subscription_id', sa.String(255), nullable=True),
        
        # Cancellation
        sa.Column('cancelled_at', sa.DateTime(), nullable=True),
        sa.Column('cancelled_reason', sa.String(500), nullable=True),
        
        # BaseModel timestamps
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
    )
    
    # 2. Adicionar novos campos na tabela stores
    op.add_column('stores', sa.Column('subdomain', sa.String(100), nullable=True, unique=True))
    op.add_column('stores', sa.Column('plan', sa.String(20), nullable=True, server_default='trial'))
    op.add_column('stores', sa.Column('trial_ends_at', sa.DateTime(), nullable=True))
    
    # 3. Criar índices
    op.create_index(op.f('ix_stores_subdomain'), 'stores', ['subdomain'], unique=True)
    op.create_index(op.f('ix_subscriptions_tenant_id'), 'subscriptions', ['tenant_id'], unique=True)
    
    # 4. Criar subscription para stores existentes (se houver)
    connection = op.get_bind()
    stores_result = connection.execute(sa.text("SELECT id FROM stores WHERE is_active = TRUE"))
    stores = stores_result.fetchall()
    
    for store in stores:
        store_id = store[0]
        trial_ends = datetime.now() + timedelta(days=30)
        
        connection.execute(
            sa.text("""
                INSERT INTO subscriptions 
                (tenant_id, plan, status, is_trial, trial_started_at, trial_ends_at, max_products, max_users)
                VALUES 
                (:tenant_id, 'trial', 'active', TRUE, :now, :trial_ends, 100, 1)
            """),
            {
                'tenant_id': store_id,
                'now': datetime.now(),
                'trial_ends': trial_ends
            }
        )
        
        # Atualizar store com plan e trial_ends_at
        connection.execute(
            sa.text("""
                UPDATE stores 
                SET plan = 'trial', trial_ends_at = :trial_ends
                WHERE id = :store_id
            """),
            {
                'store_id': store_id,
                'trial_ends': trial_ends
            }
        )


def downgrade() -> None:
    # Remover índices
    op.drop_index(op.f('ix_subscriptions_tenant_id'), table_name='subscriptions')
    op.drop_index(op.f('ix_stores_subdomain'), table_name='stores')
    
    # Remover campos da tabela stores
    op.drop_column('stores', 'trial_ends_at')
    op.drop_column('stores', 'plan')
    op.drop_column('stores', 'subdomain')
    
    # Remover tabela subscriptions
    op.drop_table('subscriptions')
