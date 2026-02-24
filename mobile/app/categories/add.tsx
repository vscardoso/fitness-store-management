import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Text, TextInput, Button } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCreateCategory, useCategories } from '@/hooks/useCategories';
import { Colors, theme } from '@/constants/Colors';
import CategoryPickerModal from '@/components/ui/CategoryPickerModal';

export default function AddCategoryScreen() {
  const router = useRouter();
  const createMutation = useCreateCategory();
  const { categories } = useCategories();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState<number | undefined>(undefined);
  const [showParentPicker, setShowParentPicker] = useState(false);

  const [nameError, setNameError] = useState('');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Apenas categorias raiz como opções de pai
  const rootCategories = categories.filter((c) => !c.parent_id);
  const selectedParent = categories.find((c) => c.id === parentId);

  const validate = (): boolean => {
    if (!name.trim() || name.trim().length < 2) {
      setNameError('Nome deve ter ao menos 2 caracteres');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) {
      setErrorMessage('Preencha todos os campos obrigatórios corretamente');
      setShowErrorDialog(true);
      return;
    }

    createMutation.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        parent_id: parentId,
      },
      {
        onSuccess: () => setShowSuccessDialog(true),
        onError: (err: any) => {
          const msg = err?.response?.data?.detail || 'Não foi possível criar a categoria. Tente novamente.';
          setErrorMessage(msg);
          setShowErrorDialog(true);
        },
      }
    );
  };

  const handleClearParent = () => setParentId(undefined);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />

      {/* Header */}
      <LinearGradient
        colors={[Colors.light.primary, Colors.light.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Nova Categoria</Text>
          <Text style={styles.headerSubtitle}>Preencha os dados da categoria</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Card do formulário */}
        <View style={styles.card}>
          <View style={styles.cardSection}>
            <Ionicons name="pricetag" size={20} color={Colors.light.primary} />
            <Text style={styles.sectionTitle}>Informações da Categoria</Text>
          </View>

          {/* Nome */}
          <TextInput
            label="Nome da Categoria *"
            value={name}
            onChangeText={(v) => { setName(v); setNameError(''); }}
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="tag" />}
            error={!!nameError}
          />
          {nameError ? <Text style={styles.error}>{nameError}</Text> : null}

          {/* Descrição */}
          <TextInput
            label="Descrição (opcional)"
            value={description}
            onChangeText={setDescription}
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="text" />}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Card de hierarquia */}
        <View style={styles.card}>
          <View style={styles.cardSection}>
            <Ionicons name="git-branch" size={20} color={Colors.light.primary} />
            <Text style={styles.sectionTitle}>Hierarquia</Text>
          </View>

          <Text style={styles.fieldLabel}>Categoria Pai (opcional)</Text>
          <Text style={styles.fieldHint}>
            Deixe vazio para criar categoria raiz, ou selecione uma categoria pai.
          </Text>

          {/* Seletor de pai */}
          {selectedParent ? (
            <View style={styles.selectedParent}>
              <View style={styles.selectedParentIcon}>
                <Ionicons name="pricetags" size={20} color={Colors.light.primary} />
              </View>
              <View style={styles.selectedParentInfo}>
                <Text style={styles.selectedParentName}>{selectedParent.name}</Text>
                {selectedParent.description ? (
                  <Text style={styles.selectedParentDesc} numberOfLines={1}>
                    {selectedParent.description}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={handleClearParent} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={22} color={Colors.light.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.selectParentBtn}
              onPress={() => setShowParentPicker(true)}
            >
              <Ionicons name="add-circle-outline" size={20} color={Colors.light.primary} />
              <Text style={styles.selectParentText}>Selecionar categoria pai</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Botão salvar */}
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={createMutation.isPending}
          disabled={createMutation.isPending}
          icon="check"
          style={styles.saveBtn}
          contentStyle={styles.saveBtnContent}
        >
          Criar Categoria
        </Button>
      </ScrollView>

      {/* Modal de seleção de categoria pai */}
      <CategoryPickerModal
        visible={showParentPicker}
        categories={rootCategories}
        onSelect={(category) => {
          setParentId(category.id);
          setShowParentPicker(false);
        }}
        onDismiss={() => setShowParentPicker(false)}
        selectedId={parentId}
      />

      {/* Dialog de Sucesso */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Sucesso!"
        message="Categoria criada com sucesso!"
        confirmText="OK"
        onConfirm={() => {
          setShowSuccessDialog(false);
          router.back();
        }}
        onCancel={() => {
          setShowSuccessDialog(false);
          router.back();
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: theme.spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },

  // Scroll & Content
  scroll: { flex: 1 },
  content: {
    padding: theme.spacing.md,
    paddingBottom: 60,
    gap: theme.spacing.md,
  },

  // Card
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    gap: theme.spacing.sm,
  },
  cardSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
  },

  // Inputs
  input: {
    backgroundColor: Colors.light.card,
  },
  error: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.error,
    marginTop: -theme.spacing.xs,
    marginLeft: 4,
  },

  // Hierarchy
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
    marginTop: theme.spacing.xs,
  },
  fieldHint: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  selectParentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.light.primary,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  selectParentText: {
    fontSize: theme.fontSize.base,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  selectedParent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.primary + '10',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.primary + '30',
  },
  selectedParentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedParentInfo: {
    flex: 1,
  },
  selectedParentName: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.text,
  },
  selectedParentDesc: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  clearBtn: {
    padding: 4,
  },

  // Save Button
  saveBtn: {
    borderRadius: 12,
    marginTop: theme.spacing.sm,
  },
  saveBtnContent: {
    paddingVertical: theme.spacing.sm,
  },
});
