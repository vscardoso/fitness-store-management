/**
 * Product Wizard - Fluxo unificado de criação de produtos
 *
 * 3 etapas:
 * 1. Identificar - Scanner IA ou Manual
 * 2. Confirmar - Revisar e editar dados
 * 3. Entrada - Vincular a entrada de estoque
 */

import React, { useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  BackHandler,
  Platform,
  AccessibilityInfo,
  Animated,
} from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useCategories } from '@/hooks';
import { useProductWizard } from '@/hooks/useProductWizard';
import type { IdentifyMethod } from '@/types/wizard';
import WizardStepper from '@/components/products/WizardStepper';
import WizardStep1 from '@/components/products/WizardStep1';
import WizardStep2 from '@/components/products/WizardStep2';
import WizardStep3 from '@/components/products/WizardStep3';
import WizardComplete from '@/components/products/WizardComplete';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function ProductWizardScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const params = useLocalSearchParams<{
    method?: string;
    /** Dados pré-preenchidos do scanner IA (JSON string com campos do produto) */
    prefillData?: string;
    // Params de retorno do entries/add ou entries/index (entrada existente)
    returnFromEntry?: string;
    createdEntryId?: string;
    createdEntryCode?: string;
    createdEntryQuantity?: string;
    createdEntrySupplier?: string;
    createdProductData?: string; // Dados do produto para restaurar
    // Params do catálogo
    catalogProductData?: string; // Dados do produto selecionado do catálogo
    restoreStep?: string;
    restoreProductData?: string;
  }>();
  const { categories } = useCategories();
  const wizard = useProductWizard();
  const { state } = wizard;
  const restoreFromRoute = wizard.restoreFromRoute;
  const handleEntryCreated = wizard.handleEntryCreated;

  const [showExitDialog, setShowExitDialog] = React.useState(false);
  const [showSkipEntryDialog, setShowSkipEntryDialog] = React.useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = React.useState(false);
  const contentOpacity = React.useRef(new Animated.Value(1)).current;
  const contentTranslateY = React.useRef(new Animated.Value(0)).current;
  const lastRestoreKeyRef = React.useRef<string | null>(null);
  const lastEntryReturnKeyRef = React.useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotionEnabled(enabled);
        }
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotionEnabled) {
      contentOpacity.setValue(1);
      contentTranslateY.setValue(0);
      return;
    }

    contentOpacity.setValue(0);
    contentTranslateY.setValue(10);

    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [state.currentStep, reduceMotionEnabled, contentOpacity, contentTranslateY]);

  // Se veio com method=scanner, já inicia no modo scanner
  useEffect(() => {
    if (params.method === 'scanner' && !state.identifyMethod) {
      wizard.selectMethod('scanner');
    }
    
    // Se veio com method=catalog, processar dados do catálogo
    if (params.method === 'catalog' && params.catalogProductData && !state.identifyMethod) {
      try {
        const catalogProduct = JSON.parse(params.catalogProductData);
        wizard.selectMethod('catalog');
        wizard.selectCatalogProduct(catalogProduct as any);
      } catch (e) {
        console.error('Erro ao parsear catalogProductData:', e);
      }
    }

    // Se veio com prefillData (scanner editManually), pular Step 1 e ir direto ao Step 2
    if (params.prefillData && !state.identifyMethod) {
      try {
        const data = JSON.parse(params.prefillData);
        wizard.selectMethod('manual');
        wizard.setManualData(data);
        wizard.goToStep('confirm');
      } catch (e) {
        console.error('Erro ao parsear prefillData:', e);
        // Fallback: abrir modo manual normal
        wizard.selectMethod('manual');
      }
    }
  }, [params.method, params.catalogProductData, params.prefillData]);

  // Restaurar etapa ao voltar da tela de entrada (mantendo fluxo no wizard)
  useEffect(() => {
    if (!params.restoreStep) return;

    const restoreKey = `${params.restoreStep}|${params.restoreProductData || ''}`;
    if (lastRestoreKeyRef.current === restoreKey) return;
    lastRestoreKeyRef.current = restoreKey;

    const step = params.restoreStep as any;
    if (step === 'identify' || step === 'confirm' || step === 'entry' || step === 'complete') {
      let restoreProduct: any = undefined;
      if (params.restoreProductData) {
        try {
          restoreProduct = JSON.parse(params.restoreProductData);
        } catch (e) {
          console.error('Erro ao parsear restoreProductData:', e);
        }
      }
      restoreFromRoute(step, restoreProduct);
    }
  }, [params.restoreStep, params.restoreProductData, restoreFromRoute]);

  // Processar retorno do entries/add ou entries/index (entrada existente)
  useEffect(() => {
    if (params.returnFromEntry === 'true' && params.createdEntryId) {
      const returnKey = [
        params.createdEntryId,
        params.createdEntryCode || '',
        params.createdEntryQuantity || '',
        params.createdEntrySupplier || '',
        params.createdProductData || '',
      ].join('|');
      if (lastEntryReturnKeyRef.current === returnKey) return;
      lastEntryReturnKeyRef.current = returnKey;

      // Restaurar dados do produto se vier de entrada existente
      let productData = null;
      if (params.createdProductData) {
        try {
          productData = JSON.parse(params.createdProductData);
        } catch (e) {
          console.error('Erro ao parsear createdProductData:', e);
        }
      }

      handleEntryCreated(
        {
          id: parseInt(params.createdEntryId, 10),
          code: params.createdEntryCode || '',
          quantity: parseInt(params.createdEntryQuantity || '1', 10),
          supplier: params.createdEntrySupplier,
        },
        productData // Passar dados do produto para restaurar
      );
    }
  }, [
    params.returnFromEntry,
    params.createdEntryId,
    params.createdEntryCode,
    params.createdEntryQuantity,
    params.createdEntrySupplier,
    params.createdProductData,
    handleEntryCreated,
  ]);

  // Handle hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });

    return () => backHandler.remove();
  }, [state.isDirty, state.currentStep]);

  const handleBack = useCallback(async () => {
    // Back sempre volta para o passo anterior do fluxo.
    if (state.currentStep === 'identify') {
      // No primeiro passo, confirma saída em vez de navegar direto para home.
      setShowExitDialog(true);
      return;
    }

    // Se está em outro step, volta para o anterior
    if (state.currentStep === 'confirm') {
      wizard.goToStep('identify');
      return;
    }

    // Se está no Step 3 (produto já criado), confirmar antes de pular a entrada
    if (state.currentStep === 'entry') {
      if (!state.createdProduct) {
        wizard.goToStep('confirm');
        return;
      }
      setShowSkipEntryDialog(true);
      return;
    }

    // Se está no Step 4 (complete), volta para Step 3
    if (state.currentStep === 'complete') {
      wizard.goToStep('entry');
      return;
    }

    // Se tem dados não salvos, confirmar saída
    if (state.isDirty) {
      setShowExitDialog(true);
    } else {
      router.back();
    }
  }, [state.currentStep, state.isDirty, wizard, router]);

  const handleStepPress = useCallback((targetStep: 'identify' | 'confirm' | 'entry' | 'complete') => {
    if (targetStep === state.currentStep) {
      // Refresh explícito do Step 3 para reidratar contexto sem reset destrutivo.
      if (targetStep === 'entry') {
        restoreFromRoute('entry', state.createdProduct ?? state.productData);
      }
      return;
    }

    if (targetStep === 'identify') {
      wizard.goToStep('identify');
      return;
    }

    if (targetStep === 'confirm') {
      if (state.identifyMethod || state.productData?.name) {
        wizard.goToStep('confirm');
      }
      return;
    }

    if (targetStep === 'entry') {
      if (state.createdProduct) {
        wizard.goToStep('entry');
      }
      return;
    }

    if (targetStep === 'complete' && state.linkedEntry) {
      wizard.goToStep('complete');
    }
  }, [state.currentStep, state.identifyMethod, state.productData, state.createdProduct, state.linkedEntry, wizard, restoreFromRoute]);

  const getBlockedReason = useCallback((targetStep: 'identify' | 'confirm' | 'entry' | 'complete') => {
    if (targetStep === 'identify') return null;

    if (targetStep === 'confirm') {
      if (!state.identifyMethod && !state.productData?.name) {
        return 'Primeiro escolha um método e identifique o produto.';
      }
      return null;
    }

    if (targetStep === 'entry' && !state.createdProduct) {
      return 'Conclua a etapa Confirmar para criar/selecionar o produto.';
    }

    if (targetStep === 'complete' && !state.linkedEntry) {
      return 'Finalize a vinculação da entrada para liberar o resumo.';
    }

    return null;
  }, [state.identifyMethod, state.productData, state.createdProduct, state.linkedEntry]);

  const confirmExit = () => {
    setShowExitDialog(false);
    wizard.resetWizard();
    router.back();
  };

  const getHeaderTitle = () => {
    switch (state.currentStep) {
      case 'identify':
        return 'Novo Produto';
      case 'confirm':
        return 'Confirmar Dados';
      case 'entry':
        return 'Vincular Estoque';
      case 'complete':
        return 'Concluido';
      default:
        return 'Cadastrar Produto';
    }
  };

  const getHeaderSubtitle = () => {
    switch (state.currentStep) {
      case 'identify':
        return 'Escolha como identificar o produto';
      case 'confirm':
        return 'Revise as informações';
      case 'entry':
        return 'Adicione ao estoque';
      case 'complete':
        return 'Cadastro finalizado com sucesso';
      default:
        return '';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={brandingColors.primary} />

      {/* Header */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[brandingColors.primary, brandingColors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={handleBack}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>

            <View style={styles.headerPlaceholder} />
          </View>

          <Text style={styles.headerSubtitle}>{getHeaderSubtitle()}</Text>
        </LinearGradient>
      </View>

      {/* Stepper */}
      <WizardStepper
        currentStep={state.currentStep}
        onStepPress={handleStepPress as any}
        getBlockedReason={getBlockedReason as any}
      />

      {/* Content - cada step gerencia seu próprio KeyboardAvoidingView */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentTranslateY }],
          },
        ]}
      >
        {state.currentStep === 'identify' && (
          <WizardStep1
            wizard={wizard}
            categories={categories}
            onNext={() => wizard.goToStep('confirm')}
          />
        )}

        {state.currentStep === 'confirm' && (
          <WizardStep2
            wizard={wizard}
            categories={categories}
            onBack={() => wizard.goToStep('identify')}
          />
        )}

        {state.currentStep === 'entry' && (
          <WizardStep3 wizard={wizard} />
        )}

        {state.currentStep === 'complete' && (
          <WizardComplete wizard={wizard} onGoToProducts={() => router.replace('/(tabs)/products')} />
        )}
      </Animated.View>

      {/* Exit Dialog */}
      <ConfirmDialog
        visible={showExitDialog}
        title="Descartar alterações?"
        message="Você tem dados não salvos. Deseja realmente sair?"
        type="warning"
        confirmText="Descartar"
        cancelText="Continuar"
        onConfirm={confirmExit}
        onCancel={() => setShowExitDialog(false)}
        icon="alert-circle"
      />

      {/* Skip Entry Dialog — confirmar cancelamento de vinculação */}
      <ConfirmDialog
        visible={showSkipEntryDialog}
        title="Cancelar vinculação?"
        message="O produto ficará no catálogo sem estoque vinculado. Você poderá vinculá-lo a uma entrada mais tarde."
        type="warning"
        confirmText="Sim, cancelar"
        cancelText="Não, continuar"
        onConfirm={() => {
          setShowSkipEntryDialog(false);
          wizard.skipEntry();
        }}
        onCancel={() => setShowSkipEntryDialog(false)}
        icon="close-circle"
      />

      {/* Wizard Dialog — substitui Alert.alert do hook (erros, permissões, etc.) */}
      {state.wizardDialog && (
        <ConfirmDialog
          visible={state.wizardDialog.visible}
          title={state.wizardDialog.title}
          message={state.wizardDialog.message}
          type={state.wizardDialog.type ?? 'warning'}
          confirmText={state.wizardDialog.confirmText ?? 'OK'}
          cancelText={state.wizardDialog.cancelText ?? ''}
          onConfirm={() => {
            state.wizardDialog?.onConfirm?.();
            wizard.clearWizardDialog();
          }}
          onCancel={wizard.clearWizardDialog}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.md,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
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
    fontWeight: 'bold',
    color: '#fff',
  },
  headerPlaceholder: {
    width: 40,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
