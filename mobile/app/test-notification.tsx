/**
 * Tela de teste do sistema de notificações
 * Acesse: /test-notification
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotificationStore } from '@/store/notificationStore';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { createNotification } from '@/types/notification';

export default function TestNotificationScreen() {
  const router = useRouter();
  const { quickNotify, addNotification, clearAll, getUnreadCount } = useNotificationStore();
  const { sendLocalNotification, scheduleNotification } = usePushNotifications();

  const unreadCount = getUnreadCount();

  // Testes de notificações in-app
  const testInfo = () => {
    quickNotify('info', 'Informação', 'Esta é uma notificação de informação', {
      icon: 'information-circle-outline',
    });
  };

  const testSuccess = () => {
    quickNotify('success', 'Sucesso!', 'Operação concluída com sucesso', {
      icon: 'check-circle-outline',
    });
  };

  const testWarning = () => {
    quickNotify('warning', 'Atenção', 'Estoque baixo detectado', {
      icon: 'warning-outline',
      autoDismiss: 8000,
    });
  };

  const testError = () => {
    quickNotify('error', 'Erro', 'Falha ao processar a requisição', {
      icon: 'alert-circle-outline',
    });
  };

  const testAction = () => {
    const notification = createNotification(
      'action',
      'Confirmar Envio',
      'O envio #123 foi realizado?',
      {
        actions: [
          {
            id: 'confirm',
            label: 'Sim, foi enviado',
            onPress: async () => {
              await new Promise(resolve => setTimeout(resolve, 500));
              quickNotify('success', 'Confirmado!', 'Envio marcado como enviado');
            },
          },
          {
            id: 'cancel',
            label: 'Ainda não',
            style: 'cancel',
            onPress: () => {
              quickNotify('info', 'OK', 'Confirme quando for enviado');
            },
          },
        ],
        autoDismiss: 0,  // Aguarda ação do usuário
        priority: 'high',
      }
    );
    addNotification(notification);
  };

  const testNavigation = () => {
    quickNotify('info', 'Novo Pedido', 'Cliente João fez um pedido. Clique para ver detalhes.', {
      route: '/(tabs)/',
      autoDismiss: 10000,
      priority: 'high',
    });
  };

  const testMultiple = () => {
    quickNotify('info', 'Notificação 1', 'Primeira notificação');
    setTimeout(() => {
      quickNotify('success', 'Notificação 2', 'Segunda notificação');
    }, 500);
    setTimeout(() => {
      quickNotify('warning', 'Notificação 3', 'Terceira notificação');
    }, 1000);
  };

  // Testes de push notifications
  const testPushLocal = async () => {
    await sendLocalNotification(
      'Push Local',
      'Esta é uma notificação push local',
      { test: true }
    );
    quickNotify('info', 'Push Enviado', 'Notificação push local enviada');
  };

  const testPushScheduled = async () => {
    await scheduleNotification(
      'Push Agendada',
      'Esta notificação foi agendada para 5 segundos',
      5,
      { scheduled: true }
    );
    quickNotify('info', 'Push Agendada', 'Notificação será exibida em 5 segundos');
  };

  const testLongMessage = () => {
    quickNotify(
      'info',
      'Título Muito Longo Para Caber em Uma Linha',
      'Esta é uma mensagem muito longa que vai testar o comportamento do banner quando o texto ultrapassa o limite de linhas definido. Será que vai funcionar corretamente com ellipsis?',
      {
        autoDismiss: 10000,
      }
    );
  };

  const testClearAll = () => {
    clearAll();
    quickNotify('success', 'Limpo!', 'Todas as notificações foram removidas');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Teste de Notificações</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Info */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#2196F3" />
          <Text style={styles.infoText}>
            Teste todos os tipos de notificações abaixo. As notificações aparecerão no topo da tela.
          </Text>
        </View>

        {/* Notificações Básicas */}
        <Text style={styles.sectionTitle}>Notificações Básicas</Text>
        <TestButton
          icon="information-circle-outline"
          title="Info"
          description="Notificação de informação"
          color="#2196F3"
          onPress={testInfo}
        />
        <TestButton
          icon="check-circle-outline"
          title="Success"
          description="Notificação de sucesso"
          color="#4CAF50"
          onPress={testSuccess}
        />
        <TestButton
          icon="warning-outline"
          title="Warning"
          description="Notificação de aviso"
          color="#FF9800"
          onPress={testWarning}
        />
        <TestButton
          icon="alert-circle-outline"
          title="Error"
          description="Notificação de erro"
          color="#F44336"
          onPress={testError}
        />

        {/* Notificações Avançadas */}
        <Text style={styles.sectionTitle}>Notificações Avançadas</Text>
        <TestButton
          icon="help-circle-outline"
          title="Com Ações"
          description="Notificação com botões de ação"
          color="#9C27B0"
          onPress={testAction}
        />
        <TestButton
          icon="navigate-outline"
          title="Com Navegação"
          description="Notificação que navega ao clicar"
          color="#00BCD4"
          onPress={testNavigation}
        />
        <TestButton
          icon="copy-outline"
          title="Múltiplas"
          description="3 notificações em sequência"
          color="#607D8B"
          onPress={testMultiple}
        />
        <TestButton
          icon="text-outline"
          title="Mensagem Longa"
          description="Teste com texto muito longo"
          color="#795548"
          onPress={testLongMessage}
        />

        {/* Push Notifications */}
        <Text style={styles.sectionTitle}>Push Notifications</Text>
        <TestButton
          icon="notifications-outline"
          title="Push Local"
          description="Notificação push imediata"
          color="#FF5722"
          onPress={testPushLocal}
        />
        <TestButton
          icon="time-outline"
          title="Push Agendada"
          description="Push em 5 segundos"
          color="#FF9800"
          onPress={testPushScheduled}
        />

        {/* Ações */}
        <Text style={styles.sectionTitle}>Gerenciamento</Text>
        <TestButton
          icon="trash-outline"
          title="Limpar Todas"
          description="Remove todas as notificações"
          color="#F44336"
          onPress={testClearAll}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Não lidas: <Text style={styles.footerBold}>{unreadCount}</Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

interface TestButtonProps {
  icon: string;
  title: string;
  description: string;
  color: string;
  onPress: () => void;
}

function TestButton({ icon, title, description, color, onPress }: TestButtonProps) {
  return (
    <TouchableOpacity style={styles.testButton} onPress={onPress}>
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <View style={styles.testButtonContent}>
        <Text style={styles.testButtonTitle}>{title}</Text>
        <Text style={styles.testButtonDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  badge: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 8,
    marginBottom: 12,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  testButtonContent: {
    flex: 1,
  },
  testButtonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  testButtonDescription: {
    fontSize: 13,
    color: '#666',
  },
  footer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
  },
  footerBold: {
    fontWeight: '600',
    color: '#1a1a1a',
  },
});
