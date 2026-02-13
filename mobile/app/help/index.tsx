/**
 * HelpScreen
 * Tela de ajuda com lista de tutoriais disponíveis
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTutorialContext } from '@/contexts/TutorialContext';
import { TUTORIAL_LIST, TUTORIALS, TUTORIAL_COLORS } from '@/constants/tutorials';
import { Colors } from '@/constants/Colors';

export default function HelpScreen() {
  const router = useRouter();
  const {
    completedTutorials,
    startTutorial,
    resetAllTutorials,
    isTutorialCompleted,
  } = useTutorialContext();

  // Calcular progresso geral
  const totalTutorials = TUTORIAL_LIST.length;
  const completedCount = completedTutorials.length;
  const progressPercent = totalTutorials > 0 ? (completedCount / totalTutorials) * 100 : 0;

  // Handler para iniciar tutorial
  const handleStartTutorial = (tutorialId: string, screen: string) => {
    // Navegar para a tela e iniciar tutorial
    router.push(screen as any);
    setTimeout(() => {
      startTutorial(tutorialId);
    }, 500);
  };

  // Handler para resetar tutoriais
  const handleResetTutorials = () => {
    Alert.alert(
      'Resetar Tutoriais',
      'Isso vai permitir que você veja todos os tutoriais novamente. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resetar',
          style: 'destructive',
          onPress: () => {
            resetAllTutorials();
            Alert.alert('Pronto!', 'Todos os tutoriais foram resetados.');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[Colors.light.primary, Colors.light.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <View style={styles.headerIcon}>
            <Ionicons name="help-circle" size={40} color="#fff" />
          </View>
          <Text style={styles.headerTitle}>Central de Ajuda</Text>
          <Text style={styles.headerSubtitle}>
            Aprenda a usar todas as funcionalidades
          </Text>
        </View>
      </LinearGradient>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
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
