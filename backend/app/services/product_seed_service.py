"""
Serviço para criar produtos iniciais automaticamente quando uma loja se cadastra.
"""
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.category_repository import CategoryRepository
from app.models.product import Product
from app.models.product_variant import ProductVariant
import logging

logger = logging.getLogger(__name__)


class ProductSeedService:
    """Serviço para seed automático de roupas e acessórios fitness."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.category_repo = CategoryRepository(db)
        self.sku_counter = 1  # Contador para gerar SKUs únicos

    async def seed_fitness_products(self, tenant_id: int) -> int:
        """Cria 115 roupas e acessórios fitness para uma nova loja."""
        logger.info(f"Iniciando seed de roupas fitness para tenant_id={tenant_id}")

        categories = await self._create_categories(tenant_id)
        products_created = 0

        products_created += await self._create_products(
            tenant_id, categories.get("Camisetas").id, self._get_tshirts()
        )
        products_created += await self._create_products(
            tenant_id, categories.get("Shorts e Bermudas").id, self._get_shorts()
        )
        products_created += await self._create_products(
            tenant_id, categories.get("Leggings e Calças").id, self._get_leggings()
        )
        products_created += await self._create_products(
            tenant_id, categories.get("Tops e Sutiãs").id, self._get_tops()
        )
        products_created += await self._create_products(
            tenant_id, categories.get("Jaquetas e Moletons").id, self._get_jackets()
        )
        products_created += await self._create_products(
            tenant_id, categories.get("Tênis e Calçados").id, self._get_shoes()
        )
        products_created += await self._create_products(
            tenant_id, categories.get("Acessórios").id, self._get_accessories()
        )

        logger.info(f"{products_created} roupas fitness criadas para tenant_id={tenant_id}")
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

    async def _create_products(self, tenant_id: int, category_id: int, products_data: list) -> int:
        """Cria produtos com variantes diretamente no banco."""
        count = 0
        for p in products_data:
            sku = self._generate_sku()
            
            # Criar produto pai
            product = Product(
                name=p["name"],
                description=p.get("description"),
                brand=p.get("brand"),
                category_id=category_id,
                gender=p.get("gender"),
                material=p.get("material"),
                is_catalog=True,  # Produtos do catálogo
                is_active=True,
                tenant_id=tenant_id,
            )
            self.db.add(product)
            await self.db.flush()  # Obter product.id
            
            # Criar variante
            variant = ProductVariant(
                product_id=product.id,
                sku=sku,
                price=Decimal(str(p["price"])),
                cost_price=Decimal(str(p["cost_price"])) if p.get("cost_price") else None,
                color=p.get("color"),
                size=p.get("size"),
                is_active=True,
                tenant_id=tenant_id,
            )
            self.db.add(variant)
            count += 1
        
        await self.db.flush()
        return count

    def _get_tshirts(self) -> list:
        return [
            {"name": "Camiseta Dry Fit Preta P", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "size": "P"},
            {"name": "Camiseta Dry Fit Preta M", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "size": "M"},
            {"name": "Camiseta Dry Fit Preta G", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "size": "G"},
            {"name": "Camiseta Dry Fit Preta GG", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "size": "GG"},
            {"name": "Camiseta Dry Fit Branca M", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "color": "Branco", "size": "M"},
            {"name": "Camiseta Dry Fit Branca G", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "color": "Branco", "size": "G"},
            {"name": "Camiseta Dry Fit Azul Marinho M", "brand": "Adidas", "cost_price": 38.00, "price": 74.90, "color": "Azul Marinho", "size": "M"},
            {"name": "Camiseta Dry Fit Azul Marinho G", "brand": "Adidas", "cost_price": 38.00, "price": 74.90, "color": "Azul Marinho", "size": "G"},
            {"name": "Regata Cavada Preta P", "brand": "Under Armour", "cost_price": 30.00, "price": 59.90, "size": "P"},
            {"name": "Regata Cavada Preta M", "brand": "Under Armour", "cost_price": 30.00, "price": 59.90, "size": "M"},
            {"name": "Regata Cavada Preta G", "brand": "Under Armour", "cost_price": 30.00, "price": 59.90, "size": "G"},
            {"name": "Regata Cavada Cinza M", "brand": "Under Armour", "cost_price": 30.00, "price": 59.90, "color": "Cinza", "size": "M"},
            {"name": "Regata Nadador Preta P", "brand": "Puma", "cost_price": 28.00, "price": 54.90, "size": "P"},
            {"name": "Regata Nadador Preta M", "brand": "Puma", "cost_price": 28.00, "price": 54.90, "size": "M"},
            {"name": "Regata Nadador Preta G", "brand": "Puma", "cost_price": 28.00, "price": 54.90, "size": "G"},
            {"name": "Regata Nadador Branca M", "brand": "Puma", "cost_price": 28.00, "price": 54.90, "color": "Branco", "size": "M"},
            {"name": "Camiseta Oversized Preta M", "brand": "Adidas", "cost_price": 40.00, "price": 79.90, "size": "M"},
            {"name": "Camiseta Oversized Preta G", "brand": "Adidas", "cost_price": 40.00, "price": 79.90, "size": "G"},
            {"name": "Camiseta Oversized Cinza G", "brand": "Adidas", "cost_price": 40.00, "price": 79.90, "color": "Cinza", "size": "G"},
            {"name": "Camiseta Compressao Preta M", "brand": "Under Armour", "cost_price": 45.00, "price": 89.90, "size": "M"},
            {"name": "Camiseta Compressao Preta G", "brand": "Under Armour", "cost_price": 45.00, "price": 89.90, "size": "G"},
            {"name": "Camiseta Basica Algodao Preta M", "brand": "Lupo", "cost_price": 25.00, "price": 49.90, "size": "M"},
            {"name": "Camiseta Basica Algodao Preta G", "brand": "Lupo", "cost_price": 25.00, "price": 49.90, "size": "G"},
            {"name": "Camiseta Basica Algodao Branca M", "brand": "Lupo", "cost_price": 25.00, "price": 49.90, "color": "Branco", "size": "M"},
            {"name": "Camiseta Basica Algodao Branca G", "brand": "Lupo", "cost_price": 25.00, "price": 49.90, "color": "Branco", "size": "G"},
        ]

    def _get_shorts(self) -> list:
        return [
            {"name": "Short de Treino Preto P", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "size": "P"},
            {"name": "Short de Treino Preto M", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "size": "M"},
            {"name": "Short de Treino Preto G", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "size": "G"},
            {"name": "Short de Treino Preto GG", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "size": "GG"},
            {"name": "Short de Treino Azul M", "brand": "Adidas", "cost_price": 42.00, "price": 84.90, "color": "Azul", "size": "M"},
            {"name": "Short de Treino Azul G", "brand": "Adidas", "cost_price": 42.00, "price": 84.90, "color": "Azul", "size": "G"},
            {"name": "Bermuda Moletom Preta M", "brand": "Puma", "cost_price": 50.00, "price": 99.90, "size": "M"},
            {"name": "Bermuda Moletom Preta G", "brand": "Puma", "cost_price": 50.00, "price": 99.90, "size": "G"},
            {"name": "Bermuda Moletom Cinza M", "brand": "Puma", "cost_price": 50.00, "price": 99.90, "color": "Cinza", "size": "M"},
            {"name": "Bermuda Moletom Cinza G", "brand": "Puma", "cost_price": 50.00, "price": 99.90, "color": "Cinza", "size": "G"},
            {"name": "Short Corrida 2 em 1 Preto P", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "size": "P"},
            {"name": "Short Corrida 2 em 1 Preto M", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "size": "M"},
            {"name": "Short Corrida 2 em 1 Preto G", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "size": "G"},
            {"name": "Short Ciclista Preto P", "brand": "Lupo", "cost_price": 35.00, "price": 69.90, "size": "P"},
            {"name": "Short Ciclista Preto M", "brand": "Lupo", "cost_price": 35.00, "price": 69.90, "size": "M"},
            {"name": "Short Ciclista Preto G", "brand": "Lupo", "cost_price": 35.00, "price": 69.90, "size": "G"},
            {"name": "Bermuda Tactel Preta M", "brand": "Adidas", "cost_price": 45.00, "price": 89.90, "size": "M"},
            {"name": "Bermuda Tactel Preta G", "brand": "Adidas", "cost_price": 45.00, "price": 89.90, "size": "G"},
            {"name": "Short Dry Fit Cinza M", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "color": "Cinza", "size": "M"},
            {"name": "Short Dry Fit Cinza G", "brand": "Nike", "cost_price": 40.00, "price": 79.90, "color": "Cinza", "size": "G"},
        ]

    def _get_leggings(self) -> list:
        return [
            {"name": "Legging Preta Cintura Alta P", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "size": "P"},
            {"name": "Legging Preta Cintura Alta M", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "size": "M"},
            {"name": "Legging Preta Cintura Alta G", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "size": "G"},
            {"name": "Legging Preta Cintura Alta GG", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "size": "GG"},
            {"name": "Legging Estampada Cintura Alta M", "brand": "Adidas", "cost_price": 65.00, "price": 129.90, "size": "M"},
            {"name": "Legging Estampada Cintura Alta G", "brand": "Adidas", "cost_price": 65.00, "price": 129.90, "size": "G"},
            {"name": "Legging Corsario Preta M", "brand": "Lupo", "cost_price": 50.00, "price": 99.90, "size": "M"},
            {"name": "Legging Corsario Preta G", "brand": "Lupo", "cost_price": 50.00, "price": 99.90, "size": "G"},
            {"name": "Calca Jogger Preta M", "brand": "Puma", "cost_price": 70.00, "price": 139.90, "size": "M"},
            {"name": "Calca Jogger Preta G", "brand": "Puma", "cost_price": 70.00, "price": 139.90, "size": "G"},
            {"name": "Calca Jogger Cinza M", "brand": "Puma", "cost_price": 70.00, "price": 139.90, "color": "Cinza", "size": "M"},
            {"name": "Calca Jogger Cinza G", "brand": "Puma", "cost_price": 70.00, "price": 139.90, "color": "Cinza", "size": "G"},
            {"name": "Calca Moletom Preta M", "brand": "Adidas", "cost_price": 75.00, "price": 149.90, "size": "M"},
            {"name": "Calca Moletom Preta G", "brand": "Adidas", "cost_price": 75.00, "price": 149.90, "size": "G"},
            {"name": "Legging Compressao Preta M", "brand": "Under Armour", "cost_price": 80.00, "price": 159.90, "size": "M"},
            {"name": "Legging Compressao Preta G", "brand": "Under Armour", "cost_price": 80.00, "price": 159.90, "size": "G"},
            {"name": "Legging Seamless Preta M", "brand": "Gymshark", "cost_price": 85.00, "price": 169.90, "size": "M"},
            {"name": "Legging Seamless Preta G", "brand": "Gymshark", "cost_price": 85.00, "price": 169.90, "size": "G"},
            {"name": "Legging Cinza Mescla M", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "color": "Cinza", "size": "M"},
            {"name": "Legging Cinza Mescla G", "brand": "Nike", "cost_price": 60.00, "price": 119.90, "color": "Cinza", "size": "G"},
        ]

    def _get_tops(self) -> list:
        return [
            {"name": "Top Esportivo Preto P", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "size": "P"},
            {"name": "Top Esportivo Preto M", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "size": "M"},
            {"name": "Top Esportivo Preto G", "brand": "Nike", "cost_price": 35.00, "price": 69.90, "size": "G"},
            {"name": "Top Esportivo Rosa M", "brand": "Adidas", "cost_price": 38.00, "price": 74.90, "color": "Rosa", "size": "M"},
            {"name": "Top Esportivo Rosa G", "brand": "Adidas", "cost_price": 38.00, "price": 74.90, "color": "Rosa", "size": "G"},
            {"name": "Sutia Esportivo Alto Impacto Preto P", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "size": "P"},
            {"name": "Sutia Esportivo Alto Impacto Preto M", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "size": "M"},
            {"name": "Sutia Esportivo Alto Impacto Preto G", "brand": "Under Armour", "cost_price": 55.00, "price": 109.90, "size": "G"},
            {"name": "Top Nadador Preto M", "brand": "Lupo", "cost_price": 32.00, "price": 64.90, "size": "M"},
            {"name": "Top Nadador Preto G", "brand": "Lupo", "cost_price": 32.00, "price": 64.90, "size": "G"},
            {"name": "Top Cropped Preto P", "brand": "Puma", "cost_price": 30.00, "price": 59.90, "size": "P"},
            {"name": "Top Cropped Preto M", "brand": "Puma", "cost_price": 30.00, "price": 59.90, "size": "M"},
            {"name": "Top Cropped Preto G", "brand": "Puma", "cost_price": 30.00, "price": 59.90, "size": "G"},
            {"name": "Sutia Seamless Preto M", "brand": "Gymshark", "cost_price": 60.00, "price": 119.90, "size": "M"},
            {"name": "Sutia Seamless Preto G", "brand": "Gymshark", "cost_price": 60.00, "price": 119.90, "size": "G"},
        ]

    def _get_jackets(self) -> list:
        return [
            {"name": "Jaqueta Corta-Vento Preta M", "brand": "Nike", "cost_price": 80.00, "price": 159.90, "size": "M"},
            {"name": "Jaqueta Corta-Vento Preta G", "brand": "Nike", "cost_price": 80.00, "price": 159.90, "size": "G"},
            {"name": "Jaqueta Corta-Vento Preta GG", "brand": "Nike", "cost_price": 80.00, "price": 159.90, "size": "GG"},
            {"name": "Moletom Fechado Preto M", "brand": "Adidas", "cost_price": 90.00, "price": 179.90, "size": "M"},
            {"name": "Moletom Fechado Preto G", "brand": "Adidas", "cost_price": 90.00, "price": 179.90, "size": "G"},
            {"name": "Moletom Fechado Cinza M", "brand": "Adidas", "cost_price": 90.00, "price": 179.90, "color": "Cinza", "size": "M"},
            {"name": "Moletom Aberto com Capuz Preto M", "brand": "Puma", "cost_price": 95.00, "price": 189.90, "size": "M"},
            {"name": "Moletom Aberto com Capuz Preto G", "brand": "Puma", "cost_price": 95.00, "price": 189.90, "size": "G"},
            {"name": "Jaqueta Tactel Preta M", "brand": "Under Armour", "cost_price": 85.00, "price": 169.90, "size": "M"},
            {"name": "Jaqueta Tactel Preta G", "brand": "Under Armour", "cost_price": 85.00, "price": 169.90, "size": "G"},
            {"name": "Colete Puffer Preto M", "brand": "Nike", "cost_price": 100.00, "price": 199.90, "size": "M"},
            {"name": "Colete Puffer Preto G", "brand": "Nike", "cost_price": 100.00, "price": 199.90, "size": "G"},
            {"name": "Jaqueta Bomber Preta M", "brand": "Adidas", "cost_price": 110.00, "price": 219.90, "size": "M"},
            {"name": "Jaqueta Bomber Preta G", "brand": "Adidas", "cost_price": 110.00, "price": 219.90, "size": "G"},
            {"name": "Moletom Oversized Preto G", "brand": "Puma", "cost_price": 95.00, "price": 189.90, "size": "G"},
        ]

    def _get_shoes(self) -> list:
        return [
            {"name": "Tenis Corrida Revolution Preto 38", "brand": "Nike", "cost_price": 150.00, "price": 299.90, "size": "38"},
            {"name": "Tenis Corrida Revolution Preto 40", "brand": "Nike", "cost_price": 150.00, "price": 299.90, "size": "40"},
            {"name": "Tenis Corrida Revolution Preto 42", "brand": "Nike", "cost_price": 150.00, "price": 299.90, "size": "42"},
            {"name": "Tenis Musculacao Metcon Preto 40", "brand": "Nike", "cost_price": 180.00, "price": 359.90, "size": "40"},
            {"name": "Tenis Musculacao Metcon Preto 42", "brand": "Nike", "cost_price": 180.00, "price": 359.90, "size": "42"},
            {"name": "Tenis Ultraboost Preto 40", "brand": "Adidas", "cost_price": 200.00, "price": 399.90, "size": "40"},
            {"name": "Tenis Ultraboost Preto 42", "brand": "Adidas", "cost_price": 200.00, "price": 399.90, "size": "42"},
            {"name": "Tenis Charged Preto 40", "brand": "Under Armour", "cost_price": 170.00, "price": 339.90, "size": "40"},
            {"name": "Tenis Charged Preto 42", "brand": "Under Armour", "cost_price": 170.00, "price": 339.90, "size": "42"},
            {"name": "Chinelo Slide Preto 40", "brand": "Adidas", "cost_price": 50.00, "price": 99.90, "size": "40"},
        ]

    def _get_accessories(self) -> list:
        return [
            {"name": "Bone Aba Curva Preto", "brand": "Nike", "cost_price": 35.00, "price": 69.90},
            {"name": "Bone Aba Curva Branco", "brand": "Adidas", "cost_price": 35.00, "price": 69.90, "color": "Branco"},
            {"name": "Viseira Esportiva Preta", "brand": "Under Armour", "cost_price": 25.00, "price": 49.90},
            {"name": "Meia Cano Alto Kit 3 Pares Preta", "brand": "Lupo", "cost_price": 20.00, "price": 39.90},
            {"name": "Meia Cano Medio Kit 3 Pares Branca", "brand": "Lupo", "cost_price": 20.00, "price": 39.90, "color": "Branco"},
            {"name": "Luva de Musculacao M", "brand": "MadMax", "cost_price": 25.00, "price": 49.90, "size": "M"},
            {"name": "Luva de Musculacao G", "brand": "MadMax", "cost_price": 25.00, "price": 49.90, "size": "G"},
            {"name": "Mochila Esportiva 30L Preta", "brand": "Nike", "cost_price": 80.00, "price": 159.90},
            {"name": "Bolsa Esportiva 40L Preta", "brand": "Adidas", "cost_price": 90.00, "price": 179.90},
            {"name": "Munhequeira Par Preta", "brand": "Nike", "cost_price": 15.00, "price": 29.90},
        ]