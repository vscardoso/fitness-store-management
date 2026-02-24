"""
Serviço para criar produtos do catálogo automaticamente quando uma loja se cadastra.

FORMATO: Produtos com múltiplas variantes (tamanhos/cores)
- Cada produto pai tem N variantes
- SKU é gerado por variante
"""
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.category_repository import CategoryRepository
from app.models.product import Product
from app.models.product_variant import ProductVariant
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class ProductSeedService:
    """Serviço para seed automático de roupas e acessórios fitness."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.category_repo = CategoryRepository(db)
        self.sku_counter = 1

    async def seed_fitness_products(self, tenant_id: int) -> int:
        """Cria produtos fitness com variantes para uma nova loja."""
        logger.info(f"Iniciando seed de produtos com variantes para tenant_id={tenant_id}")

        categories = await self._create_categories(tenant_id)
        variants_created = 0

        variants_created += await self._create_products_with_variants(
            tenant_id, categories.get("Camisetas").id, self._get_tshirts()
        )
        variants_created += await self._create_products_with_variants(
            tenant_id, categories.get("Shorts e Bermudas").id, self._get_shorts()
        )
        variants_created += await self._create_products_with_variants(
            tenant_id, categories.get("Leggings e Calças").id, self._get_leggings()
        )
        variants_created += await self._create_products_with_variants(
            tenant_id, categories.get("Tops e Sutiãs").id, self._get_tops()
        )
        variants_created += await self._create_products_with_variants(
            tenant_id, categories.get("Jaquetas e Moletons").id, self._get_jackets()
        )
        variants_created += await self._create_products_with_variants(
            tenant_id, categories.get("Tênis e Calçados").id, self._get_shoes()
        )
        variants_created += await self._create_products_with_variants(
            tenant_id, categories.get("Acessórios").id, self._get_accessories()
        )

        logger.info(f"{variants_created} variantes criadas para tenant_id={tenant_id}")
        return variants_created

    # Método _generate_sku REMOVIDO - produtos do catálogo não têm SKU
    # SKU só é gerado quando o produto é ativado para a loja

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

    async def _create_products_with_variants(
        self, 
        tenant_id: int, 
        category_id: int, 
        products_data: List[Dict[str, Any]]
    ) -> int:
        """Cria produtos pais com suas variantes (SEM SKU - catálogo não tem SKU)."""
        variants_count = 0
        
        for prod_data in products_data:
            product = Product(
                name=prod_data["name"],
                description=prod_data.get("description"),
                brand=prod_data.get("brand"),
                base_price=Decimal(str(prod_data.get("base_price", 0))),
                category_id=category_id,
                gender=prod_data.get("gender"),
                material=prod_data.get("material"),
                is_catalog=True,
                is_active=True,
                tenant_id=tenant_id,
            )
            self.db.add(product)
            await self.db.flush()
            
            for var_data in prod_data.get("variants", []):
                # IMPORTANTE: Variantes do catálogo NÃO têm SKU
                # SKU só é gerado quando o produto é ativado (copiado para a loja)
                variant = ProductVariant(
                    product_id=product.id,
                    sku=None,  # Catálogo não tem SKU
                    price=Decimal(str(var_data.get("price", prod_data.get("base_price", 0)))),
                    cost_price=Decimal(str(var_data["cost_price"])) if var_data.get("cost_price") else None,
                    color=var_data.get("color"),
                    size=var_data.get("size"),
                    is_active=True,
                    tenant_id=tenant_id,
                )
                self.db.add(variant)
                variants_count += 1
        
        await self.db.flush()
        return variants_count

    def _get_tshirts(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "Camiseta Dry Fit Preta",
                "brand": "Nike",
                "base_price": 69.90,
                "gender": "Unissex",
                "material": "Poliamida",
                "variants": [
                    {"size": "P", "cost_price": 35.00, "price": 69.90},
                    {"size": "M", "cost_price": 35.00, "price": 69.90},
                    {"size": "G", "cost_price": 35.00, "price": 69.90},
                    {"size": "GG", "cost_price": 35.00, "price": 69.90},
                ]
            },
            {
                "name": "Camiseta Dry Fit Branca",
                "brand": "Nike",
                "base_price": 69.90,
                "gender": "Unissex",
                "material": "Poliamida",
                "variants": [
                    {"size": "P", "color": "Branco", "cost_price": 35.00, "price": 69.90},
                    {"size": "M", "color": "Branco", "cost_price": 35.00, "price": 69.90},
                    {"size": "G", "color": "Branco", "cost_price": 35.00, "price": 69.90},
                ]
            },
            {
                "name": "Camiseta Dry Fit Azul Marinho",
                "brand": "Adidas",
                "base_price": 74.90,
                "gender": "Unissex",
                "material": "Poliamida",
                "variants": [
                    {"size": "P", "color": "Azul Marinho", "cost_price": 38.00, "price": 74.90},
                    {"size": "M", "color": "Azul Marinho", "cost_price": 38.00, "price": 74.90},
                    {"size": "G", "color": "Azul Marinho", "cost_price": 38.00, "price": 74.90},
                ]
            },
            {
                "name": "Regata Cavada Preta",
                "brand": "Under Armour",
                "base_price": 59.90,
                "gender": "Masculino",
                "material": "Poliéster",
                "variants": [
                    {"size": "P", "cost_price": 30.00, "price": 59.90},
                    {"size": "M", "cost_price": 30.00, "price": 59.90},
                    {"size": "G", "cost_price": 30.00, "price": 59.90},
                    {"size": "GG", "cost_price": 30.00, "price": 59.90},
                ]
            },
            {
                "name": "Regata Cavada Cinza",
                "brand": "Under Armour",
                "base_price": 59.90,
                "gender": "Masculino",
                "material": "Poliéster",
                "variants": [
                    {"size": "P", "color": "Cinza", "cost_price": 30.00, "price": 59.90},
                    {"size": "M", "color": "Cinza", "cost_price": 30.00, "price": 59.90},
                    {"size": "G", "color": "Cinza", "cost_price": 30.00, "price": 59.90},
                ]
            },
            {
                "name": "Regata Nadador Preta",
                "brand": "Puma",
                "base_price": 54.90,
                "gender": "Masculino",
                "material": "Algodão",
                "variants": [
                    {"size": "P", "cost_price": 28.00, "price": 54.90},
                    {"size": "M", "cost_price": 28.00, "price": 54.90},
                    {"size": "G", "cost_price": 28.00, "price": 54.90},
                ]
            },
            {
                "name": "Camiseta Oversized Preta",
                "brand": "Adidas",
                "base_price": 79.90,
                "gender": "Unissex",
                "material": "Algodão",
                "variants": [
                    {"size": "M", "cost_price": 40.00, "price": 79.90},
                    {"size": "G", "cost_price": 40.00, "price": 79.90},
                    {"size": "GG", "cost_price": 40.00, "price": 79.90},
                ]
            },
            {
                "name": "Camiseta Compressão Preta",
                "brand": "Under Armour",
                "base_price": 89.90,
                "gender": "Masculino",
                "material": "Elastano",
                "variants": [
                    {"size": "P", "cost_price": 45.00, "price": 89.90},
                    {"size": "M", "cost_price": 45.00, "price": 89.90},
                    {"size": "G", "cost_price": 45.00, "price": 89.90},
                    {"size": "GG", "cost_price": 45.00, "price": 89.90},
                ]
            },
            {
                "name": "Camiseta Básica Algodão Preta",
                "brand": "Lupo",
                "base_price": 49.90,
                "gender": "Unissex",
                "material": "Algodão",
                "variants": [
                    {"size": "P", "cost_price": 25.00, "price": 49.90},
                    {"size": "M", "cost_price": 25.00, "price": 49.90},
                    {"size": "G", "cost_price": 25.00, "price": 49.90},
                    {"size": "GG", "cost_price": 25.00, "price": 49.90},
                ]
            },
        ]

    def _get_shorts(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "Short de Treino Preto",
                "brand": "Nike",
                "base_price": 79.90,
                "gender": "Masculino",
                "material": "Poliamida",
                "variants": [
                    {"size": "P", "cost_price": 40.00, "price": 79.90},
                    {"size": "M", "cost_price": 40.00, "price": 79.90},
                    {"size": "G", "cost_price": 40.00, "price": 79.90},
                    {"size": "GG", "cost_price": 40.00, "price": 79.90},
                ]
            },
            {
                "name": "Short de Treino Azul",
                "brand": "Adidas",
                "base_price": 84.90,
                "gender": "Masculino",
                "material": "Poliamida",
                "variants": [
                    {"size": "P", "color": "Azul", "cost_price": 42.00, "price": 84.90},
                    {"size": "M", "color": "Azul", "cost_price": 42.00, "price": 84.90},
                    {"size": "G", "color": "Azul", "cost_price": 42.00, "price": 84.90},
                ]
            },
            {
                "name": "Bermida Moletom Preta",
                "brand": "Puma",
                "base_price": 99.90,
                "gender": "Masculino",
                "material": "Moletom",
                "variants": [
                    {"size": "M", "cost_price": 50.00, "price": 99.90},
                    {"size": "G", "cost_price": 50.00, "price": 99.90},
                    {"size": "GG", "cost_price": 50.00, "price": 99.90},
                ]
            },
            {
                "name": "Short Corrida 2 em 1 Preto",
                "brand": "Under Armour",
                "base_price": 109.90,
                "gender": "Masculino",
                "material": "Poliamida",
                "variants": [
                    {"size": "P", "cost_price": 55.00, "price": 109.90},
                    {"size": "M", "cost_price": 55.00, "price": 109.90},
                    {"size": "G", "cost_price": 55.00, "price": 109.90},
                ]
            },
            {
                "name": "Short Ciclista Preto",
                "brand": "Lupo",
                "base_price": 69.90,
                "gender": "Feminino",
                "material": "Elastano",
                "variants": [
                    {"size": "P", "cost_price": 35.00, "price": 69.90},
                    {"size": "M", "cost_price": 35.00, "price": 69.90},
                    {"size": "G", "cost_price": 35.00, "price": 69.90},
                ]
            },
        ]

    def _get_leggings(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "Legging Cintura Alta Preta",
                "brand": "Nike",
                "base_price": 119.90,
                "gender": "Feminino",
                "material": "Elastano",
                "variants": [
                    {"size": "P", "cost_price": 60.00, "price": 119.90},
                    {"size": "M", "cost_price": 60.00, "price": 119.90},
                    {"size": "G", "cost_price": 60.00, "price": 119.90},
                    {"size": "GG", "cost_price": 60.00, "price": 119.90},
                ]
            },
            {
                "name": "Legging Estampada Cintura Alta",
                "brand": "Adidas",
                "base_price": 129.90,
                "gender": "Feminino",
                "material": "Elastano",
                "variants": [
                    {"size": "P", "cost_price": 65.00, "price": 129.90},
                    {"size": "M", "cost_price": 65.00, "price": 129.90},
                    {"size": "G", "cost_price": 65.00, "price": 129.90},
                ]
            },
            {
                "name": "Calça Jogger Preta",
                "brand": "Puma",
                "base_price": 139.90,
                "gender": "Unissex",
                "material": "Moletom",
                "variants": [
                    {"size": "P", "cost_price": 70.00, "price": 139.90},
                    {"size": "M", "cost_price": 70.00, "price": 139.90},
                    {"size": "G", "cost_price": 70.00, "price": 139.90},
                    {"size": "GG", "cost_price": 70.00, "price": 139.90},
                ]
            },
            {
                "name": "Calça Moletom Preta",
                "brand": "Adidas",
                "base_price": 149.90,
                "gender": "Unissex",
                "material": "Moletom",
                "variants": [
                    {"size": "M", "cost_price": 75.00, "price": 149.90},
                    {"size": "G", "cost_price": 75.00, "price": 149.90},
                    {"size": "GG", "cost_price": 75.00, "price": 149.90},
                ]
            },
            {
                "name": "Legging Seamless Preta",
                "brand": "Gymshark",
                "base_price": 169.90,
                "gender": "Feminino",
                "material": "Seamless",
                "variants": [
                    {"size": "P", "cost_price": 85.00, "price": 169.90},
                    {"size": "M", "cost_price": 85.00, "price": 169.90},
                    {"size": "G", "cost_price": 85.00, "price": 169.90},
                ]
            },
        ]

    def _get_tops(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "Top Esportivo Preto",
                "brand": "Nike",
                "base_price": 69.90,
                "gender": "Feminino",
                "material": "Elastano",
                "variants": [
                    {"size": "P", "cost_price": 35.00, "price": 69.90},
                    {"size": "M", "cost_price": 35.00, "price": 69.90},
                    {"size": "G", "cost_price": 35.00, "price": 69.90},
                ]
            },
            {
                "name": "Top Esportivo Rosa",
                "brand": "Adidas",
                "base_price": 74.90,
                "gender": "Feminino",
                "material": "Elastano",
                "variants": [
                    {"size": "P", "color": "Rosa", "cost_price": 38.00, "price": 74.90},
                    {"size": "M", "color": "Rosa", "cost_price": 38.00, "price": 74.90},
                    {"size": "G", "color": "Rosa", "cost_price": 38.00, "price": 74.90},
                ]
            },
            {
                "name": "Sutiã Esportivo Alto Impacto Preto",
                "brand": "Under Armour",
                "base_price": 109.90,
                "gender": "Feminino",
                "material": "Elastano",
                "variants": [
                    {"size": "P", "cost_price": 55.00, "price": 109.90},
                    {"size": "M", "cost_price": 55.00, "price": 109.90},
                    {"size": "G", "cost_price": 55.00, "price": 109.90},
                ]
            },
            {
                "name": "Top Cropped Preto",
                "brand": "Puma",
                "base_price": 59.90,
                "gender": "Feminino",
                "material": "Algodão",
                "variants": [
                    {"size": "P", "cost_price": 30.00, "price": 59.90},
                    {"size": "M", "cost_price": 30.00, "price": 59.90},
                    {"size": "G", "cost_price": 30.00, "price": 59.90},
                ]
            },
        ]

    def _get_jackets(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "Jaqueta Corta-Vento Preta",
                "brand": "Nike",
                "base_price": 159.90,
                "gender": "Unissex",
                "material": "Nylon",
                "variants": [
                    {"size": "M", "cost_price": 80.00, "price": 159.90},
                    {"size": "G", "cost_price": 80.00, "price": 159.90},
                    {"size": "GG", "cost_price": 80.00, "price": 159.90},
                ]
            },
            {
                "name": "Moletom Fechado Preto",
                "brand": "Adidas",
                "base_price": 179.90,
                "gender": "Unissex",
                "material": "Moletom",
                "variants": [
                    {"size": "M", "cost_price": 90.00, "price": 179.90},
                    {"size": "G", "cost_price": 90.00, "price": 179.90},
                    {"size": "GG", "cost_price": 90.00, "price": 179.90},
                ]
            },
            {
                "name": "Moletom Aberto com Capuz Preto",
                "brand": "Puma",
                "base_price": 189.90,
                "gender": "Unissex",
                "material": "Moletom",
                "variants": [
                    {"size": "M", "cost_price": 95.00, "price": 189.90},
                    {"size": "G", "cost_price": 95.00, "price": 189.90},
                    {"size": "GG", "cost_price": 95.00, "price": 189.90},
                ]
            },
            {
                "name": "Colete Puffer Preto",
                "brand": "Nike",
                "base_price": 199.90,
                "gender": "Unissex",
                "material": "Nylon",
                "variants": [
                    {"size": "M", "cost_price": 100.00, "price": 199.90},
                    {"size": "G", "cost_price": 100.00, "price": 199.90},
                    {"size": "GG", "cost_price": 100.00, "price": 199.90},
                ]
            },
        ]

    def _get_shoes(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "Tênis Corrida Revolution Preto",
                "brand": "Nike",
                "base_price": 299.90,
                "gender": "Unissex",
                "material": "Mesh",
                "variants": [
                    {"size": "38", "cost_price": 150.00, "price": 299.90},
                    {"size": "39", "cost_price": 150.00, "price": 299.90},
                    {"size": "40", "cost_price": 150.00, "price": 299.90},
                    {"size": "41", "cost_price": 150.00, "price": 299.90},
                    {"size": "42", "cost_price": 150.00, "price": 299.90},
                    {"size": "43", "cost_price": 150.00, "price": 299.90},
                ]
            },
            {
                "name": "Tênis Musculação Metcon Preto",
                "brand": "Nike",
                "base_price": 359.90,
                "gender": "Unissex",
                "material": "Mesh",
                "variants": [
                    {"size": "38", "cost_price": 180.00, "price": 359.90},
                    {"size": "40", "cost_price": 180.00, "price": 359.90},
                    {"size": "42", "cost_price": 180.00, "price": 359.90},
                ]
            },
            {
                "name": "Tênis Ultraboost Preto",
                "brand": "Adidas",
                "base_price": 399.90,
                "gender": "Unissex",
                "material": "Primeknit",
                "variants": [
                    {"size": "38", "cost_price": 200.00, "price": 399.90},
                    {"size": "40", "cost_price": 200.00, "price": 399.90},
                    {"size": "42", "cost_price": 200.00, "price": 399.90},
                ]
            },
            {
                "name": "Chinelo Slide Preto",
                "brand": "Adidas",
                "base_price": 99.90,
                "gender": "Unissex",
                "material": "EVA",
                "variants": [
                    {"size": "38", "cost_price": 50.00, "price": 99.90},
                    {"size": "40", "cost_price": 50.00, "price": 99.90},
                    {"size": "42", "cost_price": 50.00, "price": 99.90},
                ]
            },
        ]

    def _get_accessories(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "Boné Aba Curva Preto",
                "brand": "Nike",
                "base_price": 69.90,
                "gender": "Unissex",
                "material": "Algodão",
                "variants": [
                    {"cost_price": 35.00, "price": 69.90},
                ]
            },
            {
                "name": "Boné Aba Curva Branco",
                "brand": "Adidas",
                "base_price": 69.90,
                "gender": "Unissex",
                "material": "Algodão",
                "variants": [
                    {"color": "Branco", "cost_price": 35.00, "price": 69.90},
                ]
            },
            {
                "name": "Viseira Esportiva Preta",
                "brand": "Under Armour",
                "base_price": 49.90,
                "gender": "Unissex",
                "material": "Poliéster",
                "variants": [
                    {"cost_price": 25.00, "price": 49.90},
                ]
            },
            {
                "name": "Meia Cano Alto Kit 3 Pares Preta",
                "brand": "Lupo",
                "base_price": 39.90,
                "gender": "Unissex",
                "material": "Algodão",
                "variants": [
                    {"cost_price": 20.00, "price": 39.90},
                ]
            },
            {
                "name": "Luva de Musculação",
                "brand": "MadMax",
                "base_price": 49.90,
                "gender": "Unissex",
                "material": "Couro",
                "variants": [
                    {"size": "M", "cost_price": 25.00, "price": 49.90},
                    {"size": "G", "cost_price": 25.00, "price": 49.90},
                ]
            },
            {
                "name": "Mochila Esportiva 30L Preta",
                "brand": "Nike",
                "base_price": 159.90,
                "gender": "Unissex",
                "material": "Poliamida",
                "variants": [
                    {"color": "Preto", "cost_price": 80.00, "price": 159.90},
                ]
            },
            {
                "name": "Bolsa Esportiva 40L Preta",
                "brand": "Adidas",
                "base_price": 179.90,
                "gender": "Unissex",
                "material": "Poliamida",
                "variants": [
                    {"color": "Preto", "cost_price": 90.00, "price": 179.90},
                ]
            },
            {
                "name": "Munhequeira Par Preta",
                "brand": "Nike",
                "base_price": 29.90,
                "gender": "Unissex",
                "material": "Elastano",
                "variants": [
                    {"cost_price": 15.00, "price": 29.90},
                ]
            },
        ]