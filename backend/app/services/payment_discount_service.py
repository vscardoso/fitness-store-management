"""
Service layer for payment discount business logic.
"""
from decimal import Decimal
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment_discount import PaymentDiscount
from app.schemas.payment_discount import (
    PaymentDiscountCreate,
    PaymentDiscountUpdate,
    PaymentDiscountCalculation
)
from app.repositories.payment_discount_repository import PaymentDiscountRepository


class PaymentDiscountService:
    """Service for payment discount business operations."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = PaymentDiscountRepository()
    
    async def create_discount(
        self,
        tenant_id: int,
        discount_data: PaymentDiscountCreate
    ) -> PaymentDiscount:
        """
        Create new payment discount configuration.
        
        Args:
            tenant_id: Tenant ID
            discount_data: Discount data
            
        Returns:
            Created PaymentDiscount instance
            
        Raises:
            ValueError: If discount already exists for this payment method
        """
        # Check if discount already exists for this method
        existing = await self.repo.get_by_payment_method(
            self.db,
            tenant_id,
            discount_data.payment_method
        )
        
        if existing:
            raise ValueError(
                f"Discount for payment method '{discount_data.payment_method}' already exists. "
                "Use update instead."
            )
        
        # Create discount
        discount_dict = discount_data.model_dump()
        discount_dict['tenant_id'] = tenant_id
        # Set timestamps explicitly to avoid DB default functions (SQLite lacks now())
        current_ts = datetime.utcnow()
        discount_dict.setdefault('created_at', current_ts)
        discount_dict.setdefault('updated_at', current_ts)
        discount = await self.repo.create(self.db, obj_in=discount_dict)
        
        return discount
    
    async def update_discount(
        self,
        discount_id: int,
        tenant_id: int,
        discount_data: PaymentDiscountUpdate
    ) -> PaymentDiscount:
        """
        Update payment discount configuration.
        
        Args:
            discount_id: Discount ID
            tenant_id: Tenant ID
            discount_data: Updated discount data
            
        Returns:
            Updated PaymentDiscount instance
            
        Raises:
            ValueError: If discount not found
        """
        discount = await self.repo.get(self.db, discount_id, tenant_id=tenant_id)
        if not discount:
            raise ValueError(f"Payment discount with ID {discount_id} not found")
        
        # Update discount using ID-based update
        update_dict = discount_data.model_dump(exclude_unset=True)
        updated_discount = await self.repo.update(
            self.db,
            id=discount_id,
            obj_in=update_dict,
            tenant_id=tenant_id
        )
        
        return updated_discount
    
    async def get_discount(
        self,
        discount_id: int,
        tenant_id: int
    ) -> Optional[PaymentDiscount]:
        """Get discount by ID."""
        return await self.repo.get(self.db, discount_id, tenant_id=tenant_id)
    
    async def get_all_discounts(
        self,
        tenant_id: int,
        active_only: bool = False
    ) -> list[PaymentDiscount]:
        """
        Get all discounts for tenant.
        
        Args:
            tenant_id: Tenant ID
            active_only: Only return active discounts
            
        Returns:
            List of PaymentDiscount instances
        """
        if active_only:
            return await self.repo.get_all_active(self.db, tenant_id)
        
        return await self.repo.get_multi(self.db, tenant_id=tenant_id, limit=100)
    
    async def get_discount_by_method(
        self,
        tenant_id: int,
        payment_method: str
    ) -> Optional[PaymentDiscount]:
        """Get discount for specific payment method."""
        return await self.repo.get_by_payment_method(
            self.db,
            tenant_id,
            payment_method
        )
    
    async def calculate_discount(
        self,
        tenant_id: int,
        payment_method: str,
        amount: Decimal
    ) -> PaymentDiscountCalculation:
        """
        Calculate discount for specific payment method and amount.
        
        Args:
            tenant_id: Tenant ID
            payment_method: Payment method
            amount: Original amount
            
        Returns:
            PaymentDiscountCalculation with calculation details
        """
        discount_config = await self.get_discount_by_method(tenant_id, payment_method)
        
        if not discount_config or not discount_config.is_active:
            # No discount available
            return PaymentDiscountCalculation(
                payment_method=payment_method,
                original_amount=amount,
                discount_percentage=Decimal(0),
                discount_amount=Decimal(0),
                final_amount=amount
            )
        
        # Calculate discount
        discount_amount = discount_config.calculate_discount(amount)
        final_amount = amount - discount_amount
        
        return PaymentDiscountCalculation(
            payment_method=payment_method,
            original_amount=amount,
            discount_percentage=discount_config.discount_percentage,
            discount_amount=discount_amount,
            final_amount=final_amount
        )
    
    async def delete_discount(
        self,
        discount_id: int,
        tenant_id: int
    ) -> bool:
        """
        Soft delete payment discount.
        
        Args:
            discount_id: Discount ID
            tenant_id: Tenant ID
            
        Returns:
            True if deleted, False if not found
        """
        discount = await self.repo.get(self.db, discount_id, tenant_id=tenant_id)
        if not discount:
            return False
        
        # Soft delete using ID-based update
        await self.repo.update(
            self.db,
            id=discount_id,
            obj_in={'is_active': False},
            tenant_id=tenant_id
        )
        
        return True
