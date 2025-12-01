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
  Divider,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import DetailHeader from '@/components/layout/DetailHeader';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getCustomerById, deleteCustomer } from '@/services/customerService';
import { formatPhone, formatDate, formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';

export default function CustomerDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/customers');
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
    retry: false, // Não tentar novamente em caso de 404
  });

  /**
   * Estados
   */
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

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
    onSuccess: async () => {
      setShowDeleteDialog(false);
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      setShowSuccessDialog(true);
    },
    onError: (error: any) => {
      setShowDeleteDialog(false);
      Alert.alert('Erro', error.message || 'Erro ao deletar cliente');
    },
  });

  /**
   * Confirmar deleção
   */
  const handleDelete = () => {
    setShowDeleteDialog(true);
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
        <Text style={{ marginTop: 16, color: Colors.light.error, textAlign: 'center', fontSize: 18, fontWeight: '600' }}>
          ID do cliente inválido
        </Text>
        <Text style={{ marginTop: 8, color: '#666', textAlign: 'center', marginBottom: 24 }}>
          O ID fornecido não é válido
        </Text>
        <TouchableOpacity
          onPress={goBack}
          style={{ backgroundColor: Colors.light.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={{ marginTop: 16, color: '#666' }}>Carregando cliente...</Text>
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={Colors.light.error} />
        <Text style={{ marginTop: 16, color: Colors.light.text, textAlign: 'center', fontSize: 18, fontWeight: '600' }}>
          Cliente não encontrado ou foi excluído
        </Text>
        <Text style={{ marginTop: 8, color: '#666', textAlign: 'center', marginBottom: 24, paddingHorizontal: 32 }}>
          O cliente pode ter sido excluído ou o link está incorreto.
        </Text>
        <TouchableOpacity
          onPress={goBack}
          style={{ backgroundColor: Colors.light.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Voltar</Text>
        </TouchableOpacity>
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />
      <DetailHeader
        title="Detalhes do Cliente"
        entityName={customer.full_name}
        backRoute="/(tabs)/customers"
        editRoute={`/customers/edit/${customerId}`}
        onDelete={handleDelete}
        badges={badges}
        metrics={[]}
      />

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
        {/* Ações Rápidas (Ligar/Email) */}
        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={[styles.quickCard, !customer.phone && styles.quickCardDisabled]}
            onPress={handleCall}
            disabled={!customer.phone}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: Colors.light.primary + '20' }]}>
              <Ionicons name="call-outline" size={20} color={Colors.light.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickLabel}>Ligar</Text>
              <Text style={styles.quickValue} numberOfLines={1}>
                {customer.phone ? formatPhone(customer.phone) : 'Indisponível'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickCard, !customer.email && styles.quickCardDisabled]}
            onPress={handleEmail}
            disabled={!customer.email}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: Colors.light.success + '20' }]}>
              <Ionicons name="mail-outline" size={20} color={Colors.light.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickLabel}>Email</Text>
              <Text style={styles.quickValue} numberOfLines={1}>
                {customer.email || 'Indisponível'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Informações de Contato */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="call-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text variant="titleMedium" style={styles.cardTitle}>
                Informações de Contato
              </Text>
            </View>

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
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderIcon}>
                  <Ionicons name="location-outline" size={20} color={Colors.light.primary} />
                </View>
                <Text variant="titleMedium" style={styles.cardTitle}>
                  Endereço
                </Text>
              </View>

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
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="information-circle-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text variant="titleMedium" style={styles.cardTitle}>
                Informações Adicionais
              </Text>
            </View>

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

      {/* Dialog de Confirmação de Exclusão */}
      <ConfirmDialog
        visible={showDeleteDialog}
        title="Confirmar Exclusão"
        message={`Tem certeza que deseja excluir o cliente "${customer?.full_name}"?\n\nEsta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDeleteDialog(false)}
        type="danger"
        icon="trash"
        loading={deleteMutation.isPending}
      />

      {/* Dialog de Sucesso */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Sucesso!"
        message="Cliente excluído com sucesso!"
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
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
  quickGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginHorizontal: 16,
  },
  quickCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  quickCardDisabled: {
    opacity: 0.5,
  },
  quickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  quickLabel: {
    color: Colors.light.textSecondary,
    fontSize: 12,
  },
  quickValue: {
    color: Colors.light.text,
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    margin: 16,
    marginTop: 0,
    marginBottom: 12,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.light.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontWeight: '600',
    color: Colors.light.text,
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
