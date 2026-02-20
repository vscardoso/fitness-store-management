# Sistema de Variantes de Produto - Implementação

## Visão Geral

Este documento descreve a implementação do sistema de variantes de produto (tamanho/cor) no sistema de gestão de loja fitness.

## Arquitetura

### Modelo de Dados

```
Product (Produto Pai)
├── name: "Conjunto Legging Nike"
├── description: "Legging fitness alta compressão..."
├── brand: "Nike"
├── category_id: 5
├── base_price: 89.90  (preço de referência)
├── image_url: "legging-nike.jpg"
└── variants: [
      { size: "P", color: "Roxo", sku: "LEG-NIK-ROX-P", price: 89.90 },
      { size: "M", color: "Roxo", sku: "LEG-NIK-ROX-M", price: 89.90 },
      { size: "G", color: "Roxo", sku: "LEG-NIK-ROX-G", price: 89.90 },
      { size: "GG", color: "Roxo", sku: "LEG-NIK-ROX-GG", price: 94.90 },
      { size: "P", color: "Preto", sku: "LEG-NIK-PRE-P", price: 89.90 },
      ...
    ]
```

### Tabelas do Banco de Dados

#### `products` (Produto Pai)
- `id`, `tenant_id`, `name`, `description`, `brand`
- `category_id`, `gender`, `material`
- `base_price` (NOVO - preço de referência)
- `is_digital`, `is_activewear`, `is_catalog`
- `image_url`, `is_active`, `created_at`, `updated_at`

#### `product_variants` (NOVA)
- `id`, `tenant_id`, `product_id` (FK)
- `sku` (único por tenant)
- `size`, `color`
- `price`, `cost_price`
- `image_url` (imagem específica da variante)
- `is_active`
- **Constraint única:** `(product_id, size, color)`

#### Tabelas Atualizadas
- `entry_items` → adicionado `variant_id`
- `inventory` → adicionado `variant_id`
- `sale_items` → adicionado `variant_id`
- `return_items` → adicionado `variant_id`

## Arquivos Criados/Modificados

### Backend - Modelos
- `backend/app/models/product_variant.py` - NOVO modelo
- `backend/app/models/product.py` - Modificado (removidos campos movidos)
- `backend/app/models/entry_item.py` - Adicionado `variant_id`
- `backend/app/models/inventory.py` - Adicionado `variant_id`
- `backend/app/models/sale.py` - Adicionado `variant_id` em SaleItem
- `backend/app/models/sale_return.py` - Adicionado `variant_id` em ReturnItem
- `backend/app/models/__init__.py` - Exportar ProductVariant

### Backend - Repositórios
- `backend/app/repositories/product_variant_repository.py` - NOVO

### Backend - Schemas
- `backend/app/schemas/product_variant.py` - NOVO

### Backend - Serviços
- `backend/app/services/product_variant_service.py` - NOVO

### Backend - API
- `backend/app/api/v1/product_variants.py` - NOVO
- `backend/app/api/v1/router.py` - Registrar router

### Backend - Migração
- `backend/alembic/versions/add_product_variants.py` - NOVA migração
- `backend/migrate_to_variants.py` - Script de migração de dados

## Endpoints da API

### Variantes
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/v1/product-variants/` | Criar variante |
| POST | `/api/v1/product-variants/with-product` | Criar produto com variantes |
| POST | `/api/v1/product-variants/bulk` | Criar variantes em massa |
| GET | `/api/v1/product-variants/{id}` | Buscar variante por ID |
| GET | `/api/v1/product-variants/sku/{sku}` | Buscar variante por SKU |
| GET | `/api/v1/product-variants/product/{id}` | Listar variantes do produto |
| GET | `/api/v1/product-variants/product/{id}/grid` | Grade de variações |
| GET | `/api/v1/product-variants/search/?q=...` | Buscar variantes |
| PATCH | `/api/v1/product-variants/{id}` | Atualizar variante |
| DELETE | `/api/v1/product-variants/{id}` | Desativar variante |

## Como Executar a Migração

### 1. Aplicar migração do banco de dados
```bash
cd backend
alembic upgrade head
```

### 2. Executar script de migração de dados (dry-run primeiro)
```bash
# Simular migração
python migrate_to_variants.py --dry-run --tenant-id 1

# Executar migração
python migrate_to_variants.py --tenant-id 1
```

## Status da Implementação

### ✅ Backend - Completo
- [x] Modelo `ProductVariant`
- [x] Modificações em `Product`, `EntryItem`, `SaleItem`, `ReturnItem`, `Inventory`
- [x] Repositório e Serviço
- [x] Schemas Pydantic
- [x] Endpoints de API
- [x] Migração Alembic
- [x] Script de migração de dados

### ✅ Frontend Mobile - Tipos e Serviços
- [x] `mobile/types/productVariant.ts` - Tipos TypeScript
- [x] `mobile/services/productVariantService.ts` - Serviço de API
- [x] `mobile/components/products/VariantSelector.tsx` - Seletor de tamanhos/cores
- [x] `mobile/components/products/VariantPicker.tsx` - Modal de seleção na venda

### 🔄 Frontend Mobile - Integração (Pendente)
- [ ] Atualizar Wizard de criação para usar variantes
- [ ] Atualizar Scanner IA para sugerir múltiplas variações
- [ ] Atualizar listagem de produtos para agrupar por produto pai
- [ ] Atualizar tela de venda para selecionar variante
- [ ] Atualizar etiquetas para usar dados da variante

## Arquivos Criados

### Backend
```
backend/app/models/product_variant.py
backend/app/repositories/product_variant_repository.py
backend/app/schemas/product_variant.py
backend/app/services/product_variant_service.py
backend/app/api/v1/product_variants.py
backend/alembic/versions/add_product_variants.py
backend/migrate_to_variants.py
```

### Mobile
```
mobile/types/productVariant.ts
mobile/services/productVariantService.ts
mobile/components/products/VariantSelector.tsx
mobile/components/products/VariantPicker.tsx
```

### Documentação
```
docs/PRODUCT_VARIANTS_IMPLEMENTATION.md
```

## Benefícios

1. **Experiência profissional** - Padrão de e-commerce (Shopify, WooCommerce)
2. **Estoque por variação** - FIFO funciona corretamente
3. **Preços diferenciados** - GG pode custar mais que P
4. **Relatórios consolidados** - Vendas por produto (agregado)
5. **Escalável** - Fácil adicionar novas variações (ex: material)

## Compatibilidade

O sistema mantém compatibilidade com dados existentes:
- Campos `product_id` legados mantidos como nullable
- Script de migração converte produtos existentes
- APIs antigas continuam funcionando durante transição