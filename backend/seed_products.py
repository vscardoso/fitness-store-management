"""
Script para criar 100+ produtos fitness como template do sistema.
Estes produtos serão copiados para cada nova loja criada no signup.
"""
import asyncio
from sqlalchemy import text
from app.core.database import async_session_maker


# Produtos organizados por categoria
FITNESS_PRODUCTS = {
    "Suplementos": [
        ("Whey Protein Concentrado 1kg", "Proteína de alta qualidade para ganho de massa muscular", 89.90, 45.00),
        ("Whey Protein Isolado 900g", "Proteína isolada com 90% de pureza", 129.90, 65.00),
        ("Creatina Monohidratada 300g", "Suplemento para aumento de força e performance", 69.90, 35.00),
        ("BCAA 2:1:1 - 120 cápsulas", "Aminoácidos de cadeia ramificada", 54.90, 27.00),
        ("Glutamina 300g", "Recuperação muscular e imunidade", 59.90, 30.00),
        ("Multivitamínico 60 cápsulas", "Complexo vitamínico completo", 39.90, 20.00),
        ("Ômega 3 - 90 cápsulas", "Gordura boa para saúde cardiovascular", 44.90, 22.00),
        ("Pré-Treino 300g", "Energia e foco para treinar", 79.90, 40.00),
        ("Termogênico 60 cápsulas", "Acelera metabolismo e queima gordura", 69.90, 35.00),
        ("Maltodextrina 1kg", "Carboidrato de rápida absorção", 34.90, 17.00),
        ("Albumina 500g", "Proteína da clara do ovo", 49.90, 25.00),
        ("Pasta de Amendoim Integral 500g", "Fonte natural de proteína e gorduras boas", 24.90, 12.00),
        ("Barra de Proteína - Chocolate", "Snack proteico prático", 5.90, 3.00),
        ("Barra de Proteína - Amendoim", "Snack proteico sabor amendoim", 5.90, 3.00),
        ("Hipercalórico 3kg", "Ganho de massa para ectomorfos", 119.90, 60.00),
    ],
    
    "Roupas Masculinas": [
        ("Camiseta Dry Fit - Preta P", "Tecido que seca rápido", 39.90, 20.00),
        ("Camiseta Dry Fit - Preta M", "Tecido que seca rápido", 39.90, 20.00),
        ("Camiseta Dry Fit - Preta G", "Tecido que seca rápido", 39.90, 20.00),
        ("Camiseta Dry Fit - Azul P", "Tecido que seca rápido", 39.90, 20.00),
        ("Camiseta Dry Fit - Azul M", "Tecido que seca rápido", 39.90, 20.00),
        ("Camiseta Dry Fit - Azul G", "Tecido que seca rápido", 39.90, 20.00),
        ("Regata Cavada - Preta M", "Ideal para treino de braços", 34.90, 17.00),
        ("Regata Cavada - Preta G", "Ideal para treino de braços", 34.90, 17.00),
        ("Bermuda Tactel - Preta P", "Leve e confortável", 49.90, 25.00),
        ("Bermuda Tactel - Preta M", "Leve e confortável", 49.90, 25.00),
        ("Bermuda Tactel - Preta G", "Leve e confortável", 49.90, 25.00),
        ("Calça de Moletom - Preta M", "Aquecimento e conforto", 79.90, 40.00),
        ("Calça de Moletom - Preta G", "Aquecimento e conforto", 79.90, 40.00),
        ("Short de Corrida - Preto M", "Ultra leve para corrida", 44.90, 22.00),
        ("Short de Corrida - Preto G", "Ultra leve para corrida", 44.90, 22.00),
    ],
    
    "Roupas Femininas": [
        ("Top Esportivo - Preto P", "Sustentação média", 44.90, 22.00),
        ("Top Esportivo - Preto M", "Sustentação média", 44.90, 22.00),
        ("Top Esportivo - Rosa P", "Sustentação média", 44.90, 22.00),
        ("Top Esportivo - Rosa M", "Sustentação média", 44.90, 22.00),
        ("Legging Fitness - Preta P", "Alta compressão", 69.90, 35.00),
        ("Legging Fitness - Preta M", "Alta compressão", 69.90, 35.00),
        ("Legging Fitness - Preta G", "Alta compressão", 69.90, 35.00),
        ("Legging Estampada P", "Estampa exclusiva", 79.90, 40.00),
        ("Legging Estampada M", "Estampa exclusiva", 79.90, 40.00),
        ("Short Fitness - Preto P", "Conforto e mobilidade", 39.90, 20.00),
        ("Short Fitness - Preto M", "Conforto e mobilidade", 39.90, 20.00),
        ("Cropped Esportivo - Branco P", "Ventilação e estilo", 34.90, 17.00),
        ("Cropped Esportivo - Branco M", "Ventilação e estilo", 34.90, 17.00),
        ("Conjunto Fitness Preto P", "Top + Legging", 99.90, 50.00),
        ("Conjunto Fitness Preto M", "Top + Legging", 99.90, 50.00),
    ],
    
    "Acessórios": [
        ("Luva de Treino - P", "Proteção e aderência", 29.90, 15.00),
        ("Luva de Treino - M", "Proteção e aderência", 29.90, 15.00),
        ("Luva de Treino - G", "Proteção e aderência", 29.90, 15.00),
        ("Cinto de Musculação - M", "Suporte lombar", 89.90, 45.00),
        ("Cinto de Musculação - G", "Suporte lombar", 89.90, 45.00),
        ("Munhequeira Par", "Estabilização do punho", 24.90, 12.00),
        ("Joelheira Par", "Proteção e compressão", 34.90, 17.00),
        ("Straps para Levantamento", "Melhor pegada na barra", 39.90, 20.00),
        ("Toalha Fitness", "Absorção rápida", 19.90, 10.00),
        ("Squeeze 700ml", "Garrafa de água", 24.90, 12.00),
        ("Squeeze 1L", "Garrafa de água grande", 29.90, 15.00),
        ("Coqueteleira 600ml", "Para shakes", 19.90, 10.00),
        ("Necessaire Fitness", "Organização de acessórios", 34.90, 17.00),
        ("Mochila Fitness", "Espaçosa e resistente", 89.90, 45.00),
        ("Bolsa Térmica", "Mantém temperatura", 54.90, 27.00),
    ],
    
    "Equipamentos": [
        ("Tapete de Yoga/Pilates", "Anti-derrapante 5mm", 79.90, 40.00),
        ("Bola Suíça 65cm", "Exercícios de core", 69.90, 35.00),
        ("Bola Suíça 75cm", "Exercícios de core", 74.90, 37.00),
        ("Elástico de Resistência Leve", "Mini band", 19.90, 10.00),
        ("Elástico de Resistência Médio", "Mini band", 19.90, 10.00),
        ("Elástico de Resistência Forte", "Mini band", 19.90, 10.00),
        ("Kit 3 Elásticos", "Leve, médio e forte", 49.90, 25.00),
        ("Halteres 2kg (par)", "Musculação em casa", 44.90, 22.00),
        ("Halteres 3kg (par)", "Musculação em casa", 59.90, 30.00),
        ("Halteres 5kg (par)", "Musculação em casa", 89.90, 45.00),
        ("Kettlebell 8kg", "Treino funcional", 79.90, 40.00),
        ("Kettlebell 12kg", "Treino funcional", 119.90, 60.00),
        ("Corda de Pular", "Cardio", 24.90, 12.00),
        ("Roda Abdominal", "Exercício de core", 39.90, 20.00),
        ("Push-up Bar", "Flexão elevada", 49.90, 25.00),
        ("Barra de Porta", "Instalação sem furos", 89.90, 45.00),
        ("Faixa de Suspensão TRX", "Treino funcional", 149.90, 75.00),
    ],
    
    "Eletrônicos": [
        ("Relógio Fitness Básico", "Contador de passos e calorias", 149.90, 75.00),
        ("Relógio Fitness GPS", "GPS e monitor cardíaco", 399.90, 200.00),
        ("Fone Bluetooth Esportivo", "À prova d'água", 89.90, 45.00),
        ("Cinta Cardíaca Bluetooth", "Monitor de frequência", 169.90, 85.00),
        ("Balança Digital", "Até 180kg", 79.90, 40.00),
        ("Balança Bioimpedância", "Análise corporal completa", 249.90, 125.00),
    ],
}


async def seed_products():
    """Cria produtos template no banco de dados."""
    
    async with async_session_maker() as db:
        try:
            print("🌱 Criando produtos template...")
            
            # Primeiro criar uma Store template para os produtos
            print("\n📦 Criando Store template...")
            await db.execute(text("""
                INSERT INTO stores (id, name, slug, is_default, is_active, created_at, updated_at)
                VALUES (0, 'Template Store', 'template', FALSE, FALSE, NOW(), NOW())
                ON CONFLICT (id) DO NOTHING
            """))
            await db.commit()
            
            # Criar categorias
            print("\n📁 Criando categorias...")
            category_ids = {}
            for idx, category_name in enumerate(FITNESS_PRODUCTS.keys(), start=1):
                result = await db.execute(text("""
                    INSERT INTO categories (name, slug, tenant_id, is_active, created_at, updated_at)
                    VALUES (:name, :slug, 0, TRUE, NOW(), NOW())
                    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
                    RETURNING id
                """), {
                    "name": category_name,
                    "slug": category_name.lower().replace(" ", "-")
                })
                category_ids[category_name] = result.scalar()
                print(f"  ✓ {category_name} (ID: {category_ids[category_name]})")
            
            await db.commit()
            
            # Criar produtos
            print("\n🏋️ Criando produtos...")
            total_products = 0
            
            for category_name, products in FITNESS_PRODUCTS.items():
                category_id = category_ids[category_name]
                
                for idx, (name, description, price, cost) in enumerate(products, start=1):
                    # Gerar SKU único
                    sku = f"{category_name[:3].upper()}{str(total_products + 1).zfill(4)}"
                    
                    await db.execute(text("""
                        INSERT INTO products (
                            name, description, sku, price, cost_price,
                            category_id, tenant_id, is_active, is_digital, is_activewear,
                            created_at, updated_at
                        )
                        VALUES (
                            :name, :description, :sku, :price, :cost,
                            :category_id, 0, TRUE, FALSE, TRUE,
                            NOW(), NOW()
                        )
                    """), {
                        "name": name,
                        "description": description,
                        "sku": sku,
                        "price": price,
                        "cost": cost,
                        "category_id": category_id
                    })
                    
                    total_products += 1
                    
                print(f"  ✓ {category_name}: {len(products)} produtos")
            
            await db.commit()
            
            print(f"\n✅ Seed concluído!")
            print(f"📊 Total de categorias: {len(category_ids)}")
            print(f"📦 Total de produtos: {total_products}")
            print("\n💡 Estes produtos serão copiados automaticamente para cada nova loja no signup")
            
        except Exception as e:
            await db.rollback()
            print(f"\n❌ Erro ao criar produtos: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(seed_products())
