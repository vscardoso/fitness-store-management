/**
 * Loading Demo Screen
 * Demonstração do novo sistema de loading
 */

import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { loadingManager } from '@/services/loadingManager';
import { Colors } from '@/constants/Colors';
import PageHeader from '@/components/layout/PageHeader';
import { router } from 'expo-router';

export default function LoadingDemoScreen() {
  const testQuickLoading = () => {
    loadingManager.show('Carregando rapidamente...');
    setTimeout(() => {
      loadingManager.hide();
    }, 800);
  };

  const testMediumLoading = () => {
    loadingManager.show('Processando dados...');
    setTimeout(() => {
      loadingManager.hide();
    }, 3000);
  };

  const testLongLoading = () => {
    loadingManager.show('Operação demorada...');
    setTimeout(() => {
      loadingManager.hide();
    }, 12000); // Vai mostrar o aviso de timeout
  };

  const testCustomMessages = async () => {
    loadingManager.show('Salvando produto...');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    loadingManager.show('Atualizando estoque...');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    loadingManager.show('Finalizando...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    loadingManager.hide();
  };

  const testMultipleRequests = () => {
    // Simula múltiplas requisições simultâneas
    loadingManager.show('Requisição 1');
    loadingManager.show('Requisição 2');
    loadingManager.show('Requisição 3');

    setTimeout(() => loadingManager.hide(), 1000);
    setTimeout(() => loadingManager.hide(), 2000);
    setTimeout(() => loadingManager.hide(), 3000);
  };

  const testNoMessage = () => {
    loadingManager.show(); // Sem mensagem customizada
    setTimeout(() => {
      loadingManager.hide();
    }, 2000);
  };

  return (
    <View style={styles.container}>
      <PageHeader
        title="Demonstração de Loading"
        subtitle="Teste o novo sistema de loading"
        onBack={() => router.back()}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              ✨ Novo Sistema de Loading
            </Text>
            <Text variant="bodyMedium" style={styles.description}>
              Sistema de loading completamente redesenhado com:
            </Text>
            <View style={styles.featureList}>
              <Text style={styles.feature}>� Spinner com órbitas e partículas flutuantes</Text>
              <Text style={styles.feature}>✨ Múltiplas animações simultâneas (órbitas, pulsos, ondas)</Text>
              <Text style={styles.feature}>💫 Partículas animadas aleatoriamente</Text>
              <Text style={styles.feature}>🌊 Ondas expandindo do centro</Text>
              <Text style={styles.feature}>🎨 Pontos coloridos orbitando em velocidades diferentes</Text>
              <Text style={styles.feature}>⚡ Performance otimizada com useNativeDriver</Text>
            </View>
          </Card.Content>
        </Card>

        <Text variant="titleMedium" style={styles.testTitle}>
          Testes de Duração
        </Text>

        <Button
          mode="contained"
          onPress={testQuickLoading}
          style={styles.button}
          icon="flash"
        >
          Loading Rápido (0.8s)
        </Button>

        <Button
          mode="contained"
          onPress={testMediumLoading}
          style={styles.button}
          icon="timer-sand"
        >
          Loading Médio (3s)
        </Button>

        <Button
          mode="contained"
          onPress={testLongLoading}
          style={styles.button}
          icon="clock-alert"
        >
          Loading Longo (12s - mostra aviso)
        </Button>

        <Text variant="titleMedium" style={styles.testTitle}>
          Testes de Comportamento
        </Text>

        <Button
          mode="outlined"
          onPress={testCustomMessages}
          style={styles.button}
          icon="message-text"
        >
          Mensagens Customizadas (sequencial)
        </Button>

        <Button
          mode="outlined"
          onPress={testMultipleRequests}
          style={styles.button}
          icon="server-network"
        >
          Múltiplas Requisições (contador)
        </Button>

        <Button
          mode="outlined"
          onPress={testNoMessage}
          style={styles.button}
          icon="loading"
        >
          Sem Mensagem Customizada
        </Button>

        <Card style={[styles.card, styles.infoCard]}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.infoTitle}>
              ℹ️ Informações Técnicas
            </Text>
            <View style={styles.infoList}>
              <Text style={styles.infoItem}>
                • <Text style={styles.bold}>Delay:</Text> 200ms antes de mostrar (evita flicker)
              </Text>
              <Text style={styles.infoItem}>
                • <Text style={styles.bold}>Mínimo:</Text> 300ms de exibição (suavidade)
              </Text>
              <Text style={styles.infoItem}>
                • <Text style={styles.bold}>Timeout:</Text> Aviso após 10s
              </Text>
              <Text style={styles.infoItem}>
                • <Text style={styles.bold}>Auto-hide:</Text> Força esconder após 30s
              </Text>
              <Text style={styles.infoItem}>
                • <Text style={styles.bold}>Contador:</Text> Gerencia requisições simultâneas
              </Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
    color: Colors.light.text,
  },
  description: {
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  featureList: {
    gap: 6,
  },
  feature: {
    color: Colors.light.text,
    fontSize: 14,
    lineHeight: 20,
  },
  testTitle: {
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 12,
    color: Colors.light.text,
  },
  button: {
    marginBottom: 12,
    borderRadius: 12,
  },
  infoCard: {
    marginTop: 8,
    backgroundColor: Colors.light.infoLight,
    borderWidth: 1,
    borderColor: Colors.light.info + '30',
  },
  infoTitle: {
    fontWeight: '700',
    marginBottom: 8,
    color: Colors.light.info,
  },
  infoList: {
    gap: 6,
  },
  infoItem: {
    color: Colors.light.text,
    fontSize: 13,
    lineHeight: 20,
  },
  bold: {
    fontWeight: '600',
  },
});
