"""
Serviço para criar produtos iniciais automaticamente quando uma loja se cadastra.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.product_repository import ProductRepository
from app.repositories.category_repository import CategoryRepository
from app.schemas.product import ProductCreate
import logging

logger = logging.getLogger(__name__)


class ProductSeedService:
    """Serviço para seed automático de roupas e acessórios fitness."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.product_repo = ProductRepository(db)
        self.category_repo = CategoryRepository(db)
        self.sku_counter = 1  # Contador para gerar SKUs únicos

    async def seed_fitness_products(self, tenant_id: int) -> int:
        """Cria 115 roupas e acessórios fitness para uma nova loja."""
        logger.info(f"🌱 Iniciando seed de roupas fitness para tenant_id={tenant_id}")

        categories = await self._create_categories(tenant_id)
        products_created = 0

        products_created += await self._create_tshirts(tenant_id, categories.get("Camisetas").id)
        products_created += await self._create_shorts(tenant_id, categories.get("Shorts e Bermudas").id)
        products_created += await self._create_leggings(tenant_id, categories.get("Leggings e Calças").id)
        products_created += await self._create_tops(tenant_id, categories.get("Tops e Sutiãs").id)
        products_created += await self._create_jackets(tenant_id, categories.get("Jaquetas e Moletons").id)
        products_created += await self._create_shoes(tenant_id, categories.get("Tênis e Calçados").id)
        products_created += await self._create_accessories(tenant_id, categories.get("Acessórios").id)

        logger.info(f"✅ {products_created} roupas fitness criadas para tenant_id={tenant_id}")
        return products_created

    def _generate_sku(self) -> str:
        """Gera SKU único no formato FIT-0001, FIT-0002, etc."""
        sku = f"FIT-{self.sku_counter:04d}"
        self.sku_counter += 1
        return sku

    async def _create_categories(self, tenant_id: int) -> dict:
        categories_data = [
            {"name": "Camisetas", "description": "Camisetas e regatas fitness", "slug": "camisetas"},
            {"name": "Shorts e Bermudas", "description": "Shorts e bermudas de treino", "slug": "shorts-bermudas"},
            {"name": "Leggings e Calças", "description": "Leggings e calças de academia", "slug": "leggings-calcas"},
            {"name": "Tops e Sutiãs", "description": "Tops e sutiãs esportivos", "slug": "tops-sutias"},
            {"name": "Jaquetas e Moletons", "description": "Jaquetas e moletons fitness", "slug": "jaquetas-moletons"},
            {"name": "Tênis e Calçados", "description": "Tênis e calçados esportivos", "slug": "tenis-calcados"},
            {"name": "Acessórios", "description": "Bonés, meias, luvas e acessórios", "slug": "acessorios"},
        ]
        categories = {}
        for cat_data in categories_data:
            cat = await self.category_repo.create(cat_data, tenant_id=tenant_id)
            categories[cat.name] = cat
        return categories

    async def _create_tshirts(self, tenant_id: int, category_id: int) -> int:
        products = [
            {"name": "Camiseta Dry Fit Preta P", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Camiseta Dry Fit Preta M", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Camiseta Dry Fit Preta G", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Camiseta Dry Fit Preta GG", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Camiseta Dry Fit Branca M", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Camiseta Dry Fit Branca G", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Camiseta Dry Fit Azul Marinho M", "brand": "Adidas", "cost_price": 38.00, "price": 74.90, "category_id": category_id},
            {"name": "Camiseta Dry Fit Azul Marinho G", "brand": "Adidas", "cost_price": 38.00, "price": 74.90, "category_id": category_id},
            {"name": "Regata Cavada Preta P", "brand": "Under Armour", "cost_price": 30.00, "price": 59.90, "category_id": category_id},
            {"name": "Regata Cavada Preta M", "brand": "Under Armour", "cost_price": 30.00, "price": 59.90, "category_id": category_id},
            {"name": "Regata Cavada Preta G", "brand": "Under Armour", "cost_price": 30.00, "price": 59.90, "category_id": category_id},
            {"name": "Regata Cavada Cinza M", "brand": "Under Armour", "cost_price": 30.00, "price": 59.90, "category_id": category_id},
            {"name": "Regata Nadador Preta P", "brand": "Puma", "cost_price": 28.00, "price": 54.90, "category_id": category_id},
            {"name": "Regata Nadador Preta M", "brand": "Puma", "cost_price": 28.00, "price": 54.90, "category_id": category_id},
            {"name": "Regata Nadador Preta G", "brand": "Puma", "cost_price": 28.00, "price": 54.90, "category_id": category_id},
            {"name": "Regata Nadador Branca M", "brand": "Puma", "cost_price": 28.00, "price": 54.90, "category_id": category_id},
            {"name": "Camiseta Oversized Preta M", "brand": "Adidas", "cost_price": 40.00, "price": 79.90, "category_id": category_id},
            {"name": "Camiseta Oversized Preta G", "brand": "Adidas", "cost_price": 40.00, "price": 79.90, "category_id": category_id},
            {"name": "Camiseta Oversized Cinza G", "brand": "Adidas", "cost_price": 40.00, "price": 79.90, "category_id": category_id},
            {"name": "Camiseta Compressão Preta M", "brand": "Under Armour", "cost_price": 45.00, "price": 89.90, "category_id": category_id},
            {"name": "Camiseta Compressão Preta G", "brand": "Under Armour", "cost_price": 45.00, "price": 89.90, "category_id": category_id},
            {"name": "Camiseta Básica Algodão Preta M", "brand": "Lupo", "cost_price": 25.00, "price": 49.90, "category_id": category_id},
            {"name": "Camiseta Básica Algodão Preta G", "brand": "Lupo", "cost_price": 25.00, "price": 49.90, "category_id": category_id},
            {"name": "Camiseta Básica Algodão Branca M", "brand": "Lupo", "cost_price": 25.00, "price": 49.90, "category_id": category_id},
            {"name": "Camiseta Básica Algodão Branca G", "brand": "Lupo", "cost_price": 25.00, "price": 49.90, "category_id": category_id},
        ]
        count = 0
        for p in products:
            p['sku'] = self._generate_sku()  # Adicionar SKU
            p['is_catalog'] = True  # Marcar como catálogo
            await self.product_repo.create(ProductCreate(**p), tenant_id=tenant_id)
            count += 1
        return count

    async def _create_shorts(self, tenant_id: int, category_id: int) -> int:
        products = [
            {"name": "Short de Treino Preto P", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "category_id": category_id},
            {"name": "Short de Treino Preto M", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "category_id": category_id},
            {"name": "Short de Treino Preto G", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "category_id": category_id},
            {"name": "Short de Treino Preto GG", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "category_id": category_id},
            {"name": "Short de Treino Azul M", "brand": "Adidas", "cost_price": 42.00, "price": 84.90, "category_id": category_id},
            {"name": "Short de Treino Azul G", "brand": "Adidas", "cost_price": 42.00, "price": 84.90, "category_id": category_id},
            {"name": "Bermuda Moletom Preta M", "brand": "Puma", "cost_price": 50.00, "price": 99.90, "category_id": category_id},
            {"name": "Bermuda Moletom Preta G", "brand": "Puma", "cost_price": 50.00, "price": 99.90, "category_id": category_id},
            {"name": "Bermuda Moletom Cinza M", "brand": "Puma", "cost_price": 50.00, "price": 99.90, "category_id": category_id},
            {"name": "Bermuda Moletom Cinza G", "brand": "Puma", "cost_price": 50.00, "price": 99.90, "category_id": category_id},
            {"name": "Short Corrida 2 em 1 Preto P", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "category_id": category_id},
            {"name": "Short Corrida 2 em 1 Preto M", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "category_id": category_id},
            {"name": "Short Corrida 2 em 1 Preto G", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "category_id": category_id},
            {"name": "Short Ciclista Preto P", "brand": "Lupo", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Short Ciclista Preto M", "brand": "Lupo", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Short Ciclista Preto G", "brand": "Lupo", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Bermuda Tactel Preta M", "brand": "Adidas", "cost_price": 45.00, "price": 89.90, "category_id": category_id},
            {"name": "Bermuda Tactel Preta G", "brand": "Adidas", "cost_price": 45.00, "price": 89.90, "category_id": category_id},
            {"name": "Short Dry Fit Cinza M", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "category_id": category_id},
            {"name": "Short Dry Fit Cinza G", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "category_id": category_id},
        ]
        count = 0
        for p in products:
            p['sku'] = self._generate_sku()  # Adicionar SKU
            p['is_catalog'] = True  # Marcar como catálogo
            await self.product_repo.create(ProductCreate(**p), tenant_id=tenant_id)
            count += 1
        return count

    async def _create_leggings(self, tenant_id: int, category_id: int) -> int:
        products = [
            {"name": "Legging Preta Cintura Alta P", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "category_id": category_id},
            {"name": "Legging Preta Cintura Alta M", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "category_id": category_id},
            {"name": "Legging Preta Cintura Alta G", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "category_id": category_id},
            {"name": "Legging Preta Cintura Alta GG", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "category_id": category_id},
            {"name": "Legging Estampada Cintura Alta M", "brand": "Adidas", "cost_price": 65.00, "price": 129.90, "category_id": category_id},
            {"name": "Legging Estampada Cintura Alta G", "brand": "Adidas", "cost_price": 65.00, "price": 129.90, "category_id": category_id},
            {"name": "Legging Corsário Preta M", "brand": "Lupo", "cost_price": 50.00, "price": 99.90, "category_id": category_id},
            {"name": "Legging Corsário Preta G", "brand": "Lupo", "cost_price": 50.00, "price": 99.90, "category_id": category_id},
            {"name": "Calça Jogger Preta M", "brand": "Puma", "cost_price": 70.00, "price": 139.90, "category_id": category_id},
            {"name": "Calça Jogger Preta G", "brand": "Puma", "cost_price": 70.00, "price": 139.90, "category_id": category_id},
            {"name": "Calça Jogger Cinza M", "brand": "Puma", "cost_price": 70.00, "price": 139.90, "category_id": category_id},
            {"name": "Calça Jogger Cinza G", "brand": "Puma", "cost_price": 70.00, "price": 139.90, "category_id": category_id},
            {"name": "Calça Moletom Preta M", "brand": "Adidas", "cost_price": 75.00, "price": 149.90, "category_id": category_id},
            {"name": "Calça Moletom Preta G", "brand": "Adidas", "cost_price": 75.00, "price": 149.90, "category_id": category_id},
            {"name": "Legging Compressão Preta M", "brand": "Under Armour", "cost_price": 80.00, "price": 159.90, "category_id": category_id},
            {"name": "Legging Compressão Preta G", "brand": "Under Armour", "cost_price": 80.00, "price": 159.90, "category_id": category_id},
            {"name": "Legging Seamless Preta M", "brand": "Gymshark", "cost_price": 85.00, "price": 169.90, "category_id": category_id},
            {"name": "Legging Seamless Preta G", "brand": "Gymshark", "cost_price": 85.00, "price": 169.90, "category_id": category_id},
            {"name": "Legging Cinza Mescla M", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "category_id": category_id},
            {"name": "Legging Cinza Mescla G", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "category_id": category_id},
        ]
        count = 0
        for p in products:
            p['sku'] = self._generate_sku()  # Adicionar SKU
            p['is_catalog'] = True  # Marcar como catálogo
            await self.product_repo.create(ProductCreate(**p), tenant_id=tenant_id)
            count += 1
        return count

    async def _create_tops(self, tenant_id: int, category_id: int) -> int:
        products = [
            {"name": "Top Esportivo Preto P", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Top Esportivo Preto M", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Top Esportivo Preto G", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Top Esportivo Rosa M", "brand": "Adidas", "cost_price": 38.00, "price": 74.90, "category_id": category_id},
            {"name": "Top Esportivo Rosa G", "brand": "Adidas", "cost_price": 38.00, "price": 74.90, "category_id": category_id},
            {"name": "Sutiã Esportivo Alto Impacto Preto P", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "category_id": category_id},
            {"name": "Sutiã Esportivo Alto Impacto Preto M", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "category_id": category_id},
            {"name": "Sutiã Esportivo Alto Impacto Preto G", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "category_id": category_id},
            {"name": "Top Nadador Preto M", "brand": "Lupo", "cost_price": 32.00, "price": 64.90, "category_id": category_id},
            {"name": "Top Nadador Preto G", "brand": "Lupo", "cost_price": 32.00, "price": 64.90, "category_id": category_id},
            {"name": "Top Cropped Preto P", "brand": "Puma", "cost_price": 30.00, "price": 59.90, "category_id": category_id},
            {"name": "Top Cropped Preto M", "brand": "Puma", "cost_price": 30.00, "price": 59.90, "category_id": category_id},
            {"name": "Top Cropped Preto G", "brand": "Puma", "cost_price": 30.00, "price": 59.90, "category_id": category_id},
            {"name": "Sutiã Seamless Preto M", "brand": "Gymshark", "cost_price": 60.00, "price": 119.90, "category_id": category_id},
            {"name": "Sutiã Seamless Preto G", "brand": "Gymshark", "cost_price": 60.00, "price": 119.90, "category_id": category_id},
        ]
        count = 0
        for p in products:
            p['sku'] = self._generate_sku()  # Adicionar SKU
            p['is_catalog'] = True  # Marcar como catálogo
            await self.product_repo.create(ProductCreate(**p), tenant_id=tenant_id)
            count += 1
        return count

    async def _create_jackets(self, tenant_id: int, category_id: int) -> int:
        products = [
            {"name": "Jaqueta Corta-Vento Preta M", "brand": "Nike", "cost_price": 80.00, "price": 159.90, "category_id": category_id},
            {"name": "Jaqueta Corta-Vento Preta G", "brand": "Nike", "cost_price": 80.00, "price": 159.90, "category_id": category_id},
            {"name": "Jaqueta Corta-Vento Preta GG", "brand": "Nike", "cost_price": 80.00, "price": 159.90, "category_id": category_id},
            {"name": "Moletom Fechado Preto M", "brand": "Adidas", "cost_price": 90.00, "price": 179.90, "category_id": category_id},
            {"name": "Moletom Fechado Preto G", "brand": "Adidas", "cost_price": 90.00, "price": 179.90, "category_id": category_id},
            {"name": "Moletom Fechado Cinza M", "brand": "Adidas", "cost_price": 90.00, "price": 179.90, "category_id": category_id},
            {"name": "Moletom Aberto com Capuz Preto M", "brand": "Puma", "cost_price": 95.00, "price": 189.90, "category_id": category_id},
            {"name": "Moletom Aberto com Capuz Preto G", "brand": "Puma", "cost_price": 95.00, "price": 189.90, "category_id": category_id},
            {"name": "Jaqueta Tactel Preta M", "brand": "Under Armour", "cost_price": 85.00, "price": 169.90, "category_id": category_id},
            {"name": "Jaqueta Tactel Preta G", "brand": "Under Armour", "cost_price": 85.00, "price": 169.90, "category_id": category_id},
            {"name": "Colete Puffer Preto M", "brand": "Nike", "cost_price": 100.00, "price": 199.90, "category_id": category_id},
            {"name": "Colete Puffer Preto G", "brand": "Nike", "cost_price": 100.00, "price": 199.90, "category_id": category_id},
            {"name": "Jaqueta Bomber Preta M", "brand": "Adidas", "cost_price": 110.00, "price": 219.90, "category_id": category_id},
            {"name": "Jaqueta Bomber Preta G", "brand": "Adidas", "cost_price": 110.00, "price": 219.90, "category_id": category_id},
            {"name": "Moletom Oversized Preto G", "brand": "Puma", "cost_price": 95.00, "price": 189.90, "category_id": category_id},
        ]
        count = 0
        for p in products:
            p['sku'] = self._generate_sku()  # Adicionar SKU
            p['is_catalog'] = True  # Marcar como catálogo
            await self.product_repo.create(ProductCreate(**p), tenant_id=tenant_id)
            count += 1
        return count

    async def _create_shoes(self, tenant_id: int, category_id: int) -> int:
        products = [
            {"name": "Tênis Corrida Revolution Preto 38", "brand": "Nike", "cost_price": 150.00, "price": 299.90, "category_id": category_id},
            {"name": "Tênis Corrida Revolution Preto 40", "brand": "Nike", "cost_price": 150.00, "price": 299.90, "category_id": category_id},
            {"name": "Tênis Corrida Revolution Preto 42", "brand": "Nike", "cost_price": 150.00, "price": 299.90, "category_id": category_id},
            {"name": "Tênis Musculação Metcon Preto 40", "brand": "Nike", "cost_price": 180.00, "price": 359.90, "category_id": category_id},
            {"name": "Tênis Musculação Metcon Preto 42", "brand": "Nike", "cost_price": 180.00, "price": 359.90, "category_id": category_id},
            {"name": "Tênis Ultraboost Preto 40", "brand": "Adidas", "cost_price": 200.00, "price": 399.90, "category_id": category_id},
            {"name": "Tênis Ultraboost Preto 42", "brand": "Adidas", "cost_price": 200.00, "price": 399.90, "category_id": category_id},
            {"name": "Tênis Charged Preto 40", "brand": "Under Armour", "cost_price": 170.00, "price": 339.90, "category_id": category_id},
            {"name": "Tênis Charged Preto 42", "brand": "Under Armour", "cost_price": 170.00, "price": 339.90, "category_id": category_id},
            {"name": "Chinelo Slide Preto 40", "brand": "Adidas", "cost_price": 50.00, "price": 99.90, "category_id": category_id},
        ]
        count = 0
        for p in products:
            p['sku'] = self._generate_sku()  # Adicionar SKU
            p['is_catalog'] = True  # Marcar como catálogo
            await self.product_repo.create(ProductCreate(**p), tenant_id=tenant_id)
            count += 1
        return count

    async def _create_accessories(self, tenant_id: int, category_id: int) -> int:
        products = [
            {"name": "Boné Aba Curva Preto", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Boné Aba Curva Branco", "brand": "Adidas", "cost_price": 35.00, "price": 69.90, "category_id": category_id},
            {"name": "Viseira Esportiva Preta", "brand": "Under Armour", "cost_price": 25.00, "price": 49.90, "category_id": category_id},
            {"name": "Meia Cano Alto Kit 3 Pares Preta", "brand": "Lupo", "cost_price": 20.00, "price": 39.90, "category_id": category_id},
            {"name": "Meia Cano Médio Kit 3 Pares Branca", "brand": "Lupo", "cost_price": 20.00, "price": 39.90, "category_id": category_id},
            {"name": "Luva de Musculação M", "brand": "MadMax", "cost_price": 25.00, "price": 49.90, "category_id": category_id},
            {"name": "Luva de Musculação G", "brand": "MadMax", "cost_price": 25.00, "price": 49.90, "category_id": category_id},
            {"name": "Mochila Esportiva 30L Preta", "brand": "Nike", "cost_price": 80.00, "price": 159.90, "category_id": category_id},
            {"name": "Bolsa Esportiva 40L Preta", "brand": "Adidas", "cost_price": 90.00, "price": 179.90, "category_id": category_id},
            {"name": "Munhequeira Par Preta", "brand": "Nike", "cost_price": 15.00, "price": 29.90, "category_id": category_id},
        ]
        count = 0
        for p in products:
            p['sku'] = self._generate_sku()  # Adicionar SKU
            p['is_catalog'] = True  # Marcar como catálogo
            await self.product_repo.create(ProductCreate(**p), tenant_id=tenant_id)
            count += 1
        return count
