# Padrão de Telas de Adição (Add Screens)

## 📋 Overview
Este documento define o padrão visual e estrutural para **todas as telas de adição/criação** no app mobile. Use este template sempre que criar novas telas de formulário.

## 🎨 Características Visuais

### Header Gradiente
- **Cor**: `Colors.light.primary` (sólida, sem degradê)
- **Componentes**:
  - Botão voltar (esquerda) → `router.push('/(tabs)/[section]')`
  - Título centralizado
  - Placeholder (direita, para simetria)
  - Subtítulo descritivo

### Cards com Ícones
- **Estrutura**: Card > Card.Content > cardHeader + inputs
- **Header do Card**:
  - Icon wrapper: 32x32, borderRadius 8, `primary+15%` background
  - Título do card: fontSize 16, fontWeight 600
  - Separador inferior (border-bottom)

### Dialogs
- **ConfirmDialog** para sucesso/erro (não Alert.alert)
- **Sucesso**: tipo "success", icon "checkmark-circle"
- **Erro**: tipo "danger", icon "alert-circle"

## 📁 Estrutura de Arquivo

```typescript
import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  TextInput,
  Button,
  HelperText,
  Text,
  Card,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, theme } from '@/constants/Colors';

export default function AddEntityScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Estados do formulário
  const [field1, setField1] = useState('');
  const [field2, setField2] = useState('');

  // Estados de validação e UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /**
   * Validar formulário
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!field1.trim()) {
      newErrors.field1 = 'Campo obrigatório';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Mutation: Criar entidade
   */
  const createMutation = useMutation({
    mutationFn: (data: EntityCreate) => createEntity(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['entities'] });
      setShowSuccessDialog(true);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.detail || error.message || 'Erro ao criar';
      setErrorMessage(message);
      setShowErrorDialog(true);
    },
  });

  /**
   * Submeter formulário
   */
  const handleSubmit = () => {
    if (!validateForm()) {
      setErrorMessage('Preencha todos os campos obrigatórios');
      setShowErrorDialog(true);
      return;
    }

    const data: EntityCreate = {
      field1: field1.trim(),
      field2: field2.trim() || undefined,
    };

    createMutation.mutate(data);
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      {/* Header Gradiente */}
      <LinearGradient
        colors={[Colors.light.primary, Colors.light.primary]}
        style={styles.headerGradient}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/entities')}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nova Entidade</Text>
          <View style={styles.headerPlaceholder} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerSubtitle}>Preencha os dados</Text>
        </View>
      </LinearGradient>

      <View style={styles.content}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
        {/* Card Exemplo 1 */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="cube-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Informações Básicas</Text>
            </View>

          <TextInput
            label="Campo 1 *"
            value={field1}
            onChangeText={(text) => {
              setField1(text);
              setErrors({ ...errors, field1: '' });
            }}
            mode="outlined"
            error={!!errors.field1}
            style={styles.input}
          />
          {errors.field1 ? (
            <HelperText type="error">{errors.field1}</HelperText>
          ) : null}
          </Card.Content>
        </Card>

        {/* Botões de ação */}
        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => router.push('/(tabs)/entities')}
            style={styles.button}
            disabled={createMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            style={[styles.button, styles.buttonPrimary]}
            loading={createMutation.isPending}
            disabled={createMutation.isPending}
          >
            Salvar
          </Button>
        </View>
        </ScrollView>
      </View>
      </KeyboardAvoidingView>

      {/* Dialog de Sucesso */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Sucesso!"
        message="Entidade criada com sucesso!"
        confirmText="OK"
        onConfirm={() => {
          setShowSuccessDialog(false);
          router.push('/(tabs)/entities');
        }}
        onCancel={() => {
          setShowSuccessDialog(false);
          router.push('/(tabs)/entities');
        }}
        type="success"
        icon="checkmark-circle"
      />

      {/* Dialog de Erro */}
      <ConfirmDialog
        visible={showErrorDialog}
        title="Erro"
        message={errorMessage}
        confirmText="OK"
        onConfirm={() => setShowErrorDialog(false)}
        onCancel={() => setShowErrorDialog(false)}
        type="danger"
        icon="alert-circle"
      />
    </View>
  );
}
```

## 🎨 Styles Obrigatórios

```typescript
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.primary, // IMPORTANTE: mesma cor do gradiente
  },
  // Header styles
  headerGradient: {
    paddingTop: theme.spacing.xl + 28,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.xl,
    fontWeight: 'bold' as const,
    color: '#fff',
  },
  headerPlaceholder: {
    width: 40,
  },
  headerInfo: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    maxWidth: '90%',
    alignSelf: 'center',
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.95,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: 'normal' as const,
  },
  // Content styles
  content: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  // Card styles
  card: {
    marginBottom: theme.spacing.md,
    borderRadius: 16,
    elevation: 2,
    backgroundColor: Colors.light.background,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.light.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  // Input styles
  input: {
    marginBottom: theme.spacing.sm,
    backgroundColor: Colors.light.background,
  },
  // Action styles
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  button: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: Colors.light.primary,
  },
});
```

## 🔧 Ícones Comuns

| Seção | Ícone Ionicons |
|-------|----------------|
| Informações Básicas | `cube-outline` |
| Dados Pessoais | `person-outline` |
| Documentos | `card-outline` |
| Endereço | `location-outline` |
| Categoria | `grid-outline` |
| Preços | `cash-outline` |
| Estoque | `archive-outline` |
| Viagem | `car-outline` |
| Data/Tempo | `calendar-outline` |
| Notas | `document-text-outline` |

## ✅ Checklist de Implementação

- [ ] Header gradiente com cor sólida `Colors.light.primary`
- [ ] Botão voltar com `router.push()` (não `goBack()`)
- [ ] Título centralizado + subtítulo
- [ ] Cards com `cardHeader`, `cardHeaderIcon`, `cardTitle`
- [ ] Inputs dentro de `Card.Content`
- [ ] Validação com estado `errors`
- [ ] `ConfirmDialog` para sucesso/erro (não `Alert.alert`)
- [ ] `useMutation` com `invalidateQueries` no `onSuccess`
- [ ] `handleSubmit` (não `handleSave`) para consistência
- [ ] Botões de ação: Cancelar (outlined) + Salvar (contained)
- [ ] Loading states nos botões durante mutation
- [ ] Styles completos (header, card, content, input, actions)

## 📦 Telas que Seguem Este Padrão

✅ **Implementado**:
- `mobile/app/entries/add.tsx` - Nova Entrada (REFERÊNCIA)
- `mobile/app/products/add.tsx` - Novo Produto
- `mobile/app/customers/add.tsx` - Novo Cliente

⏳ **Pendente**:
- `mobile/app/trips/add.tsx` - Nova Viagem (precisa atualizar)

## 🚫 O Que Evitar

❌ **Não usar**:
- `Alert.alert()` para confirmações (use `ConfirmDialog`)
- `useBackToList` hook (use `router.push()` direto)
- Degradês no header (`[primary, secondary]` → só `[primary, primary]`)
- `SafeAreaView` como container (use `View` + `KeyboardAvoidingView`)
- Hard-coded colors (use `Colors.light.*` constants)
- Seções com `<View style={styles.section}>` (use `<Card>`)

✅ **Sempre usar**:
- `ConfirmDialog` para feedback
- `router.push('/(tabs)/[section]')` para navegação
- `Card` para agrupar inputs relacionados
- `cardHeader` com ícone para cada card
- Estados de loading/error
- React Query mutation patterns

---

**Última atualização**: 27 de novembro de 2025
**Mantido por**: Equipe de Frontend
