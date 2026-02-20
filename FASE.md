 ⏺ Agora tenho todas as informações necessárias para criar o plano completo. Vou apresentá-lo ao usuário:

 ⏺ ## Análise Completa do Sistema

   ### 1. Sistema Atual de Catálogo

   Fluxo de Criação de Usuário:
   1. Usuário faz signup → SignupService cria Store + User + Subscription
   2. ProductSeedService.seed_fitness_products() cria ~115 produtos com is_catalog=True
   3. Produtos são templates que o usuário pode "ativar" para sua loja

   Problema Atual do Catálogo:
   Cada variação (tamanho/cor) é criada como um produto separado no catálogo:
   - "Camiseta Dry Fit Preta P" - Produto 1
   - "Camiseta Dry Fit Preta M" - Produto 2
   - "Camiseta Dry Fit Preta G" - Produto 3

   Isso não está correto com o novo sistema de variantes! Deveria ser:
   - "Camiseta Dry Fit Preta" - Produto pai com 3 variantes (P, M, G)

   ### 2. Tratamento de Erros Atual

   Componentes Existentes:
   - ErrorBoundary.tsx - Captura erros React não tratados
   - ConfirmDialog.tsx - Exibe diálogos de sucesso/erro/aviso
   - api.ts - Trata erros HTTP (401, 403, rede)

   Problemas:
   - Tratamento disperso em cada tela
   - Não há componente centralizado para erros de API
   - Mensagens de erro não são consistentes

   ---

   ## Plano de Implementação

   ### FASE 1: Componente de Tratamento de Erros

   1.1 Criar `ApiErrorHandler` - Componente centralizado
   ``typescript
   // mobile/components/ui/ApiErrorHandler.tsx
   - Hook useApiError() para capturar e formatar erros
   - Mapeamento de códigos HTTP para mensagens amigáveis
   - Integração com React Query (onError global)
   - Toast/Snackbar para erros temporários
   - Modal para erros críticos
   `

   **1.2 Criar ErrorSnackbar - Feedback visual rápido**
   `typescript
   // mobile/components/ui/ErrorSnackbar.tsx
   - Snackbar animado para erros leves
   - Auto-dismiss após 4 segundos
   - Ação de "Tentar novamente"
   `

   **1.3 Integrar no _layout.tsx principal**
   - Configurar React Query com tratamento global de erros
   - Adicionar ErrorSnackbar no root layout

   ### FASE 2: Reestruturar Catálogo com Variantes Corretas

   **2.1 Atualizar ProductSeedService**
   `python
   # Novo formato de dados:
   products = [
       {
           "name": "Camiseta Dry Fit Preta",
           "brand": "Nike",
           "base_price": 69.90,
           "variants": [
               {"size": "P", "cost_price": 35.00, "price": 69.90},
               {"size": "M", "cost_price": 35.00, "price": 69.90},
               {"size": "G", "cost_price": 35.00, "price": 69.90},
               {"size": "GG", "cost_price": 35.00, "price": 69.90},
           ]
       }
   ]
   `

   **2.2 Criar script de migração**
   - Script para converter catálogo existente para novo formato
   - Agrupar produtos por nome base
   - Criar variantes apropriadas

   **2.3 Atualizar endpoint de ativação**
   - Permitir selecionar qual variante ativar
   - Ou ativar produto com todas as variantes

   ### FASE 3: Plano de Exclusão/Limpeza

   **3.1 Script para limpar catálogo antigo**
   `python
   # backend/reset_catalog.py
   - Remover produtos do catálogo atual
   - Recriar com estrutura de variantes correta
   `

   **3.2 Criar novos produtos com variantes adequadas**
   - ~30-40 produtos pais com múltiplas variantes cada
   - Total de ~100+ variantes (mesmo número de SKUs)

   ---

   ## Resumo das Tarefas

   | Fase | Tarefa | Arquivos |
   |------|--------|----------|
   | 1.1 | Criar ApiErrorHandler | mobile/components/ui/ApiErrorHandler.tsx |
   | 1.2 | Criar ErrorSnackbar | mobile/components/ui/ErrorSnackbar.tsx |
   | 1.3 | Integrar no layout | mobile/app/_layout.tsx |
   | 2.1 | Atualizar ProductSeedService | backend/app/services/product_seed_service.py |
   | 2.2 | Criar script migração | backend/migrate_catalog_variants.py |
   | 2.3 | Atualizar ativação | backend/app/services/product_service.py |
   | 3.1 | Criar script limpeza | backend/reset_catalog.py |
   | 3.2 | Testar fluxo completo | backend/test_catalog_roundtrip.py` |

   ---

   Deseja que eu prossiga com este plano? Por favor, toggle to Act mode (Tab) para iniciar a implementação.