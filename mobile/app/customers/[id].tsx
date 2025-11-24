import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  Linking,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {
  Text,
  Card,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import ActionButtons from '@/components/ui/ActionButtons';
import { getCustomerById, deleteCustomer } from '@/services/customerService';
import { formatPhone, formatDate, formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';

export default function CustomerDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Validar ID do cliente
  const customerId = id ? parseInt(id as string) : NaN;
  const isValidId = !isNaN(customerId) && customerId > 0;

  /**
   * Query: Buscar cliente
   */
  const { data: customer, isLoading, refetch } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => getCustomerById(customerId),
    enabled: isValidId,
  });

  /**
   * Estado de refresh
   */
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Função de refresh
   */
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  /**
   * Mutation: Deletar cliente
   */
  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomer(customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      Alert.alert('Sucesso!', 'Cliente deletado', [
        {
          text: 'OK',
          onPress: () => router.push('/(tabs)/customers'),
        },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.message || 'Erro ao deletar cliente');
    },
  });

  /**
   * Confirmar deleção
   */
  const handleDelete = () => {
    Alert.alert(
      'Confirmar exclusão',
      `Tem certeza que deseja deletar "${customer?.full_name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

  /**
   * Ligar para cliente
   */
  const handleCall = () => {
    if (customer?.phone) {
      const phoneNumber = customer.phone.replace(/\D/g, '');
      Linking.openURL(`tel:${phoneNumber}`);
    }
  };

  /**
   * Enviar email
   */
  const handleEmail = () => {
    if (customer?.email) {
      Linking.openURL(`mailto:${customer.email}`);
    }
  };

  // Verificar se ID é válido
  if (!isValidId) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={Colors.light.error} />
        <Text style={{ marginTop: 16, color: Colors.light.error, textAlign: 'center', fontSize: 16 }}>
          ID do cliente inválido
        </Text>
        <Text style={{ marginTop: 8, color: '#666', textAlign: 'center' }}>
          O ID fornecido não é válido
        </Text>
      </View>
    );
  }

  if (isLoading || !customer) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={{ marginTop: 16, color: '#666' }}>Carregando cliente...</Text>
      </View>
    );
  }

  // Preparar badges de status
  const badges = [
    customer.is_active
      ? { icon: 'checkmark-circle' as const, label: 'ATIVO', type: 'success' as const }
      : { icon: 'close-circle' as const, label: 'INATIVO', type: 'error' as const },
  ];

  // Preparar ações rápidas (ligar/email)
  const quickActions = [
    ...(customer.phone
      ? [
          {
            icon: 'call' as const,
            label: 'Ligar',
            onPress: handleCall,
            color: Colors.light.primary,
          },
        ]
      : []),
    ...(customer.email
      ? [
          {
            icon: 'mail' as const,
            label: 'Email',
            onPress: handleEmail,
            color: Colors.light.primary,
          },
        ]
      : []),
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />

      {/* Header com gradiente */}
      <LinearGradient
        colors={[Colors.light.primary, '#7c4dff']}
        style={styles.headerGradient}
      >
        <View style={[styles.headerContent, { marginTop: 8 }]}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/customers')}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Detalhes do Cliente</Text>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => router.push(`/customers/edit/${customerId}` as any)}
                style={styles.actionButton}
              >
                <Ionicons name="pencil" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.actionButton}>
                <Ionicons name="trash" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.headerEntityName}>{customer.full_name}</Text>

            {/* Badges de status */}
            {badges.length > 0 && (
              <View style={styles.badges}>
                {badges.map((badge, index) => (
                  <View key={index} style={[styles.badge,
                    badge.type === 'success' ? styles.badgeSuccess :
                    badge.type === 'error' ? styles.badgeError : styles.badgeInfo
                  ]}>
                    <Ionicons
                      name={badge.icon}
                      size={14}
                      color="#fff"
                      style={styles.badgeIcon}
                    />
                    <Text style={styles.badgeText}>{badge.label}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Métricas principais */}
            <View style={styles.metrics}>
              <View style={styles.metricCard}>
                <Ionicons name="cart-outline" size={20} color="#fff" style={styles.metricIcon} />
                <Text style={styles.metricLabel}>Compras</Text>
                <Text style={styles.metricValue}>{customer.total_purchases || 0}</Text>
              </View>
              <View style={styles.metricCard}>
                <Ionicons name="cash-outline" size={20} color="#fff" style={styles.metricIcon} />
                <Text style={styles.metricLabel}>Total</Text>
                <Text style={styles.metricValue}>{formatCurrency(customer.total_spent || 0)}</Text>
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView 
        style={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.light.primary]}
          />
        }
      >
        {/* Ações Rápidas */}
        {quickActions.length > 0 && (
          <View style={styles.quickActionsContainer}>
            <ActionButtons actions={quickActions} />
          </View>
        )}

        {/* Informações de Contato */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Informações de Contato
            </Text>

            <View style={styles.infoSection}>
              {customer.phone && (
                <InfoRow
                  icon="call-outline"
                  label="Telefone"
                  value={formatPhone(customer.phone)}
                  layout="vertical"
                />
              )}

              {customer.email && (
                <InfoRow
                  icon="mail-outline"
                  label="Email"
                  value={customer.email}
                  layout="vertical"
                />
              )}

              {customer.document_number && (
                <InfoRow
                  icon="card-outline"
                  label="CPF"
                  value={customer.document_number}
                  layout="vertical"
                />
              )}

              {customer.birth_date && (
                <InfoRow
                  icon="calendar-outline"
                  label="Data de Nascimento"
                  value={formatDate(customer.birth_date)}
                  layout="vertical"
                />
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Endereço */}
        {(customer.address || customer.city || customer.state) && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Endereço
              </Text>

              <View style={styles.infoSection}>
                {customer.address && (
                  <InfoRow
                    icon="location-outline"
                    label="Endereço"
                    value={`${customer.address}${
                      customer.address_number ? `, ${customer.address_number}` : ''
                    }`}
                    layout="vertical"
                  />
                )}

                {(customer.city || customer.state) && (
                  <InfoRow
                    icon="navigate-outline"
                    label="Cidade/Estado"
                    value={[customer.city, customer.state].filter(Boolean).join(' - ')}
                    layout="vertical"
                  />
                )}

                {customer.zip_code && (
                  <InfoRow
                    icon="pin-outline"
                    label="CEP"
                    value={customer.zip_code}
                    layout="vertical"
                  />
                )}
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Informações Adicionais */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Informações Adicionais
            </Text>

            <View style={styles.statsGrid}>
              <StatCard
                label="Pontos de Fidelidade"
                value={Number(customer.loyalty_points || 0).toFixed(0)}
                icon="star"
                valueColor={Colors.light.primary}
              />

              <StatCard
                label="Total Gasto"
                value={`R$ ${Number(customer.total_spent || 0).toFixed(2)}`}
                icon="cash"
                valueColor={Colors.light.success}
              />

              <StatCard
                label="Total de Compras"
                value={String(customer.total_purchases || 0)}
                icon="cart"
                valueColor={Colors.light.primary}
              />
            </View>

            <View style={styles.additionalInfo}>
              <Text variant="bodySmall" style={styles.additionalText}>
                Cadastrado em: {formatDate(customer.created_at)}
              </Text>
              <Text variant="bodySmall" style={styles.additionalText}>
                Última atualização: {formatDate(customer.updated_at)}
              </Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.primary,
  },
  // Header com gradiente
  headerGradient: {
    paddingTop: 0, // SafeArea já cuidou do espaço
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  headerContent: {
    marginTop: theme.spacing.sm, // Pequeno espaço após SafeArea
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
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
    fontWeight: theme.fontWeight.bold,
    color: '#fff',
    marginHorizontal: theme.spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
  },
  headerInfo: {
    alignItems: 'center',
  },
  headerEntityName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: '#fff',
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
  },
  badgeError: {
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
  },
  badgeInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  badgeIcon: {
    marginRight: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  metrics: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  metricIcon: {
    marginBottom: 6,
  },
  metricLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    marginBottom: 4,
  },
  metricValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  quickActionsContainer: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  card: {
    margin: 16,
    marginTop: 0,
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 16,
  },
  infoSection: {
    gap: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  additionalInfo: {
    gap: 4,
    marginTop: 8,
  },
  additionalText: {
    color: Colors.light.icon,
  },
});
