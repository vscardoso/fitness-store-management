# 🔄 Reiniciar Sistema com Rastreabilidade Completa

Este guia explica como limpar o banco de dados e começar do zero com o novo sistema de rastreabilidade de estoque.

---

## 📋 O que mudou?

### ✅ Sistema ANTES (antigo):
- Produtos tinham estoque, mas sem origem conhecida
- Impossível saber de onde veio cada produto
- Cálculos imprecisos de custo e lucro

### ✨ Sistema AGORA (novo):
- **TODO produto está vinculado a uma entrada de estoque**
- Rastreabilidade completa: sabe origem, fornecedor, custo real
- Cálculos precisos baseados em custos reais de compra
- Análises avançadas: ROI por viagem, performance de fornecedores
- Dashboard com métricas reais

---

## 🚀 Passos para Reiniciar

### 1. **Parar o backend** (se estiver rodando)
```powershell
# Pressione Ctrl+C no terminal onde o backend está rodando
```

### 2. **Limpar o banco de dados**
```powershell
cd backend
.\venv\Scripts\Activate.ps1
python reset_database.py
```

**O que esse script faz:**
- ✅ Deleta TODOS os dados de todas as tabelas
- ✅ Mantém a estrutura do banco intacta
- ✅ Prepara para começar do zero
- ⚠️ **ATENÇÃO**: Dados não podem ser recuperados!

### 3. **Recriar categorias**
```powershell
python create_categories.py
```

**Cria categorias padrão:**
- Suplementos
- Roupas Fitness
- Acessórios
- Equipamentos

### 4. **Criar usuário admin**
```powershell
python create_user.py
```

**Credenciais padrão:**
- Email: `admin@fitness.com`
- Senha: `admin123`
- Role: ADMIN

### 5. **Iniciar o backend**
```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 6. **Testar no mobile**

a) **Fazer login:**
   - Email: admin@fitness.com
   - Senha: admin123

b) **Cadastrar primeiro produto COM estoque inicial:**
   ```
   Nome: Whey Protein
   SKU: WHY-001
   Preço: 89.90
   Custo: 45.00
   Estoque Inicial: 10 ← IMPORTANTE!
   Categoria: Suplementos
   ```

   **O que acontece automaticamente:**
   - ✅ Produto criado
   - ✅ Entrada INITIAL_INVENTORY criada (INIT-WHY-001-...)
   - ✅ EntryItem vinculando produto à entrada
   - ✅ Estoque rastreável desde o início!

c) **Verificar no Dashboard:**
   - Valor Investido: R$ 450,00 (10 × R$ 45,00)
   - Receita Potencial: R$ 899,00 (10 × R$ 89,90)
   - Lucro Potencial: R$ 449,00
   - Margem: 99,78%
   - Estoque: 10 unidades

---

## 📊 Novo Dashboard

### Métricas com Rastreabilidade:

**Estoque:**
- **Valor Investido**: Custo REAL baseado em EntryItems
- **Receita Potencial**: Se vender todo estoque
- **Lucro Potencial**: Diferença entre receita e custo
- **Margem Média**: Percentual de lucro
- **Quantidade Total**: Unidades em estoque
- **Produtos**: Total de produtos ativos
- **Estoque Baixo**: Produtos abaixo do mínimo

**Vendas:**
- **Total Hoje**: Vendas do dia atual
- **Ticket Médio**: Valor médio por venda
- **Quantidade**: Número de vendas

**Clientes:**
- **Total**: Clientes ativos no sistema

### Endpoint:
```
GET /api/v1/dashboard/stats
```

---

## 🎯 Tipos de Entrada

Agora você pode criar entradas de diferentes tipos:

| Tipo | Código | Quando usar |
|------|--------|-------------|
| **TRIP** | `trip` | Compra em viagem internacional |
| **ONLINE** | `online` | Compra online (Mercado Livre, etc) |
| **LOCAL** | `local` | Compra em loja local |
| **INITIAL_INVENTORY** | `initial` | Estoque inicial (criado automaticamente) |
| **ADJUSTMENT** | `adjustment` | Ajuste de inventário |
| **RETURN** | `return` | Devolução de cliente |
| **DONATION** | `donation` | Doação ou brinde recebido |

---

## 📝 Workflow Recomendado

### 1. **Cadastrar Produtos com Estoque Inicial**
   - Use `initial_stock` para produtos que você já tem
   - Sistema cria entrada INITIAL_INVENTORY automaticamente

### 2. **Registrar Compras/Viagens**
   - Crie entrada de estoque (TRIP, ONLINE, LOCAL)
   - Adicione produtos e quantidades
   - Sistema vincula tudo automaticamente

### 3. **Fazer Vendas**
   - Sistema usa FIFO (First In, First Out)
   - Desconta das entradas mais antigas primeiro
   - Mantém rastreabilidade completa

### 4. **Analisar Performance**
   - Dashboard mostra métricas reais
   - Detalhes de entradas mostram ROI
   - Identifica produtos parados vs best sellers

---

## 🔍 Verificar Rastreabilidade

### No Backend:
```bash
# Ver todas as entradas
curl http://localhost:8000/api/v1/stock-entries

# Ver entrada específica com produtos
curl http://localhost:8000/api/v1/stock-entries/1

# Ver estatísticas do dashboard
curl http://localhost:8000/api/v1/dashboard/stats
```

### No Mobile:
1. Abra "Entradas" no menu
2. Veja lista de todas as entradas
3. Clique em uma entrada para ver:
   - Produtos vinculados
   - Quantidades vendidas
   - Sell-through rate
   - ROI

---

## 📚 Arquivos Modificados

### Backend:
- ✅ `app/models/stock_entry.py` - Novos tipos de entrada
- ✅ `app/services/product_service.py` - Cria entrada automática
- ✅ `app/api/v1/endpoints/dashboard.py` - Novo endpoint de stats
- ✅ `app/api/v1/router.py` - Registra dashboard endpoint
- ✅ `reset_database.py` - Script de limpeza atualizado

### Mobile:
- ✅ `services/dashboardService.ts` - Novo service
- ✅ `app/(tabs)/index.tsx` - Dashboard atualizado
- ✅ `types/index.ts` - Novos tipos de entrada
- ✅ `app/entries/[id].tsx` - Tela de detalhes padronizada

### Documentação:
- ✅ `CLAUDE.md` - Seção de rastreabilidade adicionada
- ✅ `RESET_AND_START_FRESH.md` - Este guia

---

## 🎉 Resultado Final

Agora você tem:
- ✅ Sistema profissional com rastreabilidade total
- ✅ Dashboard com métricas precisas baseadas em custos reais
- ✅ Análises financeiras corretas (FIFO, ROI, margem)
- ✅ Decisões baseadas em dados reais
- ✅ Auditoria completa de estoque

**Todo produto sabe de onde veio!** 🚀

---

## ❓ FAQ

**P: E se eu já tiver produtos cadastrados?**
R: Execute `python migrate_products_to_entries.py` para criar entradas para produtos existentes.

**P: Posso adicionar estoque manualmente sem entrada?**
R: Não. O sistema agora exige que todo estoque venha de uma entrada para manter rastreabilidade.

**P: Como funciona o FIFO?**
R: Quando você vende, o sistema desconta automaticamente das entradas mais antigas primeiro (quantity_remaining dos EntryItems).

**P: O que acontece se eu deletar uma entrada?**
R: Os EntryItems são deletados em cascata, mas apenas se os produtos não tiverem sido vendidos ainda.

---

**Última atualização:** 2025-11-24
**Versão do Sistema:** 2.0 - Rastreabilidade Completa
