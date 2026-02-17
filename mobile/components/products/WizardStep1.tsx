/**
 * WizardStep1 - Identificar Produto
 *
 * Opções: Scanner IA | Manual | Catálogo
 * Reutiliza lógica do useAIScanner via useProductWizard
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  TextInput as RNTextInput,
} from 'react-native';
import { Text, Button, TextInput, Card, ProgressBar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import type { UseProductWizardReturn } from '@/hooks/useProductWizard';
import type { IdentifyMethod } from '@/types/wizard';
import type { Category } from '@/types';
import CategoryPickerModal from '@/components/ui/CategoryPickerModal';

interface WizardStep1Props {
  wizard: UseProductWizardReturn;
  categories: Category[];
  onNext: () => void;
}

export default function WizardStep1({
  wizard,
  categories,
  onNext,
}: WizardStep1Props) {
  const { state } = wizard;
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  // Renderiza seleção de método
  const renderMethodSelection = () => (
    <View style={styles.methodContainer}>
      <Text style={styles.sectionTitle}>Como deseja cadastrar?</Text>

      <View style={styles.methodButtons}>
        {/* Scanner IA */}
        <TouchableOpacity
          style={[
            styles.methodButton,
            state.identifyMethod === 'scanner' && styles.methodButtonActive,
          ]}
          onPress={() => wizard.selectMethod('scanner')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={state.identifyMethod === 'scanner'
              ? [Colors.light.primary, Colors.light.secondary]
              : ['#F3F4F6', '#F3F4F6']}
            style={styles.methodButtonGradient}
          >
            <Ionicons
              name="scan"
              size={32}
              color={state.identifyMethod === 'scanner' ? '#fff' : Colors.light.primary}
            />
            <Text style={[
              styles.methodButtonText,
              state.identifyMethod === 'scanner' && styles.methodButtonTextActive,
            ]}>
              Scanner IA
            </Text>
            <Text style={[
              styles.methodButtonSubtext,
              state.identifyMethod === 'scanner' && styles.methodButtonSubtextActive,
            ]}>
              Foto do produto
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Manual */}
        <TouchableOpacity
          style={[
            styles.methodButton,
            state.identifyMethod === 'manual' && styles.methodButtonActive,
          ]}
          onPress={() => wizard.selectMethod('manual')}
          activeOpacity={0.8}
        >
          <View style={[
            styles.methodButtonContent,
            state.identifyMethod === 'manual' && styles.methodButtonContentActive,
          ]}>
            <Ionicons
              name="pencil"
              size={32}
              color={state.identifyMethod === 'manual' ? Colors.light.primary : Colors.light.textSecondary}
            />
            <Text style={[
              styles.methodButtonText,
              state.identifyMethod === 'manual' && styles.methodButtonTextManual,
            ]}>
              Manual
            </Text>
            <Text style={styles.methodButtonSubtext}>
              Digitar dados
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Renderiza interface do scanner
  const renderScanner = () => {
    // Estado inicial - botões de captura
    if (!state.capturedImage && !state.isAnalyzing) {
      return (
        <View style={styles.scannerContainer}>
          <View style={styles.illustrationContainer}>
            <LinearGradient
              colors={[Colors.light.primary + '20', Colors.light.secondary + '20']}
              style={styles.illustrationGradient}
            >
              <Ionicons name="camera" size={60} color={Colors.light.primary} />
            </LinearGradient>
          </View>

          <Text style={styles.scannerTitle}>Capture o produto</Text>
          <Text style={styles.scannerSubtitle}>
            A IA vai identificar automaticamente os dados
          </Text>

          <View style={styles.captureButtons}>
            <Button
              mode="contained"
              onPress={wizard.takePhoto}
              icon="camera"
              style={styles.captureButton}
              contentStyle={styles.captureButtonContent}
            >
              Tirar Foto
            </Button>

            <Button
              mode="contained"
              onPress={wizard.pickFromGallery}
              icon="image-multiple"
              style={styles.captureButton}
              contentStyle={styles.captureButtonContent}
            >
              Galeria
            </Button>
          </View>

          {/* Dicas */}
          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>Dicas:</Text>
            <View style={styles.tipRow}>
              <Ionicons name="sunny-outline" size={14} color={Colors.light.textSecondary} />
              <Text style={styles.tipText}>Boa iluminação</Text>
            </View>
            <View style={styles.tipRow}>
              <Ionicons name="expand-outline" size={14} color={Colors.light.textSecondary} />
              <Text style={styles.tipText}>Produto centralizado</Text>
            </View>
          </View>
        </View>
      );
    }

    // Estado de análise
    if (state.isAnalyzing) {
      return (
        <View style={styles.analyzingContainer}>
          {state.capturedImage && (
            <Image
              source={{ uri: state.capturedImage }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          )}
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.analyzingText}>Analisando...</Text>
            <ProgressBar indeterminate color="#fff" style={styles.progressBar} />
          </View>
        </View>
      );
    }

    // Resultado da análise
    if (state.scanResult) {
      return (
        <View style={styles.resultContainer}>
          {state.capturedImage && (
            <View style={styles.resultImageContainer}>
              <Image
                source={{ uri: state.capturedImage }}
                style={styles.resultImage}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={wizard.retakePhoto}
              >
                <Ionicons name="camera-reverse" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* Badges de status */}
          <View style={styles.badgesRow}>
            <View style={[styles.badge, { backgroundColor: Colors.light.success + '20' }]}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.light.success} />
              <Text style={[styles.badgeText, { color: Colors.light.success }]}>
                Identificado
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: Colors.light.primary + '20' }]}>
              <Ionicons name="analytics" size={14} color={Colors.light.primary} />
              <Text style={[styles.badgeText, { color: Colors.light.primary }]}>
                {Math.round(state.scanResult.confidence * 100)}% confiança
              </Text>
            </View>
          </View>

          {/* Preview dos dados */}
          <Card style={styles.previewCard}>
            <Card.Content>
              <Text style={styles.previewName}>{state.scanResult.name}</Text>
              <Text style={styles.previewSku}>SKU: {state.scanResult.suggested_sku}</Text>
              <Text style={styles.previewCategory}>{state.scanResult.suggested_category}</Text>
            </Card.Content>
          </Card>

          {/* Aviso de duplicados */}
          {state.duplicates.length > 0 && (
            <View style={styles.duplicatesWarning}>
              <Ionicons name="warning" size={18} color={Colors.light.warning} />
              <Text style={styles.duplicatesText}>
                {state.duplicates.length} produto(s) similar(es) encontrado(s)
              </Text>
            </View>
          )}

          <Button
            mode="contained"
            onPress={onNext}
            style={styles.nextButton}
            icon="arrow-right"
            contentStyle={styles.nextButtonContent}
          >
            Revisar Dados
          </Button>
        </View>
      );
    }

    // Erro
    if (state.analyzeError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={Colors.light.error} />
          <Text style={styles.errorText}>{state.analyzeError}</Text>
          <Button mode="contained" onPress={wizard.retakePhoto}>
            Tentar Novamente
          </Button>
        </View>
      );
    }

    return null;
  };

  // Renderiza formulário manual
  const renderManualForm = () => {
    const selectedCategory = categories.find(c => c.id === state.productData.category_id);

    return (
      <View style={styles.manualContainer}>
        <Text style={styles.manualTitle}>Dados Básicos</Text>
        <Text style={styles.manualSubtitle}>
          Preencha o mínimo para avançar. Você poderá completar depois.
        </Text>

        <TextInput
          label="Nome do Produto *"
          value={state.productData.name || ''}
          onChangeText={(text) => wizard.setManualData({ name: text })}
          mode="outlined"
          style={styles.input}
          placeholder="Ex: Legging Fitness Preta"
        />

        <TouchableOpacity
          style={styles.categoryButton}
          onPress={() => setCategoryModalVisible(true)}
        >
          <View style={styles.categoryButtonContent}>
            <Ionicons
              name="grid-outline"
              size={20}
              color={selectedCategory ? Colors.light.primary : Colors.light.textTertiary}
            />
            <Text style={selectedCategory ? styles.categoryText : styles.categoryPlaceholder}>
              {selectedCategory?.name || 'Selecionar categoria *'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.light.textTertiary} />
          </View>
        </TouchableOpacity>

        <Button
          mode="contained"
          onPress={onNext}
          style={styles.nextButton}
          icon="arrow-right"
          disabled={!state.productData.name || !state.productData.category_id}
        >
          Continuar
        </Button>

        <CategoryPickerModal
          visible={categoryModalVisible}
          categories={categories}
          selectedId={state.productData.category_id}
          onSelect={(category) => {
            wizard.setManualData({ category_id: category.id });
            setCategoryModalVisible(false);
          }}
          onDismiss={() => setCategoryModalVisible(false)}
        />
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Seleção de método */}
      {renderMethodSelection()}

      {/* Interface específica do método */}
      {state.identifyMethod === 'scanner' && renderScanner()}
      {state.identifyMethod === 'manual' && renderManualForm()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  methodContainer: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  methodButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  methodButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  methodButtonActive: {
    borderColor: Colors.light.primary,
  },
  methodButtonGradient: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    gap: 8,
  },
  methodButtonContent: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
  },
  methodButtonContentActive: {
    backgroundColor: Colors.light.primary + '15',
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  methodButtonTextActive: {
    color: '#fff',
  },
  methodButtonTextManual: {
    color: Colors.light.primary,
  },
  methodButtonSubtext: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  methodButtonSubtextActive: {
    color: 'rgba(255,255,255,0.8)',
  },

  // Scanner
  scannerContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  illustrationContainer: {
    marginBottom: theme.spacing.lg,
  },
  illustrationGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
  },
  scannerSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  captureButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  captureButton: {
    backgroundColor: Colors.light.primary,
  },
  captureButtonContent: {
    paddingVertical: 6,
  },
  tipsContainer: {
    backgroundColor: Colors.light.backgroundSecondary,
    padding: theme.spacing.md,
    borderRadius: 12,
    width: '100%',
  },
  tipsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 8,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },

  // Analyzing
  analyzingContainer: {
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  analyzingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  progressBar: {
    width: 200,
    height: 4,
    borderRadius: 2,
  },

  // Result
  resultContainer: {
    gap: theme.spacing.md,
  },
  resultImageContainer: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  resultImage: {
    width: '100%',
    height: '100%',
  },
  retakeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  previewCard: {
    borderRadius: 12,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 4,
  },
  previewSku: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  previewCategory: {
    fontSize: 13,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  duplicatesWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.warning + '15',
    padding: theme.spacing.md,
    borderRadius: 12,
  },
  duplicatesText: {
    fontSize: 13,
    color: Colors.light.text,
    flex: 1,
  },
  nextButton: {
    marginTop: theme.spacing.md,
    backgroundColor: Colors.light.primary,
  },
  nextButtonContent: {
    paddingVertical: 6,
  },

  // Error
  errorContainer: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xl,
  },
  errorText: {
    fontSize: 14,
    color: Colors.light.error,
    textAlign: 'center',
  },

  // Manual Form
  manualContainer: {
    marginTop: theme.spacing.lg,
  },
  manualTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
  },
  manualSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  input: {
    marginBottom: theme.spacing.md,
    backgroundColor: '#fff',
  },
  categoryButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    borderRadius: 12,
    backgroundColor: '#fff',
    marginBottom: theme.spacing.md,
  },
  categoryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    minHeight: 56,
    gap: 12,
  },
  categoryText: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
    fontWeight: '600',
  },
  categoryPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.textTertiary,
  },
});
