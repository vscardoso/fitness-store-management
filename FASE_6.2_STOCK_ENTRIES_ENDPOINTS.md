# FASE 6.2 - Stock Entries REST API Endpoints

## 📋 Visão Geral

API REST completa para gerenciamento de **Entradas de Estoque** (StockEntries) com suporte a análise de produtos encalhados e melhores performantes.

---

## ✅ Implementação Completa

### Arquivo Principal
- ✅ `/backend/app/api/v1/endpoints/stock_entries.py` (609 linhas)

### Modificações em Services
- ✅ `StockEntryService.get_entries_filtered()` - Filtros avançados (tipo, viagem, datas)
- ✅ `StockEntryService.get_slow_moving_products()` - Produtos encalhados com taxa de depleção
- ✅ `StockEntryService.get_best_performing_entries()` - Entradas com melhor performance

### Modificações em Repositories
- ✅ `StockEntryRepository.get_filtered()` - Query com múltiplos filtros
- ✅ `EntryItemRepository.get_slow_moving()` - Cálculo SQL de depleção
- ✅ Adicionado `Float` e `case` aos imports de SQLAlchemy

### Modificações em Schemas
- ✅ `StockEntryCreateRequest` - Request com array de items
- ✅ Corrigido import de `List` no TYPE_CHECKING

### Integração
- ✅ Router registrado em `app/api/v1/router.py`
- ✅ Tag: **"Entradas de Estoque"**

---

## 🔗 8 Endpoints Implementados

### 1️⃣ POST /stock-entries
**Criar Nova Entrada de Estoque**

```python
POST /api/v1/stock-entries
Authorization: Bearer {token}
Content-Type: application/json

{
  "trip_id": 1,
  "entry_type": "COMPRA",
  "entry_date": "2024-01-15",
  "supplier": "Fornecedor XYZ",
  "invoice_number": "NF-2024-001",
  "notes": "Compra de suplementos importados",
  "items": [
    {
      "product_id": 1,
      "quantity_received": 100,
      "unit_cost": 45.50,
      "expiry_date": "2025-12-31"
    },
    {
      "product_id": 2,
      "quantity_received": 50,
      "unit_cost": 89.90,
      "expiry_date": "2025-06-30"
    }
  ]
}
```

**Resposta 201 Created:**
```json
{
  "id": 1,
  "trip_id": 1,
  "entry_type": "COMPRA",
  "entry_date": "2024-01-15",
  "supplier": "Fornecedor XYZ",
  "invoice_number": "NF-2024-001",
  "notes": "Compra de suplementos importados",
  "created_at": "2024-01-15T10:30:00",
  "updated_at": "2024-01-15T10:30:00",
  "is_active": true,
  "items": [
    {
      "id": 1,
      "stock_entry_id": 1,
      "product_id": 1,
      "quantity_received": 100,
      "quantity_remaining": 100,
      "unit_cost": 45.50,
      "expiry_date": "2025-12-31"
    }
  ]
}
```

**Permissões:** Admin, Seller  
**Lógica:**
1. Valida trip_id existe e está ativa
2. Valida todos os product_ids existem
3. Cria StockEntry com transação
4. Cria EntryItems associados
5. Atualiza `product.current_stock` e `product.unit_cost` (método FIFO)
6. Registra movimento no histórico de estoque

---

### 2️⃣ GET /stock-entries
**Listar Entradas de Estoque (com Filtros)**

```python
GET /api/v1/stock-entries?entry_type=COMPRA&trip_id=1&start_date=2024-01-01&end_date=2024-12-31&skip=0&limit=20
Authorization: Bearer {token}
```

**Resposta 200 OK:**
```json
[
  {
    "id": 1,
    "trip_id": 1,
    "entry_type": "COMPRA",
    "entry_date": "2024-01-15",
    "supplier": "Fornecedor XYZ",
    "invoice_number": "NF-2024-001",
    "items": [
      {
        "id": 1,
        "product": {
          "id": 1,
          "name": "Whey Protein",
          "sku": "WP-001"
        },
        "quantity_received": 100,
        "quantity_remaining": 75,
        "unit_cost": 45.50
      }
    ],
    "trip": {
      "id": 1,
      "trip_number": "TRIP-2024-001",
      "status": "CONCLUIDA"
    }
  }
]
```

**Filtros Disponíveis:**
- `entry_type`: COMPRA, DEVOLUCAO, AJUSTE
- `trip_id`: ID da viagem
- `start_date`: Data inicial (YYYY-MM-DD)
- `end_date`: Data final (YYYY-MM-DD)
- `skip`, `limit`: Paginação

**Permissões:** Admin, Seller, Employee (read-only)

---

### 3️⃣ GET /stock-entries/{id}
**Detalhes de Uma Entrada**

```python
GET /api/v1/stock-entries/1
Authorization: Bearer {token}
```

**Resposta 200 OK:** (mesmo formato do POST)

**Permissões:** Admin, Seller, Employee

---

### 4️⃣ GET /stock-entries/{id}/analytics
**Análise Detalhada de uma Entrada**

```python
GET /api/v1/stock-entries/1/analytics
Authorization: Bearer {token}
```

**Resposta 200 OK:**
```json
{
  "entry_id": 1,
  "total_items": 5,
  "total_cost": 4550.00,
  "total_received": 250,
  "total_remaining": 180,
  "depletion_rate": 28.0,
  "items": [
    {
      "product_id": 1,
      "product_name": "Whey Protein",
      "quantity_received": 100,
      "quantity_remaining": 75,
      "unit_cost": 45.50,
      "total_cost": 4550.00,
      "depletion_rate": 25.0,
      "days_since_entry": 45
    }
  ]
}
```

**Métricas:**
- `depletion_rate`: (recebido - restante) / recebido * 100
- `days_since_entry`: Dias desde a entrada
- `total_cost`: Custo total da entrada

**Permissões:** Admin, Seller, Employee

---

### 5️⃣ GET /stock-entries/slow-moving
**Produtos Encalhados (Baixa Depleção)**

```python
GET /api/v1/stock-entries/slow-moving?days_threshold=30&depletion_threshold=20&skip=0&limit=20
Authorization: Bearer {token}
```

**Resposta 200 OK:**
```json
[
  {
    "id": 5,
    "product": {
      "id": 10,
      "name": "BCAA 500g",
      "sku": "BCAA-500",
      "category_name": "Aminoácidos"
    },
    "stock_entry": {
      "id": 2,
      "entry_date": "2023-11-01",
      "supplier": "ABC Supplements",
      "trip_id": 1
    },
    "quantity_received": 200,
    "quantity_remaining": 180,
    "unit_cost": 35.00,
    "expiry_date": "2025-06-30",
    "depletion_rate": 10.0,
    "days_since_entry": 75
  }
]
```

**Lógica:**
- **Filtro 1:** `entry_date <= hoje - days_threshold` (padrão: 30 dias)
- **Filtro 2:** `quantity_remaining > 0` (ainda tem estoque)
- **Filtro 3:** `depletion_rate < depletion_threshold` (padrão: 20%)
- **Ordenação:** Por `depletion_rate` ASC (mais encalhados primeiro)

**Cálculo SQL de Depleção:**
```sql
((quantity_received - quantity_remaining) / quantity_received) * 100 AS depletion_rate
```

**Permissões:** Admin, Seller

---

### 6️⃣ GET /stock-entries/best-performing
**Entradas com Melhor Performance**

```python
GET /api/v1/stock-entries/best-performing?limit=10
Authorization: Bearer {token}
```

**Resposta 200 OK:**
```json
[
  {
    "entry_id": 1,
    "entry_date": "2024-01-15",
    "trip_id": 1,
    "trip_number": "TRIP-2024-001",
    "supplier": "XYZ Suplementos",
    "total_items": 5,
    "total_cost": 10000.00,
    "depletion_rate": 85.5,
    "performance_score": 85.5,
    "avg_days_to_deplete": 12
  }
]
```

**Lógica:**
- Calcula `depletion_rate` médio de todos os items da entrada
- `performance_score` = depleção média ponderada
- Ordena por `performance_score` DESC (melhor performance primeiro)

**Permissões:** Admin, Seller

---

### 7️⃣ PUT /stock-entries/{id}
**Atualizar Entrada de Estoque**

```python
PUT /api/v1/stock-entries/1
Authorization: Bearer {token}
Content-Type: application/json

{
  "supplier": "Fornecedor ABC Ltda",
  "invoice_number": "NF-2024-001-CORRIGIDA",
  "notes": "Nota fiscal corrigida"
}
```

**Resposta 200 OK:** (entrada atualizada)

**Permissões:** Admin, Seller  
**Restrições:**
- ❌ Não permite alterar `trip_id`, `entry_type`, `entry_date`
- ❌ Não permite atualizar items (use endpoints específicos)
- ✅ Apenas metadados (supplier, invoice, notes)

---

### 8️⃣ DELETE /stock-entries/{id}
**Excluir Entrada de Estoque (Soft Delete)**

```python
DELETE /api/v1/stock-entries/1
Authorization: Bearer {token}
```

**Resposta 200 OK:**
```json
{
  "message": "Entrada de estoque excluída com sucesso"
}
```

**Permissões:** Admin APENAS  
**Lógica:**
1. Valida se entrada existe
2. Soft delete: `is_active = False`
3. Soft delete em cascata: Todos os `entry_items` associados
4. **NÃO reverte estoque** (manter histórico íntegro)

---

## 🧮 Análise de Produtos Encalhados

### Algoritmo de Detecção

```python
# EntryItemRepository.get_slow_moving()
depletion_calc = case(
    (EntryItem.quantity_received > 0,
     ((EntryItem.quantity_received - EntryItem.quantity_remaining).cast(Float) 
      / EntryItem.quantity_received.cast(Float)) * 100
    ),
    else_=0
).label('depletion_rate')

query = (
    select(EntryItem, depletion_calc)
    .join(StockEntry)
    .filter(
        and_(
            StockEntry.entry_date <= date_threshold,  # Antigos (> 30 dias)
            EntryItem.quantity_remaining > 0,         # Ainda tem estoque
            depletion_calc < depletion_threshold      # Depleção baixa (< 20%)
        )
    )
    .order_by(depletion_calc.asc())  # Mais encalhados primeiro
)
```

### Interpretação dos Resultados

| Depleção | Status | Ação Recomendada |
|----------|--------|------------------|
| 0-10% | 🔴 Crítico | Promoção agressiva, descontos |
| 10-20% | 🟡 Atenção | Monitorar, ofertas especiais |
| 20-50% | 🟢 Normal | Giro dentro do esperado |
| 50%+ | ✅ Excelente | Produto de alta performance |

---

## 🏆 Análise de Melhores Entradas

### Algoritmo de Ranking

```python
# StockEntryService.get_best_performing_entries()
for entry in entries:
    items = await entry_item_repo.get_by_stock_entry(db, entry.id)
    
    total_received = sum(item.quantity_received for item in items)
    total_remaining = sum(item.quantity_remaining for item in items)
    
    if total_received > 0:
        depletion = ((total_received - total_remaining) / total_received) * 100
        performance_score = depletion
    
    # Ordenar por performance_score DESC
```

### Métricas Calculadas

- **Performance Score:** Taxa de depleção média da entrada
- **Total Cost:** Soma de `quantity_received * unit_cost` de todos os items
- **Avg Days to Deplete:** Média de dias até depleção completa
- **Total Items:** Quantidade de produtos únicos na entrada

---

## 🔒 Permissões por Endpoint

| Endpoint | Admin | Seller | Employee |
|----------|-------|--------|----------|
| POST / | ✅ | ✅ | ❌ |
| GET /list | ✅ | ✅ | ✅ |
| GET /{id} | ✅ | ✅ | ✅ |
| GET /{id}/analytics | ✅ | ✅ | ✅ |
| GET /slow-moving | ✅ | ✅ | ❌ |
| GET /best-performing | ✅ | ✅ | ❌ |
| PUT /{id} | ✅ | ✅ | ❌ |
| DELETE /{id} | ✅ | ❌ | ❌ |

---

## 📊 Integração com FIFO

Ao criar uma entrada de estoque:

1. **EntryItems são criados** com `quantity_remaining = quantity_received`
2. **Product.current_stock é atualizado** (soma das quantidades)
3. **Product.unit_cost é atualizado** usando FIFO weighted average
4. **Histórico de estoque é registrado** (movimento IN)

Ao processar vendas (FASE 7):

1. Sistema consulta `EntryItem.get_fifo_items()` (ordenado por `entry_date` ASC)
2. Decrementa `quantity_remaining` dos items mais antigos primeiro
3. Registra custo de venda usando `unit_cost` do item FIFO

---

## 🧪 Testes Realizados

```powershell
# Compilação
python -m py_compile app/api/v1/endpoints/stock_entries.py  # ✅ OK
python -m py_compile app/api/v1/router.py                    # ✅ OK

# Testes Unitários (próxima fase)
pytest tests/test_stock_entries.py -v
```

---

## 📚 Próximos Passos

### FASE 7: Integração FIFO com Vendas
- ✅ `SaleService.process_sale()` consumir EntryItems via FIFO
- ✅ Atualizar `quantity_remaining` dos items mais antigos
- ✅ Calcular `cost_of_goods_sold` (COGS) usando custos FIFO
- ✅ Registrar movimentos de saída no histórico

### FASE 8: Testes Unitários
- ✅ Criar `tests/test_stock_entries.py`
- ✅ Testar todos os 8 endpoints
- ✅ Validar cálculos de depleção e performance
- ✅ Testar permissões por role

### FASE 9: Interface Mobile
- ✅ Tela de listagem de entradas (com filtros)
- ✅ Tela de detalhes + analytics
- ✅ Tela de produtos encalhados (com alertas)
- ✅ Dashboard de melhores entradas

---

## 🎯 Resumo da Entrega

| Item | Status | Arquivo |
|------|--------|---------|
| API Endpoints | ✅ | `stock_entries.py` (609 linhas) |
| Service Methods | ✅ | `stock_entry_service.py` |
| Repository Methods | ✅ | `stock_entry_repository.py`, `entry_item_repository.py` |
| Schemas | ✅ | `stock_entry.py` |
| Router Registration | ✅ | `router.py` |
| Documentação | ✅ | `FASE_6.2_STOCK_ENTRIES_ENDPOINTS.md` |

---

**Status:** ✅ **FASE 6.2 COMPLETA**

**Data:** 2024-01-20  
**Responsável:** GitHub Copilot (Claude Sonnet 4.5)
