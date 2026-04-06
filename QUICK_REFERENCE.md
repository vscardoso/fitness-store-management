# 🚀 Guia Rápido - Comandos de Orquestração

## 📌 Como Usar Este Sistema

### 1. Copie o Comando Base
```
🔄 FULL-STACK [TIPO]: [descrição da mudança]
```

### 2. Escolha o Tipo Correto

| Tipo | Quando Usar | Exemplo |
|------|-------------|---------|
| **ADD-FIELD** | Adicionar campo a entidade existente | `🔄 FULL-STACK ADD-FIELD: Adicionar campo "neighborhood" ao Customer` |
| **NEW-FEATURE** | Criar nova funcionalidade completa | `🔄 FULL-STACK NEW-FEATURE: Sistema de envios condicionais` |
| **MODIFY-FLOW** | Alterar fluxo/comportamento existente | `🔄 FULL-STACK MODIFY-FLOW: Permitir edição de envios enviados` |
| **FIX-INCONSISTENCY** | Corrigir dados/status inconsistentes | `🔄 FULL-STACK FIX-INCONSISTENCY: Status não atualiza após ação` |
| **REFACTOR** | Melhorar código sem mudar funcionalidade | `🔄 FULL-STACK REFACTOR: Otimizar queries de listagem` |
| **UI-UPGRADE** | Atualizar tela existente com todos os padrões visuais atuais | `🔄 FULL-STACK UI-UPGRADE: Tela de listagem de clientes` |

### 3. Cole no Chat e Aguarde

Claude vai:
1. ✅ Ler AGENT_ORCHESTRATION.md
2. ✅ Identificar camadas afetadas
3. ✅ Chamar agentes na ordem correta
4. ✅ Validar cada etapa
5. ✅ Reportar status completo

---

## ⚡ Comandos Prontos para Copiar

### Adicionar Campos

```bash
# Adicionar campo de texto simples
🔄 FULL-STACK ADD-FIELD: Adicionar campo "complemento" ao endereço do Cliente

# Adicionar campo com relação
🔄 FULL-STACK ADD-FIELD: Adicionar campo "categoria_id" ao Produto

# Adicionar campo calculado
🔄 FULL-STACK ADD-FIELD: Adicionar campo "idade" calculado a partir de birth_date
```

### Criar Features

```bash
# Feature completa
🔄 FULL-STACK NEW-FEATURE: Sistema de cupons de desconto

# Sub-módulo de feature
🔄 FULL-STACK NEW-FEATURE: Relatório de vendas por período

# Integração externa
🔄 FULL-STACK NEW-FEATURE: Integração com WhatsApp Business API
```

### Atualizar Tela com Padrões Visuais Atuais (UI-UPGRADE)

```bash
# Tela simples (listagem, detalhes)
🔄 FULL-STACK UI-UPGRADE: Tela de listagem de clientes

# Tela com formulário
🔄 FULL-STACK UI-UPGRADE: Tela de edição de produto

# Tela com dados financeiros
🔄 FULL-STACK UI-UPGRADE: Tela de vendas por período

# Múltiplas telas de um módulo
🔄 FULL-STACK UI-UPGRADE: Módulo de envios (listagem + detalhes + formulário)
```

---

## 📋 Prompts Prontos — UI-UPGRADE (copiar e colar direto no chat)

> Substitua `[NOME DA TELA]` e `[CAMINHO]` antes de enviar.

---

### Prompt 1 — Tela de Listagem

```
🔄 FULL-STACK UI-UPGRADE: [NOME DA TELA] — [CAMINHO]

Aplicar todos os padrões visuais atuais do projeto:

1. Header → substituir por `<PageHeader title="..." subtitle="..." showBackButton onBack={...} />`
   - PageHeader já usa `useBrandingColors()` internamente. Não passar gradientColors manual.

2. Cards → substituir `<Card>` do react-native-paper por `<View>` com:
   { backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl,
     borderWidth: 1, borderColor: Colors.light.border, ...theme.shadows.sm }

3. Cores de marca → substituir hex hardcoded por `useBrandingColors()`:
   const brandingColors = useBrandingColors(); // primary, secondary, accent, gradient

4. Animação de entrada → usar useFocusEffect (obrigatório em tabs):
   header: scale 0.94→1 + opacity 0→1 (spring)
   conteúdo: translateY 24→0 + opacity 0→1 (delay 140ms, spring)

5. Lista → FlatList com:
   - contentContainerStyle: { paddingBottom: theme.spacing.xxl, gap: theme.spacing.sm }
   - ListEmptyComponent: ícone contextual + título + subtítulo (não texto puro)
   - showsVerticalScrollIndicator: false

6. FAB → cor via brandingColors.primary (não hardcoded)

Não alterar: lógica de negócio, queries, navegação, outros arquivos.
```

---

### Prompt 2 — Tela com Dados Financeiros

```
🔄 FULL-STACK UI-UPGRADE: [NOME DA TELA] — [CAMINHO]

Aplicar padrões visuais atuais com foco em dados financeiros:

1. Header → `<PageHeader>` (useBrandingColors internamente)

2. Valores financeiros → substituir cores hardcoded por VALUE_COLORS:
   import { VALUE_COLORS } from '@/constants/Colors';
   - receita, lucro, positivo  → VALUE_COLORS.positive  (#10B981)
   - custo, prejuízo, negativo → VALUE_COLORS.negative  (#EF4444)
   - preço, quantidade neutra  → VALUE_COLORS.neutral   (#11181C)
   - alerta, atenção           → VALUE_COLORS.warning   (#F59E0B)

   Helper disponível: import { valueColor } from '@/utils/format';
   valueColor(valor, 'profit' | 'revenue' | 'cost' | 'auto')

3. Valores monetários → aplicar:
   { fontSize: 18–28, fontWeight: '800', letterSpacing: -0.5 }

4. Cards → <View> direto (sem react-native-paper <Card>)

5. Animação de entrada → useFocusEffect com spring/timing

6. Badges de status → backgroundColor: COR + '18', borderRadius: theme.borderRadius.sm
   texto: fontSize: 10, fontWeight: '700', UPPERCASE

Não alterar: lógica de cálculo, queries, navegação, outros arquivos.
```

---

### Prompt 3 — Tela com Formulário

```
🔄 FULL-STACK UI-UPGRADE: [NOME DA TELA] — [CAMINHO]

Aplicar padrões visuais atuais com foco em formulários:

1. Header → `<PageHeader title="..." showBackButton onBack={router.back} />`

2. Inputs → substituir <TextInput mode="outlined"> do Paper por TextInput nativo:
   style: { backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl,
            borderWidth: 1, borderColor: Colors.light.border,
            paddingHorizontal: theme.spacing.md, height: 52,
            fontSize: theme.fontSize.base, color: Colors.light.text }
   placeholderTextColor: Colors.light.textTertiary

3. Botão primário → substituir <Button mode="contained"> do Paper por:
   <TouchableOpacity style={{ borderRadius: theme.borderRadius.xl, overflow: 'hidden' }} activeOpacity={0.8}>
     <LinearGradient colors={brandingColors.gradient} start={{x:0,y:0}} end={{x:1,y:0}}
       style={{ paddingVertical: 16, alignItems: 'center', flexDirection: 'row',
                justifyContent: 'center', gap: 8 }}>
       <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
       <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Salvar</Text>
     </LinearGradient>
   </TouchableOpacity>

4. Labels de seção → UPPERCASE, fontSize: 10–12, fontWeight: '600', letterSpacing: 0.5,
   color: Colors.light.textTertiary

5. Animação de entrada → useFocusEffect (header + conteúdo)

6. KeyboardAvoidingView → behavior: Platform.OS === 'ios' ? 'padding' : undefined

Não alterar: validações, lógica de submit, navegação, outros arquivos.
```

---

### Prompt 4 — Correção Cirúrgica de Cores (sem refatorar estrutura)

```
🔄 FULL-STACK UI-UPGRADE: [NOME DA TELA] — somente cores

Corrigir apenas as referências de cor fora do padrão. NÃO alterar estrutura, layout ou lógica.

1. Cores de marca hardcoded → useBrandingColors():
   const brandingColors = useBrandingColors(); // importar de @/store/brandingStore
   Substituir: '#6366F1', '#8B5CF6', Colors.light.primary, Colors.light.secondary
   Por: brandingColors.primary, brandingColors.secondary, brandingColors.gradient

2. Cores financeiras hardcoded → VALUE_COLORS:
   import { VALUE_COLORS } from '@/constants/Colors';
   Substituir: '#10B981', '#EF4444', '#F59E0B', Colors.light.success, Colors.light.error
   Por: VALUE_COLORS.positive, VALUE_COLORS.negative, VALUE_COLORS.warning

3. Cores em StyleSheet.create que dependem de hook → mover para inline style no JSX
   (StyleSheet não aceita valores de hooks, isso causa bug silencioso)

4. buttonColor, color, tintColor em componentes do Paper → usar brandingColors.primary inline

Não alterar: estrutura JSX, lógica, queries, navegação, outros arquivos.
```

---

**O que será feito automaticamente:**

| Componente | Antes (legado) | Depois (padrão atual) |
|------------|---------------|----------------------|
| Header | `LinearGradient` hardcoded | `<PageHeader>` + `useBrandingColors()` |
| Cards | `<Card>` do react-native-paper | `<View>` com styles diretos |
| Textos em cards | `<Text>` do Paper | `<Text>` do react-native |
| Cores de marca | hex hardcoded (`#6366F1`) | `brandingColors.primary` |
| Dados financeiros | hex hardcoded (`#10B981`) | `VALUE_COLORS.positive/negative/warning` |
| Espaçamentos | valores px avulsos (`16`) | tokens `theme.spacing.md` |
| Tipografia | valores px avulsos (`14`) | tokens `theme.fontSize.md` |
| BorderRadius | valores px avulsos (`12`) | tokens `theme.borderRadius.lg` |
| Animação de entrada | nenhuma ou `useEffect([])` | `useFocusEffect` com spring/timing |
| FAB | cor hardcoded | `brandingColors.primary` |
| Botão primário | `<Button mode="contained">` do Paper | `TouchableOpacity + LinearGradient` |
| Estado vazio | texto puro | `ícone contextual + título + subtítulo` |
| Estado de loading | `ActivityIndicator` solto | loading com ícone na cor branding |

**Checklist específico do UI-UPGRADE:**

- [ ] `PageHeader` importado de `@/components/layout/PageHeader` (não criar header manual)
- [ ] `useBrandingColors()` importado de `@/store/brandingStore`
- [ ] `VALUE_COLORS` importado de `@/constants/Colors` (apenas para dados financeiros)
- [ ] Zero `<Card>` ou `<Text>` do `react-native-paper` em cards/modais críticos
- [ ] Zero hex hardcoded em componentes (tudo via tokens)
- [ ] `useFocusEffect` com animação header (scale+opacity) + conteúdo (translateY+opacity)
- [ ] `FlatList` com `ListEmptyComponent` visual (ícone + texto + subtexto)
- [ ] `paddingBottom: theme.spacing.xxl` no fim de listas (gesture bar)
- [ ] `flexShrink: 0` em colunas de valor monetário (direita)
- [ ] `minWidth: 0` em colunas de texto variável (esquerda)
- [ ] `numberOfLines` em todos os textos de comprimento dinâmico
- [ ] `activeOpacity` em todos os `TouchableOpacity` (0.65–0.8)
- [ ] `hitSlop` em botões com área tátil < 44px

---

### Modificar Fluxos

```bash
# Alterar validação
🔄 FULL-STACK MODIFY-FLOW: Permitir venda sem estoque (sob pedido)

# Adicionar etapa
🔄 FULL-STACK MODIFY-FLOW: Adicionar confirmação antes de deletar produto

# Mudar comportamento
🔄 FULL-STACK MODIFY-FLOW: Atualizar estoque em tempo real durante venda
```

### Corrigir Inconsistências

```bash
# Dados dessincronizados
🔄 FULL-STACK FIX-INCONSISTENCY: Campo "neighborhood" não aparece nos forms

# Status incorreto
🔄 FULL-STACK FIX-INCONSISTENCY: Status permanece "PENDING" após enviar

# Cache desatualizado
🔄 c Lista não atualiza após criar item

🔄 FULL-STACK FIX-INFO: O que é inconsistente? Qual comportamento esperado? Qual erro aparece?

🔄 FULL-STACK FIX-TEST: Teste todo o fluxo do contexto criado ou alterado
```

---

## 🎯 Atalhos para Situações Comuns

### "Falta um campo no formulário"
```bash
🔄 FULL-STACK ADD-FIELD: Adicionar campo "[nome_campo]" ao [Entidade]
```

### "Preciso de uma nova tela/funcionalidade"
```bash
🔄 FULL-STACK NEW-FEATURE: [Descrição da funcionalidade]
```

### "O status/dado não está atualizando"
```bash
🔄 FULL-STACK FIX-INCONSISTENCY: [Descrição do problema]
```

### "A tela está fora do padrão visual atual (header, cores, cards)"
```bash
🔄 FULL-STACK UI-UPGRADE: [nome da tela ou módulo]
```

### "Os botões estão feios/fora do padrão"
```bash
🔄 FULL-STACK UI-UPGRADE: [nome da tela] — focar em botões e FAB
```

### "Quero mudar como algo funciona"
```bash
🔄 FULL-STACK MODIFY-FLOW: [Descrição da mudança desejada]
```

---

## 🎨 Padrões de Sistema, Tela e UX

### Cores do Sistema (`mobile/constants/Colors.ts`)

```typescript
Colors.light = {
  // Primárias
  primary: '#6366F1',        // Roxo - ações principais, FAB, headers
  secondary: '#8B5CF6',      // Roxo claro - gradientes

  // Feedback
  success: '#10B981',        // Verde - sucesso, ativo, dinheiro
  warning: '#F59E0B',        // Amarelo - alertas, pendente
  error: '#EF4444',          // Vermelho - erros, deletar, inativo
  info: '#3B82F6',           // Azul - informação, links

  // Fundos
  background: '#FFFFFF',           // Fundo principal
  backgroundSecondary: '#F3F4F6',  // Fundo de telas (cinza claro)
  card: '#FFFFFF',                 // Cards e inputs

  // Textos
  text: '#11181C',           // Texto principal (quase preto)
  textSecondary: '#6B7280',  // Texto secundário (cinza)
  textTertiary: '#9CA3AF',   // Texto terciário (cinza claro)

  // Bordas
  border: '#E5E7EB',         // Bordas sutis
}
```

### Estrutura Padrão de Telas

```
┌─────────────────────────────────┐
│  HEADER (LinearGradient)        │  ← primary → secondary
│  ┌─────────────────────────┐    │
│  │ ← Back    Título    [?] │    │  ← Botão voltar + Título + HelpButton
│  │          Subtítulo       │    │
│  └─────────────────────────┘    │
│  borderBottomRadius: 24         │
├─────────────────────────────────┤
│  SEARCHBAR (se aplicável)       │  ← marginHorizontal: 16
├─────────────────────────────────┤
│  FILTROS (Chips)                │  ← flexDirection: 'row', gap: 8
├─────────────────────────────────┤
│                                 │
│  CONTEÚDO (FlatList/ScrollView) │  ← paddingHorizontal: 16
│                                 │
│  ┌─────────────────────────┐    │
│  │ Card Item               │    │  ← borderRadius: 16, elevation: 2
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ Card Item               │    │
│  └─────────────────────────┘    │
│                                 │
│                        [FAB] ●  │  ← position: absolute, bottom: 24
└─────────────────────────────────┘
```

### Padrões de Header

```typescript
// Header com gradiente (PADRÃO)
<LinearGradient
  colors={[Colors.light.primary, Colors.light.secondary]}
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 1 }}
  style={{
    paddingTop: 50,              // StatusBar + espaço
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  }}
>
  {/* Conteúdo */}
</LinearGradient>
```

### Padrões de Cards

```typescript
// Card padrão para listas
const cardStyle = {
  borderRadius: 16,
  elevation: 2,
  backgroundColor: Colors.light.card,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  marginBottom: 12,
};
```

### Padrões de Formulários

```typescript
// TextInput padrão (react-native-paper)
<TextInput
  label="Nome do Campo *"
  value={value}
  onChangeText={setValue}
  mode="outlined"                    // SEMPRE outlined
  style={{
    marginBottom: 12,
    backgroundColor: Colors.light.card
  }}
  left={<TextInput.Icon icon="icon-name" />}  // Ícone opcional
/>

// Campos obrigatórios: Label + " *"
// Validação: Alert.alert('Erro', 'Mensagem clara')
```

### Padrões de Botões

> ⚠️ **NUNCA usar `<Button>` do react-native-paper para ações principais.** O padrão do projeto é `TouchableOpacity + LinearGradient` para primário e `TouchableOpacity` outlined para secundário/destrutivo.

#### Grupo de botões no final da página (padrão canônico)

Botões ficam **dentro do ScrollView**, no final do conteúdo — nunca em barra fixa separada.

```typescript
// Container
<View style={styles.actions}>
  {/* Botão secundário (ex: Fotos, Cancelar) */}
  <TouchableOpacity
    style={[styles.actionButton, styles.secondaryActionButton]}
    onPress={handleSecondary}
    activeOpacity={0.75}
  >
    <Ionicons name="images-outline" size={18} color={brandingColors.primary} />
    <Text style={[styles.secondaryActionButtonText, { color: brandingColors.primary }]}>Fotos</Text>
  </TouchableOpacity>

  {/* Botão destrutivo (ex: Excluir) */}
  <TouchableOpacity
    style={[styles.actionButton, styles.dangerActionButton]}
    onPress={handleDelete}
    activeOpacity={0.75}
  >
    <Ionicons name="trash-outline" size={18} color={Colors.light.error} />
    <Text style={styles.dangerActionButtonText}>Excluir</Text>
  </TouchableOpacity>

  {/* Botão primário (ex: Editar, Salvar) */}
  <TouchableOpacity
    style={[styles.actionButton, styles.primaryActionButton]}
    onPress={handlePrimary}
    activeOpacity={0.8}
  >
    <LinearGradient
      colors={brandingColors.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.primaryActionButtonGradient}
    >
      <Ionicons name="pencil-outline" size={18} color="#fff" />
      <Text style={styles.primaryActionButtonText}>Editar</Text>
    </LinearGradient>
  </TouchableOpacity>
</View>
```

```typescript
// Estilos obrigatórios (copiar direto)
actions: {
  flexDirection: 'row',
  gap: theme.spacing.sm,
  marginTop: theme.spacing.lg,
  paddingBottom: theme.spacing.md,
},
actionButton: {
  flex: 1,
  borderRadius: theme.borderRadius.lg,
  minHeight: 52,
  overflow: 'hidden',
},
primaryActionButton: {
  ...theme.shadows.sm,
},
primaryActionButtonGradient: {
  minHeight: 52,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  paddingHorizontal: theme.spacing.md,
},
primaryActionButtonText: {
  fontSize: theme.fontSize.base,
  color: '#fff',
  fontWeight: '700',
},
secondaryActionButton: {
  borderWidth: 1.5,
  borderColor: Colors.light.border,
  backgroundColor: Colors.light.card,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
},
secondaryActionButtonText: {
  fontSize: theme.fontSize.base,
  fontWeight: '700',
},
dangerActionButton: {
  borderWidth: 1.5,
  borderColor: Colors.light.error + '50',
  backgroundColor: Colors.light.error + '08',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
},
dangerActionButtonText: {
  fontSize: theme.fontSize.base,
  fontWeight: '700',
  color: Colors.light.error,
},
```

**Regras:**
- Ordem: secundário → destrutivo → primário (destaque à direita)
- Botões condicionais (ex: Fotos só se `hasVariants`) → omitir do JSX, `flex` ajusta automaticamente
- `minHeight: 52` obrigatório em todos
- Primário sempre com `LinearGradient` + `brandingColors.gradient`

### Padrões de FAB (Floating Action Button)

```typescript
// Usar componente personalizado FAB
import FAB from '@/components/FAB';

<FAB
  directRoute="/entity/add"   // Rota para adicionar
  bottom={90}                 // Ajustar se tem tabs
/>

// OU FAB nativo (sem menu)
<FAB
  icon="plus"
  style={{
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: Colors.light.primary,
  }}
  onPress={() => router.push('/entity/add')}
  color="#fff"
/>
```

### Padrões de Listas (FlatList)

```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id.toString()}
  contentContainerStyle={{
    paddingHorizontal: 16,
    paddingBottom: 100,        // Espaço para FAB
  }}
  refreshControl={
    <RefreshControl
      refreshing={isRefetching}
      onRefresh={refetch}
      colors={[Colors.light.primary]}
    />
  }
  ListEmptyComponent={
    <EmptyState
      icon="icon-outline"
      title="Nenhum item"
      description="Descrição útil"
    />
  }
/>
```

### Padrões de Feedback

```typescript
// Loading global (automático via api interceptor)
// NÃO precisa fazer nada, já é automático

// Mensagem de sucesso
Alert.alert('Sucesso', 'Ação realizada com sucesso');

// Mensagem de erro
Alert.alert('Erro', error.response?.data?.detail || 'Erro ao realizar ação');

// Confirmação antes de ação destrutiva
Alert.alert(
  'Confirmar Ação',
  'Tem certeza que deseja fazer isso?',
  [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Confirmar', style: 'destructive', onPress: handleAction },
  ]
);
```

### Padrões de Navegação

```typescript
// Voltar
router.back()

// Ir para tela
router.push('/entity/add')

// Ir com parâmetro
router.push(`/entity/${id}`)

// Substituir (sem voltar)
router.replace('/(auth)/login')
```

### Padrões de Badges/Chips

```typescript
// Badge de status
<View style={{
  backgroundColor: statusColor + '15',  // Cor com transparência
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderRadius: 12,
}}>
  <Text style={{
    color: statusColor,
    fontSize: 12,
    fontWeight: '600'
  }}>
    {statusLabel}
  </Text>
</View>

// Cores por status
const statusColors = {
  active: '#10B981',    // Verde
  pending: '#F59E0B',   // Amarelo
  inactive: '#EF4444',  // Vermelho
  info: '#3B82F6',      // Azul
};
```

### Padrões de Espaçamento (`theme.spacing`)

```typescript
theme.spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Uso
marginBottom: theme.spacing.md,  // 16
padding: theme.spacing.lg,       // 24
gap: theme.spacing.sm,           // 8
```

### Padrões de Tipografia (`theme.fontSize`)

```typescript
theme.fontSize = {
  xxs: 10,
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// Uso
fontSize: theme.fontSize.base,     // 16 - texto normal
fontSize: theme.fontSize.sm,       // 14 - texto secundário
fontSize: theme.fontSize.xxl,      // 24 - títulos de header
```

### Padrões de BorderRadius (`theme.borderRadius`)

```typescript
theme.borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
};

// Uso
borderRadius: theme.borderRadius.lg,   // 12 - cards
borderRadius: theme.borderRadius.xxl,  // 24 - headers
borderRadius: theme.borderRadius.full, // círculos
```

### Checklist de Consistência Visual

Ao criar/modificar telas, verifique:

**Identidade Visual**
- [ ] Header usa `<PageHeader>` de `@/components/layout/PageHeader` (não `LinearGradient` manual)
- [ ] Cores de marca via `useBrandingColors()` — NUNCA hex hardcoded
- [ ] Dados financeiros via `VALUE_COLORS` — NUNCA hex hardcoded
- [ ] FAB usa `brandingColors.primary` (não cor fixa)
- [ ] Ícone temático contextual no header (não genérico)

**Componentes**
- [ ] Zero `<Card>` do react-native-paper (causa blur no Android) → usar `<View>`
- [ ] Zero `<Text>` do Paper em cards/modais críticos → usar `<Text>` do react-native
- [ ] Botão primário: `TouchableOpacity + LinearGradient` com `brandingColors.gradient`
- [ ] Inputs: `TextInput` nativo com style direto (não `mode="outlined"` do Paper)

**Layout e Espaçamento**
- [ ] Espaçamentos via `theme.spacing` (não px avulsos)
- [ ] Tipografia via `theme.fontSize` e `theme.fontWeight`
- [ ] BorderRadius via `theme.borderRadius`
- [ ] `paddingBottom: theme.spacing.xxl` no fim de listas (gesture bar)
- [ ] `flexShrink: 0` em colunas de valor monetário (direita)
- [ ] `minWidth: 0` em colunas de texto dinâmico (esquerda)

**Animação e Interação**
- [ ] `useFocusEffect` com spring/timing (não `useEffect([])` em tabs)
- [ ] `activeOpacity` em todos os `TouchableOpacity` (0.65–0.8)
- [ ] `hitSlop` em botões com área tátil < 44px
- [ ] `numberOfLines` em textos de comprimento variável

**Estados**
- [ ] Loading: indicador visual com cor branding
- [ ] Vazio: `ícone contextual + título + subtítulo`
- [ ] Erro: mensagem clara com botão "Tentar novamente"

---

## 🔍 Checklist Antes de Marcar como Pronto

Copie e cole no chat após o agente terminar:

```markdown
## ✅ Validação Final

### Backend
- [ ] Migration executada com sucesso?
- [ ] Endpoint responde corretamente no Swagger?
- [ ] Dados salvam no banco?

### Frontend
- [ ] Tela renderiza sem erros?
- [ ] Dados aparecem corretamente?
- [ ] Formulário salva com sucesso?
- [ ] Lista atualiza após criar/editar?

### UX
- [ ] Visual está consistente com outras telas?
- [ ] Loading aparece durante requests?
- [ ] Mensagens de erro são claras?
- [ ] Navegação funciona?

### Teste E2E
- [ ] Testei criar → visualizar → editar → deletar?
- [ ] Testei em dispositivo real (não só emulador)?
- [ ] Testei casos extremos (campos vazios, dados inválidos)?
```

---

## 🆘 Troubleshooting

### "Claude não entendeu o comando"
**Solução:** Seja mais específico:
```bash
# ❌ Muito genérico
Adicionar campo

# ✅ Específico e claro
🔄 FULL-STACK ADD-FIELD: Adicionar campo "celular_alternativo" (string, opcional) ao Customer
```

### "Mudança foi feita mas tem erros"
**Solução:** Use FIX-INCONSISTENCY:
```bash
🔄 FULL-STACK FIX-INCONSISTENCY: [Descreva o erro exato que está aparecendo]
```

### "Não sei qual tipo usar"
**Decisão rápida:**
- Adicionar/remover campo? → **ADD-FIELD**
- Criar algo novo do zero? → **NEW-FEATURE**
- Mudar como algo funciona? → **MODIFY-FLOW**
- Corrigir bug/inconsistência? → **FIX-INCONSISTENCY**
- Melhorar código sem mudar feature? → **REFACTOR**

### "Claude não chamou os agentes corretos"
**Solução:** Force a ordem:
```bash
🔄 FULL-STACK NEW-FEATURE: [descrição]

Ordem de execução:
1. Backend Agent: criar models, schemas, endpoints
2. Frontend Agent: criar telas, services, types
3. UX Agent: revisar e ajustar interface
```

---

## 💡 Dicas Pro

### 1. **Seja Descritivo**
```bash
# ❌ Vago
🔄 FULL-STACK ADD-FIELD: Adicionar campo

# ✅ Claro
🔄 FULL-STACK ADD-FIELD: Adicionar campo "data_nascimento" (date, opcional) ao Customer para calcular idade
```

### 2. **Mencione Validações**
```bash
🔄 FULL-STACK ADD-FIELD: Adicionar campo "email" (string, obrigatório, validar formato) ao Customer
```

### 3. **Especifique Relacionamentos**
```bash
🔄 FULL-STACK ADD-FIELD: Adicionar campo "categoria_id" (FK para Category) ao Product
```

### 4. **Indique Comportamento Esperado**
```bash
🔄 FULL-STACK NEW-FEATURE: Sistema de cupons que aplica desconto % ou valor fixo, valida data de validade
```

### 5. **Peça Revisão UX Explicitamente**
```bash
🔄 FULL-STACK MODIFY-FLOW: Reorganizar botões da tela de envios (revisar UX com mobile-ux-specialist)
```

---

## 📊 Monitoramento de Progresso

Durante a execução, Claude vai mostrar:

```markdown
🔄 **FULL-STACK [TIPO] INICIADO**

## 📋 Plano de Execução
- [✅/⏳/❌] Backend
- [✅/⏳/❌] Frontend
- [✅/⏳/❌] UX

## 🎯 Status Atual
✅ Backend: COMPLETO
⏳ Frontend: EM ANDAMENTO (2/5 arquivos)
⏳ UX: PENDENTE

## 🔍 Próximos Passos
1. Criar service em mobile/services/
2. Implementar telas
3. Revisar UX
```

---

## 🎓 Treinamento para Novas Sessões

Se abrir uma nova sessão do Claude Code, comece com:

```markdown
📚 **CONTEXTO DO PROJETO**

Este projeto usa sistema de orquestração de agentes documentado em:
- AGENT_ORCHESTRATION.md (processo completo)
- QUICK_REFERENCE.md (comandos rápidos)

Ao ver comando `🔄 FULL-STACK`, siga o protocolo definido nesses arquivos.

Agora vou passar minha demanda:
[cole seu comando aqui]
```

---

## 🔗 Links Rápidos

- **Processo Completo:** [AGENT_ORCHESTRATION.md](./AGENT_ORCHESTRATION.md)
- **Arquitetura:** [CLAUDE.md](./CLAUDE.md)
- **Docs API:** http://localhost:8000/docs

---

## 📞 FAQ Rápido

**P: Preciso usar o comando para mudanças pequenas?**
R: Não obrigatório, mas recomendado para garantir zero erros.

**P: Posso misturar tipos de mudança?**
R: Sim, escolha o tipo predominante e descreva todas as mudanças.

**P: Claude ignorou uma camada (backend/frontend/UX)?**
R: Peça explicitamente: "Também precisa atualizar o [camada] para [ação]"

**P: Como sei se está completo?**
R: Quando Claude marcar todas as camadas como ✅ e você validar o checklist final.

**P: Posso pedir para Claude parar e revisar?**
R: Sim! Digite "PAUSE - revisar [camada] antes de continuar"

---

**Lembre-se:** O objetivo é **ZERO RETRABALHO**. Melhor gastar 5 minutos planejando do que 30 minutos corrigindo! 🎯
