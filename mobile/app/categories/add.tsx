import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
  Text,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCreateCategory, useCategories } from '@/hooks/useCategories';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import CategoryPickerModal from '@/components/ui/CategoryPickerModal';

export default function AddCategoryScreen() {
  const router = useRouter();
  const goBack = () => router.back();
  const brandingColors = useBrandingColors();
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

  // Animação de entrada
  const headerOpacity = useSharedValue(0);
  const headerScale = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY = useSharedValue(24);

  useFocusEffect(
    useCallback(() => {
      headerOpacity.value = 0;
      headerScale.value = 0.94;
      contentOpacity.value = 0;
      contentTransY.value = 24;

      headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
      headerScale.value = withSpring(1, { damping: 16, stiffness: 200 });
      
      const timer = setTimeout(() => {
        contentOpacity.value = withTiming(1, { duration: 340 });
        contentTransY.value = withSpring(0, { damping: 18, stiffness: 200 });
      }, 140);

      return () => clearTimeout(timer);
    }, [])
  );

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />

      {/* Header animado */}
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Nova Categoria"
          subtitle="Preencha os dados da categoria"
          showBackButton
          onBack={() => router.back()}
        />
      </Animated.View>

      {/* Conteúdo animado */}
      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Card de informações */}
          <View style={styles.card}>
            <View style={styles.cardSection}>
              <Ionicons name="pricetag-outline" size={20} color={brandingColors.primary} />
              <Text style={styles.sectionTitle}>INFORMAÇÕES DA CATEGORIA</Text>
            </View>

            <Text style={styles.inputLabel}>NOME *</Text>
            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                setNameError('');
              }}
              placeholder="Ex: Suplementos"
              placeholderTextColor={Colors.light.textTertiary}
              style={[styles.input, nameError ? styles.inputError : null]}
            />
            {nameError ? <Text style={styles.error}>{nameError}</Text> : null}

            <Text style={styles.inputLabel}>DESCRIÇÃO (OPCIONAL)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Digite uma descrição..."
              placeholderTextColor={Colors.light.textTertiary}
              style={[styles.input, styles.inputMultiline]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Card de hierarquia */}
          <View style={styles.card}>
            <View style={styles.cardSection}>
              <Ionicons name="git-branch-outline" size={20} color={brandingColors.primary} />
              <Text style={styles.sectionTitle}>HIERARQUIA</Text>
            </View>

            <Text style={styles.fieldLabel}>Categoria Pai (opcional)</Text>
            <Text style={styles.fieldHint}>
              Deixe vazio para criar categoria raiz, ou selecione uma categoria pai.
            </Text>

            {selectedParent ? (
              <View style={[styles.selectedParent, { borderColor: brandingColors.primary + '30', backgroundColor: brandingColors.primary + '10' }]}>
                <View style={[styles.selectedParentIcon, { backgroundColor: brandingColors.primary + '20' }]}>
                  <Ionicons name="pricetags-outline" size={20} color={brandingColors.primary} />
                </View>
                <View style={styles.selectedParentInfo}>
                  <Text style={styles.selectedParentName}>{selectedParent.name}</Text>
                  {selectedParent.description ? (
                    <Text style={styles.selectedParentDesc} numberOfLines={1}>
                      {selectedParent.description}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={handleClearParent}
                  style={styles.clearBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="close-circle"
                    size={22}
                    color={Colors.light.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.selectParentBtn, { borderColor: brandingColors.primary }]}
                onPress={() => setShowParentPicker(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={20} color={brandingColors.primary} />
                <Text style={[styles.selectParentText, { color: brandingColors.primary }]}>
                  Selecionar categoria pai
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Botão criar */}
          <TouchableOpacity
            style={[styles.saveBtn, createMutation.isPending && styles.saveBtnDisabled]}
            onPress={handleSubmit}
            disabled={createMutation.isPending}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={createMutation.isPending ? ['#9CA3AF', '#9CA3AF'] : brandingColors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtnGradient}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              )}
              <Text style={styles.saveBtnText}>
                {createMutation.isPending ? 'Criando...' : 'Criar Categoria'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>

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
          goBack();
        }}
        onCancel={() => {
          setShowSuccessDialog(false);
          goBack();
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

  // Scroll & Content
  scroll: { flex: 1 },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },

  // Card
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
    gap: theme.spacing.md,
  },
  cardSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Inputs
  inputLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.light.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: 14,
  },
  inputError: {
    borderColor: Colors.light.error,
  },
  error: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.error,
    marginTop: -10,
  },

  // Hierarchy
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
  },
  fieldHint: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  selectParentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  selectParentText: {
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  selectedParent: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    marginTop: theme.spacing.sm,
  },
  selectedParentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginTop: theme.spacing.sm,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: theme.fontSize.base,
  },
});
