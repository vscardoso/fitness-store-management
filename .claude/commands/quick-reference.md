# Quick Reference — fitness-store-management

## Tipos de FULL-STACK

| Tipo | Quando usar |
|------|-------------|
| `ADD-FIELD` | Adicionar campo a entidade existente |
| `NEW-FEATURE` | Criar funcionalidade completa do zero |
| `MODIFY-FLOW` | Alterar fluxo/comportamento existente |
| `FIX-INCONSISTENCY` | Corrigir bug, dado ou status inconsistente |
| `REFACTOR` | Melhorar código sem mudar funcionalidade |
| `UI-UPGRADE` | Atualizar tela com todos os padrões visuais atuais |

Sintaxe: `FULL-STACK [TIPO]: [descrição]`

---

## Prompts prontos — UI-UPGRADE

### Tela de Listagem
```
FULL-STACK UI-UPGRADE: [NOME DA TELA] — [CAMINHO]

1. Header → <PageHeader> (useBrandingColors internamente, não passar cores manuais)
2. Cards → <View> com: { backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border, ...theme.shadows.sm }
3. Cores de marca → useBrandingColors(): primary, secondary, accent, gradient
4. Animação → useFocusEffect (tabs): header scale 0.94→1 + opacity 0→1 (spring); conteúdo translateY 24→0 + opacity 0→1 (delay 140ms)
5. Lista → FlatList com contentContainerStyle: { paddingBottom: theme.spacing.xxl, gap: theme.spacing.sm }, ListEmptyComponent visual, showsVerticalScrollIndicator: false
6. FAB → brandingColors.primary

Não alterar: lógica de negócio, queries, navegação, outros arquivos.
```

### Tela com Dados Financeiros
```
FULL-STACK UI-UPGRADE: [NOME DA TELA] — [CAMINHO]

1. Header → <PageHeader>
2. Valores → VALUE_COLORS: positive (#10B981), negative (#EF4444), warning (#F59E0B), neutral (#11181C)
   Helper: valueColor(valor, 'profit'|'revenue'|'cost'|'auto') de @/utils/format
3. Valores monetários: { fontSize: 18–28, fontWeight: '800', letterSpacing: -0.5 }
4. Cards → <View> direto
5. Animação → useFocusEffect
6. Badges: backgroundColor: COR+'18', borderRadius: sm, fontSize: 10, fontWeight: '700', UPPERCASE

Não alterar: lógica de cálculo, queries, navegação, outros arquivos.
```

### Tela com Formulário
```
FULL-STACK UI-UPGRADE: [NOME DA TELA] — [CAMINHO]

1. Header → <PageHeader title="..." showBackButton onBack={router.back} />
2. Inputs → TextInput nativo: { backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border, paddingHorizontal: theme.spacing.md, height: 52, fontSize: theme.fontSize.base }
3. Botão primário → TouchableOpacity + LinearGradient com brandingColors.gradient
4. Labels de seção → UPPERCASE, fontSize: 10–12, fontWeight: '600', color: Colors.light.textTertiary
5. Animação → useFocusEffect
6. KeyboardAvoidingView → behavior: Platform.OS === 'ios' ? 'padding' : undefined

Não alterar: validações, lógica de submit, navegação, outros arquivos.
```

### Correção cirúrgica de cores
```
FULL-STACK UI-UPGRADE: [NOME DA TELA] — somente cores

1. Cores de marca hardcoded → useBrandingColors() (importar de @/store/brandingStore)
   Substituir: '#6366F1', '#8B5CF6', Colors.light.primary
   Por: brandingColors.primary, brandingColors.gradient

2. Cores financeiras → VALUE_COLORS (importar de @/constants/Colors)
   Substituir: '#10B981', '#EF4444', '#F59E0B'
   Por: VALUE_COLORS.positive, VALUE_COLORS.negative, VALUE_COLORS.warning

3. StyleSheet.create com hooks → mover para inline style (StyleSheet não aceita valores de hooks)

Não alterar estrutura, layout ou lógica.
```

---

## Padrões mobile obrigatórios

**Botão primário:** `TouchableOpacity + LinearGradient` (nunca `<Button>` do Paper)

**Ordem dos botões:** secundário → destrutivo → primário (destaque à direita)

**Header:** `<PageHeader>` de `@/components/layout/PageHeader` — nunca `LinearGradient` manual

**Tokens:**
- `theme.spacing`: xxs=2, xs=4, sm=8, md=16, lg=24, xl=32, xxl=48
- `theme.fontSize`: xxs=10, xs=12, sm=14, base=16, lg=18, xl=20, xxl=24
- `theme.borderRadius`: sm=4, md=8, lg=12, xl=16, xxl=24, full=9999

---

## Checklist UI-UPGRADE

- [ ] `<PageHeader>` sem cores manuais
- [ ] `useBrandingColors()` — zero hex hardcoded de marca
- [ ] `VALUE_COLORS` — zero hex hardcoded de dados financeiros
- [ ] Zero `<Card>` ou `<Button>` do Paper em áreas críticas
- [ ] `useFocusEffect` com spring/timing (não `useEffect([])` em tabs)
- [ ] `paddingBottom: theme.spacing.xxl` no fim de listas
- [ ] `ListEmptyComponent` visual (ícone + título + subtítulo)
- [ ] `activeOpacity` em todos os `TouchableOpacity`
- [ ] `numberOfLines` em textos de comprimento variável

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Mudança feita mas com erros | `FULL-STACK FIX-INCONSISTENCY: [erro exato]` |
| Claude ignorou uma camada | "Também precisa atualizar o [camada] para [ação]" |
| Não sei qual tipo usar | ADD-FIELD (campo) / NEW-FEATURE (novo) / MODIFY-FLOW (mudar) / FIX (bug) |
| Camada executada na ordem errada | Especificar: "Ordem: Backend → Mobile → Web" |

---

## Fluxo de mudança

**Backend:** Model → Schema → `python migrate.py "descrição"` → Service → Endpoint

**Mobile:** Type → Service → Component → Screen → `queryClient.invalidateQueries()`

**Web:** Type → Service → Page/Component
