import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Linking,
  ActivityIndicator,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getCustomerById, deleteCustomer } from '@/services/customerService';
import { getSales } from '@/services/saleService';
import { formatPhone, formatDate, formatCurrency, formatDateTime } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { Sale } from '@/types';

export default function CustomerDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/customers');
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();

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
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');

  /**
   * Query: Histórico de vendas do cliente
   */
  const { data: customerSales = [] } = useQuery<Sale[]>({
    queryKey: ['sales', { customer_id: customerId }],
    queryFn: () => getSales({ customer_id: customerId, limit: 10 } as any),
    enabled: isValidId,
  });

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
      setErrorDialogMessage(error.message || 'Erro ao deletar cliente');
      setShowErrorDialog(true);
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
          style={{ backgroundColor: brandingColors.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={brandingColors.primary} />
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
          style={{ backgroundColor: brandingColors.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Preparar ações rápidas (ligar/email)
  const quickActions = [
    ...(customer.phone
      ? [
          {
            icon: 'call' as const,
            label: 'Ligar',
            onPress: handleCall,
            color: brandingColors.primary,
          },
        ]
      : []),
    ...(customer.email
      ? [
          {
            icon: 'mail' as const,
            label: 'Email',
            onPress: handleEmail,
            color: brandingColors.primary,
          },
        ]
      : []),
  ];

  return (
    <View style={styles.container}>
      <PageHeader
        title={customer.full_name}
        subtitle="Detalhes do cliente"
        showBackButton
        onBack={goBack}
        rightActions={[
          {
            icon: 'pencil',
            onPress: () => router.push(`/customers/edit/${customerId}` as any),
          },
          {
            icon: 'trash',
            onPress: handleDelete,
          },
        ]}
      />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[brandingColors.primary]}
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
            <View style={[styles.quickIconWrap, { backgroundColor: brandingColors.primary + '20' }]}>
              <Ionicons name="call-outline" size={20} color={brandingColors.primary} />
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
        <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="call-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.cardTitle}>
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
        </View>

        {/* Endereço */}
        {(customer.address || customer.city || customer.state) && (
          <View style={styles.card}>
              <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="location-outline" size={20} color={brandingColors.primary} />
                </View>
                <Text style={styles.cardTitle}>
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
          </View>
        )}

        {/* Informações Adicionais */}
        <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="information-circle-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.cardTitle}>
                Informações Adicionais
              </Text>
            </View>

            <View style={styles.statsGrid}>
              <StatCard
                label="Pontos de Fidelidade"
                value={Number(customer.loyalty_points || 0).toFixed(0)}
                icon="star"
                valueColor={brandingColors.primary}
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
                valueColor={brandingColors.primary}
              />
            </View>

            <View style={styles.additionalInfo}>
              <Text style={styles.additionalText}>
                Cadastrado em: {formatDate(customer.created_at)}
              </Text>
              <Text style={styles.additionalText}>
                Última atualização: {formatDate(customer.updated_at)}
              </Text>
            </View>
        </View>
        {/* Histórico de Compras */}
        <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="receipt-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.cardTitle}>
                Histórico de Compras
              </Text>
            </View>

            {customerSales.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Ionicons name="receipt-outline" size={40} color={Colors.light.textTertiary} />
                <Text style={styles.emptyHistoryText}>Nenhuma compra registrada</Text>
              </View>
            ) : (
              <>
                {customerSales.map((sale, index) => {
                  const statusColors: Record<string, { color: string; bg: string }> = {
                    completed:          { color: '#2E7D32', bg: '#E8F5E9' },
                    pending:            { color: '#F57C00', bg: '#FFF3E0' },
                    cancelled:          { color: '#C62828', bg: '#FFEBEE' },
                    partially_refunded: { color: '#F57C00', bg: '#FFF3E0' },
                    refunded:           { color: '#7B1FA2', bg: '#F3E5F5' },
                  };
                  const st = statusColors[sale.status] || statusColors.pending;
                  const statusLabels: Record<string, string> = {
                    completed: 'Concluída',
                    pending: 'Pendente',
                    cancelled: 'Cancelada',
                    partially_refunded: 'Dev. Parcial',
                    refunded: 'Devolvida',
                  };
                  return (
                    <TouchableOpacity
                      key={sale.id}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/sales/${sale.id}` as any)}
                      style={[styles.saleHistoryItem, index < customerSales.length - 1 && styles.saleHistoryItemBorder]}
                    >
                      <View style={styles.saleHistoryLeft}>
                        <Text style={styles.saleHistoryNumber}>{sale.sale_number}</Text>
                        <Text style={styles.saleHistoryDate}>{formatDateTime(sale.created_at)}</Text>
                      </View>
                      <View style={styles.saleHistoryRight}>
                        <Text style={styles.saleHistoryAmount}>{formatCurrency(sale.total_amount)}</Text>
                        <View style={[styles.saleHistoryBadge, { backgroundColor: st.bg }]}>
                          <Text style={[styles.saleHistoryStatus, { color: st.color }]}>
                            {statusLabels[sale.status] || sale.status}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} style={{ marginLeft: 8 }} />
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
        </View>

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

      {/* Dialog de Erro */}
      <ConfirmDialog
        visible={showErrorDialog}
        title="Erro"
        message={errorDialogMessage}
        confirmText="OK"
        onConfirm={() => setShowErrorDialog(false)}
        onCancel={() => setShowErrorDialog(false)}
        type="danger"
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    elevation: 2,
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
    marginBottom: 16,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
    ...theme.shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
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
    color: Colors.light.textSecondary,
  },
  emptyHistory: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyHistoryText: {
    color: Colors.light.textTertiary,
    fontSize: 14,
  },
  saleHistoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  saleHistoryItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  saleHistoryLeft: {
    flex: 1,
  },
  saleHistoryNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  saleHistoryDate: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  saleHistoryRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  saleHistoryAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
  },
  saleHistoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  saleHistoryStatus: {
    fontSize: 11,
    fontWeight: '600',
  },
});
