# Inventário de UI — Fitness Store Management (Mobile)

> Referência completa de telas, modais, diálogos e padrões de header.

---

## Sumário

1. [PageHeader — Padrão de Header](#1-pageheader--padrão-de-header)
2. [ConfirmDialog — Padrão de Confirmação](#2-confirmdialog--padrão-de-confirmação)
3. [Modais Especializados](#3-modais-especializados)
4. [Telas do App](#4-telas-do-app)
5. [Mapeamento Tela × Modal](#5-mapeamento-tela--modal)

---

## 1. PageHeader — Padrão de Header

**Arquivo:** `mobile/components/layout/PageHeader.tsx`

Header universal com gradiente de branding. Usado em todas as telas internas.

### Props

| Prop | Tipo | Obrigatório | Padrão | Descrição |
|------|------|-------------|--------|-----------|
| `title` | `string` | ✅ | — | Título principal |
| `subtitle` | `string` | — | — | Subtítulo / contador |
| `showBackButton` | `boolean` | — | `false` | Exibe botão voltar |
| `onBack` | `() => void` | — | — | Callback customizado de voltar |
| `rightActions` | `RightAction[]` | — | `[]` | Ações à direita (máx 3) |
| `gradientColors` | `[string, string]` | — | branding | Cores do gradiente |
| `children` | `ReactNode` | — | — | Elemento customizado (ex: badge de status) |

### Uso típico

```tsx
<PageHeader
  title="Produtos"
  subtitle="15 itens"
  showBackButton
  onBack={goBack}
  rightActions={[
    { icon: 'create-outline', onPress: () => setEditing(true) },
    { icon: 'trash-outline', onPress: () => openDeleteDialog() },
  ]}
/>
```

---

## 1.5 Tooltip Modal — Padrão de Modal Informativo

**Padrão inline** (não é componente separado, mas pattern reutilizável)

Modal de informação contextual para explicar métricas, campos e conceitos. Design clean e consistente em todo o app.

### Estrutura

```tsx
// Estado (obrigatório)
const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

// Gatilho (ícone ⓘ ao lado do label)
<TouchableOpacity onPress={() => setActiveTooltip('identificador')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
  <Ionicons name="information-circle-outline" size={11} color="#9CA3AF" />
</TouchableOpacity>

// Modal (no final do JSX da tela)
<Modal
  visible={activeTooltip !== null}
  transparent
  animationType="fade"
  onRequestClose={() => setActiveTooltip(null)}
>
  <TouchableOpacity
    style={styles.tooltipOverlay}
    activeOpacity={1}
    onPress={() => setActiveTooltip(null)}
  >
    <Animated.View style={[styles.tooltipBox, { transform: [{ scale: activeTooltip !== null ? 1 : 0.9 }] }]}>
      {activeTooltip === 'identificador' && (
        <>
          <View style={styles.tooltipHeader}>
            <View style={[styles.tooltipIconContainer, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="wallet-outline" size={20} color="#6366F1" />
            </View>
            <Text style={styles.tooltipTitle}>Título da Métrica</Text>
          </View>
          <View style={styles.tooltipDivider} />
          <Text style={styles.tooltipText}>
            Explicação clara e concisa do conceito. Use quebras de linha para separar exemplos.
          </Text>
        </>
      )}
      <TouchableOpacity 
        onPress={() => setActiveTooltip(null)} 
        style={styles.tooltipClose}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={brandingColors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.tooltipCloseGradient}
        >
          <Text style={styles.tooltipCloseText}>Entendi</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  </TouchableOpacity>
</Modal>
```

### Estilos obrigatórios

```tsx
tooltipOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.5)',
  justifyContent: 'center',
  alignItems: 'center',
  paddingHorizontal: 24,
},
tooltipBox: {
  backgroundColor: '#fff',
  borderRadius: 20,
  padding: 0,
  width: '100%',
  maxWidth: 400,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.25,
  shadowRadius: 32,
  elevation: 16,
  overflow: 'hidden',
},
tooltipHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
  paddingHorizontal: 20,
  paddingTop: 20,
  paddingBottom: 12,
},
tooltipIconContainer: {
  width: 40,
  height: 40,
  borderRadius: 12,
  justifyContent: 'center',
  alignItems: 'center',
},
tooltipTitle: {
  flex: 1,
  fontSize: 17,
  fontWeight: '700',
  color: '#111827',
},
tooltipDivider: {
  height: 1,
  backgroundColor: '#F3F4F6',
  marginHorizontal: 20,
},
tooltipText: {
  fontSize: 14,
  color: '#6B7280',
  lineHeight: 22,
  paddingHorizontal: 20,
  paddingTop: 16,
  paddingBottom: 20,
},
tooltipClose: {
  marginHorizontal: 20,
  marginBottom: 20,
  borderRadius: 12,
  overflow: 'hidden',
},
tooltipCloseGradient: {
  paddingVertical: 14,
  alignItems: 'center',
},
tooltipCloseText: {
  fontSize: 15,
  fontWeight: '700',
  color: '#fff',
},
```

### Cores do ícone por contexto

| Contexto | backgroundColor | iconColor |
|----------|----------------|-----------|
| Financeiro positivo (lucro, receita) | `#ECFDF5` | `VALUE_COLORS.positive` |
| Financeiro negativo (custo, despesa) | `#FEF2F2` | `VALUE_COLORS.negative` |
| Informativo (geral, conceitos) | `#EEF2FF` | `#6366F1` |
| Alerta/atenção | `#FEF3C7` | `VALUE_COLORS.warning` |

**Usado em:** `/(tabs)/index.tsx` (Dashboard — 11 tooltips)

---

## 2. ConfirmDialog — Padrão de Confirmação

**Arquivo:** `mobile/components/ui/ConfirmDialog.tsx`

Modal de confirmação para ações destrutivas ou importantes. Padrão único em todo o app.

### Props

| Prop | Tipo | Obrigatório | Padrão | Descrição |
|------|------|-------------|--------|-----------|
| `visible` | `boolean` | ✅ | — | Exibe/oculta |
| `type` | `'danger' \| 'warning' \| 'info' \| 'success'` | — | `'info'` | Estilo visual |
| `title` | `string` | ✅ | — | Título do diálogo |
| `message` | `string` | ✅ | — | Mensagem principal |
| `confirmText` | `string` | — | `'Confirmar'` | Texto do botão de confirmação |
| `cancelText` | `string` | — | `'Cancelar'` | Texto do botão de cancelamento |
| `onConfirm` | `() => void` | ✅ | — | Callback ao confirmar |
| `onCancel` | `() => void` | — | — | Callback ao cancelar |
| `details` | `string[]` | — | — | Lista de detalhes adicionais |
| `icon` | `string` | — | — | Ícone customizado (Ionicons) |
| `loading` | `boolean` | — | `false` | Estado de carregamento |

### Cores por tipo

| Tipo | Cor | Quando usar |
|------|-----|-------------|
| `danger` | Vermelho | Deletar, ações irreversíveis |
| `warning` | Laranja | Confirmações com risco |
| `info` | Azul | Informações, confirmações neutras |
| `success` | Verde | Confirmações positivas |

### Padrão de estado (obrigatório em todas as telas)

```tsx
const [dialog, setDialog] = useState({
  visible: false,
  type: 'info' as const,
  title: '',
  message: '',
  confirmText: undefined as string | undefined,
  onConfirm: () => {},
});

// Para abrir:
setDialog({
  visible: true,
  type: 'danger',
  title: 'Excluir produto?',
  message: 'Esta ação não pode ser desfeita.',
  confirmText: 'Excluir',
  onConfirm: handleDelete,
});

// JSX:
<ConfirmDialog
  visible={dialog.visible}
  type={dialog.type}
  title={dialog.title}
  message={dialog.message}
  confirmText={dialog.confirmText}
  onConfirm={dialog.onConfirm}
  onCancel={() => setDialog(d => ({ ...d, visible: false }))}
/>
```

---

## 3. Modais Especializados

### 3.1 CustomerSelectionModal

**Arquivo:** `mobile/components/sale/CustomerSelectionModal.tsx`

Modal de busca e seleção de cliente durante uma venda.

| Prop | Tipo | Descrição |
|------|------|-----------|
| `visible` | `boolean` | Exibe/oculta |
| `onDismiss` | `() => void` | Fecha sem selecionar |
| `onSelectCustomer` | `(customer: Customer) => void` | Retorna cliente selecionado |

**Features:** busca em tempo real por nome/email/telefone/CPF, badge com número de compras, opção "Continuar sem cliente".

**Usado em:** `/(tabs)/sale.tsx`

---

### 3.2 ProductSelectionModal

**Arquivo:** `mobile/components/sale/ProductSelectionModal.tsx`

Modal de busca e seleção de produto durante uma venda.

| Prop | Tipo | Descrição |
|------|------|-----------|
| `visible` | `boolean` | Exibe/oculta |
| `onDismiss` | `() => void` | Fecha sem selecionar |
| `onSelectProduct` | `(product, variant) => void` | Retorna produto + variante |

**Features:** produtos agrupados por modelo, seleção de variante (tamanho/cor), badge de estoque por variante.

**Usado em:** `/(tabs)/sale.tsx`

---

### 3.3 CategoryPickerModal

**Arquivo:** `mobile/components/ui/CategoryPickerModal.tsx`

Bottom sheet de seleção de categoria.

| Prop | Tipo | Descrição |
|------|------|-----------|
| `visible` | `boolean` | Exibe/oculta |
| `categories` | `Category[]` | Lista de categorias |
| `selectedId` | `number` | ID da categoria atual |
| `onSelect` | `(category: Category) => void` | Retorna categoria selecionada |
| `onDismiss` | `() => void` | Fecha sem selecionar |
| `showProductCount` | `boolean` | Exibe contador de produtos |

**Features:** animação spring, ícone automático por nome, toque no backdrop fecha.

**Usado em:** `/products/add.tsx`, `/products/edit/[id].tsx`, wizard de produto.

---

### 3.4 SimilarProductsModal

**Arquivo:** `mobile/components/products/SimilarProductsModal.tsx`

Aparece após scan de código de barras quando há produtos similares — impede duplicatas.

| Prop | Tipo | Descrição |
|------|------|-----------|
| `visible` | `boolean` | Exibe/oculta |
| `duplicates` | `DuplicateMatch[]` | Lista de produtos similares |
| `scannedName` | `string` | Nome escaneado |
| `onUseProduct` | `(id, name, qty) => void` | Usar produto existente |
| `onCreateVariant` | `(id) => void` | Criar variante do existente |
| `onCreateNew` | `() => void` | Criar produto novo mesmo assim |

**Score de similaridade:**
- ≥ 90% → vermelho (quase idêntico)
- ≥ 75% → laranja (muito similar)
- < 75% → verde (possivelmente diferente)

**Não pode ser dispensado** sem uma das três ações acima.

**Usado em:** `/products/scan.tsx`

---

### 3.5 ReturnModal

**Arquivo:** `mobile/components/sale/ReturnModal.tsx`

Fluxo completo de devolução de uma venda.

| Prop | Tipo | Descrição |
|------|------|-----------|
| `visible` | `boolean` | Exibe/oculta |
| `saleId` | `number` | ID da venda |
| `saleNumber` | `string` | Número da venda (exibição) |
| `onDismiss` | `() => void` | Cancela a devolução |
| `onSuccess` | `() => void` | Devolução concluída com sucesso |

**Fluxo interno:**
1. Carrega elegibilidade (prazo de 7 dias)
2. Exibe banner com prazo restante
3. Seleção de itens e quantidades
4. Cálculo de reembolso em tempo real
5. Campo de motivo (obrigatório)
6. ConfirmDialog para confirmação final
7. Processa e dispara `onSuccess`

**Usado em:** `/sales/[id].tsx`

---

### 3.6 LabelProductPickerModal

**Arquivo:** `mobile/components/labels/LabelProductPickerModal.tsx`

Seleção múltipla de produtos para o Studio de Etiquetas.

| Prop | Tipo | Descrição |
|------|------|-----------|
| `visible` | `boolean` | Exibe/oculta |
| `onDismiss` | `() => void` | Fecha sem confirmar |
| `onConfirm` | `(items: PickedItem[]) => void` | Retorna produtos selecionados |
| `alreadyAdded` | `Set<string>` | SKUs já adicionados (marcados) |

**Features:** seleção em massa, checkbox tri-estado para grupos, badge contador, botão "Limpar".

**Usado em:** `/products/label/index.tsx`

---

### 3.7 ItemStatusModal

**Arquivo:** `mobile/components/conditional/ItemStatusModal.tsx`

Marcar item de envio condicional como danificado ou perdido.

| Prop | Tipo | Descrição |
|------|------|-----------|
| `visible` | `boolean` | Exibe/oculta |
| `onDismiss` | `() => void` | Cancela |
| `onConfirm` | `(quantity: number) => void` | Confirma com quantidade |
| `type` | `'damaged' \| 'lost'` | Tipo de ocorrência |
| `itemName` | `string` | Nome do item |
| `maxQuantity` | `number` | Quantidade máxima |
| `unitPrice` | `number` | Preço unitário (impacto financeiro) |
| `loading` | `boolean` | Estado de carregamento |

**Usado em:** `/(tabs)/conditional/[id].tsx`

---

### 3.8 MarkAsSentModal

**Arquivo:** `mobile/components/conditional/MarkAsSentModal.tsx`

Marcar envio condicional como despachado.

| Prop | Tipo | Descrição |
|------|------|-----------|
| `visible` | `boolean` | Exibe/oculta |
| `onDismiss` | `() => void` | Cancela |
| `onConfirm` | `(data) => void` | Confirma com dados de envio |
| `loading` | `boolean` | Estado de carregamento |

**Campos (todos opcionais):** transportadora, código de rastreio, observações.

**Usado em:** `/(tabs)/conditional/[id].tsx`

---

## 4. Telas do App

### Autenticação (`/(auth)/`)

| Tela | Arquivo | Header | Notas |
|------|---------|--------|-------|
| Login | `(auth)/login.tsx` | — | Tela de entrada |

---

### Tabs Principais (`/(tabs)/`)

| Tela | Arquivo | Título no Header | Back | Modais / Dialogs |
|------|---------|-----------------|------|-----------------|
| Dashboard | `(tabs)/index.tsx` | "Início" | — | — |
| Nova Venda | `(tabs)/sale.tsx` | "Nova Venda" | — | CustomerSelectionModal, ProductSelectionModal, ConfirmDialog |
| Clientes | `(tabs)/customers.tsx` | "Clientes" | — | ConfirmDialog |
| Produtos | `(tabs)/products.tsx` | "Produtos" | — | ConfirmDialog |
| Mais / Menu | `(tabs)/more.tsx` | — | — | — |

---

### Vendas

| Tela | Arquivo | Título no Header | Back | Modais / Dialogs |
|------|---------|-----------------|------|-----------------|
| Lista de Vendas | `(tabs)/sales/index.tsx` | "Vendas" | — | — |
| Detalhes da Venda | `sales/[id].tsx` | Número da venda | ✅ | ReturnModal, ConfirmDialog |

---

### Produtos

| Tela | Arquivo | Título no Header | Back | Modais / Dialogs |
|------|---------|-----------------|------|-----------------|
| Detalhes do Produto | `products/[id].tsx` | Nome do produto | ✅ | ConfirmDialog (deletar) |
| Novo Produto | `products/add.tsx` | "Novo Produto" | ✅ | CategoryPickerModal, ConfirmDialog |
| Editar Produto | `products/edit/[id].tsx` | "Editar Produto" | ✅ | CategoryPickerModal, ConfirmDialog |
| Scan / Câmera | `products/scan.tsx` | — | — | SimilarProductsModal |
| Wizard de Produto | `products/wizard.tsx` | — | — | CategoryPickerModal, ConfirmDialog |
| QR Code do Produto | `products/qrcode/[id].tsx` | "QR Code" | ✅ | — |
| Studio de Etiquetas | `products/label/index.tsx` | "Studio de Etiquetas" | — | LabelProductPickerModal, ConfirmDialog |
| Etiqueta Individual | `products/label/[id].tsx` | "Etiqueta" | ✅ | ConfirmDialog |

---

### Clientes

| Tela | Arquivo | Título no Header | Back | Modais / Dialogs |
|------|---------|-----------------|------|-----------------|
| Detalhes do Cliente | `customers/[id].tsx` | Nome do cliente | ✅ | ConfirmDialog |
| Novo Cliente | `customers/add.tsx` | "Novo Cliente" | ✅ | ConfirmDialog |
| Editar Cliente | `customers/edit/[id].tsx` | "Editar Cliente" | ✅ | ConfirmDialog |

---

### Entradas de Estoque

| Tela | Arquivo | Título no Header | Back | Modais / Dialogs |
|------|---------|-----------------|------|-----------------|
| Lista de Entradas | `(tabs)/entries/index.tsx` | "Entradas" | — | — |
| Nova Entrada | `(tabs)/entries/add.tsx` | "Nova Entrada" | ✅ | ConfirmDialog |
| Detalhes da Entrada | `(tabs)/entries/[id].tsx` | ID da entrada | ✅ | ConfirmDialog |
| Adicionar Estoque (rápido) | `entries/add-stock.tsx` | "Adicionar Estoque" | ✅ | ConfirmDialog |

---

### Envios Condicionais

| Tela | Arquivo | Título no Header | Back | Modais / Dialogs |
|------|---------|-----------------|------|-----------------|
| Lista de Envios | `(tabs)/conditional/index.tsx` | "Envios Condicionais" | — | — |
| Novo Envio | `(tabs)/conditional/create.tsx` | "Novo Envio" | ✅ | ConfirmDialog |
| Detalhes do Envio | `(tabs)/conditional/[id].tsx` | ID do envio | ✅ | ItemStatusModal, MarkAsSentModal, ConfirmDialog |

---

### Despesas

| Tela | Arquivo | Título no Header | Back | Modais / Dialogs |
|------|---------|-----------------|------|-----------------|
| Lista de Despesas | `(tabs)/expenses/index.tsx` | "Despesas" | — | ConfirmDialog |
| Nova Despesa | `(tabs)/expenses/create.tsx` | "Nova Despesa" | ✅ | ConfirmDialog |
| Editar Despesa | `(tabs)/expenses/edit.tsx` | "Editar Despesa" | ✅ | ConfirmDialog |
| P&L Mensal | `(tabs)/expenses/resultado.tsx` | "P&L Mensal" | ✅ | — |

---

### Categorias

| Tela | Arquivo | Título no Header | Back | Modais / Dialogs |
|------|---------|-----------------|------|-----------------|
| Nova Categoria | `categories/add.tsx` | "Nova Categoria" | ✅ | ConfirmDialog |
| Editar Categoria | `categories/edit/[id].tsx` | "Editar Categoria" | ✅ | ConfirmDialog |

---

### Relatórios

| Tela | Arquivo | Título no Header | Back | Modais / Dialogs |
|------|---------|-----------------|------|-----------------|
| Relatório de Vendas | `reports/sales.tsx` | "Vendas" | ✅ | — |
| Vendas por Período | `reports/sales-period.tsx` | "Período" | ✅ | — |

---

### Configurações

| Tela | Arquivo | Título no Header | Back | Modais / Dialogs |
|------|---------|-----------------|------|-----------------|
| Branding / Marca | `settings/branding.tsx` | "Identidade Visual" | ✅ | ConfirmDialog |
| Descontos de Pagamento | `(tabs)/payment-discounts.tsx` | "Descontos" | — | ConfirmDialog |

---

### Catálogo Público

| Tela | Arquivo | Header | Notas |
|------|---------|--------|-------|
| Catálogo | `catalog.tsx` | — | Vitrine pública |

---

## 5. Mapeamento Tela × Modal

| Modal | Telas onde é usado |
|-------|--------------------|
| **ConfirmDialog** | `sale.tsx`, `sales/[id].tsx`, `products/[id].tsx`, `products/add.tsx`, `products/edit/[id].tsx`, `products/wizard.tsx`, `products/label/index.tsx`, `products/label/[id].tsx`, `customers/[id].tsx`, `customers/add.tsx`, `customers/edit/[id].tsx`, `entries/add.tsx`, `entries/[id].tsx`, `entries/add-stock.tsx`, `conditional/create.tsx`, `conditional/[id].tsx`, `expenses/index.tsx`, `expenses/create.tsx`, `expenses/edit.tsx`, `categories/add.tsx`, `categories/edit/[id].tsx`, `settings/branding.tsx`, `payment-discounts.tsx` |
| **CustomerSelectionModal** | `(tabs)/sale.tsx` |
| **ProductSelectionModal** | `(tabs)/sale.tsx` |
| **CategoryPickerModal** | `products/add.tsx`, `products/edit/[id].tsx`, `products/wizard.tsx` |
| **SimilarProductsModal** | `products/scan.tsx` |
| **ReturnModal** | `sales/[id].tsx` |
| **LabelProductPickerModal** | `products/label/index.tsx` |
| **ItemStatusModal** | `(tabs)/conditional/[id].tsx` |
| **MarkAsSentModal** | `(tabs)/conditional/[id].tsx` |

---

## Referências Rápidas de Arquivos

| Componente | Arquivo |
|-----------|---------|
| PageHeader | `components/layout/PageHeader.tsx` |
| ConfirmDialog | `components/ui/ConfirmDialog.tsx` |
| CustomerSelectionModal | `components/sale/CustomerSelectionModal.tsx` |
| ProductSelectionModal | `components/sale/ProductSelectionModal.tsx` |
| CategoryPickerModal | `components/ui/CategoryPickerModal.tsx` |
| SimilarProductsModal | `components/products/SimilarProductsModal.tsx` |
| ReturnModal | `components/sale/ReturnModal.tsx` |
| LabelProductPickerModal | `components/labels/LabelProductPickerModal.tsx` |
| ItemStatusModal | `components/conditional/ItemStatusModal.tsx` |
| MarkAsSentModal | `components/conditional/MarkAsSentModal.tsx` |
