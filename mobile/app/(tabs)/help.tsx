/**
 * HelpScreen
 * Tela de ajuda com lista de tutoriais disponíveis
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import { useTutorialContext } from '@/contexts/TutorialContext';
import { TUTORIAL_LIST, TUTORIAL_COLORS } from '@/constants/tutorials';
import useBackToList from '@/hooks/useBackToList';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getProducts } from '@/services/productService';

export default function HelpScreen() {
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/more');
  const {
    completedTutorials,
    startTutorial,
    resetAllTutorials,
    isTutorialCompleted,
  } = useTutorialContext();

  const [resetConfirmDialog, setResetConfirmDialog] = useState(false);
  const [resetSuccessDialog, setResetSuccessDialog] = useState(false);
  const [noProductDialog, setNoProductDialog] = useState(false);

  // Calcular progresso geral
  const totalTutorials = TUTORIAL_LIST.length;
  const completedCount = completedTutorials.length;
  const progressPercent = totalTutorials > 0 ? (completedCount / totalTutorials) * 100 : 0;

  // Handler para iniciar tutorial
  const handleStartTutorial = async (tutorialId: string, screen: string) => {
    let targetScreen = screen;

    // Tutoriais de telas com parâmetro dinâmico (ex: /products/edit/[id]) não
    // podem navegar pro literal "[id]" — precisam de um produto real primeiro,
    // senão a tela abre com "ID inválido".
    if (screen.includes('[id]')) {
      try {
        const products = await getProducts({ limit: 1 });
        if (!products.length) {
          setNoProductDialog(true);
          return;
        }
        targetScreen = screen.replace('[id]', String(products[0].id));
      } catch {
        setNoProductDialog(true);
        return;
      }
    }

    // Navegar para a tela e iniciar tutorial
    router.push(targetScreen as any);
    setTimeout(() => {
      startTutorial(tutorialId);
    }, 500);
  };

  // Handler para resetar tutoriais
  const handleResetTutorials = () => {
    setResetConfirmDialog(true);
  };

  return (
    <View style={styles.container}>
      <PageHeader
        title="Central de Ajuda"
        subtitle="Aprenda a usar todas as funcionalidades"
        showBackButton
        onBack={goBack}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Ionicons name="trophy" size={24} color="#F59E0B" />
            <Text style={styles.progressTitle}>Seu Progresso</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {completedCount} de {totalTutorials} tutoriais concluídos
          </Text>
        </View>

        {/* Tutorial List */}
        <Text style={styles.sectionTitle}>Tutoriais Disponíveis</Text>

        {TUTORIAL_LIST.map((tutorial) => {
          const isCompleted = isTutorialCompleted(tutorial.id);

          return (
            <TouchableOpacity
              key={tutorial.id}
              style={styles.tutorialCard}
              onPress={() => handleStartTutorial(tutorial.id, tutorial.screen)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.tutorialIcon,
                  { backgroundColor: isCompleted ? '#ECFDF5' : '#EEF2FF' },
                ]}
              >
                <Ionicons
                  name={tutorial.icon as any}
                  size={24}
                  color={isCompleted ? '#10B981' : '#6366F1'}
                />
              </View>
              <View style={styles.tutorialContent}>
                <View style={styles.tutorialHeader}>
                  <Text style={styles.tutorialName}>{tutorial.name}</Text>
                  {isCompleted && (
                    <View style={styles.completedBadge}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={styles.tutorialDescription}>
                  {tutorial.description}
                </Text>
                <Text style={styles.tutorialSteps}>
                  {tutorial.steps.length} passos
                </Text>
              </View>
              <Ionicons
                name="play-circle"
                size={28}
                color={isCompleted ? '#10B981' : TUTORIAL_COLORS.accent}
              />
            </TouchableOpacity>
          );
        })}

        {/* Tips Section */}
        <Text style={styles.sectionTitle}>Dicas</Text>

        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Ionicons name="bulb" size={20} color="#F59E0B" />
          </View>
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>Acesso Rápido</Text>
            <Text style={styles.tipText}>
              Toque no botão ? no topo de qualquer tela para iniciar o tutorial daquela seção.
            </Text>
          </View>
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Ionicons name="sync" size={20} color="#3B82F6" />
          </View>
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>Rever Tutoriais</Text>
            <Text style={styles.tipText}>
              Você pode rever qualquer tutorial quantas vezes quiser tocando nele acima.
            </Text>
          </View>
        </View>

        {/* Reset Button */}
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleResetTutorials}
        >
          <Ionicons name="refresh" size={18} color="#EF4444" />
          <Text style={styles.resetButtonText}>Resetar todos os tutoriais</Text>
        </TouchableOpacity>

        {/* Spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>

      <ConfirmDialog
        visible={resetConfirmDialog}
        type="danger"
        title="Resetar Tutoriais"
        message="Isso vai permitir que você veja todos os tutoriais novamente. Deseja continuar?"
        confirmText="Resetar"
        cancelText="Cancelar"
        onConfirm={() => {
          resetAllTutorials();
          setResetConfirmDialog(false);
          setResetSuccessDialog(true);
        }}
        onCancel={() => setResetConfirmDialog(false)}
        icon="refresh-outline"
      />

      <ConfirmDialog
        visible={resetSuccessDialog}
        type="success"
        title="Pronto!"
        message="Todos os tutoriais foram resetados."
        confirmText="OK"
        onConfirm={() => setResetSuccessDialog(false)}
        onCancel={() => setResetSuccessDialog(false)}
        icon="checkmark-circle-outline"
      />

      <ConfirmDialog
        visible={noProductDialog}
        type="info"
        title="Cadastre um produto primeiro"
        message="Este tutorial usa um produto real como exemplo. Cadastre pelo menos um produto para poder vê-lo."
        confirmText="OK"
        onConfirm={() => setNoProductDialog(false)}
        onCancel={() => setNoProductDialog(false)}
        icon="cube-outline"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
    marginTop: 8,
  },
  tutorialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  tutorialIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  tutorialContent: {
    flex: 1,
  },
  tutorialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tutorialName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  completedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tutorialDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  tutorialSteps: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 20,
    gap: 8,
  },
  resetButtonText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
});
