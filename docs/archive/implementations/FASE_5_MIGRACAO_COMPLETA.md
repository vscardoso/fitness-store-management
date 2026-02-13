# FASE 5: Scripts de Migração - Batch → StockEntry

## ✅ Implementação Completa

Data: 03/11/2025  
Status: **CONCLUÍDO**

---

## 📁 Estrutura Criada

```
backend/scripts/
├── __init__.py                    # Pacote Python
├── README.md                      # Documentação completa
├── migration_status.py            # Verifica status do banco
├── migrate_batch_to_entry.py      # Executa migração
├── validate_migration.py          # Valida integridade
├── cleanup_batches.py             # Remove batches antigos
└── seed_db.py                     # Dados de exemplo
```

---

## 📋 Scripts Implementados

### 1. **migration_status.py** (355 linhas)
**Função**: Diagnóstico do estado atual do banco

**Funcionalidades**:
- ✅ Conta batches ativos/inativos
- ✅ Conta stock_entries e entry_items ativos/inativos
- ✅ Calcula custos totais de ambos os sistemas
- ✅ Detecta status da migração (não iniciada, em progresso, completa)
- ✅ Identifica discrepâncias de custos
- ✅ Localiza produtos órfãos (sem rastreamento)
- ✅ Detalha entradas por tipo (trip/online/local)

**Uso**:
```bash
python scripts/migration_status.py
```

**Exemplo de Saída**:
```
======================================================================
📊 STATUS DO BANCO DE DADOS
======================================================================
Horário: 03/11/2025 14:30:45

🗃️  SISTEMA ANTIGO (BATCHES)
----------------------------------------------------------------------
Batches ativos: 15
Batches inativos: 0
Total de batches: 15
Produtos com batch_id: 127
Custo total (batches ativos): R$ 24,580.00

📦 SISTEMA NOVO (STOCK ENTRIES)
----------------------------------------------------------------------
StockEntries ativos: 0
StockEntries inativos: 0
Total de StockEntries: 0
EntryItems ativos: 0
EntryItems inativos: 0
Total de EntryItems: 0

🔍 ANÁLISE
----------------------------------------------------------------------
❌ Status: Migração NÃO realizada
   → Execute: python scripts/migrate_batch_to_entry.py
```

---

### 2. **migrate_batch_to_entry.py** (404 linhas)
**Função**: Migração principal de dados

**Funcionalidades**:
- ✅ Cria `StockEntry` para cada `Batch`
- ✅ Cria `EntryItem` para cada produto do batch
- ✅ Preserva timestamps originais (`created_at`, `updated_at`)
- ✅ **Mantém batches originais** (não deleta)
- ✅ Executa em **transaction** (rollback automático em caso de erro)
- ✅ Logger detalhado com progresso em tempo real
- ✅ Validações de integridade:
  - Verifica `initial_quantity > 0`
  - Ajusta `quantity_remaining` se maior que `quantity_received`
  - Loga discrepâncias de custos

**Mapeamento de Campos**:

| Campo Batch | → | Campo StockEntry |
|-------------|---|------------------|
| `batch_code` | → | `entry_code` |
| `purchase_date` | → | `entry_date` |
| `supplier_name` | → | `supplier_name` |
| `supplier_cnpj` | → | `supplier_cnpj` |
| `invoice_number` | → | `invoice_number` |
| `total_cost` | → | `total_cost` |
| `notes` | → | `notes` |
| `created_at` | → | `created_at` |
| `updated_at` | → | `updated_at` |
| `is_active` | → | `is_active` |

| Campo Product | → | Campo EntryItem |
|---------------|---|-----------------|
| `initial_quantity` | → | `quantity_received` |
| Estoque atual | → | `quantity_remaining` |
| `cost_price` | → | `unit_cost` |

**Uso**:
```bash
python scripts/migrate_batch_to_entry.py
```

**Fluxo de Execução**:
1. Verifica pré-requisitos (existência de batches)
2. Avisa se já existem stock_entries
3. Solicita confirmação do usuário
4. Para cada batch:
   - Cria StockEntry correspondente
   - Para cada produto do batch:
     - Cria EntryItem com quantidades e custos
   - Recalcula `total_cost` do entry baseado nos itens
5. Commit da transaction
6. Exibe resumo completo

**Tratamento de Erros**:
- Se um batch falhar, continua para o próximo
- Se erro crítico, faz rollback de tudo
- Logs detalhados de cada problema

---

### 3. **validate_migration.py** (315 linhas)
**Função**: Validação de integridade da migração

**Funcionalidades**:
- ✅ Verifica se todos os batches têm StockEntry correspondente
- ✅ Valida mapeamento de campos:
  - `entry_code == batch_code`
  - `entry_date == purchase_date`
  - `supplier_name` correspondente
- ✅ Compara custos totais (tolerância de R$ 0.01)
- ✅ Verifica se todos os produtos têm EntryItem
- ✅ Valida quantidades:
  - `quantity_received == initial_quantity`
  - `quantity_remaining == estoque atual`
- ✅ Valida custos unitários
- ✅ Relatório detalhado com problemas e avisos

**Uso**:
```bash
python scripts/validate_migration.py
```

**Exit Codes**:
- `0`: Validação OK, pode fazer cleanup
- `1`: Validação falhou, corrigir problemas

**Exemplo de Saída (Sucesso)**:
```
🔍 VALIDAÇÃO DA MIGRAÇÃO BATCH → STOCK ENTRY
======================================================================
📦 Encontrados 15 batches para validar

🔍 Validando: LOTE-2024-001
  ✓ entry_code: LOTE-2024-001
  ✓ entry_date: 2024-01-15
  ✓ total_cost: R$ 1600.00
  ✓ Todos os 2 itens validados

...

======================================================================
📊 RESUMO DA VALIDAÇÃO
======================================================================
Total de Batches: 15
StockEntries encontrados: 15
Correspondências válidas: 15
Problemas encontrados: 0
Avisos: 0
======================================================================

✅ VALIDAÇÃO CONCLUÍDA COM SUCESSO!
   A migração está correta e pode prosseguir para limpeza.
```

---

### 4. **cleanup_batches.py** (145 linhas)
**Função**: Limpeza de batches após migração validada

**Funcionalidades**:
- ✅ Remove `batch_id` de todos os produtos
- ✅ Faz **soft delete** dos batches (`is_active = False`)
- ✅ **NÃO deleta fisicamente** (dados podem ser recuperados)
- ✅ Requer confirmação dupla
- ✅ Verifica existência de stock_entries antes de prosseguir
- ✅ Executa em transaction

⚠️ **ATENÇÃO**: Execute apenas após validação bem-sucedida!

**Uso**:
```bash
python scripts/cleanup_batches.py
```

**Confirmações Requeridas**:
1. "Tem certeza que validou a migração? (digite 'SIM' para confirmar)"
2. "ÚLTIMA CONFIRMAÇÃO - Deseja realmente limpar os batches? (s/n)"

**O que faz**:
```sql
-- Remove batch_id dos produtos
UPDATE products SET batch_id = NULL WHERE batch_id IS NOT NULL;

-- Desativa batches (soft delete)
UPDATE batches SET is_active = 0 WHERE is_active = 1;
```

---

### 5. **seed_db.py** (285 linhas)
**Função**: Popular banco com dados de exemplo

**Funcionalidades**:
- ✅ Cria 12 produtos de exemplo (roupas, calçados, acessórios, suplementos)
- ✅ Cria 5 clientes de exemplo
- ✅ Cria 2 usuários de exemplo (vendedor, gerente)
- ✅ Usa categorias existentes
- ✅ Tratamento de erros por item (não para se um falhar)

**Uso**:
```bash
python scripts/seed_db.py
```

**Dados Criados**:
- **Produtos**: 12 itens variados
- **Clientes**: 5 clientes com dados completos
- **Usuários**: 
  - vendedor@fitnessstore.com / vendedor123
  - gerente@fitnessstore.com / gerente123

---

## 🔄 Processo de Migração Completo

### Passo a Passo Recomendado

```bash
# 0. Verificar status inicial
python scripts/migration_status.py

# 1. Backup do banco (IMPORTANTE!)
Copy-Item fitness_store.db fitness_store.db.backup

# 2. Executar migração
python scripts/migrate_batch_to_entry.py

# 3. Verificar status pós-migração
python scripts/migration_status.py

# 4. Validar migração
python scripts/validate_migration.py

# 5. Se validação OK, fazer cleanup
python scripts/cleanup_batches.py

# 6. Verificar status final
python scripts/migration_status.py
```

### Checklist de Execução

- [ ] Backup do banco de dados
- [ ] Status inicial verificado
- [ ] Migração executada sem erros críticos
- [ ] Status pós-migração verificado
- [ ] Validação concluída com sucesso (exit code 0)
- [ ] Sistema testado (listar produtos, consultar entries)
- [ ] Cleanup executado
- [ ] Status final verificado
- [ ] Batches desativados, produtos sem batch_id

---

## 🚨 Tratamento de Erros e Rollback

### Rollback ANTES do Cleanup

Se algo der errado antes de executar `cleanup_batches.py`, **os batches originais ainda existem**:

```python
# Via Python
from app.core.database import async_session_maker
from app.models import StockEntry, EntryItem
from sqlalchemy import delete
import asyncio

async def rollback():
    async with async_session_maker() as session:
        await session.execute(delete(EntryItem))
        await session.execute(delete(StockEntry))
        await session.commit()
        print('✅ Rollback completo')

asyncio.run(rollback())
```

Ou via SQL:
```sql
DELETE FROM entry_items;
DELETE FROM stock_entries;
```

### Rollback DEPOIS do Cleanup

Se algo der errado após o cleanup, restaurar backup:

```powershell
# Parar servidor FastAPI
Copy-Item fitness_store.db.backup fitness_store.db
```

Ou reativar batches via SQL:
```sql
-- Reativar batches
UPDATE batches SET is_active = 1;

-- Restaurar batch_id nos produtos
UPDATE products
SET batch_id = (
    SELECT b.id
    FROM batches b
    JOIN products p2 ON p2.batch_id = b.id
    WHERE p2.sku = products.sku
    LIMIT 1
)
WHERE id IN (SELECT DISTINCT product_id FROM entry_items);
```

---

## 📊 Métricas e Performance

### Estimativas de Performance

| Quantidade | Tempo Estimado |
|------------|----------------|
| 10 batches, 100 produtos | ~1-2s |
| 50 batches, 500 produtos | ~3-5s |
| 100 batches, 1000 produtos | ~5-10s |
| 500 batches, 5000 produtos | ~30-60s |

**Fatores que afetam performance**:
- Quantidade de produtos por batch
- Velocidade do disco (SQLite é I/O intensivo)
- Carga do sistema

---

## 🧪 Testes Recomendados Pós-Migração

### 1. Testes Básicos

```bash
# Listar produtos
curl http://localhost:8000/api/v1/products

# Listar stock_entries
curl http://localhost:8000/api/v1/stock-entries

# Verificar entry_items no banco
sqlite3 fitness_store.db "SELECT COUNT(*) FROM entry_items WHERE is_active = 1;"
```

### 2. Teste de FIFO

```python
# Via Python
from app.services.fifo_service import FIFOService
from app.core.database import async_session_maker

async def test_fifo():
    async with async_session_maker() as session:
        fifo = FIFOService()
        
        # Simular venda
        preview = await fifo.simulate_sale(session, product_id=1, quantity=10)
        print(f"Custo total: R$ {preview['total_cost']:.2f}")
        print(f"Custo médio: R$ {preview['average_unit_cost']:.2f}")
```

### 3. Verificar Integridade Referencial

```sql
-- Produtos órfãos (sem entry_item)
SELECT p.id, p.sku, p.name
FROM products p
WHERE p.is_active = 1
AND NOT EXISTS (
    SELECT 1 FROM entry_items ei
    WHERE ei.product_id = p.id
    AND ei.is_active = 1
);

-- Entry_items sem produto
SELECT ei.id, ei.product_id
FROM entry_items ei
WHERE ei.is_active = 1
AND NOT EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = ei.product_id
    AND p.is_active = 1
);
```

---

## 📝 Notas Importantes

### ✅ Pontos Positivos
- **Segurança**: Migração usa transactions (rollback automático)
- **Preservação**: Batches originais mantidos até confirmação
- **Validação**: Script dedicado para verificar integridade
- **Logging**: Detalhado em todas as etapas
- **Recuperação**: Múltiplas opções de rollback

### ⚠️ Atenções
- **Backup obrigatório** antes de iniciar
- **Parar servidor** durante migração recomendado
- **Testar em dev** antes de produção
- **Validar sempre** antes do cleanup
- **Confirmar testes** antes de remover batches

### 🔧 Manutenções Futuras
- [ ] Adicionar migração de histórico de vendas (se necessário)
- [ ] Script de auditoria comparando somas de custos
- [ ] Dashboard de status da migração (opcional)
- [ ] Logs persistentes em arquivo (opcional)

---

## 🎯 Próximos Passos

Após completar a FASE 5:

1. **FASE 6**: Criar endpoints API para Trip e StockEntry
   - `POST /api/v1/trips` - Criar viagem
   - `GET /api/v1/trips` - Listar viagens
   - `POST /api/v1/stock-entries` - Criar entrada de estoque
   - `GET /api/v1/stock-entries` - Listar entradas
   - `GET /api/v1/stock-entries/analytics` - Análises

2. **FASE 7**: Integrar FIFOService com SaleService
   - Modificar fluxo de venda para usar FIFO
   - Registrar fontes de custo nas vendas
   - Atualizar `quantity_remaining` dos entry_items

3. **FASE 8**: Testes unitários
   - Testar FIFO com múltiplos entry_items
   - Testar rollback de vendas
   - Testar analytics de custos

4. **FASE 9**: Interface mobile
   - Telas de Trip management
   - Telas de Stock Entry
   - Visualização de custos FIFO

---

## 📚 Referências

- **Arquitetura**: `/docs/ARCHITECTURE.md`
- **Sistema Trip**: `TRIP_SYSTEM_IMPLEMENTATION.md`
- **Scripts**: `/backend/scripts/README.md`
- **Modelos**: `/backend/app/models/`
- **Repositórios**: `/backend/app/repositories/`
- **Serviços**: `/backend/app/services/`

---

**Última atualização**: 03/11/2025  
**Versão**: 1.0.0  
**Status**: ✅ FASE 5 COMPLETA
