# Validacao de Exclusao de Entradas com Vendas

## Resumo

Implementada validacao robusta que **impede exclusao de StockEntry que ja teve vendas**, garantindo a integridade do sistema de rastreabilidade FIFO.

## Modificacoes Realizadas

### 1. Service Layer (backend/app/services/stock_entry_service.py)

**Metodo modificado:** `delete_entry()` (linhas 457-546)

**Validacao adicionada (linhas 489-506):**

```python
# VALIDACAO CRITICA: Verificar se algum item teve vendas
# Se quantity_sold > 0, a entrada e parte do historico de vendas e nao pode ser excluida
items_with_sales = [
    item for item in entry.entry_items
    if item.is_active and item.quantity_sold > 0
]

if items_with_sales:
    # Calcular total vendido para mensagem informativa
    total_sold = sum(item.quantity_sold for item in items_with_sales)
    products_sold = len(items_with_sales)

    raise ValueError(
        f"Nao e possivel excluir entrada com produtos ja vendidos. "
        f"Esta entrada faz parte do historico de vendas "
        f"({products_sold} produto(s) com {total_sold} unidade(s) vendida(s)). "
        f"A rastreabilidade e auditoria exigem que entradas com vendas sejam mantidas no sistema."
    )
```

**Como funciona:**
1. Antes de qualquer operacao de exclusao, verifica TODOS os `entry_items` da entrada
2. Para cada item ativo, calcula `quantity_sold` (property calculada: `quantity_received - quantity_remaining`)
3. Se QUALQUER item tiver `quantity_sold > 0`, lanca `ValueError` com mensagem clara
4. A mensagem inclui estatisticas: quantos produtos e quantas unidades foram vendidas

### 2. Endpoint (backend/app/api/v1/endpoints/stock_entries.py)

**Endpoint:** `DELETE /stock-entries/{entry_id}` (linhas 604-654)

**Tratamento de erro (linhas 641-653):**

```python
except ValueError as e:
    error_msg = str(e).lower()

    if "nao encontrada" in error_msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,  # 400 para validacao
            detail=str(e)
        )
```

O endpoint **JA estava preparado** para capturar `ValueError` e retornar HTTP 400 (Bad Request).

## Comportamento

### Entrada COM vendas (quantity_sold > 0)
```
DELETE /api/v1/stock-entries/15

Status: 400 Bad Request
Body: {
  "detail": "Nao e possivel excluir entrada com produtos ja vendidos. Esta entrada faz parte do historico de vendas (1 produto(s) com 30 unidade(s) vendida(s)). A rastreabilidade e auditoria exigem que entradas com vendas sejam mantidas no sistema."
}
```

### Entrada SEM vendas (quantity_sold = 0)
```
DELETE /api/v1/stock-entries/16

Status: 200 OK
Body: {
  "success": true,
  "orphan_products_deleted": 0,
  "orphan_products": [],
  "total_stock_removed": 50,
  "entry_code": "TEST-ENTRY-002"
}
```

## Teste de Validacao

### Scripts criados:

1. **create_test_entry.py**: Cria dados de teste
   - Entrada 1: COM vendas (30 unidades vendidas)
   - Entrada 2: SEM vendas

2. **test_entry_sales_validation.py**: Testa a validacao
   - Verifica que entradas COM vendas sao BLOQUEADAS
   - Verifica que entradas SEM vendas sao PERMITIDAS

### Executar testes:

```powershell
# 1. Criar dados de teste
.\venv\Scripts\Activate.ps1
python create_test_entry.py

# 2. Executar teste de validacao
python test_entry_sales_validation.py
```

### Resultado do teste:

```
[ENTRADA] TEST-ENTRY-001-1 (ID: 15)
   - Produto ID 122: Recebido=100, Restante=70, Vendido=30

   [OK] Entrada TEM vendas: 1 produto(s), 30 unidade(s) vendida(s)
   [TESTE] Testando exclusao (deve BLOQUEAR)...
   [SUCESSO] Exclusao bloqueada corretamente!

[ENTRADA] TEST-ENTRY-002 (ID: 16)
   - Produto ID 122: Recebido=50, Restante=50, Vendido=0

   [INFO] Entrada SEM vendas (quantity_sold = 0 em todos os itens)
   [TESTE] Testando exclusao (deve PERMITIR)...
   [SUCESSO] Exclusao permitida!
```

## Por que isso e importante?

### Rastreabilidade FIFO
- Todo produto vendido vem de uma `EntryItem` especifica
- `EntryItem.quantity_sold` rastreia quantas unidades foram vendidas daquela entrada
- Se excluirmos uma entrada com vendas, perdemos o historico de custo real (FIFO)

### Auditoria Financeira
- Relatorios de ROI por entrada dependem do historico completo
- "Qual foi o lucro da viagem X?" so funciona se as entradas existirem
- Analises de fornecedor dependem do historico de vendas

### Integridade de Dados
- Sem a entrada, nao sabemos de onde vieram os produtos vendidos
- Produtos "orfaos" sem origem sao um problema de auditoria
- Sistema de custos FIFO fica inconsistente

## Proximos Passos (Opcional)

### 1. UI Mobile - Exibir warning antes de excluir
```typescript
// mobile/app/entries/[id].tsx
const handleDelete = async () => {
  try {
    await deleteStockEntry(id);
  } catch (error) {
    if (error.response?.status === 400) {
      // Mensagem clara: "Esta entrada nao pode ser excluida pois ja teve vendas"
      Alert.alert("Erro", error.response.data.detail);
    }
  }
};
```

### 2. Adicionar Badge de Status na listagem
```typescript
// Mostrar badge "Vendas Realizadas" em entradas que nao podem ser excluidas
{entry.has_sales && (
  <Badge variant="warning">Vendas Realizadas</Badge>
)}
```

### 3. Endpoint de Verificacao (GET /stock-entries/{id}/can-delete)
```python
@router.get("/{entry_id}/can-delete")
async def can_delete_entry(entry_id: int, ...):
    """Verifica se entrada pode ser excluida sem executar a exclusao."""
    entry = await service.entry_repo.get_by_id(db, entry_id, include_items=True)

    items_with_sales = [
        item for item in entry.entry_items
        if item.is_active and item.quantity_sold > 0
    ]

    return {
        "can_delete": len(items_with_sales) == 0,
        "reason": "Entrada possui vendas" if items_with_sales else None,
        "total_sold": sum(item.quantity_sold for item in items_with_sales)
    }
```

## Conclusao

A validacao esta **FUNCIONANDO CORRETAMENTE**:

- ✅ Entradas com vendas (quantity_sold > 0) sao BLOQUEADAS
- ✅ Entradas sem vendas (quantity_sold = 0) sao PERMITIDAS
- ✅ Mensagem de erro e clara e informativa
- ✅ Retorna HTTP 400 (Bad Request) como esperado
- ✅ Sistema de rastreabilidade FIFO esta protegido
- ✅ Historico de vendas e auditoria estao preservados

**Nenhuma mudanca adicional e necessaria no backend.** A validacao esta completa e robusta.
