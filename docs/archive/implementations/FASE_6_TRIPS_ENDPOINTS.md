# FASE 6: Endpoints API - Trips (Viagens)

## ✅ Implementação Completa

Data: 03/11/2025  
Status: **CONCLUÍDO**

---

## 📁 Arquivos Criados/Modificados

```
backend/app/
├── api/v1/
│   ├── endpoints/
│   │   └── trips.py                    # ✅ NOVO - 609 linhas
│   └── router.py                        # ✅ Atualizado - Registrado router de trips
├── schemas/
│   └── trip.py                          # ✅ Atualizado - Adicionado TripStatusUpdate
├── services/
│   └── trip_service.py                  # ✅ Atualizado - Adicionado get_trips_filtered
└── repositories/
    └── trip_repository.py               # ✅ Atualizado - Adicionado get_filtered
```

---

## 🎯 Endpoints Implementados

### Base URL: `/api/v1/trips`

| Método | Endpoint | Descrição | Auth | Permissões |
|--------|----------|-----------|------|------------|
| **POST** | `/` | Criar viagem | ✅ | Admin, Seller |
| **GET** | `/` | Listar viagens (com filtros) | ✅ | Todos |
| **GET** | `/{id}` | Detalhes da viagem | ✅ | Todos |
| **GET** | `/{id}/analytics` | Analytics da viagem | ✅ | Todos |
| **GET** | `/compare?ids=1,2,3` | Comparar viagens | ✅ | Todos |
| **PUT** | `/{id}` | Atualizar viagem | ✅ | Admin, Seller |
| **PUT** | `/{id}/status` | Atualizar status | ✅ | Admin, Seller |
| **DELETE** | `/{id}` | Deletar viagem | ✅ | Admin |

---

## 📋 Detalhes dos Endpoints

### 1. **POST /trips** - Criar Viagem

**Permissões**: Admin, Seller  
**Request Body**:
```json
{
  "trip_code": "TRIP-2025-001",
  "trip_date": "2025-01-15",
  "destination": "São Paulo - SP",
  "departure_time": "2025-01-15T08:00:00",
  "return_time": "2025-01-15T18:00:00",
  "travel_cost_fuel": 250.00,
  "travel_cost_food": 80.00,
  "travel_cost_toll": 45.00,
  "travel_cost_hotel": 0.00,
  "travel_cost_other": 0.00,
  "status": "planned",
  "notes": "Compra de roupas fitness"
}
```

**Response**: `201 Created`
```json
{
  "id": 1,
  "trip_code": "TRIP-2025-001",
  "trip_date": "2025-01-15",
  "destination": "São Paulo - SP",
  "departure_time": "2025-01-15T08:00:00",
  "return_time": "2025-01-15T18:00:00",
  "travel_cost_fuel": 250.00,
  "travel_cost_food": 80.00,
  "travel_cost_toll": 45.00,
  "travel_cost_hotel": 0.00,
  "travel_cost_other": 0.00,
  "travel_cost_total": 375.00,
  "status": "planned",
  "notes": "Compra de roupas fitness",
  "is_active": true,
  "created_at": "2025-11-03T14:30:00",
  "updated_at": "2025-11-03T14:30:00",
  "total_entries": 0,
  "total_items_purchased": 0,
  "total_invested": 0.00,
  "duration_hours": 10.0
}
```

**Validações**:
- ✅ `trip_code` único (verifica duplicação)
- ✅ `departure_time < return_time`
- ✅ Custos >= 0
- ✅ `travel_cost_total` calculado automaticamente

**Erros**:
- `400 Bad Request`: trip_code já existe ou dados inválidos
- `401 Unauthorized`: Não autenticado
- `403 Forbidden`: Sem permissões

---

### 2. **GET /trips** - Listar Viagens

**Permissões**: Todos os usuários autenticados  
**Query Parameters**:
- `skip` (int, default=0): Paginação
- `limit` (int, default=100, max=1000): Limite por página
- `status` (enum): Filtrar por status (planned, in_progress, completed, cancelled)
- `start_date` (date): Data inicial (trip_date >= start_date)
- `end_date` (date): Data final (trip_date <= end_date)

**Exemplos**:
```bash
# Listar todas
GET /trips?skip=0&limit=10

# Filtrar por status
GET /trips?status=completed

# Filtrar por período
GET /trips?start_date=2025-01-01&end_date=2025-01-31

# Combinar filtros
GET /trips?status=in_progress&start_date=2025-01-01
```

**Response**: `200 OK`
```json
[
  {
    "id": 1,
    "trip_code": "TRIP-2025-001",
    "trip_date": "2025-01-15",
    "destination": "São Paulo - SP",
    "status": "completed",
    "travel_cost_total": 375.00,
    "is_active": true,
    "created_at": "2025-11-03T14:30:00",
    "updated_at": "2025-11-03T14:30:00"
  },
  ...
]
```

---

### 3. **GET /trips/{id}** - Detalhes da Viagem

**Permissões**: Todos os usuários autenticados

**Response**: `200 OK`
```json
{
  "id": 1,
  "trip_code": "TRIP-2025-001",
  "trip_date": "2025-01-15",
  "destination": "São Paulo - SP",
  "departure_time": "2025-01-15T08:00:00",
  "return_time": "2025-01-15T18:00:00",
  "travel_cost_fuel": 250.00,
  "travel_cost_food": 80.00,
  "travel_cost_toll": 45.00,
  "travel_cost_hotel": 0.00,
  "travel_cost_other": 0.00,
  "travel_cost_total": 375.00,
  "status": "completed",
  "notes": "Compra de roupas fitness",
  "is_active": true,
  "created_at": "2025-11-03T14:30:00",
  "updated_at": "2025-11-03T14:30:00",
  "total_entries": 2,
  "total_items_purchased": 15,
  "total_invested": 5000.00,
  "duration_hours": 10.0
}
```

**Erros**:
- `404 Not Found`: Viagem não encontrada

---

### 4. **GET /trips/{id}/analytics** - Analytics da Viagem

**Permissões**: Todos os usuários autenticados

**Response**: `200 OK`
```json
{
  "trip_id": 1,
  "trip_code": "TRIP-2025-001",
  "destination": "São Paulo - SP",
  "status": "completed",
  "trip_date": "2025-01-15",
  
  "travel_cost_total": 375.00,
  "travel_cost_breakdown": {
    "fuel": 250.00,
    "food": 80.00,
    "toll": 45.00,
    "hotel": 0.00,
    "other": 0.00
  },
  
  "total_invested": 5000.00,
  "total_cost": 5375.00,
  
  "total_entries": 2,
  "total_items": 15,
  "total_quantity_purchased": 150,
  "total_quantity_sold": 120,
  "quantity_remaining": 30,
  
  "sell_through_rate": 80.00,
  "roi": -20.00,
  
  "duration_hours": 10.0
}
```

**Métricas Calculadas**:
- ✅ **travel_cost_total**: Soma de todos os custos de viagem
- ✅ **travel_cost_breakdown**: Detalhamento por tipo de custo
- ✅ **total_invested**: Total investido em produtos (soma dos stock_entries)
- ✅ **total_cost**: Custo viagem + produtos
- ✅ **sell_through_rate**: (Vendido / Comprado) × 100
- ✅ **roi**: ROI simplificado baseado em sell-through
- ✅ **duration_hours**: Duração da viagem em horas

---

### 5. **GET /trips/compare?ids=1,2,3** - Comparar Viagens

**Permissões**: Todos os usuários autenticados  
**Query Parameters**:
- `ids` (string, required): IDs separados por vírgula (mín: 2, máx: 10)

**Exemplo**:
```bash
GET /trips/compare?ids=1,2,3
```

**Response**: `200 OK`
```json
{
  "trips_compared": 3,
  "trips": [
    {
      "trip_id": 1,
      "trip_code": "TRIP-2025-001",
      "sell_through_rate": 80.00,
      "roi": -20.00,
      "total_invested": 5000.00,
      ...
    },
    {
      "trip_id": 2,
      "trip_code": "TRIP-2025-002",
      "sell_through_rate": 92.50,
      "roi": -7.50,
      "total_invested": 7500.00,
      ...
    },
    {
      "trip_id": 3,
      "trip_code": "TRIP-2025-003",
      "sell_through_rate": 65.00,
      "roi": -35.00,
      "total_invested": 3000.00,
      ...
    }
  ],
  
  "summary": {
    "total_invested": 15500.00,
    "average_invested": 5166.67,
    "total_items": 45,
    "average_sell_through_rate": 79.17
  },
  
  "best_performer": {
    "trip_code": "TRIP-2025-002",
    "sell_through_rate": 92.50,
    "roi": -7.50
  },
  
  "worst_performer": {
    "trip_code": "TRIP-2025-003",
    "sell_through_rate": 65.00,
    "roi": -35.00
  }
}
```

**Validações**:
- Mínimo de 2 viagens
- Máximo de 10 viagens
- IDs devem ser numéricos válidos

**Erros**:
- `400 Bad Request`: IDs inválidos ou fora dos limites
- `404 Not Found`: Alguma viagem não encontrada

---

### 6. **PUT /trips/{id}** - Atualizar Viagem

**Permissões**: Admin, Seller  
**Request Body** (todos os campos opcionais):
```json
{
  "trip_code": "TRIP-2025-001-UPDATED",
  "trip_date": "2025-01-16",
  "destination": "São Paulo - Centro",
  "travel_cost_fuel": 280.00,
  "status": "completed",
  "notes": "Viagem concluída com sucesso"
}
```

**Response**: `200 OK`
```json
{
  "id": 1,
  "trip_code": "TRIP-2025-001-UPDATED",
  "trip_date": "2025-01-16",
  ...
  "updated_at": "2025-11-03T15:45:00"
}
```

**Validações**:
- ✅ Se `trip_code` alterado, verifica unicidade
- ✅ Recalcula `travel_cost_total` se custos alterados
- ✅ Valida `departure_time < return_time`

**Erros**:
- `404 Not Found`: Viagem não encontrada
- `400 Bad Request`: trip_code duplicado ou dados inválidos
- `403 Forbidden`: Sem permissões

---

### 7. **PUT /trips/{id}/status** - Atualizar Status

**Permissões**: Admin, Seller  
**Request Body**:
```json
{
  "status": "completed"
}
```

**Status Possíveis**:
- `planned`: Viagem planejada
- `in_progress`: Viagem em andamento
- `completed`: Viagem concluída
- `cancelled`: Viagem cancelada

**Response**: `200 OK`
```json
{
  "id": 1,
  "trip_code": "TRIP-2025-001",
  "status": "completed",
  ...
  "updated_at": "2025-11-03T16:00:00"
}
```

**Validações**:
- ✅ Viagem completada não pode ter status alterado

**Erros**:
- `404 Not Found`: Viagem não encontrada
- `400 Bad Request`: Transição de status inválida
- `403 Forbidden`: Sem permissões

---

### 8. **DELETE /trips/{id}** - Deletar Viagem

**Permissões**: Apenas Admin  
**Response**: `204 No Content`

**Comportamento**:
- Faz **soft delete** (is_active = False)
- Dados não são removidos fisicamente
- Pode ser recuperado alterando is_active para True

**Validações**:
- ✅ Verifica se tem stock_entries associados
- ✅ Não permite deletar se houver entradas

**Erros**:
- `404 Not Found`: Viagem não encontrada
- `400 Bad Request`: Viagem possui entradas de estoque associadas
- `403 Forbidden`: Não é admin

---

## 🔐 Autenticação e Autorização

### Headers Requeridos
```http
Authorization: Bearer {access_token}
```

### Níveis de Permissão

| Ação | Admin | Seller | Employee |
|------|-------|--------|----------|
| **Criar** viagem | ✅ | ✅ | ❌ |
| **Listar** viagens | ✅ | ✅ | ✅ |
| **Ver detalhes** | ✅ | ✅ | ✅ |
| **Ver analytics** | ✅ | ✅ | ✅ |
| **Comparar** viagens | ✅ | ✅ | ✅ |
| **Atualizar** viagem | ✅ | ✅ | ❌ |
| **Atualizar status** | ✅ | ✅ | ❌ |
| **Deletar** viagem | ✅ | ❌ | ❌ |

---

## 🧪 Testes Recomendados

### 1. Teste de Criação
```bash
curl -X POST http://localhost:8000/api/v1/trips \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "trip_code": "TRIP-TEST-001",
    "trip_date": "2025-11-10",
    "destination": "São Paulo",
    "travel_cost_fuel": 200.00
  }'
```

### 2. Teste de Listagem com Filtros
```bash
# Filtrar por status
curl http://localhost:8000/api/v1/trips?status=completed \
  -H "Authorization: Bearer {token}"

# Filtrar por data
curl "http://localhost:8000/api/v1/trips?start_date=2025-01-01&end_date=2025-12-31" \
  -H "Authorization: Bearer {token}"
```

### 3. Teste de Analytics
```bash
curl http://localhost:8000/api/v1/trips/1/analytics \
  -H "Authorization: Bearer {token}"
```

### 4. Teste de Comparação
```bash
curl "http://localhost:8000/api/v1/trips/compare?ids=1,2,3" \
  -H "Authorization: Bearer {token}"
```

### 5. Teste de Atualização de Status
```bash
curl -X PUT http://localhost:8000/api/v1/trips/1/status \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

---

## 📊 Códigos de Status HTTP

| Código | Significado | Quando Ocorre |
|--------|-------------|---------------|
| **200** | OK | Request bem-sucedido (GET, PUT) |
| **201** | Created | Viagem criada com sucesso (POST) |
| **204** | No Content | Viagem deletada com sucesso (DELETE) |
| **400** | Bad Request | Dados inválidos ou trip_code duplicado |
| **401** | Unauthorized | Token inválido ou ausente |
| **403** | Forbidden | Usuário não tem permissões |
| **404** | Not Found | Viagem não encontrada |
| **500** | Internal Server Error | Erro no servidor |

---

## 🔧 Melhorias Implementadas

### No TripService
- ✅ Adicionado método `get_trips_filtered()` para filtros múltiplos
- ✅ Método `compare_trips()` com análise comparativa
- ✅ Método `update_trip_status()` com validações de transição
- ✅ Analytics detalhado com métricas calculadas

### No TripRepository
- ✅ Adicionado método `get_filtered()` com filtros de status e data
- ✅ Queries otimizadas com índices

### Nos Schemas
- ✅ Adicionado `TripStatusUpdate` para endpoint de status
- ✅ Validações de Pydantic v2 com `@model_validator`

---

## 📝 Notas Importantes

### ✅ Pontos Positivos
- **Segurança**: Todos os endpoints requerem autenticação
- **Permissões**: Operações de escrita restritas a Admin/Seller
- **Validações**: Dados validados com Pydantic v2
- **Soft Delete**: Viagens não são removidas fisicamente
- **Analytics**: Métricas detalhadas para tomada de decisão
- **Comparação**: Permite comparar performance de múltiplas viagens

### ⚠️ Atenções
- Viagem com stock_entries não pode ser deletada
- Status "completed" não pode ser alterado (proteção de dados)
- Comparação limitada a 10 viagens por vez (performance)
- ROI é simplificado (baseado em sell-through rate)

### 🔮 Possíveis Melhorias Futuras
- [ ] Endpoint de estatísticas globais (`GET /trips/stats`)
- [ ] Filtro por destino
- [ ] Ordenação customizada (por custo, ROI, data, etc.)
- [ ] Exportação de relatórios (PDF, Excel)
- [ ] Gráficos de analytics
- [ ] Histórico de mudanças de status
- [ ] Notificações quando viagem muda para "in_progress"

---

## 🎯 Próximos Passos

Com FASE 6 concluída, próximas etapas:

1. **FASE 7**: Criar endpoints de StockEntry
   - `POST /stock-entries` - Criar entrada de estoque
   - `GET /stock-entries` - Listar entradas
   - `GET /stock-entries/{id}` - Detalhes
   - `GET /stock-entries/{id}/items` - Itens da entrada
   - `GET /stock-entries/analytics` - Analytics globais

2. **FASE 8**: Integrar FIFOService com SaleService
   - Modificar fluxo de venda para usar FIFO
   - Registrar fontes de custo nas vendas

3. **FASE 9**: Testes unitários
   - Testar todos os endpoints
   - Testar validações
   - Testar permissões

4. **FASE 10**: Interface mobile
   - Telas de Trip management
   - Visualização de analytics
   - Comparação de viagens

---

## 📚 Referências

- **Arquitetura**: `/docs/ARCHITECTURE.md`
- **Sistema Trip**: `TRIP_SYSTEM_IMPLEMENTATION.md`
- **Migração**: `FASE_5_MIGRACAO_COMPLETA.md`
- **API Docs**: `http://localhost:8000/docs` (Swagger UI interativo)

---

**Última atualização**: 03/11/2025  
**Versão**: 1.0.0  
**Status**: ✅ FASE 6 COMPLETA - Endpoints de Trips funcionais
