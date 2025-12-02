# Sistema de Envio Condicional - Resumo de Implementação

## ✅ Completado (8/13 tasks - 62%)

### Backend (6 tasks - 100% completo)

#### 1. Models
- **Arquivo**: `backend/app/models/conditional_shipment.py`
- **Classes**:
  - `ConditionalShipment`: Status, deadlines, tracking de quantidades
  - `ConditionalShipmentItem`: Items com status individual (SENT, KEPT, RETURNED, DAMAGED, LOST)
- **Propriedades calculadas**:
  - `is_overdue`, `days_remaining`
  - `total_items_sent/kept/returned`
  - `total_value_sent/kept`
- **Relacionamentos**: Store (tenant), Customer, Items

#### 2. Schemas Pydantic
- **Arquivo**: `backend/app/schemas/conditional_shipment.py`
- **Schemas**:
  - `ConditionalShipmentCreate`: Validação de criação
  - `ProcessReturnRequest`: Validação de devolução
  - `ConditionalShipmentResponse`: Resposta completa com items
  - `ConditionalShipmentListResponse`: Versão resumida para listagem
- **Validações**: 
  - Quantidades positivas
  - Status válidos
  - Mínimo 1 item por envio

#### 3. Repository Layer
- **Arquivo**: `backend/app/repositories/conditional_shipment.py`
- **Métodos principais**:
  - `create_with_items()`: Cria envio + items em transação única
  - `list_by_tenant()`: Listagem com filtros (status, customer, overdue)
  - `get_with_items()`: Busca com eager loading
  - `mark_as_sent()`: Define status SENT + deadline
  - `get_overdue_shipments()`: Busca atrasados
  - `update_item()`: Atualiza status e quantidades de item

#### 4. Service Layer
- **Arquivo**: `backend/app/services/conditional_shipment.py`
- **Regras de negócio**:
  - ✅ Validação de estoque antes de criar envio
  - ✅ Reserva de estoque (decrementa quantity)
  - ✅ Devolução de estoque ao processar retorno
  - ✅ Criação automática de venda para itens mantidos
  - ✅ Cancelamento com devolução de estoque
  - ✅ Detecção e atualização de envios atrasados

#### 5. API Endpoints
- **Arquivo**: `backend/app/api/v1/endpoints/conditional_shipments.py`
- **Rotas**:
  - `POST /conditional-shipments` - Criar envio
  - `GET /conditional-shipments` - Listar com filtros
  - `GET /conditional-shipments/{id}` - Buscar por ID
  - `PUT /conditional-shipments/{id}/process-return` - Processar devolução
  - `DELETE /conditional-shipments/{id}` - Cancelar envio
  - `GET /conditional-shipments/overdue/check` - Checar atrasados
- **Autenticação**: Token JWT obrigatório
- **Multi-tenancy**: Validação automática via tenant_id

#### 6. Migration Alembic
- **Arquivo**: `backend/alembic/versions/008_add_conditional_shipments.py`
- **Tabelas**:
  - `conditional_shipments`: Envios principais
  - `conditional_shipment_items`: Items dos envios
- **Índices**:
  - tenant_id, customer_id, status (shipments)
  - shipment_id, product_id (items)
- **Foreign Keys**: tenant, customer, shipment, product

---

### Mobile (2 tasks - 100% completo)

#### 7. TypeScript Types
- **Arquivo**: `mobile/types/conditional.ts`
- **Interfaces**:
  - `ConditionalShipment`: Envio completo
  - `ConditionalShipmentList`: Versão resumida
  - `ConditionalShipmentItem`: Item individual
  - `CreateShipmentDTO`: DTO de criação
  - `ProcessReturnDTO`: DTO de devolução
- **Enums**: `ShipmentStatus`, `ShipmentItemStatus`
- **Helpers**:
  - `formatDeadline()`: Formata contador de prazo
  - `getDeadlineColor()`: Cor baseada em urgência
  - `SHIPMENT_STATUS_COLORS/ICONS/LABELS`: Constantes para UI

#### 8. Service API
- **Arquivo**: `mobile/services/conditionalService.ts`
- **Funções**:
  - `createShipment()`: POST /conditional-shipments
  - `listShipments(filters)`: GET com query params
  - `getShipment(id)`: GET /{id}
  - `processReturn(id, data)`: PUT /{id}/process-return
  - `cancelShipment(id, reason)`: DELETE /{id}
  - `checkOverdueShipments()`: GET /overdue/check
- **Helpers**:
  - `getPendingShipments()`: Filtro SENT
  - `getOverdueShipments()`: Filtro is_overdue=true
  - `getCompletedShipments()`: Filtro COMPLETED
  - `getShipmentsByCustomer(id)`: Filtro customer_id

---

## ⏳ Próximos Passos (5 tasks restantes)

### 9. Tab de Listagem (mobile)
**Arquivo**: `mobile/app/(tabs)/conditional.tsx`

**Estrutura**:
```tsx
- FAB: Novo Envio (navega para create)
- SegmentedButtons: Filtro [Todos, Pendentes, Atrasados, Concluídos]
- FlatList com cards:
  - Avatar do cliente
  - Nome + telefone
  - Badge de status (cor dinâmica)
  - Contador de prazo (color baseado em urgência)
  - Total de itens (X enviados, Y devolvidos, Z comprados)
  - Valor total enviado vs mantido
  - onPress: navega para detalhes
```

**React Query**:
```tsx
const { data: shipments } = useQuery({
  queryKey: ['conditional-shipments', filter],
  queryFn: () => listShipments({ status: filter }),
});
```

**Badges**:
- OVERDUE: Vermelho + ícone alert
- SENT: Azul + ícone package
- COMPLETED: Verde + ícone check

---

### 10. Tela de Criação (mobile)
**Arquivo**: `mobile/app/conditional/create.tsx`

**Fluxo**:
1. **Selecionar Cliente**:
   - Autocomplete com busca por nome/CPF
   - Exibe endereço cadastrado (editável)
   
2. **Adicionar Produtos**:
   - Scanner de código de barras
   - Busca manual
   - Cada produto: nome, SKU, quantidade, preço
   - Botão "+" para adicionar item
   - Lista de itens selecionados (editável/removível)

3. **Configurar Envio**:
   - Prazo (slider: 3-30 dias, padrão 7)
   - Endereço de entrega (TextInput multi-line)
   - Observações (opcional)

4. **Resumo**:
   - Total de itens: X peças
   - Valor total: R$ X.XXX,XX
   - Prazo: até DD/MM/YYYY

5. **Botão Criar**:
   - Valida estoque
   - Cria envio
   - Navega para detalhes

---

### 11. Tela de Processamento (mobile)
**Arquivo**: `mobile/app/conditional/[id]/return.tsx`

**Seções**:

#### Header
- Nome do cliente
- Status badge
- Deadline (color dinâmica)

#### Lista de Items
Para cada produto:
```tsx
<Card>
  <Text>{produto.name}</Text>
  <Text>Enviado: {item.quantity_sent}</Text>
  
  <View style={buttons}>
    <Button 
      mode="contained" 
      onPress={() => markAsKept(item)}
    >
      ✅ Cliente Comprou
    </Button>
    
    <Button 
      mode="outlined"
      onPress={() => markAsReturned(item)}
    >
      🔄 Devolveu
    </Button>
    
    <Button 
      mode="text"
      onPress={() => markAsDamaged(item)}
    >
      ⚠️ Danificado
    </Button>
  </View>
  
  <TextInput
    placeholder="Observações (opcional)"
    value={item.notes}
  />
</Card>
```

#### Resumo Financeiro
```tsx
<Surface>
  <Text>Total enviado: R$ {totalSent}</Text>
  <Text>Cliente comprou: R$ {totalKept} ({keptCount} itens)</Text>
  <Text>Devolvido: R$ {totalReturned} ({returnedCount} itens)</Text>
</Surface>
```

#### Botões Finais
- **Salvar Progresso**: Atualiza sem finalizar (status PARTIAL_RETURN)
- **Finalizar Venda**: Processa devolução + cria Sale (status COMPLETED)
- **Cancelar Envio**: Devolve todo estoque (status CANCELLED)

---

### 12. WhatsApp - Comprovante de Envio
**Função**: `generateShipmentMessage(shipment)`

**Template**:
```
📦 *Envio Condicional - {loja}*

Olá, {cliente}!

Enviamos *{totalItems} peças* para você experimentar em casa:
{items.map(i => `• ${i.quantity_sent}x ${i.product_name}`).join('\n')}

💰 Valor total: R$ {totalValue}
⏰ Prazo: até {deadline} ({daysRemaining} dias)
📍 Endereço: {shippingAddress}

Escolha as peças que mais gostar e devolva o restante. Só paga o que ficar! ✨

Dúvidas? Responda esta mensagem.
```

**Implementação**:
```tsx
import * as Sharing from 'expo-sharing';

const shareMessage = async (shipment: ConditionalShipment) => {
  const message = generateShipmentMessage(shipment);
  
  await Sharing.shareAsync({
    message,
    dialogTitle: 'Enviar comprovante de envio',
  });
};
```

---

### 13. WhatsApp - Confirmação de Compra
**Função**: `generateConfirmationMessage(shipment)`

**Template**:
```
✅ *Compra Confirmada!*

Você ficou com:
{itemsKept.map(i => `• ${i.quantity_kept}x ${i.product_name} - R$ ${i.kept_value}`).join('\n')}

💳 Total: R$ {totalKept}

Recebemos as {returnedCount} peças devolvidas. Obrigado pela confiança! 🙏

{imagem renderizada do pedido}
```

**Geração de imagem**:
- Usar `react-native-view-shot` para capturar screenshot do card de resumo
- Incluir logo da loja, itens comprados, total
- Compartilhar via `expo-sharing`

---

## 🚀 Como Testar

### 1. Aplicar Migração
```powershell
cd backend
python -m alembic upgrade head
```

### 2. Criar Cliente de Teste
```powershell
python backend/create_test_customer.py
```

### 3. Testar Backend (curl ou Postman)
```bash
# Criar envio
POST http://localhost:8000/api/v1/conditional-shipments
{
  "customer_id": 1,
  "shipping_address": "Rua Teste, 123",
  "items": [
    {"product_id": 1, "quantity_sent": 3, "unit_price": 150}
  ],
  "deadline_days": 7
}

# Listar
GET http://localhost:8000/api/v1/conditional-shipments?status=SENT

# Processar devolução
PUT http://localhost:8000/api/v1/conditional-shipments/1/process-return
{
  "items": [
    {"id": 1, "quantity_kept": 2, "quantity_returned": 1, "status": "KEPT"}
  ],
  "create_sale": true
}
```

### 4. Testar Mobile
1. Rodar backend: `uvicorn app.main:app --reload`
2. Rodar mobile: `npx expo start`
3. Navegar para tab "Condicional" (adicionar no tab navigator)
4. Criar envio de teste
5. Processar devolução

---

## 📊 Status Atual

| Módulo | Progresso | Tempo Estimado |
|--------|-----------|----------------|
| Backend | ✅ 100% | 3h (concluído) |
| Types + Service | ✅ 100% | 30min (concluído) |
| Listagem | ⏳ 0% | 2h |
| Criação | ⏳ 0% | 3h |
| Processamento | ⏳ 0% | 3h |
| WhatsApp Envio | ⏳ 0% | 1h |
| WhatsApp Compra | ⏳ 0% | 1h |
| **TOTAL** | **62%** | **13.5h** (3.5h feitas, 10h restantes) |

---

## 🎯 MVP Mínimo (2 dias)

Para ter funcionalidade básica:
1. ✅ Backend completo (feito)
2. ✅ Types + Service (feito)
3. ⏳ Tab de listagem (2h)
4. ⏳ Tela de criação (3h)
5. ⏳ Tela de processamento (3h)

**Deixar para depois**:
- WhatsApp integrado (pode copiar/colar texto por enquanto)
- Imagens renderizadas (opcional)
- Filtros avançados

---

## 📝 Notas Técnicas

### Estoque
- Envio **reserva** estoque (decrementa ao criar)
- Devolução **libera** estoque (incrementa ao processar)
- Cliente mantido **não muda** estoque (já estava decrementado)
- Venda automática **não movimenta** estoque (já foi reservado)

### Status Flow
```
PENDING → SENT → PARTIAL_RETURN → COMPLETED
                      ↓
                  OVERDUE
         ↓
     CANCELLED
```

### Multi-tenancy
- Todos os endpoints validam `tenant_id` automaticamente
- Relacionamentos isolados por tenant
- Índices otimizados para queries por tenant

### Performance
- Eager loading: `selectinload(items)` evita N+1 queries
- Índices em: tenant_id, customer_id, status, shipment_id
- Paginação padrão: limit=100

---

## 🔗 Arquivos Criados

### Backend (6 arquivos)
1. `backend/app/models/conditional_shipment.py`
2. `backend/app/schemas/conditional_shipment.py`
3. `backend/app/repositories/conditional_shipment.py`
4. `backend/app/services/conditional_shipment.py`
5. `backend/app/api/v1/endpoints/conditional_shipments.py`
6. `backend/alembic/versions/008_add_conditional_shipments.py`

### Mobile (2 arquivos)
7. `mobile/types/conditional.ts`
8. `mobile/services/conditionalService.ts`

### Documentação (1 arquivo)
9. `CONDITIONAL_SHIPMENT_IMPLEMENTATION.md` (este arquivo)

---

**Última atualização**: 01/12/2025 18:30
**Commit**: `feat(backend): sistema de envio condicional completo`
