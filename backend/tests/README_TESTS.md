# 🧪 Testes Completos do Sistema

Este diretório contém testes end-to-end completos para todos os endpoints da API.

## 📋 Arquivos de Teste

### 1. `test_products_complete.py`
Testes completos para endpoints de **Produtos**:
- ✅ Criar produto
- ✅ Listar produtos
- ✅ Buscar produto por ID
- ✅ Buscar produtos (search)
- ✅ Editar produto
- ✅ Deletar produto (soft delete)
- ✅ Produtos com estoque baixo
- ✅ Produtos por categoria
- ❌ Criar sem autenticação (deve falhar)
- ❌ Criar com SKU duplicado (deve falhar)

### 2. `test_customers_complete.py`
Testes completos para endpoints de **Clientes**:
- ✅ Criar cliente
- ✅ Listar clientes
- ✅ Buscar cliente por ID
- ✅ Buscar clientes (search)
- ✅ Editar cliente
- ✅ Deletar cliente (soft delete)
- ✅ Histórico de vendas do cliente
- ✅ Top clientes
- ❌ Criar sem autenticação (deve falhar)
- ❌ Criar com email duplicado (deve falhar)

### 3. `test_batches_complete.py`
Testes completos para endpoints de **Lotes**:
- ✅ Criar lote
- ✅ Listar lotes
- ✅ Buscar lote por ID
- ✅ Buscar lote por código
- ✅ Buscar lotes (search)
- ✅ Editar lote
- ✅ Deletar lote (soft delete)
- ✅ Lotes por fornecedor
- ✅ Lotes com venda lenta
- ✅ Lotes com melhor performance
- ✅ Lotes vencidos
- ✅ Lotes próximos ao vencimento
- ❌ Criar sem autenticação (deve falhar)
- ❌ Criar com código duplicado (deve falhar)

### 4. `test_sales_complete.py`
Testes completos para endpoints de **Vendas**:
- ✅ Criar venda
- ✅ Listar vendas
- ✅ Buscar venda por ID
- ✅ Cancelar venda
- ✅ Relatório diário
- ✅ Vendas por período
- ✅ Vendas por método de pagamento
- ✅ Produtos mais vendidos
- ✅ Receita por período
- ❌ Criar sem autenticação (deve falhar)
- ❌ Criar com produto inválido (deve falhar)
- ❌ Criar com estoque insuficiente (deve falhar)

### 5. `test_inventory_complete.py`
Testes completos para endpoints de **Inventário**:
- ✅ Movimentação de entrada (IN)
- ✅ Movimentação de saída (OUT)
- ✅ Buscar inventário por produto
- ✅ Listar todo o inventário
- ✅ Listar movimentações
- ✅ Movimentações por produto
- ✅ Ajustar inventário
- ✅ Produtos com estoque baixo
- ✅ Valor total do inventário
- ✅ Inventário por categoria
- ❌ Criar movimentação sem autenticação (deve falhar)
- ❌ Criar movimentação com produto inválido (deve falhar)
- ❌ Saída com estoque insuficiente (deve falhar)
- ❌ Ajustar para quantidade negativa (deve falhar)

## 🚀 Como Executar

### Executar todos os testes:
```powershell
cd backend
python run_all_tests.py
```

### Executar um módulo específico:
```powershell
# Apenas produtos
pytest tests/test_products_complete.py -v

# Apenas clientes
pytest tests/test_customers_complete.py -v

# Apenas lotes
pytest tests/test_batches_complete.py -v

# Apenas vendas
pytest tests/test_sales_complete.py -v

# Apenas inventário
pytest tests/test_inventory_complete.py -v
```

### Executar com cobertura:
```powershell
pytest tests/test_*_complete.py --cov=app --cov-report=html
```

### Executar teste específico:
```powershell
pytest tests/test_products_complete.py::test_create_product -v
```

## 📊 Estrutura dos Testes

Cada arquivo de teste segue o padrão:

1. **Testes de Sucesso (✅)**:
   - Operações CRUD completas
   - Buscas e filtros
   - Relatórios e estatísticas

2. **Testes de Falha (❌)**:
   - Validação de autenticação
   - Validação de dados duplicados
   - Validação de regras de negócio
   - Validação de estoque

3. **Helpers**:
   - Funções auxiliares para criar dados de teste
   - Reutilização de código entre testes

## 🎯 Cobertura de Testes

Os testes cobrem:
- ✅ **API Layer**: Todos os endpoints HTTP
- ✅ **Service Layer**: Lógica de negócio
- ✅ **Repository Layer**: Acesso ao banco
- ✅ **Autenticação**: JWT tokens
- ✅ **Autorização**: Permissões de usuário
- ✅ **Validações**: Dados de entrada
- ✅ **Soft Delete**: Exclusões lógicas
- ✅ **Relacionamentos**: Integridade referencial

## 📝 Convenções

- **Naming**: `test_<ação>_<entidade>`
- **Async**: Todos os testes são `@pytest.mark.asyncio`
- **Fixtures**: `test_client`, `auth_token`, `async_session`
- **Cleanup**: Soft delete automático (is_active=False)
- **Isolamento**: Cada teste é independente

## 🔍 Debugging

Para ver mais detalhes dos testes:
```powershell
# Mostrar prints
pytest tests/test_products_complete.py -v -s

# Parar no primeiro erro
pytest tests/test_products_complete.py -v -x

# Mostrar traceback completo
pytest tests/test_products_complete.py -v --tb=long
```

## 📈 Relatórios

Após executar com cobertura, abra o relatório HTML:
```powershell
# Gerar relatório
pytest tests/test_*_complete.py --cov=app --cov-report=html

# Abrir no navegador
start htmlcov/index.html
```

## ⚠️ Pré-requisitos

1. Backend rodando: `uvicorn app.main:app --reload`
2. Banco de dados criado: `python recreate_db.py`
3. Usuário admin criado: `python create_user.py`
4. Categorias criadas: `python create_categories.py`

## 🎉 Status Atual

- **Total de Testes**: ~70+ testes
- **Módulos Cobertos**: 5/5 (100%)
- **Endpoints Testados**: Todos os principais
- **Casos de Erro**: Todos os principais validados
