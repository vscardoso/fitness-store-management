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
} from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, theme } from '@/constants/Colors';
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
  }>();
  const { categories } = useCategories();
  const wizard = useProductWizard();
  const { state } = wizard;

  const [showExitDialog, setShowExitDialog] = React.useState(false);
  const [showSkipEntryDialog, setShowSkipEntryDialog] = React.useState(false);

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

  // Processar retorno do entries/add ou entries/index (entrada existente)
  useEffect(() => {
    if (params.returnFromEntry === 'true' && params.createdEntryId) {
      // Restaurar dados do produto se vier de entrada existente
      let productData = null;
      if (params.createdProductData) {
        try {
          productData = JSON.parse(params.createdProductData);
        } catch (e) {
          console.error('Erro ao parsear createdProductData:', e);
        }
      }

      wizard.handleEntryCreated(
        {
          id: parseInt(params.createdEntryId, 10),
          code: params.createdEntryCode || '',
          quantity: parseInt(params.createdEntryQuantity || '1', 10),
          supplier: params.createdEntrySupplier,
        },
        productData // Passar dados do produto para restaurar
      );
    }
  }, [params.returnFromEntry, params.createdEntryId]);

  // Handle hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });

    return () => backHandler.remove();
  }, [state.isDirty, state.currentStep]);

  const handleBack = useCallback(async () => {
    // Se está no Step 1 e não tem dados, pode sair direto
    if (state.currentStep === 'identify' && !state.isDirty) {
      router.back();
      return;
    }

    // Se está em outro step, volta para o anterior
    if (state.currentStep === 'confirm') {
      wizard.goToStep('identify');
      return;
    }

    // Se está no Step 3 (produto já criado), confirmar antes de pular a entrada
    if (state.currentStep === 'entry') {
      setShowSkipEntryDialog(true);
      return;
    }

    // Se está no Step 4 (complete), ir para lista de produtos
    if (state.currentStep === 'complete') {
      router.replace('/(tabs)/products');
      return;
    }

    // Se tem dados não salvos, confirmar saída
    if (state.isDirty) {
      setShowExitDialog(true);
    } else {
      router.back();
    }
  }, [state.currentStep, state.isDirty, wizard, router]);

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
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />

      {/* Header */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
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
      <WizardStepper currentStep={state.currentStep} />

      {/* Content - cada step gerencia seu próprio KeyboardAvoidingView */}
      <View style={styles.content}>
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
      </View>

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
