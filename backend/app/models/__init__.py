"""
Exporta todos os modelos para facilitar imports.
"""
from .base import BaseModel
from .user import User, UserRole
from .category import Category
from .product import Product
from .product_variant import ProductVariant
from .inventory import Inventory, InventoryMovement, MovementType
from .customer import Customer, CustomerType
from .sale import Sale, SaleItem, SaleStatus, PaymentMethod
from .payment_discount import PaymentDiscount
from .trip import Trip, TripStatus
from .stock_entry import StockEntry, EntryType
from .entry_item import EntryItem
from .store import Store
from .subscription import Subscription
from .conditional_shipment import ConditionalShipment, ConditionalShipmentItem
from .notification import PushToken, NotificationLog
from .sale_return import SaleReturn, ReturnItem
from .look import Look, LookItem
from .wishlist import Wishlist
from .product_tag import ProductTag
from .expense import Expense, ExpenseCategory
from .supplier import Supplier
from .supplier_product import SupplierProduct
from .audit_log import AuditLog
from .product_media import ProductMedia
from .pdv_terminal import PDVTerminal
from .pix_transaction import PixTransaction

__all__ = [
    # Base
    "BaseModel",

    # User
    "User",
    "UserRole",

    # Category
    "Category",


    # Product
    "Product",
    
    # Product Variant
    "ProductVariant",

    # Inventory
    "Inventory",
    "InventoryMovement",
    "MovementType",

    # Customer
    "Customer",
    "CustomerType",

    # Sale
    "Sale",
    "SaleItem",
    "SaleStatus",
    "PaymentMethod",
    
    # Payment Discount
    "PaymentDiscount",

    # Trip
    "Trip",
    "TripStatus",

    # Stock Entry
    "StockEntry",
    "EntryType",

    # Entry Item
    "EntryItem",

    # Store (Tenant)
    "Store",
    
    # Subscription
    "Subscription",
    
    # Conditional Shipment
    "ConditionalShipment",
    "ConditionalShipmentItem",

    # Notifications
    "PushToken",
    "NotificationLog",
    
    # Sale Return
    "SaleReturn",
    "ReturnItem",

    # Lookbook
    "Look",
    "LookItem",
    "Wishlist",
    "ProductTag",

    # Expense
    "Expense",
    "ExpenseCategory",

    # Supplier
    "Supplier",
    "SupplierProduct",

    # Audit
    "AuditLog",

    # Product Media (galeria)
    "ProductMedia",

    # PDV Terminal
    "PDVTerminal",

    # PIX Transactions (auditoria + idempotência)
    "PixTransaction",
]
