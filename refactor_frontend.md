# Plano de Refatoração Frontend — Fitness Store Management
> Gerado em 27/03/2026 | Auditoria 6-pilares | Score atual: 14/24

---

## Sumário Executivo

O app mobile está **funcionalmente robusto** com 54 componentes e 72 telas bem organizadas,
mas tem **dívida de consistência visual significativa**: 15+ cores hardcoded, 30+ valores de
spacing não padronizados, elevações aleatórias e tipografia mista (Paper variant + fontSize direto).

A modernização acontece em **4 fases incrementais**, da fundação até features novas:
1. **Design Tokens** — corrigir a base (theme + tokens)
2. **Componentes** — unificar e modernizar
3. **Identidade da Loja** — logo, cores customizáveis, QR code
4. **Experiência** — animações, dark mode, PWA

---

## Auditoria 6-Pilares (Score Atual: 14/24)

| Pilar              | Score | Principais Problemas |
|--------------------|-------|----------------------|
| Copywriting        |  2/4  | Textos funcionais mas sem personalidade; labels genéricos; sem microcopies |
| Visuals            |  2/4  | Componentes visuais inconsistentes; sem ilustrações; ícones repetitivos |
| Color              |  3/4  | Paleta definida mas 15+ cores hardcoded fora do theme |
| Typography         |  2/4  | Escala definida mas não aplicada: fontWeight '800', fontSize 22/15/13 hardcoded |
| Spacing            |  2/4  | Theme spacing definido mas ignorado em 30+ lugares (gap 6, padding 20, margin -16) |
| Experience Design  |  3/4  | Loading/skeleton bem implementado; empty states básicos; sem animações de transição |

### Inconsistências Críticas Encontradas

**Cores hardcoded (15+ instâncias):**
- `DetailHeader.tsx`: `rgba(76, 175, 80, 0.9)` — deveria ser `Colors.light.success`
- `ListHeader.tsx`: `#7c4dff` no gradiente — cor indefinida no theme
- `ProductCard.tsx`: `#2E7D32`, `#F57C00` — deveria ser `Colors.light.success/warning`
- `ConfirmDialog.tsx`: `#d32f2f`, `#388e3c`, `#e3f2fd` — deveria ser theme

**Spacing hardcoded (30+ instâncias):**
- `ActionButtons.tsx`: `gap: 16` → deveria ser `theme.spacing.md`
- `ConfirmDialog.tsx`: `padding: 32/24` → deveria ser `theme.spacing.xl/md`
- `ListHeader.tsx`: `padding: 20/16` → deveria ser `theme.spacing.md`
- `DetailHeader.tsx`: `marginTop: -16` → hack de posicionamento

**Tipografia inconsistente:**
- `StatCard.tsx`: `fontWeight: '800'` (não existe no theme)
- `ConfirmDialog.tsx`: `fontSize: 22, 15, 13` (hardcoded)
- Mix de `variant` (React Native Paper) + `fontSize` direto nos mesmos contextos

**Elevação caótica:** valores 1, 2, 3, 4, 8, 12, 24 espalhados
sem consistência com `theme.elevation.xs-xl`

---

## Fase 1 — Design Tokens (Fundação)

> **Objetivo:** Corrigir a base. Zero retrabalho nas fases seguintes.

### 1.1 Expandir `constants/Colors.ts`

Adicionar tokens ausentes que causam hardcoding nos componentes:

```typescript
// Adicionar ao theme object:

shadows: {
  // iOS shadows padronizadas (não inventar em cada componente)
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  colored: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  }),
},

fontWeight: {
  regular: '400' as const,
  medium:  '500' as const,
  semibold:'600' as const,
  bold:    '700' as const,
  extrabold:'800' as const, // Adicionar para StatCard
},

// Storebranding — preenchido via Settings
store: {
  name: 'Fitness Store',
  primaryColor: '#667eea',   // Sobrescrito pelo usuário
  secondaryColor: '#764ba2', // Sobrescrito pelo usuário
  logoUri: null as string | null,
  accentColor: '#10B981',
},
```

### 1.2 Criar `constants/tokens.ts`

Arquivo dedicado a variáveis de design que estão hardcoded nos componentes:

```typescript
// Breakpoints para badge sizes
export const BADGE = {
  sm: { fontSize: 10, paddingH: 6, paddingV: 2, borderRadius: 8 },
  md: { fontSize: 12, paddingH: 8, paddingV: 4, borderRadius: 10 },
  lg: { fontSize: 14, paddingH: 12, paddingV: 6, borderRadius: 12 },
};

// Tamanhos de ícone padronizados
export const ICON_SIZE = {
  xs: 14,
  sm: 18,
  md: 24,
  lg: 32,
  xl: 48,
  hero: 80,
};

// Duração de animações
export const ANIMATION = {
  fast: 150,
  normal: 250,
  slow: 400,
  skeleton: 1000,
};
```

### 1.3 Migrar cores hardcoded (15+ arquivos)

| Arquivo | Antes | Depois |
|---------|-------|--------|
| `DetailHeader.tsx` | `rgba(76, 175, 80, 0.9)` | `Colors.light.success + 'E6'` (hex opacity) |
| `DetailHeader.tsx` | `rgba(255, 152, 0, 0.9)` | `Colors.light.warning + 'E6'` |
| `ListHeader.tsx` | `'#7c4dff'` | `Colors.light.secondary` |
| `ProductCard.tsx` | `'#2E7D32'` | `Colors.light.success` |
| `ProductCard.tsx` | `'#F57C00'`, `'#FFF3E0'` | `Colors.light.warning`, `Colors.light.warningLight` |
| `ConfirmDialog.tsx` | `'#d32f2f'`, `'#ffebee'` | `Colors.light.error`, `Colors.light.errorLight` |
| `ConfirmDialog.tsx` | `'#388e3c'`, `'#e8f5e9'` | `Colors.light.success`, `Colors.light.successLight` |

### 1.4 Migrar spacing hardcoded (30+ arquivos)

Criar script de busca para encontrar todos os valores não padronizados:

```bash
# Encontrar padding/margin hardcoded
grep -r "padding: [0-9]" mobile/components --include="*.tsx" | grep -v "theme\."
grep -r "gap: [0-9]" mobile/components --include="*.tsx" | grep -v "theme\."
```

Principais migrações:
- `gap: 16` → `gap: theme.spacing.md`
- `padding: 20` → `padding: theme.spacing.md` (ou lg)
- `padding: 32, 24` → `padding: theme.spacing.xl, theme.spacing.md`
- `borderRadius: 12, 16, 20` → `theme.borderRadius.lg/xl/xxl`

---

## Fase 2 — Modernização de Componentes

> **Objetivo:** Componentes mais modernos, coerentes e extensíveis.

### 2.1 Criar `HeaderBase` — Componente Raiz Unificado

Atualmente há 3 headers (PageHeader, DetailHeader, ListHeader) sem herança comum.
Criar `components/layout/HeaderBase.tsx`:

```typescript
interface HeaderBaseProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode; // Para conteúdo extra (badges, métricas)
  gradient?: [string, string]; // Default: [primary, secondary]
  minimal?: boolean; // ListHeader mode
}
```

PageHeader, DetailHeader e ListHeader passam a ser variantes do HeaderBase.

### 2.2 Criar `Badge` — Componente Único

Substituir as 3 versões de badge espalhadas por um componente padrão:

```typescript
// components/ui/Badge.tsx
interface BadgeProps {
  label: string;
  variant: 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  icon?: string; // Ionicons name
  uppercase?: boolean;
}
```

Uso em: ProductCard, ProductGroupCard, DetailHeader, StatusBadge, CustomerCard.

### 2.3 Modernizar `StatCard`

Redesign com:
- Trend indicator (↑ +12% vs período anterior)
- Sparkline mini (linha de 7 dias)
- Skeleton loading integrado
- Suporte a 3 sizes: sm/md/lg
- Usar `theme.shadows.sm` em vez de elevation hardcoded

```typescript
interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  color?: string;
  trend?: { value: number; label: string }; // ex: { value: 12, label: "vs mês ant." }
  sparkline?: number[]; // últimos 7 valores para mini-gráfico
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}
```

### 2.4 Modernizar `ProductCard` e `ProductGroupCard`

- **Imagem do produto:** suporte a `product.image_url` (já existe no backend)
- **Swipe actions:** deslizar para editar/deletar (react-native-gesture-handler)
- **Stock badge:** gradiente baseado em % de estoque (verde→amarelo→vermelho)
- **Animação de entrada:** FadeIn + SlideUp na lista

### 2.5 Modernizar `EmptyState`

Adicionar variantes:
- `type="empty"` — lista vazia (padrão atual)
- `type="search"` — busca sem resultados
- `type="error"` — erro de carregamento (com retry)
- `type="offline"` — sem conexão

Adicionar animação Lottie ou React Native Reanimated para o ícone.

### 2.6 Modernizar `ConfirmDialog`

- Usar `theme.spacing` e `theme.fontSize` em vez de hardcoded
- Adicionar suporte a conteúdo personalizado no body
- Animação de entrada (slide-up + fade)
- Haptic feedback na confirmação de danger

### 2.7 Bottom Tab Bar Redesign

Redesign da tab bar para visual mais moderno:

```
Opção A: Tab bar com indicador de bolha animada (Material You)
Opção B: Tab bar minimalista flat sem labels (icons only + active indicator)
Opção C: Tab bar com blur background (iOS style glassmorphism)
```

Recomendado: **Opção C** (blur + active indicator pill):
- Background: `BlurView intensity=80` ao invés de fundo branco sólido
- Active indicator: pill colorida abaixo do ícone
- Animação: spring animation na troca de aba
- Sem labels → mais espaço vertical

### 2.8 Página de Detalhes de Produto — Redesign

Layout atual (header + lista) → Layout moderno com:
- Hero image área (aspect ratio 4:3, placeholder gradiente se sem foto)
- Sticky header transparente → opaco com scroll
- Info pills (SKU, Categoria, Brand) em row
- Stock meter visual (gauge circular)
- Tab interna: Detalhes / Histórico / Variações

---

## Fase 3 — Identidade da Loja (Customização)

> **Objetivo:** Cada loja ter sua própria identidade visual no app.

### 3.1 Store Branding System

Criar `store/brandingStore.ts` (Zustand, persistido no AsyncStorage):

```typescript
interface StoreBranding {
  name: string;           // Nome da loja
  tagline?: string;       // Slogan (exibido no login/dashboard)
  logoUri?: string;       // URI da imagem do logo
  primaryColor: string;   // Cor principal (default: #667eea)
  secondaryColor: string; // Cor secundária (default: #764ba2)
  accentColor: string;    // Cor de destaque (default: #10B981)
  darkMode: boolean;      // Preferência do tema
}
```

**Como funciona:**
1. Admin configura em `Settings > Identidade da Loja`
2. Salva no backend (`/api/v1/store/branding`) e AsyncStorage
3. `Colors.ts` lê do `brandingStore` dinamicamente
4. App inteiro re-renderiza com as novas cores

### 3.2 Color Picker — Tela de Personalização

Nova tela `app/settings/branding.tsx`:

```
┌─────────────────────────────────────────┐
│  Identidade da Loja                     │
├─────────────────────────────────────────┤
│  [Logo da loja]  [Escolher imagem]      │
│                                         │
│  Nome da Loja:  [_________________]     │
│  Slogan:        [_________________]     │
│                                         │
│  Cor Principal:  ████  [#667eea]        │
│  Cor Secundária: ████  [#764ba2]        │
│  Cor de Destaque:████  [#10B981]        │
│                                         │
│  Paletas Pré-definidas:                 │
│  [Roxo] [Azul] [Verde] [Laranja] [Rosa] │
│                                         │
│  Preview:                               │
│  ┌────────────────────────────────┐     │
│  │  [Mini preview do app com as  │     │
│  │   cores escolhidas]           │     │
│  └────────────────────────────────┘     │
│                                         │
│         [Salvar Identidade]             │
└─────────────────────────────────────────┘
```

**Paletas pré-definidas:**
```typescript
const PRESET_THEMES = [
  { name: 'Roxo (Padrão)', primary: '#667eea', secondary: '#764ba2', accent: '#10B981' },
  { name: 'Azul Oceano',   primary: '#0EA5E9', secondary: '#0284C7', accent: '#F59E0B' },
  { name: 'Verde Fitness', primary: '#10B981', secondary: '#059669', accent: '#667eea' },
  { name: 'Laranja Energia',primary: '#F97316',secondary: '#EA580C', accent: '#0EA5E9' },
  { name: 'Rosa Vibrante', primary: '#EC4899', secondary: '#DB2777', accent: '#8B5CF6' },
  { name: 'Cinza Neutro',  primary: '#374151', secondary: '#1F2937', accent: '#667eea' },
];
```

### 3.3 Logo da Loja

**Upload do logo:**
- Tela de branding > toque no logo atual > ImagePicker
- Crop circular ou retangular (configurável)
- Upload para `/api/v1/store/logo` (backend salva em `/uploads/logos/`)
- Exibido em:
  - Splash screen customizada
  - Header do Dashboard (substituindo texto "Fitness Store")
  - Tela de login (acima do formulário)
  - Rodapé de recibos/etiquetas
  - WizardComplete (branding no resumo)

**Backend necessário:**
```python
# Novo endpoint
POST /api/v1/store/branding
GET  /api/v1/store/branding
POST /api/v1/store/logo   # upload multipart
```

### 3.4 QR Code de Produtos

#### QR Code por Produto

Cada produto terá QR code gerado automaticamente que codifica:

```json
{
  "type": "fitness-product",
  "id": 42,
  "sku": "WHY-001-P",
  "name": "Whey Protein 1kg",
  "price": 89.90,
  "store": "Fitness Store",
  "v": 1
}
```

**Biblioteca:** `react-native-qrcode-svg`

**Onde usar:**
1. **Etiqueta de produto** (`ProductLabel.tsx`) — já existente, adicionar QR code
2. **Detalhes do produto** — botão "Ver QR Code" → modal com QR em tamanho grande
3. **Scanner no PDV** — `BarcodeScanner.tsx` já lê QR, integrar com o novo formato
4. **Compartilhar produto** — QR code + dados para enviar via WhatsApp

**Componente `ProductQRCode.tsx`:**
```typescript
interface ProductQRCodeProps {
  product: Product;
  size?: number;         // Default: 200
  includePrice?: boolean; // Default: true
  includeLogo?: boolean;  // Default: false (logo no centro do QR)
  variant?: 'modal' | 'label' | 'share';
}
```

**Tela de QR Code** (`app/products/qrcode/[id].tsx`):
```
┌────────────────────────────────┐
│  ← QR Code — Whey Protein      │
├────────────────────────────────┤
│                                │
│         ██████████             │
│         █      █  █            │
│         █  ██  █  █            │
│           [LOGO]               │
│         █  ██  █  █            │
│         █      █  █            │
│         ██████████             │
│                                │
│     Whey Protein 1kg           │
│     SKU: WHY-001-P             │
│     R$ 89,90                   │
│                                │
│  [Imprimir Etiqueta] [Copiar]  │
│  [Compartilhar]  [Baixar PNG]  │
└────────────────────────────────┘
```

### 3.5 Etiquetas com QR Code — Redesign

Redesign do `ProductLabel.tsx` para incluir:
- Logo da loja (canto superior)
- QR Code do produto
- Nome + SKU + Preço + Variação
- Código de barras (alternativo ou adicional)
- Layouts configuráveis: 50x25mm, 40x30mm, 60x40mm

**Formatos de etiqueta:**
```typescript
type LabelFormat =
  | 'small'    // 50x25mm — só nome + preço + barcode
  | 'medium'   // 60x40mm — nome + sku + preço + qr code
  | 'large'    // 80x50mm — tudo + logo + variação
  | 'custom';  // Dimensões customizáveis
```

---

## Fase 4 — Experiência e Modernização Visual

> **Objetivo:** App visualmente moderno, animado e polido.

### 4.1 Animações com React Native Reanimated 3

Adicionar animações em:

**Entrada de telas:**
```typescript
// Fade + slide para todas as telas
const opacity = useSharedValue(0);
const translateY = useSharedValue(20);

useEffect(() => {
  opacity.value = withTiming(1, { duration: 300 });
  translateY.value = withSpring(0);
}, []);
```

**Lista de produtos:**
- Entrada staggered: cada card aparece 50ms após o anterior
- Swipe to delete com animação de saída

**Dashboard StatCards:**
- Counter animation: número sobe de 0 até o valor real
- Entrada com spring bounce

**Tab Bar:**
- Indicador de aba ativo com spring animation

**Wizard steps:**
- Transição entre steps com slide horizontal

### 4.2 Dark Mode Completo

Sistema atual tem `Colors.dark` definido mas não totalmente aplicado.

Implementar:
- `useColorScheme()` hook para detectar sistema
- Override manual via Settings
- Todos os componentes lendo `colors = useThemeColors()` (hook que retorna light ou dark)
- Gradientes adaptados para dark (mais escuros/saturados)
- Skeleton adaptado para dark (cinza mais escuro)

### 4.3 Tela de Login Redesign

Layout moderno com branding da loja:
```
┌─────────────────────────────────────┐
│                                     │
│         [LOGO DA LOJA]              │
│      Fitness Store Manager          │
│         "Seu slogan aqui"           │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Email                        │  │
│  │  [______________________]     │  │
│  │                               │  │
│  │  Senha                        │  │
│  │  [______________________] 👁  │  │
│  │                               │  │
│  │  [       Entrar       ]       │  │
│  │                               │  │
│  │  Esqueci a senha              │  │
│  └───────────────────────────────┘  │
│                                     │
│  Versão 1.0.0 · Fitness Store       │
└─────────────────────────────────────┘
```

### 4.4 Dashboard Redesign

Layout atual: stats grid + gráfico de linhas + top produtos

Layout proposto:
```
┌─────────────────────────────────────┐
│  Bom dia, Victor! 👋                │
│  [LOGO] Fitness Store               │
│  ─────────────────────────────────  │
│  HOJ E · 27 de Março               │
├─────────────────────────────────────┤
│  RESUMO DO DIA                      │
│  ┌────────┐  ┌────────┐            │
│  │ R$850  │  │  12    │            │
│  │ Vendas │  │ Pedidos│            │
│  └────────┘  └────────┘            │
│  ┌────────┐  ┌────────┐            │
│  │ R$320  │  │  3     │            │
│  │ Lucro  │  │ Alertas│            │
│  └────────┘  └────────┘            │
├─────────────────────────────────────┤
│  VENDAS 7 DIAS  ▶ [Ver Relatório]  │
│  [Sparkline Chart]                  │
├─────────────────────────────────────┤
│  ALERTAS DE ESTOQUE (3)            │
│  · Whey Protein — 2 restantes ⚠   │
│  · BCAA 300g — 0 restantes ✗      │
│  [Ver todos]                        │
├─────────────────────────────────────┤
│  ÚLTIMAS VENDAS                     │
│  · João — R$180 · PDV · 14:30      │
│  · Maria — R$92 · PIX · 12:15      │
│  [Ver todas]                        │
└─────────────────────────────────────┘
```

### 4.5 Tela PDV Redesign (Sale Screen)

Melhorias:
- **Busca de produto com autocomplete** visual mais rico (imagem + nome + preço)
- **Carrinho** com animação slide quando produto é adicionado
- **Calculadora de troco** integrada para pagamento em dinheiro
- **Split payment** — pagar parte em dinheiro, parte em cartão
- **Desconto visual** — campo de desconto com preview em tempo real
- **QR Code de pagamento PIX** gerado automaticamente com valor da venda

### 4.6 Notificações Push (PWA-ready)

Infra para notificações locais:
- Alerta de estoque baixo (threshold configurável)
- Lembrete de metas de venda
- Aniversário de clientes VIP

**Biblioteca:** `expo-notifications`

### 4.7 Onboarding Redesign

Onboarding atual genérico → onboarding com setup da loja:

**Passo 1:** Bem-vindo (nome da loja + logo)
**Passo 2:** Configurar identidade visual (cor + logo)
**Passo 3:** Criar primeira categoria
**Passo 4:** Cadastrar primeiro produto (via wizard)
**Passo 5:** Pronto! (com confetti animation)

---

## Roadmap de Implementação

### Sprint 1 — Fundação (1 semana)
- [ ] Expandir `Colors.ts` com `shadows`, `fontWeight`, `store branding`
- [ ] Criar `constants/tokens.ts`
- [ ] Migrar 15+ cores hardcoded para theme
- [ ] Migrar 30+ spacing hardcoded para theme
- [ ] Fix `StatCard` fontWeight '800' → '700' e usar theme
- [ ] Fix `ConfirmDialog` fontSize hardcoded

### Sprint 2 — Componentes Base (1 semana)
- [ ] Criar `HeaderBase.tsx` e migrar PageHeader/DetailHeader/ListHeader
- [ ] Criar `Badge.tsx` unificado e substituir 3 versões
- [ ] Modernizar `StatCard` com trend + sparkline + skeleton
- [ ] Modernizar `EmptyState` com variantes (empty/search/error/offline)
- [ ] Modernizar `ConfirmDialog` com theme + animação

### Sprint 3 — Branding & QR Code (1-2 semanas)
- [ ] Backend: endpoints `/api/v1/store/branding` e `/api/v1/store/logo`
- [ ] `store/brandingStore.ts` (Zustand + AsyncStorage)
- [ ] Tela `app/settings/branding.tsx` com Color Picker
- [ ] Logo upload e exibição no Dashboard/Login
- [ ] `ProductQRCode.tsx` component
- [ ] Tela `app/products/qrcode/[id].tsx`
- [ ] Redesign `ProductLabel.tsx` com QR + logo

### Sprint 4 — UX Moderna (1-2 semanas)
- [ ] Animações React Native Reanimated 3 (lista staggered, counters)
- [ ] Tab bar glassmorphism com spring animation
- [ ] Dark mode completo (hook `useThemeColors`)
- [ ] Login redesign com branding dinâmico
- [ ] Dashboard redesign (layout + alertas de estoque proeminentes)
- [ ] Onboarding redesign com setup de branding

---

## Dependências a Adicionar

```json
{
  "react-native-qrcode-svg": "^6.3.0",
  "react-native-svg": "^15.x",
  "react-native-color-picker": "^0.6.0",
  "@react-native-community/slider": "^4.x",
  "react-native-reanimated": "^3.x",
  "expo-notifications": "^0.x",
  "react-native-gesture-handler": "^2.x"
}
```

> Nota: `react-native-reanimated` e `react-native-gesture-handler` provavelmente já
> estão instalados via Expo. Verificar antes de adicionar.

---

## Backend — Endpoints Necessários (Fase 3)

```python
# app/api/v1/endpoints/store.py

GET  /api/v1/store/branding
     → { name, tagline, primary_color, secondary_color, accent_color, logo_url }

PUT  /api/v1/store/branding
     Body: { name?, tagline?, primary_color?, secondary_color?, accent_color? }

POST /api/v1/store/logo
     Multipart: { logo: File }
     → { logo_url: string }

GET  /api/v1/products/{id}/qrcode
     → { qr_data: string, qr_url: string }
```

**Model `StoreBranding`** (novo):
```python
class StoreBranding(BaseModel):
    name: str
    tagline: Optional[str]
    primary_color: str = '#667eea'
    secondary_color: str = '#764ba2'
    accent_color: str = '#10B981'
    logo_path: Optional[str]
```

---

## Métricas de Sucesso

| Métrica | Atual | Meta |
|---------|-------|------|
| Cores hardcoded | 15+ | 0 |
| Spacing hardcoded | 30+ | 0 |
| Score Auditoria 6-pilares | 14/24 | 20+/24 |
| Componentes sem variante de loading | 8 | 0 |
| Empty states sem variante de erro | 5 | 0 |
| Telas com tema customizado | 0 | 100% |

---

## Arquivos Chave por Fase

### Fase 1 (Design Tokens)
- `mobile/constants/Colors.ts` — expandir theme object
- `mobile/constants/tokens.ts` — criar novo
- `mobile/components/ui/StatCard.tsx` — fix fontWeight
- `mobile/components/ui/ConfirmDialog.tsx` — fix fontSize/spacing
- `mobile/components/layout/ListHeader.tsx` — fix gradient + padding
- `mobile/components/layout/DetailHeader.tsx` — fix status colors + hack margin

### Fase 2 (Componentes)
- `mobile/components/layout/HeaderBase.tsx` — criar novo
- `mobile/components/ui/Badge.tsx` — criar novo
- `mobile/components/ui/StatCard.tsx` — redesign
- `mobile/components/ui/EmptyState.tsx` — variantes

### Fase 3 (Branding)
- `mobile/store/brandingStore.ts` — criar novo
- `mobile/app/settings/branding.tsx` — criar novo
- `mobile/components/products/ProductQRCode.tsx` — criar novo
- `mobile/app/products/qrcode/[id].tsx` — criar novo
- `mobile/components/products/ProductLabel.tsx` — redesign
- `backend/app/api/v1/endpoints/store.py` — criar novo
- `backend/app/models/store_branding.py` — criar novo

### Fase 4 (UX)
- `mobile/app/(auth)/login.tsx` — redesign
- `mobile/app/(tabs)/index.tsx` — dashboard redesign
- `mobile/app/(tabs)/_layout.tsx` — tab bar redesign
- `mobile/hooks/useThemeColors.ts` — criar novo (dark mode)

---

*Plano gerado após auditoria 6-pilares completa de 54 componentes e 72 telas.*
*Prioridade: Fase 1 e 3 têm maior impacto visual com menor risco de regressão.*
