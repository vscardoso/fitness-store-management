# 🎨 Design System - Componentes de Detalhes

## Visão Geral

Sistema de componentes padronizados para telas de detalhes, garantindo consistência visual e reutilização de código em todo o aplicativo.

## 📦 Componentes Disponíveis

### 1. DetailHeader

Header padronizado com gradiente para telas de detalhes.

**Localização:** `components/layout/DetailHeader.tsx`

**Uso:**
```tsx
import DetailHeader from '@/components/layout/DetailHeader';

<DetailHeader
  title="Detalhes do Produto"
  entityName={product.name}
  backRoute="/(tabs)/products"
  editRoute={`/products/edit/${id}`}
  onDelete={handleDelete}
  badges={[
    { icon: 'checkmark-circle', label: 'DISPONÍVEL', type: 'success' }
  ]}
  metrics={[
    { icon: 'cube-outline', label: 'Estoque', value: '150 un' },
    { icon: 'cash-outline', label: 'Preço', value: 'R$ 99,90' }
  ]}
/>
```

**Props:**
- `title`: Título da tela (ex: "Detalhes do Produto")
- `entityName`: Nome da entidade (ex: nome do produto/cliente)
- `backRoute`: Rota para voltar
- `editRoute`: Rota para edição
- `onDelete`: Callback para deletar
- `badges?`: Array de badges de status
  - `icon`: Ícone do Ionicons
  - `label`: Texto do badge
  - `type`: 'success' | 'warning' | 'error' | 'info'
- `metrics?`: Array de cards de métricas (máx 3)
  - `icon`: Ícone do Ionicons
  - `label`: Label da métrica
  - `value`: Valor formatado
- `customElement?`: Elemento customizado (ex: avatar)

**Padrão Visual (alinhado ao header da lista de produtos):**
- Gradiente: `['#667eea', '#764ba2']`, `start: {x:0,y:0}`, `end: {x:1,y:1}`
- Padding: `paddingTop: theme.spacing.xl + 32`, `paddingBottom: theme.spacing.lg`, `paddingHorizontal: theme.spacing.md`
- Bordas: `borderBottomLeftRadius` e `borderBottomRightRadius` = `theme.borderRadius.xl`
- Sem divisórias: não usar Divider em headers
- Sem título redundante: não exibir "Detalhes" se o nome da entidade está presente; o nome da entidade é o título principal
- Ações no header: voltar à esquerda; editar e excluir à direita
- Badges abaixo do nome; métricas sempre no corpo da tela

---

### 2. InfoRow

Linha de informação reutilizável com suporte a dois layouts.

**Localização:** `components/ui/InfoRow.tsx`

**Uso:**
```tsx
import InfoRow from '@/components/ui/InfoRow';

// Layout Horizontal (label: valor)
<InfoRow label="SKU:" value="PROD-001" />

// Layout Vertical (ícone + label + valor empilhados)
<InfoRow
  icon="call-outline"
  label="Telefone"
  value="(11) 98765-4321"
  layout="vertical"
/>
```

**Props:**
- `label`: Label/título da informação
- `value`: Valor da informação
- `icon?`: Ícone do Ionicons (opcional)
- `layout?`: 'horizontal' | 'vertical' (padrão: 'horizontal')
- `showIconInVertical?`: Mostrar ícone no layout vertical (padrão: true)

**Quando usar cada layout:**
- **Horizontal**: Dados técnicos (SKU, categoria, marca)
- **Vertical**: Dados de contato (telefone, email, endereço)

---

### 3. StatCard

Card de estatística para exibir métricas numéricas.

**Localização:** `components/ui/StatCard.tsx`

**Uso:**
```tsx
import StatCard from '@/components/ui/StatCard';

<StatCard
  label="Estoque"
  value="150"
  suffix="un"
  icon="cube"
  valueColor={Colors.light.primary}
/>
```

**Props:**
- `label`: Label da estatística
- `value`: Valor principal (string)
- `icon?`: Ícone do Ionicons (opcional)
- `valueColor?`: Cor do valor (padrão: Colors.light.primary)
- `suffix?`: Sufixo (ex: "un", "%", "km")

**Use para:**
- Métricas numéricas (estoque, preço, margem)
- Estatísticas (pontos, compras, gastos)
- KPIs em destaque

---

### 4. ActionButtons

Botões de ação com suporte a layout horizontal ou vertical.

**Localização:** `components/ui/ActionButtons.tsx`

**Uso:**
```tsx
import ActionButtons from '@/components/ui/ActionButtons';

<ActionButtons
  actions={[
    {
      icon: 'call',
      label: 'Ligar',
      onPress: handleCall,
      color: Colors.light.primary,
    },
    {
      icon: 'mail',
      label: 'Email',
      onPress: handleEmail,
      color: Colors.light.primary,
    },
  ]}
  layout="horizontal"
/>
```

**Props:**
- `actions`: Array de botões
  - `icon`: Ícone do Ionicons
  - `label`: Texto do botão
  - `onPress`: Callback ao pressionar
  - `color?`: Cor de fundo (opcional)
  - `disabled?`: Desabilitar botão (opcional)
- `layout?`: 'horizontal' | 'vertical' (padrão: 'horizontal')

---

## 🎯 Padrão de Estrutura para Telas de Detalhes

```tsx
<View style={styles.container}>
  {/* Header Padronizado */}
  <DetailHeader
    title="Detalhes do [Entidade]"
    entityName={entity.name}
    backRoute="/(tabs)/[resource]"
    editRoute={`/[resource]/edit/${id}`}
    onDelete={handleDelete}
    badges={badges}
    metrics={metrics}
    customElement={customElement} // Opcional
  />

  {/* ScrollView com Cards */}
  <ScrollView
    style={styles.scrollContent}
    refreshControl={<RefreshControl {...refreshProps} />}
  >
    {/* Ações Rápidas (se necessário) */}
    {actions.length > 0 && (
      <View style={styles.actionsContainer}>
        <ActionButtons actions={actions} />
      </View>
    )}

    {/* Card: Informações Principais */}
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Título da Seção
        </Text>
        <View style={styles.infoSection}>
          <InfoRow label="Label" value="Valor" />
          {/* Mais InfoRows... */}
        </View>
      </Card.Content>
    </Card>

    {/* Card: Métricas/Estatísticas */}
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Estatísticas
        </Text>
        <View style={styles.statsGrid}>
          <StatCard label="Métrica 1" value="100" />
          <StatCard label="Métrica 2" value="200" />
          <StatCard label="Métrica 3" value="300" />
        </View>
      </Card.Content>
    </Card>

    {/* Card: Informações Adicionais */}
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.additionalInfo}>
          <Text variant="bodySmall" style={styles.additionalText}>
            Cadastrado em: {formatDate(entity.created_at)}
          </Text>
        </View>
      </Card.Content>
    </Card>
  </ScrollView>
</View>
```

---

## 📐 Estilos Padrão Recomendados

```typescript
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  actionsContainer: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  card: {
    margin: 16,
    marginTop: 0,
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 16,
  },
  infoSection: {
    gap: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  additionalInfo: {
    gap: 4,
  },
  additionalText: {
    color: Colors.light.icon,
  },
});
```

---

## ✅ Convenções de UI

### Espaçamento
- **Cards**: `margin: 16` (horizontal), `marginBottom: 12` (entre cards)
- **Seções internas**: `gap: 16` ou `gap: 12`
- **Info adicional**: `gap: 4`

### Sem Dividers
❌ Não usar `<Divider>` components  
✅ Usar `marginTop`/`marginBottom` para espaçamento

### Sem Separadores Visuais em Headers
❌ Não usar linhas divisórias no header  
✅ Usar gap/margin para espaçamento natural

### Títulos Não Redundantes
❌ Não adicionar "Detalhes" + nome da entidade  
✅ Mostrar apenas o nome da entidade em destaque no header

---

## 🔄 Telas Já Refatoradas

- ✅ **Produtos** (`app/products/[id].tsx`)
  - Header com badges de estoque (disponível, baixo, sem estoque)
  - Métricas: Estoque + Preço
  - InfoRows horizontais para dados técnicos
  - StatCards para preços e margem

- ✅ **Clientes** (`app/customers/[id].tsx`)
  - Header com avatar e badge de status (ativo/inativo)
  - ActionButtons para ligar/enviar email
  - InfoRows verticais para contato e endereço
  - StatCards para pontos, gastos e compras

---

## 🚀 Como Adaptar para Novas Telas

1. **Copie a estrutura padrão** acima
2. **Configure o DetailHeader** com badges e métricas relevantes
3. **Organize as informações** em cards lógicos
4. **Use InfoRow** para pares label-valor
5. **Use StatCard** para métricas numéricas
6. **Use ActionButtons** para ações contextuais
7. **Mantenha os estilos consistentes**

---

## 📝 Exemplos Completos

Veja as implementações completas em:
- `mobile/app/products/[id].tsx`
- `mobile/app/customers/[id].tsx`

---

## 🎨 Cores Padrão

Use as cores do `Colors.ts`:

```typescript
Colors.light.primary      // Cor principal do tema
Colors.light.success      // Verde (OK, disponível)
Colors.light.warning      // Laranja (atenção, estoque baixo)
Colors.light.error        // Vermelho (erro, sem estoque)
Colors.light.icon         // Cinza para ícones e labels
Colors.light.card         // Fundo dos cards
```

---

## 📱 Componentes para Telas de Listagem

### ListHeader

Header padronizado para telas de listagem com título e contador.

**Localização:** `components/layout/ListHeader.tsx`

**Uso:**
```tsx
import ListHeader from '@/components/layout/ListHeader';

<ListHeader
  title="Produtos"
  count={150}
  singularLabel="produto"
  pluralLabel="produtos"
  showCount={true}
/>
```

**Props:**
- `title`: Título da tela (ex: "Produtos", "Clientes")
- `count?`: Número de itens (padrão: 0)
- `singularLabel?`: Label singular (padrão: 'item')
- `pluralLabel?`: Label plural (padrão: 'itens')
- `showCount?`: Mostrar contador (padrão: true)

**Visual:**
- Fundo roxo (Colors.light.primary)
- Título branco em destaque
- Contador abaixo do título

---

### EmptyState

Estado vazio padronizado para listas sem dados.

**Localização:** `components/ui/EmptyState.tsx`

**Uso:**
```tsx
import EmptyState from '@/components/ui/EmptyState';

<EmptyState
  icon="cube-outline"
  title="Nenhum produto cadastrado"
  description="Comece adicionando seu primeiro produto"
/>
```

**Props:**
- `icon`: Ícone do Ionicons
- `title`: Título principal
- `description?`: Descrição/subtítulo (opcional)
- `actionLabel?`: Label do botão de ação (opcional)
- `onAction?`: Callback do botão (opcional)

**Use para:**
- Listas vazias (sem dados)
- Resultados de busca sem matches
- Estados de erro com mensagem amigável

---

## 🎯 Padrão de Estrutura para Telas de Listagem

```tsx
<SafeAreaView style={styles.safeArea}>
  <View style={styles.container}>
    {/* Header Padronizado */}
    <ListHeader
      title="Título da Tela"
      count={items.length}
      singularLabel="item"
      pluralLabel="itens"
    />

    {/* Barra de Busca */}
    <Searchbar
      placeholder="Buscar..."
      value={searchQuery}
      onChangeText={setSearchQuery}
      style={styles.searchbar}
    />

    {/* Lista */}
    <FlatList
      data={filteredItems}
      renderItem={renderItem}
      keyExtractor={(item) => item.id.toString()}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          colors={[Colors.light.primary]}
        />
      }
      ListEmptyComponent={
        <EmptyState
          icon="cube-outline"
          title="Nenhum item encontrado"
          description="Tente outro termo de busca"
        />
      }
    />

    {/* FAB */}
    <FAB
      icon="plus"
      style={styles.fab}
      onPress={handleAdd}
      label="Adicionar"
    />
  </View>
</SafeAreaView>
```

### Estados Especiais

**Loading:**
```tsx
if (isLoading && !isRefetching) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ListHeader
          title="Título"
          count={0}
          showCount={false}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
```

**Erro:**
```tsx
if (isError) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ListHeader title="Título" count={0} showCount={false} />
        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar dados"
          description="Verifique sua conexão e tente novamente"
        />
      </View>
    </SafeAreaView>
  );
}
```

---

## 📐 Estilos Padrão para Listagem

```typescript
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.primary,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  searchbar: {
    margin: 16,
    elevation: 2,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  loadingText: {
    marginTop: 16,
    color: Colors.light.icon,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: Colors.light.primary,
  },
});
```

---

## 🔄 Telas de Listagem Padronizadas

- ✅ **Produtos** (`app/(tabs)/products.tsx`)
  - SafeAreaView com fundo roxo
  - ListHeader com contador
  - Searchbar com elevation
  - Grid de 2 colunas
  - EmptyState para lista vazia
  - Loading/Error states consistentes

- ✅ **Clientes** (`app/(tabs)/customers.tsx`)
  - SafeAreaView com fundo roxo
  - ListHeader com contador
  - Searchbar com elevation
  - Lista vertical com cards
  - EmptyState para lista vazia
  - Loading/Error states consistentes

---

**Criado em:** Outubro 2025  
**Versão:** 2.0.0
