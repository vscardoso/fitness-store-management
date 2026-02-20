"""
SignupService - Handles multi-tenant SaaS registration
Creates Store (tenant) + User (owner) + Subscription atomically
"""
import re
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.models import Store, User, Subscription, Product, Category
from app.models.user import UserRole
from app.schemas.signup import SignupRequest, SignupResponse
from app.core.security import get_password_hash, create_access_token, create_refresh_token

logger = logging.getLogger(__name__)


class SignupService:
    """
    Service for handling multi-tenant signup flow:
    1. Validate email/slug uniqueness
    2. Create Store (tenant)
    3. Create User (owner with ADMIN role)
    4. Create Subscription (trial by default)
    5. Generate JWT tokens
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def signup(self, signup_data: SignupRequest) -> SignupResponse:
        """
        Complete signup flow with atomic transaction
        
        Args:
            signup_data: User, store and plan information
            
        Returns:
            SignupResponse with user, store, subscription and tokens
            
        Raises:
            ValueError: If email/slug already exists or validation fails
            IntegrityError: If database constraints are violated
        """
        # 1. Validate email uniqueness
        await self._validate_email_unique(signup_data.email)
        
        # 2. Generate or validate slug
        slug = await self._generate_unique_slug(signup_data.store_slug or signup_data.store_name)
        
        # 3. Generate subdomain (store-slug-1234)
        subdomain = await self._generate_unique_subdomain(slug)
        
        # Begin atomic transaction
        try:
            # 4. Create Store (tenant)
            store = await self._create_store(
                name=signup_data.store_name,
                slug=slug,
                subdomain=subdomain,
                plan=signup_data.plan
            )
            
            # 5. Create Subscription for the store
            subscription = await self._create_subscription(
                tenant_id=store.id,
                plan=signup_data.plan
            )
            
            # 6. Create User (owner)
            user = await self._create_user(
                email=signup_data.email,
                password=signup_data.password,
                full_name=signup_data.full_name,
                phone=signup_data.phone,
                tenant_id=store.id,
                role=UserRole.ADMIN  # First user is always admin/owner
            )
            
            # 7. Seed fitness products automatically (100+ products)
            from app.services.product_seed_service import ProductSeedService
            seed_service = ProductSeedService(self.db)
            products_count = await seed_service.seed_fitness_products(store.id)
            logger.info(f" {products_count} produtos fitness criados para store_id={store.id}")

            # Commit transaction
            await self.db.commit()
            
            # Refresh to get relationships
            await self.db.refresh(store)
            await self.db.refresh(user)
            await self.db.refresh(subscription)
            
            # 8. Generate JWT tokens
            # IMPORTANT: "sub" must be user.id (not email) for consistency with AuthService
            access_token = create_access_token({
                "sub": str(user.id),
                "role": user.role.value,
                "tenant_id": store.id  #  ADD TENANT_ID
            })
            refresh_token = create_refresh_token({"sub": str(user.id)})
            
            # 9. Build response
            return SignupResponse(
                user_id=user.id,
                user_email=user.email,
                user_name=user.full_name,
                store_id=store.id,
                store_name=store.name,
                store_slug=store.slug,
                subdomain=store.subdomain,
                subscription_id=subscription.id,
                plan=subscription.plan,
                is_trial=subscription.is_trial,
                trial_ends_at=subscription.trial_ends_at.isoformat() if subscription.trial_ends_at else None,
                trial_days_remaining=subscription.trial_days_remaining,
                access_token=access_token,
                refresh_token=refresh_token,
            )
            
        except IntegrityError as e:
            await self.db.rollback()
            # Parse constraint violation
            if 'email' in str(e).lower():
                raise ValueError("Email já cadastrado. Tente fazer login.")
            elif 'slug' in str(e).lower():
                raise ValueError("Nome de loja já em uso. Tente outro nome.")
            else:
                raise ValueError(f"Erro ao criar conta: {str(e)}")
        except Exception as e:
            await self.db.rollback()
            raise ValueError(f"Erro ao criar conta: {str(e)}")
    
    async def _validate_email_unique(self, email: str) -> None:
        """Check if email is already registered"""
        result = await self.db.execute(
            select(User).where(User.email == email, User.is_active == True)
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            raise ValueError("Email já cadastrado. Tente fazer login ou recuperar sua senha.")
    
    async def _generate_unique_slug(self, base_slug: str) -> str:
        """
        Generate unique slug from store name or provided slug
        Adds numbers if slug already exists (store-1, store-2, etc)
        """
        # Normalize: lowercase, replace spaces with hyphens, remove special chars
        slug = base_slug.lower().strip()
        slug = re.sub(r'[^\w\s-]', '', slug)  # Remove non-alphanumeric except spaces and hyphens
        slug = re.sub(r'[-\s]+', '-', slug)  # Replace spaces and multiple hyphens with single hyphen
        slug = slug[:50]  # Limit length
        
        # Check if slug exists
        original_slug = slug
        counter = 1
        
        while True:
            result = await self.db.execute(
                select(Store).where(Store.slug == slug, Store.is_active == True)
            )
            existing_store = result.scalar_one_or_none()
            
            if not existing_store:
                break
            
            # Append counter
            slug = f"{original_slug}-{counter}"
            counter += 1
        
        return slug
    
    async def _generate_unique_subdomain(self, slug: str) -> str:
        """
        Generate unique subdomain: store-slug-1234
        Used for multi-tenant URLs (mystore-1234.app.com)
        """
        # Add random suffix for uniqueness
        suffix = secrets.token_hex(4)  # 8 characters
        subdomain = f"{slug}-{suffix}"
        
        # Verify uniqueness (rare collision)
        result = await self.db.execute(
            select(Store).where(Store.subdomain == subdomain)
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            # Retry with different suffix
            suffix = secrets.token_hex(6)
            subdomain = f"{slug}-{suffix}"
        
        return subdomain
    
    async def _create_store(
        self,
        name: str,
        slug: str,
        subdomain: str,
        plan: str
    ) -> Store:
        """Create Store (tenant)"""
        trial_ends_at = datetime.now() + timedelta(days=30) if plan == 'trial' else None
        
        store = Store(
            name=name,
            slug=slug,
            subdomain=subdomain,
            plan=plan,
            trial_ends_at=trial_ends_at,
            is_default=False,
            is_active=True
        )
        
        self.db.add(store)
        await self.db.flush()  # Get store.id without committing
        
        return store
    
    async def _create_subscription(
        self,
        tenant_id: int,
        plan: str
    ) -> Subscription:
        """Create Subscription for the tenant"""
        is_trial = (plan == 'trial')
        trial_ends_at = datetime.now() + timedelta(days=30) if is_trial else None
        trial_started_at = datetime.now() if is_trial else None
        
        # Get plan limits
        limits = self._get_plan_limits(plan)
        
        subscription = Subscription(
            tenant_id=tenant_id,
            plan=plan,
            status='active',
            is_trial=is_trial,
            trial_ends_at=trial_ends_at,
            trial_started_at=trial_started_at,
            max_products=limits['max_products'],
            max_users=limits['max_users'],
            max_sales_per_month=limits.get('max_sales_per_month'),
            feature_advanced_reports=limits['advanced_reports'],
            feature_multi_store=limits['multi_store'],
            feature_api_access=limits['api_access'],
            is_active=True
        )
        
        self.db.add(subscription)
        await self.db.flush()
        
        return subscription
    
    async def _create_user(
        self,
        email: str,
        password: str,
        full_name: str,
        phone: Optional[str],
        tenant_id: int,
        role: UserRole
    ) -> User:
        """Create User (owner)"""
        hashed_password = get_password_hash(password)
        
        user = User(
            email=email,
            hashed_password=hashed_password,
            full_name=full_name,
            phone=phone,
            role=role,
            tenant_id=tenant_id,
            is_active=True
        )
        
        self.db.add(user)
        await self.db.flush()
        
        return user
    
    def _get_plan_limits(self, plan: str) -> dict:
        """Get limits and features for plan"""
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
                "max_sales_per_month": None,
                "advanced_reports": False,
                "multi_store": False,
                "api_access": False,
            },
            "pro": {
                "max_products": 999999,
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
        return limits.get(plan, limits["trial"])
    
    async def _copy_template_products(self, tenant_id: int) -> None:
        """
        Copy template products and categories (tenant_id=0) to new store
        
        This gives every new store a starter catalog of 80+ fitness products
        that can be edited, deleted or extended by the store owner.
        """
        # 1. Get all template categories (tenant_id = 0)
        result = await self.db.execute(
            select(Category).where(
                Category.tenant_id == 0,
                Category.is_active == True
            )
        )
        template_categories = result.scalars().all()
        
        # 2. Create category mapping (old_id -> new_id)
        category_mapping = {}
        
        for template_cat in template_categories:
            new_category = Category(
                name=template_cat.name,
                description=template_cat.description,
                slug=template_cat.slug,
                tenant_id=tenant_id,
                is_active=True
            )
            self.db.add(new_category)
            await self.db.flush()  # Get new_category.id
            category_mapping[template_cat.id] = new_category.id
        
        # 3. Get all template products
        result = await self.db.execute(
            select(Product).where(
                Product.tenant_id == 0,
                Product.is_active == True
            )
        )
        template_products = result.scalars().all()
        
        # 4. Copy products with new tenant_id and mapped category_id
        from app.models.product_variant import ProductVariant
        from decimal import Decimal
        
        for template_prod in template_products:
            # Criar produto pai (sem os campos de variante)
            new_product = Product(
                name=template_prod.name,
                description=template_prod.description,
                brand=template_prod.brand,
                gender=template_prod.gender,
                material=template_prod.material,
                is_digital=template_prod.is_digital,
                is_activewear=template_prod.is_activewear,
                category_id=category_mapping.get(template_prod.category_id),
                tenant_id=tenant_id,
                is_active=True
            )
            self.db.add(new_product)
            await self.db.flush()  # Obter product.id
            
            # Criar variante com os dados do template
            variant = ProductVariant(
                product_id=new_product.id,
                sku=template_prod.sku,
                price=template_prod.price or Decimal("0"),
                cost_price=template_prod.cost_price,
                color=template_prod.color,
                size=template_prod.size,
                tenant_id=tenant_id,
                is_active=True
            )
            self.db.add(variant)
        
        # Flush to persist all products
        await self.db.flush()
    
    async def check_email_available(self, email: str) -> Tuple[bool, str]:
        """
        Check if email is available
        Returns (available: bool, message: str)
        """
        result = await self.db.execute(
            select(User).where(User.email == email, User.is_active == True)
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            return False, "Email já cadastrado"
        return True, "Email disponível"
    
    async def check_slug_available(self, slug: str) -> Tuple[bool, Optional[str], str]:
        """
        Check if slug is available
        Returns (available: bool, suggested_slug: str, message: str)
        """
        # Normalize slug
        normalized_slug = await self._generate_unique_slug(slug)
        
        result = await self.db.execute(
            select(Store).where(Store.slug == normalized_slug, Store.is_active == True)
        )
        existing_store = result.scalar_one_or_none()
        
        if existing_store:
            # Suggest alternative
            suggested = await self._generate_unique_slug(slug)
            return False, suggested, "Nome já em uso"
        
        return True, None, "Nome disponível"
