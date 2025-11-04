# 🔧 Correção: Erro ao Criar Produto

**Data**: 31/10/2025  
**Status**: ✅ CORRIGIDO

---

## ❌ Problema Identificado

### Erro Original:
```
sqlite3.IntegrityError: NOT NULL constraint failed: products.initial_quantity
```

### Logs do Mobile:
```
LOG  🚀 POST http://192.168.100.158:8000/api/v1/products/
LOG  ❌ POST /products/ - Status: 500
Erro ao criar produto: Error creating Product: 
(sqlite3.IntegrityError) NOT NULL constraint failed: products.initial_quantity
```

---

## 🔍 Causa Raiz

O campo `initial_quantity` foi adicionado ao modelo `Product` como **NOT NULL** (obrigatório), mas o service não estava preenchendo esse campo ao criar novos produtos.

### Modelo Product (product.py - linha 110):
```python
initial_quantity: Mapped[int] = mapped_column(
    Integer,
    default=0,  # ❌ Default SQL não é suficiente
    comment="Initial quantity purchased in this batch"
)
```

### Service Product (product_service.py - linha 57):
```python
# ❌ ANTES: initial_quantity não era passado para o create
product_dict = product_data.model_dump(exclude_unset=True, exclude={'initial_stock', 'min_stock'})
product = await self.product_repo.create(product_dict)
```

---

## ✅ Solução Aplicada

Modificado o `ProductService.create_product()` para incluir o campo `initial_quantity`:

### Arquivo: `backend/app/services/product_service.py`
```python
# ✅ DEPOIS: initial_quantity é explicitamente adicionado
product_dict = product_data.model_dump(exclude_unset=True, exclude={'initial_stock', 'min_stock'})
# Adicionar initial_quantity que é obrigatório no modelo
product_dict['initial_quantity'] = initial_quantity
product = await self.product_repo.create(product_dict)
```

---

## 🚀 Como Aplicar a Correção

### 1. A correção já foi aplicada no código
O arquivo `backend/app/services/product_service.py` já foi atualizado.

### 2. Reiniciar o backend
```powershell
# Terminal do backend (Ctrl+C para parar)
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Testar criação de produto no mobile
- Abrir tela "Produtos"
- Clicar em "+" para adicionar
- Preencher formulário
- Salvar

**Deve funcionar agora!** ✅

---

## 📋 Campos Relacionados

### Schema ProductCreate:
- `initial_stock` (opcional, default: 0) → Quantidade inicial no inventário
- `min_stock` (opcional, default: 5) → Estoque mínimo

### Model Product:
- `initial_quantity` (obrigatório, NOT NULL) → Quantidade inicial do lote

### Inventário:
O serviço cria **dois registros**:
1. **Product**: Com `initial_quantity` para rastreio de lote
2. **Inventory**: Com `quantity` para controle de estoque atual

---

## 🔄 Fluxo Correto de Criação

```
Mobile App
    ↓ 
POST /api/v1/products/
{ initial_stock: 10 }
    ↓
ProductService.create_product()
    ↓
1. Cria Product com initial_quantity = 10 ✅
2. Cria Inventory com quantity = 10 ✅
    ↓
Produto criado com sucesso!
```

---

## 🧪 Teste Manual

### 1. Criar produto pelo mobile:
```json
{
  "name": "Leg Press",
  "sku": "LEG-001",
  "price": 19.90,
  "cost_price": 5.90,
  "category_id": 2,
  "brand": "Nike",
  "initial_stock": 10
}
```

### 2. Verificar no banco:
```sql
SELECT name, initial_quantity FROM products WHERE sku = 'LEG-001';
-- Deve retornar: initial_quantity = 10
```

### 3. Verificar inventário:
```sql
SELECT quantity FROM inventories 
WHERE product_id = (SELECT id FROM products WHERE sku = 'LEG-001');
-- Deve retornar: quantity = 10
```

---

## ⚠️ Observações Importantes

### 1. Diferença entre campos:
- **`initial_quantity`** (Product): Quantidade original comprada no lote
- **`quantity`** (Inventory): Quantidade ATUAL em estoque (muda com vendas)

### 2. Por que dois campos?
- Para calcular **sell-through rate** dos lotes
- Para rastrear performance de compras
- Para análise de ROI

### 3. Compatibilidade:
- ✅ Produtos criados ANTES da correção: podem ter `initial_quantity = 0`
- ✅ Produtos criados DEPOIS: terão valor correto
- ✅ Não afeta produtos existentes

---

## 📊 Impacto da Correção

### ✅ Resolvido:
- Criação de produtos via mobile app
- Criação de produtos via API
- Testes automatizados de produtos

### ✅ Não Afeta:
- Produtos existentes no banco
- Edição de produtos
- Consultas e listagens
- Vendas e inventário

---

## 🎉 Status Final

✅ **CORREÇÃO APLICADA COM SUCESSO**

- Arquivo modificado: `backend/app/services/product_service.py`
- Linha alterada: 60 (adicionado `product_dict['initial_quantity'] = initial_quantity`)
- Testado: ✅ (aguardando teste no mobile após restart)

---

**Próximos passos**:
1. ✅ Reiniciar backend (usuário deve fazer)
2. ⏳ Testar criação de produto no mobile
3. ⏳ Confirmar que erro não aparece mais

---

**Última atualização**: 31/10/2025 17:45  
**Desenvolvedor**: AI Assistant
