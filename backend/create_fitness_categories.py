"""
Script para criar categorias otimizadas para loja fitness (foco em feminino).
Mantém flexibilidade para masculino, suplementos e outros produtos.
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import async_session_maker
from app.models.category import Category


async def create_fitness_categories():
    """Criar categorias otimizadas para loja fitness feminina."""
    
    categories_data = [
        # ============================================
        # ROUPAS FEMININAS (Foco Principal)
        # ============================================
        {
            "name": "Tops e Blusas Femininas",
            "slug": "tops-blusas-femininas",
            "description": "Tops, blusas, cropped, camisetas fitness femininas",
            "parent_id": None
        },
        {
            "name": "Leggings e Calças Femininas",
            "slug": "leggings-calcas-femininas",
            "description": "Leggings, calças, corsários fitness femininos",
            "parent_id": None
        },
        {
            "name": "Shorts e Bermudas Femininas",
            "slug": "shorts-bermudas-femininas",
            "description": "Shorts, bermudas, saias fitness femininas",
            "parent_id": None
        },
        {
            "name": "Conjuntos Femininos",
            "slug": "conjuntos-femininos",
            "description": "Conjuntos completos de treino femininos",
            "parent_id": None
        },
        {
            "name": "Tops Esportivos e Sutiãs",
            "slug": "tops-esportivos-sutias",
            "description": "Tops esportivos, sutiãs fitness, sports bra",
            "parent_id": None
        },
        {
            "name": "Jaquetas e Moletons Femininos",
            "slug": "jaquetas-moletons-femininos",
            "description": "Jaquetas, moletons, casacos fitness femininos",
            "parent_id": None
        },
        {
            "name": "Maiôs e Bikínis Fitness",
            "slug": "maios-bikinis-fitness",
            "description": "Maiôs, bikínis e moda praia fitness",
            "parent_id": None
        },
        
        # ============================================
        # ROUPAS MASCULINAS
        # ============================================
        {
            "name": "Camisetas e Regatas Masculinas",
            "slug": "camisetas-regatas-masculinas",
            "description": "Camisetas, regatas, dry fit masculinas",
            "parent_id": None
        },
        {
            "name": "Calças e Bermudas Masculinas",
            "slug": "calcas-bermudas-masculinas",
            "description": "Calças, bermudas, shorts fitness masculinos",
            "parent_id": None
        },
        {
            "name": "Moletons e Jaquetas Masculinos",
            "slug": "moletons-jaquetas-masculinos",
            "description": "Moletons, jaquetas, casacos masculinos",
            "parent_id": None
        },
        
        # ============================================
        # ROUPAS UNISSEX
        # ============================================
        {
            "name": "Roupas Unissex",
            "slug": "roupas-unissex",
            "description": "Roupas fitness para todos os gêneros",
            "parent_id": None
        },
        
        # ============================================
        # CALÇADOS
        # ============================================
        {
            "name": "Tênis Femininos",
            "slug": "tenis-femininos",
            "description": "Tênis esportivos femininos",
            "parent_id": None
        },
        {
            "name": "Tênis Masculinos",
            "slug": "tenis-masculinos",
            "description": "Tênis esportivos masculinos",
            "parent_id": None
        },
        {
            "name": "Chinelos e Sandálias",
            "slug": "chinelos-sandalias",
            "description": "Chinelos, sandálias, slide",
            "parent_id": None
        },
        
        # ============================================
        # ACESSÓRIOS
        # ============================================
        {
            "name": "Bolsas e Mochilas",
            "slug": "bolsas-mochilas",
            "description": "Bolsas fitness, mochilas, necessaires",
            "parent_id": None
        },
        {
            "name": "Meias e Caneleiras",
            "slug": "meias-caneleiras",
            "description": "Meias esportivas, caneleiras",
            "parent_id": None
        },
        {
            "name": "Bonés e Viseiras",
            "slug": "bones-viseiras",
            "description": "Bonés, viseiras, headbands",
            "parent_id": None
        },
        {
            "name": "Luvas e Munhequeiras",
            "slug": "luvas-munhequeiras",
            "description": "Luvas de treino, munhequeiras, joelheiras",
            "parent_id": None
        },
        {
            "name": "Garrafas e Coqueteleiras",
            "slug": "garrafas-coqueteleiras",
            "description": "Garrafinhas, squeezes, coqueteleiras",
            "parent_id": None
        },
        {
            "name": "Toalhas Fitness",
            "slug": "toalhas-fitness",
            "description": "Toalhas de treino, tapetes de yoga",
            "parent_id": None
        },
        
        # ============================================
        # EQUIPAMENTOS
        # ============================================
        {
            "name": "Equipamentos de Treino",
            "slug": "equipamentos-treino",
            "description": "Halteres, kettlebells, elásticos, faixas",
            "parent_id": None
        },
        {
            "name": "Tapetes e Colchonetes",
            "slug": "tapetes-colchonetes",
            "description": "Tapetes de yoga, colchonetes, EVA",
            "parent_id": None
        },
        
        # ============================================
        # SUPLEMENTOS
        # ============================================
        {
            "name": "Proteínas",
            "slug": "proteinas",
            "description": "Whey, proteínas vegetais, albumina",
            "parent_id": None
        },
        {
            "name": "Pré-Treinos",
            "slug": "pre-treinos",
            "description": "Pré-treinos, cafeína, energéticos",
            "parent_id": None
        },
        {
            "name": "Aminoácidos e BCAA",
            "slug": "aminoacidos-bcaa",
            "description": "BCAA, creatina, glutamina",
            "parent_id": None
        },
        {
            "name": "Vitaminas e Minerais",
            "slug": "vitaminas-minerais",
            "description": "Multivitamínicos, ômega 3, vitaminas",
            "parent_id": None
        },
        {
            "name": "Emagrecedores",
            "slug": "emagrecedores",
            "description": "Termogênicos, L-carnitina, CLA",
            "parent_id": None
        },
        {
            "name": "Barras e Snacks Fit",
            "slug": "barras-snacks-fit",
            "description": "Barras proteicas, snacks fitness, cookies fit",
            "parent_id": None
        },
        
        # ============================================
        # PERFUMARIA E COSMÉTICOS
        # ============================================
        {
            "name": "Perfumes Fitness",
            "slug": "perfumes-fitness",
            "description": "Perfumes, body splash, desodorantes",
            "parent_id": None
        },
        {
            "name": "Cuidados Pessoais",
            "slug": "cuidados-pessoais",
            "description": "Cremes, loções, hidratantes fitness",
            "parent_id": None
        },
    ]
    
    async with async_session_maker() as session:
        try:
            # Verificar se já existem categorias
            from sqlalchemy import select
            result = await session.execute(select(Category))
            existing = result.scalars().all()
            
            if existing:
                print(f"\n[INFO] Já existem {len(existing)} categorias no banco.")
                print("\n📋 Categorias atuais:")
                for cat in existing:
                    print(f"  - {cat.name}")
                
                print("\n⚠️  ATENÇÃO: Deletar categorias antigas pode quebrar produtos existentes!")
                print("   Recomendação: Adicionar novas categorias e reorganizar produtos via app.")
                
                response = input("\n❓ Deseja apenas ADICIONAR novas categorias? (s/N): ")
                if response.lower() != 's':
                    print("\n[CANCELLED] Operação cancelada.")
                    return
                
                print("\n✅ Mantendo categorias existentes e adicionando novas...")
            
            # Criar novas categorias
            print(f"\n📦 Adicionando categorias que ainda não existem...")
            print("\n" + "=" * 70)
            
            existing_names = {cat.name for cat in existing}
            existing_slugs = {cat.slug for cat in existing}
            added_count = 0
            skipped_count = 0
            
            for cat_data in categories_data:
                # Verificar se categoria já existe
                if cat_data['name'] in existing_names or cat_data['slug'] in existing_slugs:
                    print(f"  ⏭️  {cat_data['name']:<40} | já existe")
                    skipped_count += 1
                    continue
                
                category = Category(**cat_data)
                session.add(category)
                print(f"  ✅ {cat_data['name']:<40} | ADICIONADA")
                added_count += 1
            
            await session.commit()
            
            print("=" * 70)
            print(f"\n🎉 {added_count} categorias adicionadas com sucesso!")
            if skipped_count > 0:
                print(f"⏭️  {skipped_count} categorias já existiam (não duplicadas)")
            
            print(f"\n📊 Total no banco: {len(existing) + added_count} categorias")

        except Exception as e:
            await session.rollback()
            print(f"\n❌ [ERROR] Erro ao criar categorias: {str(e)}")
            raise


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("🏋️‍♀️  CRIAÇÃO DE CATEGORIAS FITNESS (Foco Feminino)")
    print("=" * 70)
    print("\nEste script cria categorias otimizadas para:")
    print("  ✅ Roupas fitness femininas (foco principal)")
    print("  ✅ Roupas masculinas e unissex")
    print("  ✅ Suplementos alimentares")
    print("  ✅ Acessórios e equipamentos")
    print("  ✅ Perfumaria e cosméticos")
    
    asyncio.run(create_fitness_categories())
    
    print("\n" + "=" * 70)
    print("✅ Processo concluído!")
    print("=" * 70 + "\n")
