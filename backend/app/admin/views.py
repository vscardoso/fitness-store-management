"""
Views do painel administrativo SQLAdmin.
Cada classe representa uma tabela no painel.
"""
from sqladmin import ModelView
from sqladmin.filters import BooleanFilter, AllUniqueStringValuesFilter
from app.models.user import User, UserRole
from app.models.store import Store
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.category import Category
from app.models.customer import Customer
from app.models.sale import Sale, SaleItem
from app.models.inventory import Inventory
from app.models.stock_entry import StockEntry
from app.models.entry_item import EntryItem
from app.models.subscription import Subscription
from app.models.trip import Trip


class UserAdmin(ModelView, model=User):
    name = "Usuário"
    name_plural = "Usuários"
    icon = "fa-solid fa-users"
    category = "Acesso"

    column_list = [User.id, User.full_name, User.email, User.role, User.tenant_id, User.is_active, User.created_at]
    column_searchable_list = [User.email, User.full_name]
    column_filters = [
        AllUniqueStringValuesFilter(User.role, title="Role"),
        BooleanFilter(User.is_active, title="Ativo"),
    ]
    column_sortable_list = [User.id, User.email, User.full_name, User.created_at]
    column_default_sort = [(User.created_at, True)]

    column_details_exclude_list = ["hashed_password"]
    form_excluded_columns = ["hashed_password", "sales", "push_tokens"]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50


class StoreAdmin(ModelView, model=Store):
    name = "Loja / Tenant"
    name_plural = "Lojas / Tenants"
    icon = "fa-solid fa-store"
    category = "Tenants"

    column_list = [Store.id, Store.name, Store.slug, Store.plan, Store.is_active, Store.trial_ends_at, Store.created_at]
    column_searchable_list = [Store.name, Store.slug, Store.subdomain]
    column_filters = [
        AllUniqueStringValuesFilter(Store.plan, title="Plano"),
        BooleanFilter(Store.is_active, title="Ativo"),
        BooleanFilter(Store.is_default, title="Padrão"),
    ]
    column_sortable_list = [Store.id, Store.name, Store.created_at]
    column_default_sort = [(Store.created_at, True)]

    form_excluded_columns = ["subscription", "conditional_shipments"]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50


class SubscriptionAdmin(ModelView, model=Subscription):
    name = "Assinatura"
    name_plural = "Assinaturas"
    icon = "fa-solid fa-credit-card"
    category = "Tenants"

    column_list = [
        Subscription.id, Subscription.tenant_id, Subscription.plan,
        Subscription.status, Subscription.is_trial, Subscription.trial_ends_at,
        Subscription.current_period_end, Subscription.is_active,
    ]
    column_filters = [
        AllUniqueStringValuesFilter(Subscription.plan, title="Plano"),
        AllUniqueStringValuesFilter(Subscription.status, title="Status"),
        BooleanFilter(Subscription.is_trial, title="Trial"),
    ]
    column_sortable_list = [Subscription.id, Subscription.tenant_id]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50


class ProductAdmin(ModelView, model=Product):
    name = "Produto"
    name_plural = "Produtos"
    icon = "fa-solid fa-box"
    category = "Catálogo"

    column_list = [
        Product.id, Product.name, Product.brand, Product.gender,
        Product.category_id, Product.is_catalog, Product.is_active, Product.created_at,
    ]
    column_searchable_list = [Product.name, Product.brand]
    column_filters = [
        BooleanFilter(Product.is_active, title="Ativo"),
        BooleanFilter(Product.is_catalog, title="Catálogo"),
        AllUniqueStringValuesFilter(Product.gender, title="Gênero"),
    ]
    column_sortable_list = [Product.id, Product.name, Product.created_at]
    column_default_sort = [(Product.created_at, True)]

    form_excluded_columns = ["variants", "inventory", "sale_items", "return_items"]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50


class ProductVariantAdmin(ModelView, model=ProductVariant):
    name = "Variante"
    name_plural = "Variantes de Produto"
    icon = "fa-solid fa-tags"
    category = "Catálogo"

    column_list = [
        "id", "product_id", "sku", "size", "color",
        "price", "cost_price", "is_active",
    ]
    column_searchable_list = ["sku", "size", "color"]
    column_filters = [
        BooleanFilter(ProductVariant.is_active, title="Ativo"),
        AllUniqueStringValuesFilter(ProductVariant.size, title="Tamanho"),
        AllUniqueStringValuesFilter(ProductVariant.color, title="Cor"),
    ]
    column_sortable_list = ["id", "price", "cost_price"]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 100


class CategoryAdmin(ModelView, model=Category):
    name = "Categoria"
    name_plural = "Categorias"
    icon = "fa-solid fa-list"
    category = "Catálogo"

    column_list = ["id", "name", "is_active", "created_at"]
    column_searchable_list = ["name"]
    column_filters = [
        BooleanFilter(Category.is_active, title="Ativo"),
    ]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50


class CustomerAdmin(ModelView, model=Customer):
    name = "Cliente"
    name_plural = "Clientes"
    icon = "fa-solid fa-user-tag"
    category = "Vendas"

    column_list = [
        Customer.id, Customer.full_name, Customer.email, Customer.phone,
        Customer.document_number, Customer.customer_type,
        Customer.loyalty_points, Customer.total_spent, Customer.is_active,
    ]
    column_searchable_list = [Customer.full_name, Customer.email, Customer.phone, Customer.document_number]
    column_filters = [
        AllUniqueStringValuesFilter(Customer.customer_type, title="Tipo"),
        BooleanFilter(Customer.is_active, title="Ativo"),
    ]
    column_sortable_list = [Customer.id, Customer.total_spent, Customer.loyalty_points]
    column_default_sort = [(Customer.total_spent, True)]

    form_excluded_columns = ["sales"]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50


class SaleAdmin(ModelView, model=Sale):
    name = "Venda"
    name_plural = "Vendas"
    icon = "fa-solid fa-receipt"
    category = "Vendas"

    column_list = [
        Sale.id, Sale.sale_number, Sale.customer_id, Sale.seller_id,
        Sale.total_amount, Sale.payment_method, Sale.status,
        Sale.tenant_id, Sale.created_at,
    ]
    column_searchable_list = [Sale.sale_number]
    column_filters = [
        AllUniqueStringValuesFilter(Sale.status, title="Status"),
        AllUniqueStringValuesFilter(Sale.payment_method, title="Pagamento"),
    ]
    column_sortable_list = [Sale.id, Sale.total_amount, Sale.created_at]
    column_default_sort = [(Sale.created_at, True)]

    form_excluded_columns = ["items", "returns"]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50


class SaleItemAdmin(ModelView, model=SaleItem):
    name = "Item de Venda"
    name_plural = "Itens de Venda"
    icon = "fa-solid fa-list-check"
    category = "Vendas"

    column_list = [
        "id", "sale_id", "variant_id", "quantity",
        "unit_price", "total_price", "is_active",
    ]
    column_filters = [
        BooleanFilter(SaleItem.is_active, title="Ativo"),
    ]
    column_sortable_list = ["id", "sale_id", "total_price"]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 100


class InventoryAdmin(ModelView, model=Inventory):
    name = "Estoque"
    name_plural = "Estoque"
    icon = "fa-solid fa-warehouse"
    category = "Estoque"

    column_list = [
        Inventory.id, Inventory.product_id, Inventory.quantity,
        Inventory.min_stock, Inventory.is_active,
    ]
    column_filters = [
        BooleanFilter(Inventory.is_active, title="Ativo"),
    ]
    column_sortable_list = [Inventory.id, Inventory.quantity]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 100


class EntryItemAdmin(ModelView, model=EntryItem):
    name = "Item de Entrada"
    name_plural = "Itens de Entrada"
    icon = "fa-solid fa-boxes-stacked"
    category = "Estoque"

    column_list = [
        "id", "entry_id", "product_id", "variant_id",
        "quantity_received", "quantity_remaining", "unit_cost", "is_active",
    ]
    column_filters = [
        BooleanFilter(EntryItem.is_active, title="Ativo"),
    ]
    column_sortable_list = ["id", "entry_id", "quantity_received", "quantity_remaining"]

    form_excluded_columns = ["stock_entry", "product", "variant"]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 100


class StockEntryAdmin(ModelView, model=StockEntry):
    name = "Entrada de Estoque"
    name_plural = "Entradas de Estoque"
    icon = "fa-solid fa-truck-ramp-box"
    category = "Estoque"

    column_list = [
        "id", "entry_code", "entry_type", "supplier_name",
        "total_cost", "entry_date", "tenant_id", "is_active",
    ]
    column_searchable_list = ["entry_code", "supplier_name"]
    column_filters = [
        AllUniqueStringValuesFilter(StockEntry.entry_type, title="Tipo"),
        BooleanFilter(StockEntry.is_active, title="Ativo"),
    ]
    column_sortable_list = ["id", "entry_date", "total_cost"]
    column_default_sort = [("entry_date", True)]

    form_excluded_columns = ["entry_items", "trip"]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50


class TripAdmin(ModelView, model=Trip):
    name = "Viagem / Compra"
    name_plural = "Viagens / Compras"
    icon = "fa-solid fa-plane"
    category = "Estoque"

    column_list = ["id", "trip_code", "destination", "trip_date", "tenant_id", "is_active", "created_at"]
    column_searchable_list = ["trip_code", "destination"]
    column_filters = [
        BooleanFilter(Trip.is_active, title="Ativo"),
    ]
    column_sortable_list = ["id", "created_at"]

    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50


ALL_VIEWS = [
    UserAdmin,
    StoreAdmin,
    SubscriptionAdmin,
    ProductAdmin,
    ProductVariantAdmin,
    CategoryAdmin,
    CustomerAdmin,
    SaleAdmin,
    SaleItemAdmin,
    InventoryAdmin,
    EntryItemAdmin,
    StockEntryAdmin,
    TripAdmin,
]
