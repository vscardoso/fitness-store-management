# 🔧 Correção do Sistema de Lotes (Batches)

## ❌ Problemas Identificados

1. **Erro 500 ao criar lote**: Tabela `batches` não existe no banco de dados
2. **Erro 403 "Not authenticated"**: Código de status HTTP incorreto (deveria ser 401)

## ✅ Correções Aplicadas

### 1. Código de Status HTTP Corrigido
- Alterado erro de usuário inativo de 403 para 401
- Arquivo: `backend/app/api/deps.py`

### 2. Scripts de Migração Criados
- `add_batches_table.py`: Cria tabela batches
- `add_batch_fields_to_products.py`: Adiciona campos batch aos produtos

## 🚀 Como Aplicar as Correções

### Opção A: Recriar Banco Inteiro (⚠️ PERDE TODOS OS DADOS)

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python recreate_db.py
python create_user.py
python create_categories.py
```

### Opção B: Adicionar Apenas a Tabela Batches (✅ MANTÉM DADOS)

```powershell
cd backend
.\venv\Scripts\Activate.ps1

# Passo 1: Criar tabela batches
python add_batches_table.py

# Passo 2: Adicionar campos batch aos produtos
python add_batch_fields_to_products.py

# Passo 3: Reiniciar backend (Ctrl+C e rodar novamente)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 📋 Estrutura da Tabela Batches

```sql
CREATE TABLE batches (
    id INTEGER PRIMARY KEY,
    batch_code VARCHAR(50) UNIQUE NOT NULL,     -- Ex: "LOTE-2025-01"
    purchase_date DATE NOT NULL,                -- Data da compra
    invoice_number VARCHAR(100),                -- Número da nota fiscal
    supplier_name VARCHAR(200),                 -- Nome do fornecedor
    supplier_cnpj VARCHAR(20),                  -- CNPJ do fornecedor
    total_cost FLOAT DEFAULT 0.0,               -- Custo total do lote
    notes TEXT,                                 -- Observações
    created_at DATETIME,
    updated_at DATETIME,
    is_active BOOLEAN DEFAULT 1
);
```

## 📋 Campos Adicionados em Products

```sql
-- Novos campos em products:
batch_id INTEGER REFERENCES batches(id),  -- FK para o lote
initial_quantity INTEGER DEFAULT 0,       -- Qtd inicial comprada
batch_position INTEGER                    -- Posição no lote (1, 2, 3...)
```

## 🧪 Testando

Após aplicar as correções, teste criar um lote:

```bash
# Via Swagger: http://localhost:8000/docs
POST /api/v1/batches/

# Body exemplo:
{
  "batch_code": "LOTE-2025-001",
  "purchase_date": "2025-10-31",
  "invoice_number": "NF-12345",
  "supplier_name": "Fornecedor Fitness LTDA",
  "supplier_cnpj": "12.345.678/0001-99",
  "total_cost": 5000.00,
  "notes": "Lote de equipamentos novos"
}
```

## 📊 Funcionalidades do Sistema de Lotes

### Endpoints Disponíveis:
- `POST /api/v1/batches/` - Criar lote
- `GET /api/v1/batches/` - Listar lotes
- `GET /api/v1/batches/{id}` - Detalhes do lote
- `GET /api/v1/batches/expired` - Lotes vencidos
- `GET /api/v1/batches/expiring-soon` - Lotes perto do vencimento
- `GET /api/v1/batches/reports/slow-moving` - Relatório de lotes com venda lenta
- `GET /api/v1/batches/reports/best-performing` - Relatório de melhores lotes
- `PUT /api/v1/batches/{id}` - Atualizar lote
- `DELETE /api/v1/batches/{id}` - Deletar lote (soft delete)

### Métricas Automáticas:
- `total_items`: Total de itens no lote
- `items_sold`: Itens vendidos
- `items_remaining`: Itens restantes
- `sell_through_rate`: Taxa de venda (%)
- `roi`: ROI do lote (%)
- `profit`: Lucro absoluto
- `days_since_purchase`: Dias desde a compra

## ⚠️ Notas Importantes

1. **Soft Delete**: Lotes com produtos ativos não podem ser deletados
2. **Unicidade**: Cada `batch_code` deve ser único
3. **Relacionamento**: Produtos ficam vinculados ao lote via `batch_id`
4. **Permissões**: Criar/editar lote requer role ADMIN ou SELLER

## 🔍 Verificação

Para verificar se tudo está funcionando:

```powershell
# 1. Verificar se tabela existe
python -c "from app.core.database import engine; import asyncio; asyncio.run(engine.connect())"

# 2. Testar endpoint
curl http://localhost:8000/api/v1/batches/
```

## ✅ Checklist

- [ ] Tabela `batches` criada
- [ ] Campos batch adicionados em `products`
- [ ] Backend reiniciado
- [ ] Teste de criação de lote bem-sucedido
- [ ] Erro 403 corrigido para 401

---

**Última atualização**: 31/10/2025
**Status**: ✅ Correções aplicadas no código, aguardando execução dos scripts de migração
