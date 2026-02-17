# Work In Progress - AI Scanner + Wizard

**Última atualização:** 2026-02-13 (corrigido)

## ⚡ Wizard de Criação de Produtos - FUNCIONANDO

**Data:** 13/02/2026
**Status:** Implementado e corrigido - pronto para teste
**Mudança:** Novo fluxo unificado de criação de produtos em 3 etapas

### Fluxo Visual

```
┌─────────────────────────────────────────────────────────────┐
│  [1. Identificar] ──── [2. Confirmar] ──── [3. Entrada]     │
│       ●                    ○                   ○            │
└─────────────────────────────────────────────────────────────┘

STEP 1: Escolhe Scanner ou Manual
  ├── Scanner: Câmera → IA analisa → Mostra resultado
  └── Manual: Nome + Categoria básicos

STEP 2: Resumo dos dados
  ├── Card com nome, SKU, preços, categoria
  ├── Botão "Editar" → modal com formulário completo
  ├── Painel de duplicados (se houver similares)
  └── Botão "Criar Produto"

STEP 3: Produto criado! Próximo passo:
  ├── "Nova Entrada" (recomendado) → /entries/add
  └── "Pular" → volta para lista de produtos
```

---

## Feature 1: Wizard de Criação de Produtos (NOVO)

### Status: IMPLEMENTADO - Pronto para teste

### O que foi feito:

#### Novos Arquivos Criados
- [x] `mobile/types/wizard.ts` - Tipos do wizard (WizardStep, WizardState, etc.)
- [x] `mobile/hooks/useProductWizard.ts` - Hook de orquestração do wizard
- [x] `mobile/components/products/WizardStepper.tsx` - Indicador visual de progresso
- [x] `mobile/components/products/WizardStep1.tsx` - Etapa Identificar (Scanner/Manual)
- [x] `mobile/components/products/WizardStep2.tsx` - Etapa Confirmar (Resumo + Edição)
- [x] `mobile/components/products/WizardStep3.tsx` - Etapa Entrada (Vincular estoque)
- [x] `mobile/app/products/wizard.tsx` - Tela principal do wizard

#### Arquivos Modificados
- [x] `mobile/hooks/index.ts` - Export do useProductWizard
- [x] `mobile/app/(tabs)/products.tsx` - FAB e botão scan agora vão para /products/wizard
- [x] `mobile/constants/Colors.ts` - Adicionados tokens xxs ao spacing e fontSize

### Fluxo do Wizard

```
┌─────────────────────────────────────────────────────────────┐
│  [1. Identificar] ──── [2. Confirmar] ──── [3. Entrada]     │
│       ●                    ○                   ○            │
└─────────────────────────────────────────────────────────────┘

Etapa 1: Identificar Produto
├── Scanner IA (foto do produto)
└── Manual (nome + categoria)

Etapa 2: Confirmar Dados
├── Resumo visual (nome, SKU, preços, categoria)
├── Botão Editar (modal com formulário completo)
└── Painel de Duplicados (produtos similares)

Etapa 3: Vincular Entrada
├── Nova Entrada (recomendado FIFO)
├── Entrada Existente
└── Pular (com aviso)
```

### Pontos de Entrada

| Entrada | Rota | Comportamento |
|---------|------|---------------|
| **FAB (+)** | `/products/wizard` | Mostra escolha: Scanner / Manual |
| **Botão Scan (header)** | `/products/wizard?method=scanner` | Já inicia no Scanner direto |

### Para testar:

1. Abrir app mobile
2. Ir para aba "Produtos"
3. **Via FAB (+)**: Mostra opções Scanner/Manual
4. **Via botão Scan**: Já abre câmera/galeria direto
5. Seguir fluxo do wizard:
   - Capturar/analisar produto (se scanner)
   - Revisar/editar dados
   - Criar produto
   - Vincular a entrada de estoque

### Benefícios

- UX mais clara com indicador de progresso
- Scanner IA e Manual no mesmo fluxo
- Edição completa antes de criar
- Detecção de duplicados integrada
- Vinculação FIFO direta
- Back navigation seguro (confirmação de perda de dados)

---

## Feature 2: Scanner de Produtos com IA (OpenAI GPT-4o Vision)

### Status: IMPLEMENTADO - Pronto para teste

### O que foi feito:

#### Backend (100%)
- [x] `backend/app/core/config.py` - Configs: OPENAI_API_KEY, AI_SCAN_ENABLED, etc.
- [x] `backend/app/schemas/ai.py` - Schemas Pydantic para request/response
- [x] `backend/app/services/ai_scan_service.py` - Serviço completo com:
  - Análise de imagem via **OpenAI GPT-4o Vision API**
  - Detecção automática de duplicados
  - Geração automática de SKU
  - Sugestão de preços baseada em histórico
  - Categorização automática
- [x] `backend/app/api/v1/endpoints/ai.py` - Endpoints:
  - `POST /api/v1/ai/scan-product` - Analisa imagem
  - `GET /api/v1/ai/status` - Status do serviço
- [x] `backend/app/api/v1/router.py` - Router incluído
- [x] `backend/requirements.txt` - Pacote `openai` adicionado

#### Mobile (100%)
- [x] `mobile/types/index.ts` - Types: ProductScanResult, AIStatusResponse, DuplicateMatch
- [x] `mobile/services/aiService.ts` - Funções: scanProductImage(), getAIStatus()
- [x] `mobile/hooks/useAIScanner.ts` - Hook completo com:
  - Captura de foto (câmera)
  - Seleção da galeria
  - Análise de imagem
  - Criação de produto
  - Detecção de duplicados
  - Edição manual
- [x] `mobile/hooks/index.ts` - Export do useAIScanner
- [x] `mobile/app/products/scan.tsx` - Tela do scanner (standalone, ainda funciona)
- [x] `mobile/components/FAB.tsx` - Scanner IA via wizard

### Para testar:

#### 1. Backend
```powershell
cd backend
.\venv\Scripts\Activate.ps1

# Adicionar no .env:
# OPENAI_API_KEY=sua-chave-api-aqui
# Veja OPENAI_SETUP_GRATUITO.md para obter chave grátis!

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Como obter API Key grátis:** Veja `OPENAI_SETUP_GRATUITO.md`
**Créditos:** $5 USD grátis (~250-500 scans)
**Validade:** 3 meses

#### 2. Mobile
```powershell
cd mobile
npm install
.\expo-dev.ps1
```

#### 3. Testar
1. Abrir app no emulador/device
2. Ir para aba Produtos
3. Clicar no FAB (+)
4. Escolher "Scanner IA"
5. Tirar foto de um produto ou escolher da galeria
6. Aguardar análise
7. Verificar dados extraídos
8. Criar produto e vincular entrada

---

## Erros TypeScript Conhecidos (Pré-existentes)

Alguns arquivos têm erros de tipo que são pré-existentes e não relacionados ao wizard:

- `app/(tabs)/conditional/[id].tsx` - Tipos de ShipmentStatus desatualizados
- `app/(tabs)/more.tsx` - Comparação de roles com strings
- `hooks/usePushNotifications.ts` - API do Expo Notifications mudou
- `components/sale/BarcodeScanner.tsx` - Props do Modal

Esses erros não afetam o funcionamento do wizard e devem ser corrigidos em uma task separada.

---

## Possíveis melhorias futuras:
- [ ] Cache de resultados de scan
- [ ] Histórico de scans
- [ ] Modo batch (múltiplas fotos)
- [ ] Treinamento customizado por loja
- [ ] Integração com catálogo de fornecedores
- [ ] Opção de selecionar produto do catálogo no wizard
