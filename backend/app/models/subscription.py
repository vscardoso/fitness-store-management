"""
Subscription model for SaaS multi-tenant system
Manages plans, trials, limits and payment status
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class Subscription(BaseModel):
    """
    Subscription model - gerencia planos e assinaturas
    
    Plans:
    - trial: 30 dias grátis, limite de 100 produtos, 1 usuário
    - free: Grátis para sempre, 50 produtos, 1 usuário, sem relatórios avançados
    - pro: R$ 49/mês, produtos ilimitados, 5 usuários, relatórios completos
    - enterprise: Sob consulta, tudo ilimitado
    """
    
    __tablename__ = "subscriptions"
    
    # Foreign Key
    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, unique=True)
    
    # Plano atual
    plan = Column(String(20), nullable=False, default="trial")  # trial, free, pro, enterprise
    status = Column(String(20), nullable=False, default="active")  # active, cancelled, expired, suspended
    
    # Trial period
    is_trial = Column(Boolean, default=True)
    trial_ends_at = Column(DateTime, nullable=True)
    trial_started_at = Column(DateTime, nullable=True)
    
    # Billing period (para planos pagos)
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    
    # Limites por plano
    max_products = Column(Integer, default=100)  # trial/free: 100, pro: 999999 (ilimitado)
    max_users = Column(Integer, default=1)  # trial/free: 1, pro: 5, enterprise: unlimited
    max_sales_per_month = Column(Integer, nullable=True)  # NULL = ilimitado
    
    # Features habilitadas
    feature_advanced_reports = Column(Boolean, default=False)  # apenas pro/enterprise
    feature_multi_store = Column(Boolean, default=False)  # apenas enterprise
    feature_api_access = Column(Boolean, default=False)  # apenas pro/enterprise
    feature_custom_fields = Column(Boolean, default=False)  # apenas pro/enterprise
    
    # Payment tracking (para integração futura com Stripe/PagSeguro)
    payment_provider = Column(String(50), nullable=True)  # stripe, pagseguro, google_play, etc
    payment_customer_id = Column(String(100), nullable=True)  # ID do cliente no provider
    payment_subscription_id = Column(String(100), nullable=True)  # ID da subscription no provider
    
    # Tracking
    cancelled_at = Column(DateTime, nullable=True)
    cancelled_reason = Column(String(255), nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="subscription")
    
    def __repr__(self):
        return f"<Subscription(tenant_id={self.tenant_id}, plan={self.plan}, status={self.status})>"
    
    @property
    def is_trial_active(self) -> bool:
        """Verifica se trial ainda está ativo"""
        if not self.is_trial or not self.trial_ends_at:
            return False
        return datetime.now() < self.trial_ends_at
    
    @property
    def trial_days_remaining(self) -> int:
        """Dias restantes do trial"""
        if not self.is_trial_active:
            return 0
        delta = self.trial_ends_at - datetime.now()
        return max(0, delta.days)
    
    @property
    def is_paid_plan(self) -> bool:
        """Verifica se é plano pago"""
        return self.plan in ["pro", "enterprise"]
    
    @property
    def can_create_products(self) -> bool:
        """Verifica se pode criar mais produtos (baseado no limite)"""
        # Implementar contagem real na service layer
        return True  # Placeholder
    
    @property
    def can_add_users(self) -> bool:
        """Verifica se pode adicionar mais usuários"""
        # Implementar contagem real na service layer
        return True  # Placeholder
    
    def get_plan_limits(self) -> dict:
        """Retorna os limites do plano atual"""
        limits = {
            "trial": {
                "max_products": 100,
                "max_users": 1,
                "max_sales_per_month": None,
                "advanced_reports": False,
                "multi_store": False,
                "api_access": False,
            },
            "free": {
                "max_products": 50,
                "max_users": 1,
                "max_sales_per_month": 100,
                "advanced_reports": False,
                "multi_store": False,
                "api_access": False,
            },
            "pro": {
                "max_products": 999999,  # "ilimitado"
                "max_users": 5,
                "max_sales_per_month": None,
                "advanced_reports": True,
                "multi_store": False,
                "api_access": True,
            },
            "enterprise": {
                "max_products": 999999,
                "max_users": 999999,
                "max_sales_per_month": None,
                "advanced_reports": True,
                "multi_store": True,
                "api_access": True,
            }
        }
        return limits.get(self.plan, limits["trial"])
    
    # Relationship
    tenant = relationship("Store", back_populates="subscription")
