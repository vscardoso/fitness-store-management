# 🎨 Guia de Uso - PageHeader Consolidado

## 📌 Problema Resolvido

**Antes**: Headers duplicados com CSS inconsistente, espaçamento "apertado" (paddingBottom: 8-16)
**Depois**: Um componente universal com CSS consistente e espaçamento correto (paddingBottom: 24)

---

## ✅ Vantagens

1. **CSS Consistente**: Todos os headers seguem mesmo padrão visual
2. **Espaçamento Correto**: `paddingBottom: 24` (não mais apertado)
3. **Zero Duplicação**: Um componente para todas as telas
4. **Flexível**: Funciona em lista, formulário, detalhes
5. **Fácil Manutenção**: Uma mudança afeta todos os headers

---

## 🚀 Exemplos de Uso

### 1. **Lista Simples (Equipe)**

```tsx
import PageHeader from '@/components/layout/PageHeader';

<PageHeader
  title="Equipe"
  subtitle={`${memberCount} ${memberCount === 1 ? 'membro' : 'membros'}`}
  showBackButton
/>
```

### 2. **Formulário (Novo Membro)**

```tsx
<PageHeader
  title="Novo Membro"
  subtitle="Adicione um colaborador à sua equipe"
  showBackButton
/>
```

### 3. **Detalhes com Ações (Detalhes do Membro)**

```tsx
<PageHeader
  title={member.full_name}
  subtitle={getRoleLabel(member.role)}
  showBackButton
  rightActions={[
    { 
      icon: 'pencil', 
      onPress: () => setIsEditing(!isEditing) 
    },
  ]}
>
  {/* Badges customizados */}
  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
    <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
        {getRoleLabel(member.role)}
      </Text>
    </View>
    {!member.is_active && (
      <View style={[styles.statusBadge, { backgroundColor: 'rgba(239, 68, 68, 0.3)' }]}>
        <Text style={styles.statusBadgeText}>Inativo</Text>
      </View>
    )}
  </View>
</PageHeader>
```

### 4. **Com Help Button (Telas Secundárias)**

```tsx
import { useTutorialContext } from '@/contexts/TutorialContext';
// OU
import { useTutorialContext } from '@/components/tutorial';

function ProductsScreen() {
  const { startTutorial } = useTutorialContext();
  
  return (
    <PageHeader
      title="Produtos"
      subtitle={`${productCount} produtos`}
      rightActions={[
        { 
          icon: 'help-circle-outline', 
          onPress: () => startTutorial('products')
        },
      ]}
    />
  );
}
```

**Padrão**: Telas secundárias (Produtos, Clientes, Vendas) mostram apenas Help.
**Dashboard/Index**: Mostra Help + botão de usuário/perfil.

### 5. **Com Cores Customizadas**

```tsx
<PageHeader
  title="Vendas"
  subtitle="15 vendas hoje"
  gradientColors={['#667eea', '#764ba2']}  // Roxo diferente
/>
```

---

## 🔧 Aplicação nas Telas Problemáticas

### **Antes e Depois: `mobile/app/(tabs)/team/index.tsx`**

#### ❌ ANTES (Apertado)
```tsx
<View style={styles.headerContainer}>
  <LinearGradient
    colors={[Colors.light.primary, Colors.light.secondary]}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={styles.headerGradient}  // ❌ paddingBottom: 16 (apertado)
  >
    <View style={styles.headerContent}>
      <View style={styles.headerTop}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Equipe</Text>
          <Text style={styles.headerSubtitle}>
            {memberCount} {memberCount === 1 ? 'membro' : 'membros'}
          </Text>
        </View>

        <View style={styles.headerPlaceholder} />
      </View>
    </View>
  </LinearGradient>
</View>
```

#### ✅ DEPOIS (Espaçado)
```tsx
import PageHeader from '@/components/layout/PageHeader';

<PageHeader
  title="Equipe"
  subtitle={`${memberCount} ${memberCount === 1 ? 'membro' : 'membros'}`}
  showBackButton
/>
```

**Resultado**:
- ✅ Reduz de ~30 linhas para 5 linhas
- ✅ Espaçamento correto (24 ao invés de 16)
- ✅ CSS consistente com resto do app

---

### **Antes e Depois: `mobile/app/(tabs)/team/add.tsx`**

#### ❌ ANTES
```tsx
<View style={styles.headerContainer}>
  <LinearGradient
    colors={[Colors.light.primary, Colors.light.secondary]}
    style={styles.headerGradient}  // ❌ paddingBottom: 8 (muito apertado!)
  >
    <View style={styles.headerContent}>
      <View style={styles.headerTop}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Novo Membro
        </Text>

        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.headerInfo}>
        <Text style={styles.headerSubtitle}>
          Adicione um colaborador à sua equipe
        </Text>
      </View>
    </View>
  </LinearGradient>
</View>
```

#### ✅ DEPOIS
```tsx
import PageHeader from '@/components/layout/PageHeader';

<PageHeader
  title="Novo Membro"
  subtitle="Adicione um colaborador à sua equipe"
  showBackButton
/>
```

---

## 📊 Comparação de CSS

### Problema (CSS Antigo)
```typescript
headerGradient: {
  paddingHorizontal: theme.spacing.md,
  paddingTop: theme.spacing.xl + 32,
  paddingBottom: theme.spacing.sm,  // ❌ 8 - MUITO APERTADO
  borderBottomLeftRadius: theme.borderRadius.xl,
  borderBottomRightRadius: theme.borderRadius.xl,
},
```

### Solução (CSS Novo)
```typescript
gradient: {
  paddingHorizontal: theme.spacing.md,
  paddingTop: theme.spacing.xl + 32,
  paddingBottom: theme.spacing.lg,  // ✅ 24 - ESPAÇADO CORRETO
  borderBottomLeftRadius: theme.borderRadius.xxl,
  borderBottomRightRadius: theme.borderRadius.xxl,
},
```

**Diferença**: 
- ❌ Antes: 8px de padding inferior (apertado)
- ✅ Depois: 24px de padding inferior (espaçado como resto do app)

---

## 🎯 Props do PageHeader

| Prop | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `title` | `string` | - | **Obrigatório**. Título principal |
| `subtitle` | `string` | - | Subtítulo/contador |
| `showBackButton` | `boolean` | `false` | Mostrar botão voltar |
| `onBack` | `() => void` | `router.back()` | Callback customizado para voltar |
| `rightActions` | `RightAction[]` | `[]` | Ações à direita (máx 3) |
| `gradientColors` | `[string, string]` | `[primary, secondary]` | Cores do gradiente |
| `children` | `React.ReactNode` | - | Elemento customizado (badges, avatar) |

### Tipo: RightAction
```typescript
interface RightAction {
  icon: keyof typeof Ionicons.glyphMap;  // Nome do ícone
  onPress: () => void;                   // Ação ao clicar
  color?: string;                        // Cor (default: '#fff')
}
```

---

## 🔍 Checklist de Migração

Para migrar uma tela para o novo PageHeader:

- [ ] Importar `PageHeader` de `@/components/layout/PageHeader`
- [ ] Substituir todo bloco `<View style={styles.headerContainer}>...</View>`
- [ ] Passar props: `title`, `subtitle`, `showBackButton`
- [ ] Se tem ações (editar, deletar), passar array `rightActions`
- [ ] Se tem badges/avatar, passar como `children`
- [ ] Remover estilos antigos do header (CSS cleanup)
- [ ] Testar em dispositivo real

---

## 📝 Plano de Implementação

### Prioridade 1 (Problemáticos)
1. ✅ `mobile/app/(tabs)/team/index.tsx` - Lista de membros
2. ✅ `mobile/app/(tabs)/team/add.tsx` - Novo membro
3. ✅ `mobile/app/(tabs)/team/[id].tsx` - Detalhes do membro

### Prioridade 2 (Opcional - para padronização completa)
4. `mobile/app/(tabs)/sales/index.tsx` - Lista de vendas
5. `mobile/app/(tabs)/entries/index.tsx` - Lista de entradas
6. `mobile/app/(tabs)/conditional/index.tsx` - Lista de envios

---

## 🎨 Resultado Visual

### Antes (Apertado)
```
┌─────────────────────────────┐
│  ← Back    Título           │
│            contador          │  ← Pouco espaço (8-16px)
└─────────────────────────────┘  ← Borda arredondada
[Conteúdo muito próximo do header]
```

### Depois (Espaçado)
```
┌─────────────────────────────┐
│  ← Back    Título           │
│            contador          │
│                              │  ← Espaço respirável (24px)
└─────────────────────────────┘  ← Borda arredondada
[Conteúdo com distância adequada]
```

---

## ✅ Próximos Passos

1. **Revisar o componente criado** em `mobile/components/layout/PageHeader.tsx`
2. **Aprovar a solução**
3. **Aplicar nas 3 telas problemáticas** (team/index, team/add, team/[id])
4. **Testar visualmente** em dispositivo real
5. **Decidir se quer migrar outras telas** (sales, entries, etc) para padronização completa

---

**Benefício Final**: 
- 🎯 Headers consistentes em todo o app
- 🔧 Fácil manutenção (uma mudança afeta todos)
- 📱 Espaçamento correto (não mais "apertado")
- ⚡ Menos código duplicado (-80% de linhas em cada tela)
