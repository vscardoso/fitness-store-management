# UI-SPEC — Catálogo de Fornecedores
**Status:** draft
**Data:** 2026-04-06
**Feature:** Supplier Catalog — formulário de entrada por item + telas CRUD de fornecedores

---

## 1. Design System Detectado

**Ferramenta:** Nenhuma (React Native sem shadcn). Design system próprio.

| Token | Fonte | Valor |
|-------|-------|-------|
| Cores | `constants/Colors.ts` | Detectadas — ver seção 2 |
| Espaçamento | `theme.spacing` | Detectado — escala de 4pt |
| Tipografia | `theme.fontSize` | Detectada — 7 tamanhos |
| Border radius | `theme.borderRadius` | Detectado |
| Cores de branding | `useBrandingColors()` | Dinâmicas via `brandingStore` |

---

## 2. Tokens de Design

### Espaçamento (escala 4pt)
| Token | Valor | Uso |
|-------|-------|-----|
| `theme.spacing.xs` | 4 | Margem interna mínima, gaps entre ícone e texto |
| `theme.spacing.sm` | 8 | Gap entre itens em linha, padding interno de chips |
| `theme.spacing.md` | 16 | Padding horizontal de tela, espaço entre seções |
| `theme.spacing.lg` | 24 | Separação entre grupos de conteúdo |
| `theme.spacing.xl` | 32 | Padding inferior do header |
| `theme.spacing.xxl` | 48 | Padding inferior de listas com FAB |

Touch targets mínimos: 44px altura (botões inline de formulário).

### Tipografia

Usar **exatamente 4 tamanhos** nesta feature:

| Papel | Token | Valor | Peso | Line-height |
|-------|-------|-------|------|-------------|
| Título de tela (PageHeader) | `theme.fontSize.xl` | 20px | 700 | 24px |
| Rótulo de seção | `theme.fontSize.md` | 14px | 600 | 20px |
| Corpo / valor | `theme.fontSize.md` | 14px | 400 | 20px |
| Legenda / meta | `theme.fontSize.sm` | 12px | 400 | 16px |

Subtítulo de PageHeader: `theme.fontSize.sm` (12px), cor `rgba(255,255,255,0.9)`.

### Paleta de Cores

**Regra 60/30/10:**
- **60% — Superfície dominante:** `Colors.light.background` (`#fff`) + `Colors.light.backgroundSecondary` (`#F8F9FA`)
- **30% — Cards e seções:** `Colors.light.card` (`#fff`) com `elevation: 2`, `borderColor: Colors.light.border` (`#E5E7EB`)
- **10% — Acento:** `brandingColors.primary` reservado para: header gradiente, botão CTA primário, ícones de seção ativos, badge "Mais barato", borda do campo de fornecedor selecionado

**Semânticas:**
| Cor | Token | Uso nesta feature |
|-----|-------|-------------------|
| Sucesso | `Colors.light.success` `#10B981` | Badge "Mais frequente", preço mais baixo destacado |
| Erro | `Colors.light.error` `#EF4444` | Validação de campo obrigatório |
| Aviso | `Colors.light.warning` `#F59E0B` | Fornecedor sem CNPJ cadastrado |
| Texto secundário | `Colors.light.textSecondary` `#6B7280` | Rótulos, metadados |
| Texto terciário | `Colors.light.textTertiary` `#9CA3AF` | Placeholders, datas relativas |

**Valores financeiros** — usar `VALUE_COLORS` (nunca `brandingColors.primary`):
- Preço unitário (neutro): `VALUE_COLORS.neutral` `#11181C`
- Menor preço (positivo): `VALUE_COLORS.positive` `#10B981`

---

## 3. Componentes Existentes a Reutilizar

| Componente | Localização | Uso nesta feature |
|-----------|------------|-------------------|
| `PageHeader` | `components/layout/PageHeader.tsx` | Cabeçalho de todas as telas novas |
| `BottomSheet` | `components/ui/BottomSheet.tsx` | Seleção e cadastro de fornecedor |
| `ConfirmDialog` | `components/ui/ConfirmDialog.tsx` | Confirmação de exclusão de fornecedor |
| `InfoRow` | `components/ui/InfoRow.tsx` | Linhas de dados nos detalhes |
| `FAB` | `components/FAB.tsx` | Lista de fornecedores |

---

## 4. Navegação e Rotas

### Estrutura de Diretórios a Criar
```
mobile/app/suppliers/
  _layout.tsx          ← OBRIGATÓRIO (evita sumir o tab footer)
  index.tsx            ← Lista de fornecedores
  [id].tsx             ← Detalhes do fornecedor
  edit/
    [id].tsx           ← Edição (opcional fase 2)
```

### Registro no Tab Layout
Em `(tabs)/_layout.tsx`, adicionar:
```tsx
<Tabs.Screen name="suppliers" options={{ href: null }} />
```

### Fluxo de Navegação
```
(tabs)/more  ──────────────→  suppliers/index
                                    │
                                    ▼
entries/add (item tap)  →  BottomSheet fornecedor
  BottomSheet "Novo"    →  mini-form inline (sem navegação)
                                    │
                                    ▼
suppliers/index  ──────────→  suppliers/[id]
products/[id]    ──────────→  suppliers/[id]   (tap num fornecedor da seção)

suppliers/[id]  back  →  router.push('/suppliers')   ← regra detail→list
```

### Parâmetros de Rota
- `suppliers/[id].tsx` — recebe `id: string`
- Ao abrir de `products/[id].tsx`, passar `?from=product&productId={id}` para permitir breadcrumb de volta

---

## 5. Especificação por Tela

---

### TELA 1 — Formulário de Entrada (`entries/add.tsx`) — seção de itens

**Modificação:** não cria tela nova. Adiciona campo de fornecedor a cada `EntryItemForm`.

#### 5.1 Layout do Item na Lista (inline compact)

Cada item da lista de produtos da entrada passa de 3 campos para 4:

```
┌─────────────────────────────────────────────────────┐
│  [Ícone produto]  Nome do produto              [✕]  │
│  Variante (se houver)                               │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │  Qtd  ▲▼ │  │  Custo   │  │  Fornecedor     ▼ │ │
│  └──────────┘  └──────────┘  └───────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Especificações do chip de fornecedor:**
- Largura: `flex: 1`, mínimo 100px
- Altura: 44px (mesmo que campos de qtd/custo)
- `backgroundColor`: `Colors.light.backgroundSecondary` quando vazio; `Colors.light.primaryLight` (`#E0E7FF`) quando selecionado
- `borderWidth: 1`, `borderColor`: `Colors.light.border` quando vazio; `brandingColors.primary` quando selecionado
- `borderRadius: theme.borderRadius.md` (8px)
- Texto vazio: "Fornecedor" em `Colors.light.textTertiary` (12px)
- Texto preenchido: nome truncado em 1 linha, `Colors.light.text` (12px, weight 500)
- Ícone `business-outline` (Ionicons) à esquerda, tamanho 14, cor `Colors.light.textSecondary`
- Ícone `chevron-down` à direita, tamanho 12, cor `Colors.light.textTertiary`
- `onPress` → abre `BottomSheet` de seleção de fornecedor

**Tipo adicionado a `EntryItemForm`:**
```ts
supplier_id?: number | null;
supplier_name?: string | null;   // cache para display sem re-fetch
```

---

### TELA 2 — BottomSheet de Seleção de Fornecedor

**Componente:** `components/suppliers/SupplierPickerSheet.tsx` (novo)
**Base:** reutiliza `BottomSheet` existente de `components/ui/BottomSheet.tsx`

#### 5.2 Layout do BottomSheet

```
┌──────────────────────────────────────────┐
│ ▬▬▬  (handle)                            │  ← gradiente brandingColors
│ [business] Selecionar Fornecedor    [✕]  │
│ Produto: Whey Protein 1kg                │
└──────────────────────────────────────────┘
│ ┌────────────────────────────────────┐   │
│ │ 🔍 Buscar fornecedor...            │   │  ← TextInput search
│ └────────────────────────────────────┘   │
│                                          │
│ SUGERIDOS PARA ESTE PRODUTO              │  ← seção, se houver histórico
│ ┌──────────────────────────────────────┐ │
│ │ [icon] Suplementos ABC          R$45 │ │  ← último preço pago
│ │        Último: 3 dias atrás          │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ TODOS OS FORNECEDORES                    │
│ ┌──────────────────────────────────────┐ │
│ │ [icon] Distribuidora XYZ             │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ [icon] Sem fornecedor                │ │  ← sempre disponível
│ └──────────────────────────────────────┘ │
│                                          │
│ [+ Cadastrar novo fornecedor]            │  ← botão secundário
│                                          │
└──────────────────────────────────────────┘
```

**Search bar:**
- `backgroundColor: Colors.light.backgroundSecondary`
- `borderRadius: theme.borderRadius.lg` (12px)
- `paddingHorizontal: 12`, `paddingVertical: 10`
- Ícone `search-outline` à esquerda, 16px, `Colors.light.textTertiary`
- Placeholder: "Buscar por nome ou CNPJ"
- Sem borda visível (apenas fundo secundário)

**Linha de fornecedor:**
- Altura mínima: 56px
- Ícone circular 36x36: `backgroundColor: Colors.light.primaryLight`, ícone `business` 18px em `brandingColors.primary`
- Nome: 14px weight 600, `Colors.light.text`
- Meta (último preço / data): 12px, `Colors.light.textSecondary`
- Fornecedor selecionado: fundo `Colors.light.primaryLight`, check `brandingColors.primary` à direita
- Sem Dividers — gap de 4px entre itens (padding vertical 8px por item)

**Linha "Sem fornecedor":**
- Ícone `remove-circle-outline`, 36x36, `backgroundColor: Colors.light.backgroundSecondary`
- Texto: "Sem fornecedor" em `Colors.light.textSecondary`, 14px weight 400
- Posição: sempre última da lista, antes do botão "Cadastrar novo"

**Botão "Cadastrar novo fornecedor":**
- Estilo: secondary (borda `Colors.light.border`, fundo transparente)
- Ícone: `add-circle-outline`, 16px
- Texto: "Cadastrar novo fornecedor"
- `onPress` → expande mini-form inline dentro do mesmo BottomSheet (sem nova tela)

**Mini-form inline de cadastro (expansível dentro do BottomSheet):**

Aparece abaixo do botão "Cadastrar novo" quando ativado:

```
┌──────────────────────────────────────────┐
│ Nome *                                   │
│ [________________________]               │
│                                          │
│ CNPJ (opcional)    Telefone (opcional)   │
│ [______________]   [______________]      │
│                                          │
│         [Cancelar]  [Salvar]             │
└──────────────────────────────────────────┘
```

- Campo Nome: obrigatório, validação inline em vermelho se vazio ao salvar
- CNPJ: máscara `cnpjMask` já existente em `utils/masks.ts`
- Telefone: máscara `phoneMask` já existente em `utils/masks.ts`
- Botão "Salvar": gradiente `brandingColors.gradient`, 44px altura, `borderRadius: theme.borderRadius.xl` (16px)
- Botão "Cancelar": secondary, mesmo estilo que BottomSheet action secondary
- Ao salvar com sucesso: fecha mini-form e seleciona o fornecedor recém-criado automaticamente

**Estados do BottomSheet:**
- **Loading inicial:** ActivityIndicator centralizado, cor `brandingColors.primary`
- **Sem fornecedores cadastrados:** ícone `business-outline` 48px (`Colors.light.textTertiary`) + texto "Nenhum fornecedor cadastrado" + botão "Cadastrar o primeiro"
- **Sem resultados na busca:** texto "Nenhum resultado para '{termo}'" + sugestão "Cadastrar '{termo}' como novo?"
- **Erro de rede:** ícone `wifi-outline` + "Não foi possível carregar. Tente novamente." + botão "Tentar novamente"

---

### TELA 3 — Detalhes do Produto (`products/[id].tsx`) — seção Fornecedores

**Modificação:** adiciona nova seção ao scroll existente da tela.

#### 5.3 Seção "Fornecedores" no produto

Posição: após seção de estoque/entradas, antes de variantes (ou no fim se variantes não existirem).

**Header da seção:**
```
Fornecedores                           [ver todos →]
```
- Rótulo "Fornecedores": 14px weight 600, `Colors.light.text`
- Link "ver todos →": 12px, `brandingColors.primary`, navega para `suppliers/index?productId={id}`
- Padding horizontal: `theme.spacing.md` (16px)
- `marginTop: theme.spacing.lg` (24px) acima da seção

**Card de fornecedor:**
```
┌──────────────────────────────────────────────────┐
│ [icone] Suplementos ABC          [Mais barato ✓] │
│         CNPJ: 12.345.678/0001-99                 │
│  ─────────────────────────────────────────────── │
│  Último preço    Compras    Última compra         │
│  R$ 42,00        8x         há 3 dias            │
└──────────────────────────────────────────────────┘
```

- `backgroundColor: Colors.light.card`
- `borderRadius: theme.borderRadius.xl` (16px)
- `padding: theme.spacing.md` (16px)
- `marginBottom: theme.spacing.sm` (8px)
- Sombra: `theme.shadows.sm`
- `onPress` → navega para `suppliers/[id]`

**Ícone de fornecedor:**
- 40x40, `borderRadius: 20` (circular)
- `backgroundColor: Colors.light.primaryLight`
- Ícone `business` 20px, cor `brandingColors.primary`

**Badge "Mais barato":**
- `backgroundColor: Colors.light.successLight` (`#D1FAE5`)
- `borderRadius: theme.borderRadius.full` (9999)
- `paddingHorizontal: 8`, `paddingVertical: 3`
- Texto: "Mais barato" 10px weight 600, `Colors.light.success` (`#10B981`)
- Ícone: `trending-down-outline` 10px à esquerda

**Badge "Mais frequente":**
- `backgroundColor: Colors.light.primaryLight` (`#E0E7FF`)
- Texto: "Mais frequente" 10px weight 600, `brandingColors.primary`
- Ícone: `star-outline` 10px à esquerda

**Linha de métricas (último preço / compras / última data):**
- Borda superior: `borderTopWidth: 1`, `borderTopColor: Colors.light.border`, `marginTop: 8`, `paddingTop: 8`
- 3 colunas em `flexDirection: row`, `justifyContent: space-between`
- Rótulo: 10px, `Colors.light.textSecondary`
- Valor: 13px weight 600, `Colors.light.text`
- Último preço usa `VALUE_COLORS.neutral`; se for o menor preço entre fornecedores, usa `VALUE_COLORS.positive`

**Estado vazio da seção:**
- Ícone `business-outline` 32px, `Colors.light.textTertiary`
- Texto: "Nenhum fornecedor registrado" 13px, `Colors.light.textSecondary`
- Subtext: "Informe o fornecedor ao registrar novas entradas"
- Sem botão (ação está no formulário de entrada)

---

### TELA 4 — Detalhes do Fornecedor (`suppliers/[id].tsx`)

**Tela nova.** Segue padrão de detail screen do projeto.

#### 5.4 Header

```
PageHeader:
  title: supplier.name
  subtitle: supplier.cnpj ?? supplier.phone ?? "Sem dados de contato"
  showBackButton: true
  onBack: () => router.push('/suppliers')
  rightActions: [
    { icon: 'pencil', onPress: handleEdit }
  ]
```

#### 5.5 Seção de Contato

Card com `InfoRow` do projeto para cada dado disponível:

| Ícone | Rótulo | Valor |
|-------|--------|-------|
| `business-outline` | CNPJ | valor formatado ou "Não informado" |
| `call-outline` | Telefone | valor ou "Não informado" |
| `calendar-outline` | Cadastrado em | data formatada |

Card: mesmos tokens de card padrão (backgroundColor card, borderRadius xl, padding md, shadow sm).

#### 5.6 Seção "Produtos Comprados"

Header da seção:
```
Produtos comprados           {count} produto{s}
```
- Rótulo: 14px weight 600
- Contador: 12px, `Colors.light.textSecondary`

**Card de produto por fornecedor:**
```
┌────────────────────────────────────────────┐
│ [img/icon]  Whey Protein 1kg               │
│             SKU: WHP-001                   │
│  ───────────────────────────────────────── │
│  Último preço    Compras    Última compra   │
│  R$ 42,00        8x         há 3 dias      │
└────────────────────────────────────────────┘
```

- Mesmo layout de métricas da tela anterior
- `onPress` → navega para `products/[id]`
- Imagem do produto: 48x48, `borderRadius: theme.borderRadius.md` (8px), fallback: ícone `cube-outline` em fundo `Colors.light.primaryLight`

**Estado loading:**
- 3 skeleton cards (View com `backgroundColor: Colors.light.backgroundSecondary`, `borderRadius: theme.borderRadius.xl`, altura 88px, opacity pulsante via Animated)

**Estado vazio:**
- Ícone `cube-outline` 40px, `Colors.light.textTertiary`
- Texto: "Nenhum produto registrado para este fornecedor"

**Estado erro:**
- Ícone `alert-circle-outline` 40px, `Colors.light.error`
- Texto: "Erro ao carregar produtos"
- Botão "Tentar novamente": secondary

#### 5.7 Ação de Exclusão

Botão "Excluir fornecedor" — posição: fim do scroll, `marginTop: 24`, `marginHorizontal: 16`.
- `backgroundColor: Colors.light.errorLight` (`#FEE2E2`)
- `borderRadius: theme.borderRadius.xl`
- `paddingVertical: 14`
- Texto: "Excluir fornecedor" 14px weight 600, `Colors.light.error`
- Ícone: `trash-outline` 16px à esquerda
- `onPress` → `ConfirmDialog` (type: 'danger')

**ConfirmDialog de exclusão:**
- type: `'danger'`
- title: `"Excluir fornecedor?"`
- message: `"Esta ação remove o fornecedor do catálogo. Os históricos de compra vinculados a entradas não serão afetados."`
- confirmText: `"Excluir"`
- cancelText: `"Cancelar"`

---

### TELA 5 — Lista de Fornecedores (`suppliers/index.tsx`)

**Tela nova.**

#### 5.8 Header

```
PageHeader:
  title: "Fornecedores"
  subtitle: "{count} fornecedor{es} cadastrado{s}"
  showBackButton: false   ← tela acessada via more, sem back
  rightActions: []        ← adição via FAB
```

#### 5.9 Busca

Search bar abaixo do PageHeader (fora do gradiente), no container branco:
- `marginHorizontal: 16`, `marginTop: 12`, `marginBottom: 8`
- `backgroundColor: Colors.light.backgroundSecondary`
- `borderRadius: theme.borderRadius.lg` (12px)
- `paddingHorizontal: 12`, `paddingVertical: 10`
- Ícone `search-outline` 16px à esquerda, `Colors.light.textTertiary`
- Placeholder: "Buscar fornecedor..."

#### 5.10 Card de Fornecedor na Lista

```
┌────────────────────────────────────────────────┐
│ [icone 44x44]  Suplementos ABC                 │
│                CNPJ: 12.345.678/0001-99        │
│                12 produtos · Última: 3 dias    │
│                                           [›]  │
└────────────────────────────────────────────────┘
```

- `backgroundColor: Colors.light.card`
- `borderRadius: theme.borderRadius.xl` (16px)
- `padding: theme.spacing.md` (16px)
- `marginHorizontal: theme.spacing.md` (16px)
- `marginBottom: theme.spacing.sm` (8px)
- Sombra: `theme.shadows.sm`
- Ícone circular 44x44: `backgroundColor: Colors.light.primaryLight`, ícone `business` 22px em `brandingColors.primary`
- Nome: 15px weight 600, `Colors.light.text`
- CNPJ/telefone: 12px, `Colors.light.textSecondary`
- Linha de meta "N produtos · Última: X": 12px, `Colors.light.textTertiary`
- Chevron `chevron-forward` 16px, `Colors.light.textTertiary`, alinhado ao centro vertical
- `onPress` → `router.push('/suppliers/{id}')`

#### 5.11 FAB

```
<FAB />
```
Reusa componente existente. Adicionar action em `FAB.tsx`:
```ts
{
  id: 'new-supplier',
  title: 'Novo Fornecedor',
  subtitle: 'Cadastrar no catálogo',
  icon: 'business',
  colors: brandingColors.gradient,
  route: '/suppliers/add',   // OU abre BottomSheet inline
}
```

Alternativa recomendada: FAB abre o mesmo `BottomSheet` com mini-form inline (sem rota `/suppliers/add` separada) para manter o fluxo consistente com o picker de itens.

**Estados:**
- **Loading:** FlatList com 5 skeleton cards (height 80px, borderRadius xl, backgroundColor backgroundSecondary)
- **Vazio:** centralizado verticalmente no espaço disponível
  - Ícone `business-outline` 64px, `Colors.light.textTertiary`
  - Título: "Nenhum fornecedor cadastrado" 18px weight 600, `Colors.light.text`
  - Subtexto: "Adicione fornecedores ao registrar entradas de estoque" 14px, `Colors.light.textSecondary`
- **Sem resultados de busca:**
  - Ícone `search-outline` 48px, `Colors.light.textTertiary`
  - Texto: "Nenhum resultado para \"{termo}\"" 14px, `Colors.light.textSecondary`
- **Erro:**
  - Ícone `alert-circle-outline` 48px, `Colors.light.error`
  - Texto: "Erro ao carregar fornecedores" 14px, `Colors.light.text`
  - Botão "Tentar novamente": secondary, `borderColor: Colors.light.border`

---

## 6. Copywriting

### CTAs Primários

| Contexto | Label |
|----------|-------|
| Botão salvar mini-form | "Salvar fornecedor" |
| Botão no BottomSheet para abrir form | "+ Cadastrar novo fornecedor" |
| FAB ação | "Novo Fornecedor" |
| Botão de edição no header | — (ícone `pencil` sem label) |

### Estados Vazios

| Tela / contexto | Título | Subtexto |
|-----------------|--------|----------|
| Lista de fornecedores | "Nenhum fornecedor cadastrado" | "Adicione fornecedores ao registrar entradas de estoque" |
| Seção de fornecedores no produto | "Nenhum fornecedor registrado" | "Informe o fornecedor ao registrar novas entradas" |
| Produtos no detalhe do fornecedor | "Nenhum produto registrado" | — |
| BottomSheet sem fornecedores | "Nenhum fornecedor cadastrado" | "Cadastre o primeiro abaixo" |

### Estados de Erro

| Contexto | Mensagem |
|----------|----------|
| Falha ao carregar lista | "Erro ao carregar fornecedores" |
| Falha ao salvar fornecedor | "Não foi possível salvar. Verifique os dados e tente novamente." |
| Falha ao excluir | "Não foi possível excluir. O fornecedor pode estar vinculado a entradas." |
| Campo nome vazio | "Nome do fornecedor é obrigatório" |
| CNPJ inválido | "CNPJ inválido" |

### Ações Destrutivas

| Ação | Abordagem |
|------|-----------|
| Excluir fornecedor | `ConfirmDialog` type `'danger'`, confirmText "Excluir", sem timer |

---

## 7. Dados por Tela — Endpoints Necessários

### 7.1 Fornecedor — modelo de dados esperado

```ts
interface Supplier {
  id: number;
  name: string;
  cnpj?: string | null;
  phone?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SupplierProduct {
  product_id: number;
  product_name: string;
  product_sku: string;
  product_image_url?: string | null;
  last_unit_cost: number;
  purchase_count: number;
  last_purchase_date: string;
}

interface ProductSupplier {
  supplier_id: number;
  supplier_name: string;
  supplier_cnpj?: string | null;
  last_unit_cost: number;
  purchase_count: number;
  last_purchase_date: string;
  is_cheapest: boolean;
  is_most_frequent: boolean;
}
```

### 7.2 Endpoints por tela

| Tela | Endpoint | Query Key |
|------|----------|-----------|
| Lista de fornecedores | `GET /api/v1/suppliers` | `['suppliers']` |
| Detalhe do fornecedor | `GET /api/v1/suppliers/{id}` | `['supplier', id]` |
| Produtos do fornecedor | `GET /api/v1/suppliers/{id}/products` | `['supplier-products', id]` |
| Fornecedores do produto | `GET /api/v1/products/{id}/suppliers` | `['product-suppliers', id]` |
| BottomSheet picker | `GET /api/v1/suppliers` + `GET /api/v1/products/{id}/suppliers` | `['suppliers']`, `['product-suppliers', id]` |
| Criar fornecedor | `POST /api/v1/suppliers` | invalida `['suppliers']` |
| Editar fornecedor | `PUT /api/v1/suppliers/{id}` | invalida `['supplier', id]`, `['suppliers']` |
| Excluir fornecedor | `DELETE /api/v1/suppliers/{id}` (soft delete) | invalida `['supplier', id]`, `['suppliers']` |
| Criar entrada com supplier_id por item | `POST /api/v1/stock-entries` (payload existente + `supplier_id` em cada item) | invalida `['stock-entries']`, `['product-suppliers', *]` |

### 7.3 Invalidações após mutations

```ts
// Criar fornecedor
queryClient.invalidateQueries({ queryKey: ['suppliers'] });

// Excluir fornecedor
queryClient.invalidateQueries({ queryKey: ['supplier', id] });
queryClient.invalidateQueries({ queryKey: ['suppliers'] });
queryClient.invalidateQueries({ queryKey: ['product-suppliers'] }); // todos os produtos

// Criar entrada (com supplier_id nos itens)
queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
queryClient.invalidateQueries({ queryKey: ['product-suppliers'] });
queryClient.invalidateQueries({ queryKey: ['supplier-products'] });
```

---

## 8. Componentes a Criar

| Componente | Localização | Descrição |
|-----------|-------------|-----------|
| `SupplierPickerSheet` | `components/suppliers/SupplierPickerSheet.tsx` | BottomSheet de seleção com busca e mini-form |
| `SupplierCard` | `components/suppliers/SupplierCard.tsx` | Card reutilizável para listas (index + seção em produto) |
| `ProductSupplierCard` | `components/suppliers/ProductSupplierCard.tsx` | Card com badges Mais barato / Mais frequente |
| `SupplierMiniForm` | (inline em SupplierPickerSheet) | Mini-form de cadastro rápido, não vira tela separada |
| `suppliers/_layout.tsx` | `app/suppliers/_layout.tsx` | Stack navigator — OBRIGATÓRIO |
| `suppliers/index.tsx` | `app/suppliers/index.tsx` | Lista com busca e FAB |
| `suppliers/[id].tsx` | `app/suppliers/[id].tsx` | Detalhes com seção de produtos |

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|------------|
| `app/entries/add.tsx` | Adicionar campo `supplier_id` / `supplier_name` em `EntryItemForm`; chip inline no card do item; abrir `SupplierPickerSheet` |
| `app/products/[id].tsx` | Adicionar seção "Fornecedores" com `ProductSupplierCard` |
| `app/(tabs)/_layout.tsx` | Registrar rota `suppliers` com `href: null` |
| `app/(tabs)/more.tsx` | Adicionar item "Fornecedores" com ícone `business-outline` |
| `types/index.ts` | Adicionar tipos `Supplier`, `SupplierProduct`, `ProductSupplier` |
| `services/supplierService.ts` | Criar — funções CRUD + endpoints de relação produto-fornecedor |

---

## 9. Padrões Obrigatórios (checklist do executor)

- [ ] `SafeAreaView` de `react-native-safe-area-context`, edges `['top']` em telas de tab
- [ ] `headerShown: false` em todas as novas Stack.Screen
- [ ] `PageHeader` em todas as novas telas — nunca header nativo
- [ ] `useBrandingColors()` para gradient e primary; nunca hardcode de `#667eea`
- [ ] Sem `<Divider>` — usar `marginTop` / `gap`
- [ ] `router.push('/suppliers')` no back de `suppliers/[id].tsx` (regra detail→list)
- [ ] `queryClient.invalidateQueries()` após toda mutation
- [ ] `ConfirmDialog` para exclusão — nunca `Alert.alert`
- [ ] Toque mínimo 44px em todos os elementos interativos
- [ ] `contentContainerStyle={{ paddingBottom: 100 }}` em listas com FAB
- [ ] Sombra via `theme.shadows.sm` nos cards — nunca `elevation` hardcoded
- [ ] Nome capitalizado ao salvar fornecedor (`capitalizeSupplierName` já existe em `entries/add.tsx`)
- [ ] Máscaras CNPJ e telefone via `utils/masks.ts` já existentes

---

## 10. Animações

Seguir padrão existente do `entries/add.tsx` (Reanimated):

- **Entrada de tela:** `headerOpacity` + `headerScale` (360ms, `Easing.out(Easing.quad)`) + conteúdo após 140ms delay
- **BottomSheet:** animação nativa `animationType="slide"` (já implementada em `BottomSheet.tsx`)
- **Mini-form inline:** `withSpring` expand height de 0 → auto ao abrir; `withTiming` opacity 0 → 1 (200ms)
- **Badge "Mais barato":** sem animação — renderizado estático

---

*Spec gerada em 2026-04-06. Consumir junto com `UX_PATTERNS.md` e `constants/Colors.ts` durante implementação.*
