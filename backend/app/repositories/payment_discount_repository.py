"""
Repository for payment discount operations.
"""
from typing import Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment_discount import PaymentDiscount
from app.schemas.payment_discount import PaymentDiscountCreate, PaymentDiscountUpdate
from app.repositories.base import BaseRepository


class PaymentDiscountRepository(BaseRepository[PaymentDiscount, PaymentDiscountCreate, PaymentDiscountUpdate]):
    """Repository for payment discount database operations."""
    
    def __init__(self):
        super().__init__(PaymentDiscount)
    
    async def get_by_payment_method(
        self,
        db: AsyncSession,
        tenant_id: int,
        payment_method: str
    ) -> Optional[PaymentDiscount]:
        """
        Get discount configuration for specific payment method.
        
        Args:
            db: Database session
            tenant_id: Tenant ID
            payment_method: Payment method (PIX, CASH, etc)
            
        Returns:
            PaymentDiscount instance or None if not found
        """
        stmt = select(self.model).where(
            and_(
                self.model.tenant_id == tenant_id,
                self.model.payment_method == payment_method.lower(),
                self.model.is_active == True
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_all_active(
        self,
        db: AsyncSession,
        tenant_id: int
    ) -> list[PaymentDiscount]:
        """
        Get all active discount configurations for tenant.
        
        Args:
            db: Database session
            tenant_id: Tenant ID
            
        Returns:
            List of active PaymentDiscount instances
        """
        stmt = select(self.model).where(
            and_(
                self.model.tenant_id == tenant_id,
                self.model.is_active == True
            )
        ).order_by(self.model.discount_percentage.desc())
        
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    async def deactivate_by_method(
        self,
        db: AsyncSession,
        tenant_id: int,
        payment_method: str
    ) -> bool:
        """
        Deactivate discount for specific payment method.
        
        Args:
            db: Database session
            tenant_id: Tenant ID
            payment_method: Payment method
            
        Returns:
            True if deactivated, False if not found
        """
        discount = await self.get_by_payment_method(db, tenant_id, payment_method)
        if not discount:
            return False
        
        discount.is_active = False
        await db.commit()
        await db.refresh(discount)
        return True
