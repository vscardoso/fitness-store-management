# UI-UPGRADE — Guia Completo de Padronização Visual

> Documento de referência para o comando `🔄 FULL-STACK UI-UPGRADE`.  
> Aplique **todos** os itens abaixo ao executar um upgrade de tela.

---

## 1. Seta de Voltar — Padrão do Sistema

### Problema comum
Telas dentro da pasta `(tabs)/` usam `router.back()` mas, por serem rotas de **tab**, a navegação pode ir para a **raiz da tab** em vez da tela anterior.

### Regra
| Tipo de tela | Localização correta | Navegação |
|---|---|---|
| Telas de detalhe / configuração acessadas via push | `app/settings/` ou `app/[entidade]/` | `router.back()` funciona corretamente |
| Telas de tab ocultas (`href: null`) acionadas via push | **Mover para fora de `(tabs)/`** | `router.back()` funciona corretamente |
| Telas de tab visíveis | `app/(tabs)/` | Sem botão voltar — são roots |

### Implementação correta (PageHeader)
```tsx
// ✅ Correto — PageHeader com onBack explícito
<PageHeader
  title="Nome da Tela"
  subtitle="Subtítulo ou contador"
  showBackButton
  onBack={() => router.back()}
/>

// ✅ Também correto — PageHeader infere router.back() quando onBack não é passado
<PageHeader
  title="Nome da Tela"
  showBackButton
/>

// ❌ Errado — header manual com LinearGradient
<LinearGradient colors={[Colors.light.primary, Colors.light.secondary]}>
  <TouchableOpacity onPress={() => router.back()}>
    <Ionicons name="arrow-back" />
  </TouchableOpacity>
</LinearGradient>
```

### Navegação de entrada (quem chama a tela)
```tsx
// ✅ Usar rota stack (fora de tabs) para telas de configuração
router.push('/settings/payment-discounts')

// ❌ Evitar empurrar o usuário para dentro do navigator de tabs
router.push('/(tabs)/payment-discounts')  // back() pode ir para a tab root
```

---

## 2. Header — PageHeader Universal

### Import
```tsx
import PageHeader from '@/components/layout/PageHeader';
import { useBrandingColors } from '@/store/brandingStore';
```

### Uso padrão
```tsx
// Listagem com contador
<PageHeader
  title="Clientes"
  subtitle="42 clientes"
  showBackButton
  onBack={() => router.back()}
/>

// Formulário
<PageHeader
  title="Novo Cliente"
  subtitle="Preencha os dados abaixo"
  showBackButton
  onBack={() => router.back()}
/>

// Com ações à direita
<PageHeader
  title="João Silva"
  subtitle="VIP"
  showBackButton
  onBack={() => router.back()}
  rightActions={[
    { icon: 'pencil', onPress: handleEdit },
    { icon: 'trash', onPress: handleDelete, color: Colors.light.error },
  ]}
/>
```

### O que NÃO fazer
```tsx
// ❌ NÃO passar gradientColors manualmente — PageHeader já usa useBrandingColors()
<PageHeader gradientColors={['#6366F1', '#8B5CF6']} />

// ❌ NÃO criar header manual com LinearGradient
// ❌ NÃO duplicar título genérico quando o nome da entidade já está no subtitle
```

---

## 3. Cores de Marca — useBrandingColors()

### Import e uso
```tsx
import { useBrandingColors } from '@/store/brandingStore';

// Dentro do componente:
const brandingColors = useBrandingColors();
// brandingColors.primary   — cor primária dinâmica
// brandingColors.secondary — cor secundária dinâmica
// brandingColors.gradient  — [primary, secondary] para LinearGradient
```

### Substituições obrigatórias
| Antes (legado) | Depois (padrão) |
|---|---|
| `Colors.light.primary` em estilo inline | `brandingColors.primary` |
| `Colors.light.secondary` em estilo inline | `brandingColors.secondary` |
| `[Colors.light.primary, Colors.light.secondary]` | `brandingColors.gradient` |
| `'#6366F1'` hardcoded | `brandingColors.primary` |
| `'#8B5CF6'` hardcoded | `brandingColors.secondary` |

### Regra crítica: StyleSheet não aceita hooks
```tsx
// ❌ ERRADO — StyleSheet.create é estático, não recebe valores de hook
const styles = StyleSheet.create({
  fab: { backgroundColor: brandingColors.primary },  // bug silencioso!
});

// ✅ CORRETO — aplicar via inline style no JSX
<View style={[styles.fab, { backgroundColor: brandingColors.primary }]} />
```

---

## 4. Cores Financeiras — VALUE_COLORS

Use para **qualquer valor monetário ou percentual** que precise de semântica positivo/negativo.

```tsx
import { VALUE_COLORS } from '@/constants/Colors';

// VALUE_COLORS.positive  → #10B981 (verde) — receita, lucro, ganho
// VALUE_COLORS.negative  → #EF4444 (vermelho) — custo, prejuízo, perda
// VALUE_COLORS.neutral   → #11181C (escuro) — preço neutro, quantidade
// VALUE_COLORS.warning   → #F59E0B (amarelo) — alerta, atenção

// Helper:
import { valueColor } from '@/utils/format';
valueColor(valor, 'profit' | 'revenue' | 'cost' | 'auto')
```

---

## 5. Cards — View nativo (sem react-native-paper Card)

O `<Card>` do Paper causa **blur no Android**. Substituir por `<View>` com bordas e sombra.

### Padrão de card
```tsx
// ✅ Correto
<View style={{
  backgroundColor: Colors.light.card,
  borderRadius: theme.borderRadius.xl,   // 16
  borderWidth: 1,
  borderColor: Colors.light.border,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 4,
  elevation: 2,
  padding: theme.spacing.md,
}}>
  {/* conteúdo */}
</View>

// ❌ Evitar
<Card style={...}>
  <Card.Content>...</Card.Content>
</Card>
```

### Texto dentro de cards
```tsx
// ✅ Text do react-native
import { Text } from 'react-native';
<Text style={{ fontSize: theme.fontSize.sm, color: Colors.light.text }}>...</Text>

// ❌ Text do Paper (evitar em cards)
import { Text } from 'react-native-paper';
<Text variant="bodySmall">...</Text>
```

---

## 6. Botão Primário — TouchableOpacity + LinearGradient

```tsx
import { LinearGradient } from 'expo-linear-gradient';
const brandingColors = useBrandingColors();

// ✅ Botão primário (salvar, criar, confirmar)
<TouchableOpacity
  style={{ borderRadius: theme.borderRadius.xl, overflow: 'hidden' }}
  onPress={handleSave}
  activeOpacity={0.8}
  disabled={isLoading}
>
  <LinearGradient
    colors={brandingColors.gradient}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
  >
    {isLoading ? (
      <ActivityIndicator size="small" color="#fff" />
    ) : (
      <>
        <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Salvar</Text>
      </>
    )}
  </LinearGradient>
</TouchableOpacity>

// ✅ Botão secundário (cancelar)
<TouchableOpacity
  style={{
    flex: 1, height: 52,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1, borderColor: Colors.light.border,
    alignItems: 'center', justifyContent: 'center',
  }}
  onPress={handleCancel}
  activeOpacity={0.7}
>
  <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.light.textSecondary }}>
    Cancelar
  </Text>
</TouchableOpacity>

// ❌ Evitar
<Button mode="contained">Salvar</Button>
<Button mode="outlined">Cancelar</Button>
```

---

## 7. Inputs — TextInput Nativo

```tsx
import { TextInput } from 'react-native';

// ✅ Input de linha única
<TextInput
  value={value}
  onChangeText={setValue}
  placeholder="Placeholder"
  placeholderTextColor={Colors.light.textTertiary}
  style={{
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md,
    height: 52,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    marginBottom: theme.spacing.md,
  }}
/>

// ✅ Textarea (multiline)
<TextInput
  multiline
  style={{
    /* mesmos styles acima */ 
    minHeight: 80,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  }}
/>

// ❌ Evitar
<TextInput mode="outlined" label="Campo" />  // Paper TextInput
```

### Labels de seção (acima de inputs)
```tsx
// ✅ Labels UPPERCASE com letterSpacing
<Text style={{
  fontSize: 10,
  fontWeight: '600',
  letterSpacing: 0.5,
  color: Colors.light.textTertiary,
  marginBottom: theme.spacing.sm,
}}>
  NOME DO CAMPO
</Text>
```

---

## 8. Switch

```tsx
import { Switch } from 'react-native';
const brandingColors = useBrandingColors();

<Switch
  value={isActive}
  onValueChange={setIsActive}
  trackColor={{
    false: Colors.light.border,
    true: brandingColors.primary + '60',
  }}
  thumbColor={isActive ? brandingColors.primary : Colors.light.textTertiary}
/>
```

---

## 9. Modal / Bottom Sheet

### Estrutura padrão
```tsx
<Modal
  visible={showModal}
  transparent
  animationType="slide"
  onRequestClose={handleClose}
>
  <KeyboardAvoidingView
    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
  >
    <View style={{
      backgroundColor: Colors.light.card,
      borderTopLeftRadius: theme.borderRadius.xxl,   // 24
      borderTopRightRadius: theme.borderRadius.xxl,
      maxHeight: '92%',
      elevation: 24,
    }}>
      <ScrollView
        style={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Drag indicator */}
        <View style={{
          width: 40, height: 4, borderRadius: 2,
          backgroundColor: Colors.light.border,
          alignSelf: 'center',
          marginBottom: theme.spacing.md,
        }} />

        {/* Header do modal */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
          <Text style={{ fontSize: theme.fontSize.xl, fontWeight: '700', color: Colors.light.text }}>
            Título
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            style={{
              width: 32, height: 32,
              borderRadius: theme.borderRadius.full,
              backgroundColor: Colors.light.backgroundSecondary,
              alignItems: 'center', justifyContent: 'center',
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={22} color={Colors.light.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Conteúdo */}
      </ScrollView>
    </View>
  </KeyboardAvoidingView>
</Modal>
```

---

## 10. ConfirmDialog — Diálogos de Confirmação

Use sempre `ConfirmDialog` do sistema em vez de `Alert.alert` para ações destrutivas ou sucesso.

```tsx
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// Estados:
const [showSuccess, setShowSuccess] = useState(false);
const [showError, setShowError] = useState(false);
const [showDelete, setShowDelete] = useState(false);
const [dialogMessage, setDialogMessage] = useState('');

// Sucesso
<ConfirmDialog
  visible={showSuccess}
  title="Sucesso!"
  message={dialogMessage}
  confirmText="OK"
  cancelText=""
  onConfirm={() => setShowSuccess(false)}
  onCancel={() => setShowSuccess(false)}
  type="success"
  icon="checkmark-circle"
/>

// Erro
<ConfirmDialog
  visible={showError}
  title="Erro"
  message={dialogMessage}
  confirmText="OK"
  cancelText=""
  onConfirm={() => setShowError(false)}
  onCancel={() => setShowError(false)}
  type="danger"
  icon="alert-circle"
/>

// Confirmação destrutiva
<ConfirmDialog
  visible={showDelete}
  title="Confirmar exclusão"
  message="Deseja remover este item?"
  confirmText="Remover"
  cancelText="Cancelar"
  onConfirm={confirmDelete}
  onCancel={() => setShowDelete(false)}
  type="danger"
  icon="trash"
/>
```

---

## 11. Animações de Entrada — useFocusEffect

Obrigatório em todas as telas para dar sensação de transição suave.

```tsx
import { useRef } from 'react';
import { Animated } from 'react-native';
import { useFocusEffect } from 'expo-router';

// Refs (fora do return, dentro do componente)
const headerScale = useRef(new Animated.Value(0.94)).current;
const headerOpacity = useRef(new Animated.Value(0)).current;
const contentTranslate = useRef(new Animated.Value(24)).current;
const contentOpacity = useRef(new Animated.Value(0)).current;

// useFocusEffect (dentro do componente, após os refs)
useFocusEffect(
  useCallback(() => {
    refetch(); // ou qualquer ação de refresh

    // Reset
    headerScale.setValue(0.94);
    headerOpacity.setValue(0);
    contentTranslate.setValue(24);
    contentOpacity.setValue(0);

    // Animar
    Animated.parallel([
      Animated.spring(headerScale, { toValue: 1, useNativeDriver: true }),
      Animated.timing(headerOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(140),
        Animated.parallel([
          Animated.spring(contentTranslate, { toValue: 0, useNativeDriver: true }),
          Animated.timing(contentOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, [refetch])
);

// No JSX:
<Animated.View style={{ transform: [{ scale: headerScale }], opacity: headerOpacity }}>
  <PageHeader title="..." showBackButton onBack={() => router.back()} />
</Animated.View>

<Animated.View style={{ flex: 1, transform: [{ translateY: contentTranslate }], opacity: contentOpacity }}>
  {/* conteúdo principal */}
</Animated.View>
```

---

## 12. FlatList — Padrão Completo

```tsx
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id.toString()}
  contentContainerStyle={{
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xxl,   // espaço p/ gesture bar e FAB
    gap: theme.spacing.sm,              // (se renderItem não tiver marginBottom)
  }}
  showsVerticalScrollIndicator={false}
  refreshControl={
    <RefreshControl
      refreshing={isRefetching}
      onRefresh={refetch}
      colors={[brandingColors.primary]}
    />
  }
  ListEmptyComponent={
    <EmptyState
      icon="icon-name-outline"
      title="Nenhum item"
      description="Descrição útil para guiar o usuário"
    />
  }
/>
```

---

## 13. FAB (Floating Action Button)

```tsx
import FAB from '@/components/FAB';

// Uso simples (onPress)
<FAB onPress={handleAddNew} />

// Com rota direta
<FAB directRoute="/entity/add" />

// Com posição customizada
<FAB onPress={handleAddNew} bottom={90} />
```

---

## 14. Badges de Status

```tsx
// ✅ Badge com cor dinâmica
<View style={{
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: isActive ? Colors.light.success + '18' : Colors.light.error + '18',
  paddingHorizontal: theme.spacing.sm,
  paddingVertical: 3,
  borderRadius: theme.borderRadius.sm,
}}>
  <View style={{
    width: 5, height: 5, borderRadius: 3, marginRight: 4,
    backgroundColor: isActive ? Colors.light.success : Colors.light.error,
  }} />
  <Text style={{
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: isActive ? Colors.light.success : Colors.light.error,
  }}>
    {isActive ? 'ATIVO' : 'INATIVO'}
  </Text>
</View>
```

---

## 15. Chips de Filtro

```tsx
{['active', 'inactive', 'all'].map((key) => {
  const isSelected = filter === key;
  return (
    <TouchableOpacity
      key={key}
      style={[
        {
          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 4, paddingVertical: 10,
          borderRadius: theme.borderRadius.lg, borderWidth: 1,
          backgroundColor: Colors.light.card,
          borderColor: Colors.light.border,
        },
        isSelected && {
          backgroundColor: brandingColors.primary + '15',
          borderColor: brandingColors.primary,
        },
      ]}
      onPress={() => setFilter(key as any)}
      activeOpacity={0.7}
    >
      <Ionicons name={...} size={16} color={isSelected ? brandingColors.primary : Colors.light.textSecondary} />
      <Text style={[
        { fontSize: theme.fontSize.xs, fontWeight: '600', color: Colors.light.textSecondary },
        isSelected && { color: brandingColors.primary },
      ]}>
        Label
      </Text>
      <View style={[
        { minWidth: 20, height: 20, borderRadius: theme.borderRadius.full, backgroundColor: Colors.light.backgroundSecondary, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
        isSelected && { backgroundColor: brandingColors.primary },
      ]}>
        <Text style={[{ fontSize: 10, fontWeight: '700', color: Colors.light.textSecondary }, isSelected && { color: '#fff' }]}>
          {count}
        </Text>
      </View>
    </TouchableOpacity>
  );
})}
```

---

## 16. Tokens de Design

```typescript
// Espaçamento
theme.spacing.xxs = 2
theme.spacing.xs = 4
theme.spacing.sm = 8
theme.spacing.md = 16
theme.spacing.lg = 24
theme.spacing.xl = 32
theme.spacing.xxl = 48

// Tipografia
theme.fontSize.xxs = 10
theme.fontSize.xs = 12
theme.fontSize.sm = 14
theme.fontSize.base = 16
theme.fontSize.lg = 18
theme.fontSize.xl = 20
theme.fontSize.xxl = 24
theme.fontSize.xxxl = 32

// BorderRadius
theme.borderRadius.sm = 4
theme.borderRadius.md = 8
theme.borderRadius.lg = 12
theme.borderRadius.xl = 16
theme.borderRadius.xxl = 24
theme.borderRadius.full = 9999

// Cores
Colors.light.card = '#FFFFFF'
Colors.light.background = '#FFFFFF'
Colors.light.backgroundSecondary = '#F3F4F6'
Colors.light.border = '#E5E7EB'
Colors.light.text = '#11181C'
Colors.light.textSecondary = '#6B7280'
Colors.light.textTertiary = '#9CA3AF'
Colors.light.success = '#10B981'
Colors.light.error = '#EF4444'
Colors.light.warning = '#F59E0B'
Colors.light.info = '#3B82F6'
```

---

## 17. Checklist Completo de UI-UPGRADE

### Identidade Visual
- [ ] Header usa `<PageHeader>` (não `LinearGradient` manual)
- [ ] `useBrandingColors()` importado de `@/store/brandingStore`
- [ ] Zero `Colors.light.primary` como cor de marca em inline styles → `brandingColors.primary`
- [ ] Zero hex hardcoded (`#6366F1`, `#8B5CF6`) → `brandingColors.primary/secondary`
- [ ] Dados financeiros via `VALUE_COLORS` (não cores hardcoded)
- [ ] FAB usa `<FAB onPress={...} />` do componente do sistema

### Navegação
- [ ] Tela está em rota stack (não em `(tabs)/` se acessada via push)
- [ ] `showBackButton` + `onBack={() => router.back()}` no PageHeader
- [ ] Navegação de entrada usa rota stack (`/settings/` ou `/entity/`)

### Componentes
- [ ] Zero `<Card>` do react-native-paper → `<View>` com border/shadow
- [ ] Zero `<Text variant=...>` do Paper em cards → `<Text>` do react-native
- [ ] Zero `<Button mode="contained">` para botão primário → `TouchableOpacity + LinearGradient`
- [ ] Zero `<TextInput mode="outlined">` do Paper → `TextInput` nativo
- [ ] `Switch` nativo com `trackColor` e `thumbColor` dinâmicos
- [ ] `ConfirmDialog` para sucesso, erro e confirmações destrutivas

### Layout e Espaçamento
- [ ] Todos espaçamentos via `theme.spacing.*`
- [ ] Toda tipografia via `theme.fontSize.*`
- [ ] Todos BorderRadius via `theme.borderRadius.*`
- [ ] `paddingBottom: theme.spacing.xxl` no fim de listas
- [ ] `flexShrink: 0` em colunas de valor monetário (direita)
- [ ] `minWidth: 0` em colunas de texto variável (esquerda)

### Animações e Interação
- [ ] `useFocusEffect` com spring/timing (não `useEffect([])`)
- [ ] Header: `scale 0.94→1` + `opacity 0→1` (spring)
- [ ] Conteúdo: `translateY 24→0` + `opacity 0→1` (delay 140ms, spring)
- [ ] `activeOpacity` em todos os `TouchableOpacity` (0.65–0.8)
- [ ] `hitSlop` em botões com área tátil < 44px
- [ ] `numberOfLines` em textos de comprimento variável

### Estados
- [ ] Loading: `ActivityIndicator` com `brandingColors.primary`
- [ ] Vazio: `<EmptyState icon="..." title="..." description="..." />`
- [ ] Erro: PageHeader + EmptyState com botão de retry
- [ ] `showsVerticalScrollIndicator={false}` em listas

### Modal Bottom Sheet
- [ ] `animationType="slide"` no Modal
- [ ] Drag indicator (barra cinza) no topo
- [ ] `KeyboardAvoidingView` com `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`
- [ ] `keyboardShouldPersistTaps="handled"` no ScrollView interno
- [ ] `Keyboard.dismiss()` ao fechar

---

## 18. Arquivos Chave

| Arquivo | Descrição |
|---|---|
| `mobile/components/layout/PageHeader.tsx` | Header universal — sempre usar este |
| `mobile/components/ui/ConfirmDialog.tsx` | Diálogos de confirmação/erro/sucesso |
| `mobile/components/ui/EmptyState.tsx` | Estado vazio com ícone + texto |
| `mobile/components/FAB.tsx` | Floating Action Button do sistema |
| `mobile/store/brandingStore.ts` | `useBrandingColors()` — cores de marca |
| `mobile/constants/Colors.ts` | `Colors`, `theme`, `VALUE_COLORS` |
| `mobile/utils/format.ts` | `valueColor()` para cores financeiras |
| `mobile/utils/haptics.ts` | `haptics.success()`, `haptics.error()`, `haptics.selection()` |
