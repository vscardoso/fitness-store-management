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
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function ProductWizardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ method?: string }>();
  const { categories } = useCategories();
  const wizard = useProductWizard();
  const { state } = wizard;

  const [showExitDialog, setShowExitDialog] = React.useState(false);

  // Se veio com method=scanner, já inicia no modo scanner
  useEffect(() => {
    if (params.method === 'scanner' && !state.identifyMethod) {
      wizard.selectMethod('scanner');
    }
  }, [params.method]);

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

    // Se está no Step 3 (produto já criado), ir para lista
    if (state.currentStep === 'entry') {
      wizard.skipEntry();
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
              <Ionicons
                name={state.currentStep === 'entry' ? 'checkmark' : 'arrow-back'}
                size={24}
                color="#fff"
              />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>

            <View style={styles.headerPlaceholder} />
          </View>

          <Text style={styles.headerSubtitle}>{getHeaderSubtitle()}</Text>
        </LinearGradient>
      </View>

      {/* Stepper */}
      <WizardStepper currentStep={state.currentStep} />

      {/* Content */}
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
