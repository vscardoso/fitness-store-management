"""
Recreate templates (categories and products with tenant_id=0)
"""
import asyncio
from app.core.database import get_db
from app.models.category import Category
from app.models.product import Product

async def recreate_templates():
    print("📦 Criando templates (tenant_id=0)...\n")
    
    async for db in get_db():
        # Check if already exist
        from sqlalchemy import select
        result = await db.execute(select(Category).where(Category.tenant_id == 0))
        existing_cats = result.scalars().all()
        
        if existing_cats:
            print(f"✅ Categorias já existem: {len(existing_cats)}")
        else:
            print("📁 Criando 6 categorias...")
            categories = [
                Category(name="Suplementos", slug="suplementos", tenant_id=0, is_active=True),
                Category(name="Roupas Masculinas", slug="roupas-masculinas", tenant_id=0, is_active=True),
                Category(name="Roupas Femininas", slug="roupas-femininas", tenant_id=0, is_active=True),
                Category(name="Acessórios", slug="acessórios", tenant_id=0, is_active=True),
                Category(name="Equipamentos", slug="equipamentos", tenant_id=0, is_active=True),
                Category(name="Eletrônicos", slug="eletrônicos", tenant_id=0, is_active=True),
            ]
            for cat in categories:
                db.add(cat)
            await db.commit()
            print(f"✅ {len(categories)} categorias criadas")
        
        # Get category IDs
        result = await db.execute(select(Category).where(Category.tenant_id == 0))
        categories = result.scalars().all()
        cat_map = {cat.name: cat.id for cat in categories}
        
        # Check if products exist
        result = await db.execute(select(Product).where(Product.tenant_id == 0))
        existing_prods = result.scalars().all()
        
        if existing_prods:
            print(f"✅ Produtos já existem: {len(existing_prods)}")
        else:
            print("\n📦 Criando 83 produtos...\n")
            
            products = []
            
            # Suplementos (20)
            sup_id = cat_map.get("Suplementos")
            products.extend([
                Product(name="Whey Protein Concentrado 1kg", sku="SUP0001", price=89.90, cost_price=45.00, category_id=sup_id, tenant_id=0, is_active=True, description="Proteína de alta qualidade para ganho de massa muscular", is_activewear=True),
                Product(name="Whey Protein Isolado 900g", sku="SUP0002", price=129.90, cost_price=65.00, category_id=sup_id, tenant_id=0, is_active=True, description="Proteína isolada com 90% de pureza", is_activewear=True),
                Product(name="Creatina Monohidratada 300g", sku="SUP0003", price=69.90, cost_price=35.00, category_id=sup_id, tenant_id=0, is_active=True, description="Suplemento para aumento de força e performance", is_activewear=True),
                Product(name="BCAA 2:1:1 - 120 cápsulas", sku="SUP0004", price=59.90, cost_price=30.00, category_id=sup_id, tenant_id=0, is_active=True, description="Aminoácidos de cadeia ramificada", is_activewear=True),
                Product(name="Glutamina 300g", sku="SUP0005", price=49.90, cost_price=25.00, category_id=sup_id, tenant_id=0, is_active=True, description="Recuperação muscular", is_activewear=True),
                Product(name="Pré-Treino 300g", sku="SUP0006", price=79.90, cost_price=40.00, category_id=sup_id, tenant_id=0, is_active=True, description="Energia e foco para treino", is_activewear=True),
                Product(name="Termogênico 60 cáps", sku="SUP0007", price=89.90, cost_price=45.00, category_id=sup_id, tenant_id=0, is_active=True, description="Queimador de gordura", is_activewear=True),
                Product(name="Ômega 3 - 120 cáps", sku="SUP0008", price=39.90, cost_price=20.00, category_id=sup_id, tenant_id=0, is_active=True, description="Saúde cardiovascular", is_activewear=True),
                Product(name="Multivitamínico", sku="SUP0009", price=34.90, cost_price=17.00, category_id=sup_id, tenant_id=0, is_active=True, description="Complexo vitamínico completo", is_activewear=True),
                Product(name="Vitamina D3 - 60 cáps", sku="SUP0010", price=29.90, cost_price=15.00, category_id=sup_id, tenant_id=0, is_active=True, description="Saúde óssea e imunidade", is_activewear=True),
                Product(name="Colágeno Hidrolisado", sku="SUP0011", price=44.90, cost_price=22.00, category_id=sup_id, tenant_id=0, is_active=True, description="Saúde das articulações", is_activewear=True),
                Product(name="ZMA - 90 cáps", sku="SUP0012", price=39.90, cost_price=20.00, category_id=sup_id, tenant_id=0, is_active=True, description="Zinco, magnésio e vitamina B6", is_activewear=True),
                Product(name="Maltodextrina 1kg", sku="SUP0013", price=29.90, cost_price=15.00, category_id=sup_id, tenant_id=0, is_active=True, description="Carboidrato de rápida absorção", is_activewear=True),
                Product(name="Dextrose 1kg", sku="SUP0014", price=24.90, cost_price=12.00, category_id=sup_id, tenant_id=0, is_active=True, description="Energia imediata", is_activewear=True),
                Product(name="Albumina 500g", sku="SUP0015", price=34.90, cost_price=17.00, category_id=sup_id, tenant_id=0, is_active=True, description="Proteína da clara do ovo", is_activewear=True),
                Product(name="Caseína 900g", sku="SUP0016", price=99.90, cost_price=50.00, category_id=sup_id, tenant_id=0, is_active=True, description="Proteína de absorção lenta", is_activewear=True),
                Product(name="Hipercalórico 3kg", sku="SUP0017", price=119.90, cost_price=60.00, category_id=sup_id, tenant_id=0, is_active=True, description="Ganho de massa", is_activewear=True),
                Product(name="Barra de Proteína - Chocolate", sku="SUP0018", price=7.90, cost_price=4.00, category_id=sup_id, tenant_id=0, is_active=True, description="20g de proteína", is_activewear=True),
                Product(name="Pasta de Amendoim 500g", sku="SUP0019", price=19.90, cost_price=10.00, category_id=sup_id, tenant_id=0, is_active=True, description="100% natural", is_activewear=True),
                Product(name="Whey Vegano 900g", sku="SUP0020", price=139.90, cost_price=70.00, category_id=sup_id, tenant_id=0, is_active=True, description="Proteína vegetal", is_activewear=True),
            ])
            
            # Roupas Masculinas (15)
            male_id = cat_map.get("Roupas Masculinas")
            for i in range(1, 16):
                products.append(Product(
                    name=f"Camiseta Dry Fit Masculina {i}",
                    sku=f"MALE{i:04d}",
                    price=49.90,
                    cost_price=25.00,
                    category_id=male_id,
                    tenant_id=0,
                    is_active=True,
                    description="Camiseta para treino",
                    is_activewear=True,
                    gender="M"
                ))
            
            # Roupas Femininas (15)
            female_id = cat_map.get("Roupas Femininas")
            for i in range(1, 16):
                products.append(Product(
                    name=f"Legging Fitness Feminina {i}",
                    sku=f"FEM{i:04d}",
                    price=79.90,
                    cost_price=40.00,
                    category_id=female_id,
                    tenant_id=0,
                    is_active=True,
                    description="Legging de alta compressão",
                    is_activewear=True,
                    gender="F"
                ))
            
            # Acessórios (15)
            acess_id = cat_map.get("Acessórios")
            acessorios = [
                ("Luva de Treino", "ACC0001", 29.90),
                ("Munhequeira Par", "ACC0002", 19.90),
                ("Cinta de Musculação", "ACC0003", 49.90),
                ("Joelheira Par", "ACC0004", 39.90),
                ("Faixa Elástica Mini Band", "ACC0005", 24.90),
                ("Corda de Pular", "ACC0006", 19.90),
                ("Squeeze 1L", "ACC0007", 29.90),
                ("Toalha Fitness", "ACC0008", 34.90),
                ("Mochila Fitness", "ACC0009", 89.90),
                ("Bolsa Térmica", "ACC0010", 79.90),
                ("Tapete de Yoga", "ACC0011", 69.90),
                ("Rolo de Massagem", "ACC0012", 59.90),
                ("Bola de Pilates 65cm", "ACC0013", 49.90),
                ("Caneleira 2kg Par", "ACC0014", 39.90),
                ("Tornozeleira 1kg Par", "ACC0015", 29.90),
            ]
            for name, sku, price in acessorios:
                products.append(Product(
                    name=name,
                    sku=sku,
                    price=price,
                    cost_price=price/2,
                    category_id=acess_id,
                    tenant_id=0,
                    is_active=True,
                    description=f"{name} de qualidade",
                    is_activewear=True
                ))
            
            # Equipamentos (15)
            equip_id = cat_map.get("Equipamentos")
            equipamentos = [
                ("Halter 10kg Par", "EQP0001", 149.90),
                ("Halter 15kg Par", "EQP0002", 219.90),
                ("Halter 20kg Par", "EQP0003", 289.90),
                ("Anilha 2kg", "EQP0004", 29.90),
                ("Anilha 5kg", "EQP0005", 69.90),
                ("Anilha 10kg", "EQP0006", 129.90),
                ("Barra Reta 1,20m", "EQP0007", 79.90),
                ("Barra W", "EQP0008", 89.90),
                ("Banco Supino", "EQP0009", 299.90),
                ("Estação de Musculação", "EQP0010", 1499.90),
                ("Bicicleta Ergométrica", "EQP0011", 799.90),
                ("Esteira Elétrica", "EQP0012", 1999.90),
                ("Elíptico", "EQP0013", 1299.90),
                ("Roda Abdominal", "EQP0014", 39.90),
                ("Barra Fixa Porta", "EQP0015", 89.90),
            ]
            for name, sku, price in equipamentos:
                products.append(Product(
                    name=name,
                    sku=sku,
                    price=price,
                    cost_price=price/2,
                    category_id=equip_id,
                    tenant_id=0,
                    is_active=True,
                    description=f"{name} profissional",
                    is_activewear=True
                ))
            
            # Eletrônicos (3)
            ele_id = cat_map.get("Eletrônicos")
            products.extend([
                Product(name="Cinta Cardíaca Bluetooth", sku="ELE0081", price=169.90, cost_price=85.00, category_id=ele_id, tenant_id=0, is_active=True, description="Monitor de frequência", is_activewear=True),
                Product(name="Balança Digital", sku="ELE0082", price=79.90, cost_price=40.00, category_id=ele_id, tenant_id=0, is_active=True, description="Até 180kg", is_activewear=True),
                Product(name="Balança Bioimpedância", sku="ELE0083", price=249.90, cost_price=125.00, category_id=ele_id, tenant_id=0, is_active=True, description="Análise corporal completa", is_activewear=True),
            ])
            
            # Add all
            for prod in products:
                db.add(prod)
            
            await db.commit()
            print(f"✅ {len(products)} produtos criados")
        
        print("\n✅ Templates prontos para cópia!")
        print(f"   📁 Categorias: {len(categories)}")
        print(f"   📦 Produtos: {len(products) if not existing_prods else len(existing_prods)}")
        
        break

asyncio.run(recreate_templates())
