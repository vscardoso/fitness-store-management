/**
 * Tela de Configuração de Descontos por Forma de Pagamento
 * Apenas ADMIN pode acessar e modificar
 * Redesign seguindo padrões do sistema (customers/products)
 */

import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import { Text, Card, TextInput, Button, Switch } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import {
  getPaymentDiscounts,
  createPaymentDiscount,
  updatePaymentDiscount,
  deletePaymentDiscount,
  type PaymentDiscount,
} from '@/services/paymentDiscountService';
import { Colors, theme } from '@/constants/Colors';
import { haptics } from '@/utils/haptics';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';

/**
 * Métodos de pagamento disponíveis
 */
const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX', icon: '💳' },
  { value: 'cash', label: 'Dinheiro', icon: '💵' },
  { value: 'debit_card', label: 'Débito', icon: '💳' },
  { value: 'credit_card', label: 'Crédito', icon: '💳' },
  { value: 'bank_transfer', label: 'Transferência', icon: '🏦' },
];

interface DiscountFormData {
  payment_method: string;
  discount_percentage: string;
  description: string;
  is_active: boolean;
}

export default function PaymentDiscountsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Estados locais
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<DiscountFormData>({
    payment_method: 'pix',
    discount_percentage: '',
    description: '',
    is_active: true,
  });
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [dialogMessage, setDialogMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; method: string } | null>(null);

  // Query para buscar descontos
  const { data: discounts, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['payment-discounts'],
    queryFn: () => getPaymentDiscounts(false), // Buscar todos (ativos e inativos)
  });

  // Auto-refresh quando a tela recebe foco
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Mutation para criar desconto
  const createMutation = useMutation({
    mutationFn: createPaymentDiscount,
    onSuccess: () => {
      // Fechar modal PRIMEIRO
      setShowFormModal(false);
      resetForm();
      
      // Depois invalidar query e mostrar sucesso
      queryClient.invalidateQueries({ queryKey: ['payment-discounts'] });
      haptics.success();
      
      // Pequeno delay para garantir que modal fechou antes de mostrar dialog
      setTimeout(() => {
        setDialogMessage('Desconto criado com sucesso!');
        setShowSuccessDialog(true);
      }, 100);
    },
    onError: (error: any) => {
      haptics.error();
      setDialogMessage(error.response?.data?.detail || 'Não foi possível criar desconto');
      setShowErrorDialog(true);
    },
  });

  // Mutation para atualizar desconto
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PaymentDiscount> }) =>
      updatePaymentDiscount(id, data),
    onSuccess: () => {
      // Fechar modal PRIMEIRO
      setShowFormModal(false);
      setEditingId(null);
      resetForm();
      
      // Depois invalidar query e mostrar sucesso
      queryClient.invalidateQueries({ queryKey: ['payment-discounts'] });
      haptics.success();
      
      // Pequeno delay para garantir que modal fechou antes de mostrar dialog
      setTimeout(() => {
        setDialogMessage('Desconto atualizado com sucesso!');
        setShowSuccessDialog(true);
      }, 100);
    },
    onError: (error: any) => {
      haptics.error();
      setDialogMessage(error.response?.data?.detail || 'Não foi possível atualizar desconto');
      setShowErrorDialog(true);
    },
  });

  // Mutation para deletar desconto
  const deleteMutation = useMutation({
    mutationFn: deletePaymentDiscount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-discounts'] });
      haptics.success();
      setDialogMessage('Desconto removido com sucesso!');
      setShowSuccessDialog(true);
    },
    onError: (error: any) => {
      haptics.error();
      setDialogMessage(error.response?.data?.detail || 'Não foi possível remover desconto');
      setShowErrorDialog(true);
    },
  });

  /**
   * Resetar formulário
   */
  const resetForm = () => {
    setFormData({
      payment_method: 'pix',
      discount_percentage: '',
      description: '',
      is_active: true,
    });
    setEditingId(null);
  };

  /**
   * Editar desconto existente
   */
  const handleEdit = (discount: PaymentDiscount) => {
    setEditingId(discount.id);
    setFormData({
      payment_method: discount.payment_method,
      discount_percentage: discount.discount_percentage.toString(),
      description: discount.description || '',
      is_active: discount.is_active,
    });
    setShowFormModal(true);
    haptics.selection();
  };

  /**
   * Abrir modal para criar novo
   */
  const handleAddNew = () => {
    resetForm();
    setShowFormModal(true);
    haptics.selection();
  };

  /**
   * Salvar desconto (criar ou atualizar)
   */
  const handleSave = () => {
    // Validações
    const percentage = parseFloat(formData.discount_percentage);
    
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      setDialogMessage('Percentual deve ser entre 0 e 100');
      setShowErrorDialog(true);
      return;
    }

    const data = {
      payment_method: formData.payment_method,
      discount_percentage: percentage,
      description: formData.description || undefined,
      is_active: formData.is_active,
    };

    if (editingId) {
      // Atualizar existente
      updateMutation.mutate({ id: editingId, data });
    } else {
      // Criar novo
      createMutation.mutate(data);
    }
  };

  /**
   * Deletar desconto
   */
  const handleDelete = (id: number, method: string) => {
    setDeleteTarget({ id, method });
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
    setShowDeleteDialog(false);
  };

  /**
   * Toggle ativo/inativo
   */
  const handleToggleActive = (discount: PaymentDiscount) => {
    updateMutation.mutate({
      id: discount.id,
      data: { is_active: !discount.is_active },
    });
  };

  // Obter label do método de pagamento
  const getMethodLabel = (method: string) => {
    return PAYMENT_METHODS.find(m => m.value === method)?.label || method;
  };

  // Obter ícone do método de pagamento
  const getMethodIcon = (method: string) => {
    return PAYMENT_METHODS.find(m => m.value === method)?.icon || '💳';
  };

  /**
   * Filtrar descontos por status
   */
  const filteredDiscounts = discounts?.filter((discount: PaymentDiscount) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return discount.is_active;
    if (statusFilter === 'inactive') return !discount.is_active;
    return true;
  });

  /**
   * Contar descontos por status
   */
  const activeCount = discounts?.filter((d: PaymentDiscount) => d.is_active).length || 0;
  const inactiveCount = discounts?.filter((d: PaymentDiscount) => !d.is_active).length || 0;
  const totalCount = discounts?.length || 0;

  /**
   * Renderizar card de desconto (layout compacto 2 colunas)
   */
  const renderDiscount = ({ item }: { item: PaymentDiscount }) => (
    <TouchableOpacity
      style={styles.cardWrapper}
      onPress={() => handleEdit(item)}
      onLongPress={() => handleDelete(item.id, getMethodLabel(item.payment_method))}
      activeOpacity={0.7}
    >
      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          {/* Ícone do método */}
          <View style={styles.iconContainer}>
            <Text style={styles.methodIcon}>{getMethodIcon(item.payment_method)}</Text>
          </View>

          {/* Nome do método */}
          <Text variant="titleSmall" style={styles.methodName} numberOfLines={1}>
            {getMethodLabel(item.payment_method)}
          </Text>

          {/* Percentual em destaque */}
          <Text variant="headlineSmall" style={styles.discountPercentage}>
            {item.discount_percentage}%
          </Text>
          <Text variant="bodySmall" style={styles.discountLabel}>
            de desconto
          </Text>

          {/* Descrição (se houver) */}
          {item.description && (
            <Text variant="bodySmall" style={styles.descriptionText} numberOfLines={2}>
              {item.description}
            </Text>
          )}

          {/* Status badge */}
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                item.is_active ? styles.statusDotActive : styles.statusDotInactive,
              ]}
            />
            <Text
              variant="bodySmall"
              style={[
                styles.statusText,
                item.is_active ? styles.statusTextActive : styles.statusTextInactive,
              ]}
            >
              {item.is_active ? 'Ativo' : 'Inativo'}
            </Text>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  /**
   * Renderizar loading
   */
  if (isLoading && !isRefetching) {
    return (
      <View style={styles.container}>
        {/* Header Clean */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backIconButton}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>Descontos</Text>
                <Text style={styles.headerSubtitle}>0 descontos</Text>
              </View>
              <View style={styles.placeholderButton} />
            </View>
          </LinearGradient>
        </View>

        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando descontos...</Text>
        </View>
      </View>
    );
  }

  /**
   * Renderizar erro
   */
  if (error) {
    return (
      <View style={styles.container}>
        {/* Header Clean */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backIconButton}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>Descontos</Text>
                <Text style={styles.headerSubtitle}>0 descontos</Text>
              </View>
              <View style={styles.placeholderButton} />
            </View>
          </LinearGradient>
        </View>

        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar descontos"
          description="Verifique sua conexão e tente novamente"
        />
      </View>
    );
  }

  const discountCount = filteredDiscounts?.length || 0;

  return (
    <View style={styles.container}>
      {/* Header Clean */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backIconButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>Descontos</Text>
              <Text style={styles.headerSubtitle}>
                {discountCount} {discountCount === 1 ? 'desconto' : 'descontos'}
              </Text>
            </View>
            <View style={styles.placeholderButton} />
          </View>
        </LinearGradient>
      </View>

      {/* Estatísticas */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Ativos</Text>
          <Text style={styles.statValue}>{activeCount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Inativos</Text>
          <Text style={styles.statValue}>{inactiveCount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total</Text>
          <Text style={styles.statValue}>{totalCount}</Text>
        </View>
      </View>

      {/* Filtros */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterChip,
            statusFilter === 'active' && styles.filterChipActive,
          ]}
          onPress={() => setStatusFilter('active')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={16}
            color={statusFilter === 'active' ? Colors.light.primary : Colors.light.textSecondary}
          />
          <Text
            style={[
              styles.filterChipText,
              statusFilter === 'active' && styles.filterChipTextActive,
            ]}
          >
            Ativos
          </Text>
          <View
            style={[
              styles.filterBadge,
              statusFilter === 'active' && styles.filterBadgeActive,
            ]}
          >
            <Text
              style={[
                styles.filterBadgeText,
                statusFilter === 'active' && styles.filterBadgeTextActive,
              ]}
            >
              {activeCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            statusFilter === 'inactive' && styles.filterChipActive,
          ]}
          onPress={() => setStatusFilter('inactive')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="close-circle-outline"
            size={16}
            color={statusFilter === 'inactive' ? Colors.light.primary : Colors.light.textSecondary}
          />
          <Text
            style={[
              styles.filterChipText,
              statusFilter === 'inactive' && styles.filterChipTextActive,
            ]}
          >
            Inativos
          </Text>
          <View
            style={[
              styles.filterBadge,
              statusFilter === 'inactive' && styles.filterBadgeActive,
            ]}
          >
            <Text
              style={[
                styles.filterBadgeText,
                statusFilter === 'inactive' && styles.filterBadgeTextActive,
              ]}
            >
              {inactiveCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            statusFilter === 'all' && styles.filterChipActive,
          ]}
          onPress={() => setStatusFilter('all')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="pricetags-outline"
            size={16}
            color={statusFilter === 'all' ? Colors.light.primary : Colors.light.textSecondary}
          />
          <Text
            style={[
              styles.filterChipText,
              statusFilter === 'all' && styles.filterChipTextActive,
            ]}
          >
            Todos
          </Text>
          <View
            style={[
              styles.filterBadge,
              statusFilter === 'all' && styles.filterBadgeActive,
            ]}
          >
            <Text
              style={[
                styles.filterBadgeText,
                statusFilter === 'all' && styles.filterBadgeTextActive,
              ]}
            >
              {totalCount}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Lista de descontos (grid 2 colunas) */}
      <FlatList
        data={filteredDiscounts}
        renderItem={renderDiscount}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[Colors.light.primary]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="pricetags-outline"
            title={statusFilter !== 'all' ? 'Nenhum desconto encontrado' : 'Nenhum desconto configurado'}
            description={
              statusFilter !== 'all'
                ? 'Tente outro filtro'
                : 'Toque no botão + para configurar descontos'
            }
          />
        }
      />

      {/* FAB - Adicionar desconto */}
      <FAB onPress={handleAddNew} />

      {/* Modal de Formulário */}
      <Modal
        visible={showFormModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowFormModal(false);
          resetForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text variant="titleLarge" style={styles.modalTitle}>
                  {editingId ? 'Editar Desconto' : 'Novo Desconto'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowFormModal(false);
                    resetForm();
                  }}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color={Colors.light.text} />
                </TouchableOpacity>
              </View>

              {/* Forma de Pagamento */}
              <Text variant="labelMedium" style={styles.label}>
                Forma de Pagamento
              </Text>
              <View style={styles.methodButtons}>
                {PAYMENT_METHODS.map((method) => (
                  <Button
                    key={method.value}
                    mode={formData.payment_method === method.value ? 'contained' : 'outlined'}
                    onPress={() => setFormData({ ...formData, payment_method: method.value })}
                    style={styles.methodButton}
                    compact
                    disabled={editingId !== null} // Não pode mudar método ao editar
                  >
                    {method.icon} {method.label}
                  </Button>
                ))}
              </View>

              {/* Percentual */}
              <TextInput
                label="Percentual de Desconto (%)"
                value={formData.discount_percentage}
                onChangeText={(text) => setFormData({ ...formData, discount_percentage: text })}
                keyboardType="decimal-pad"
                mode="outlined"
                style={styles.input}
                right={<TextInput.Affix text="%" />}
              />

              {/* Descrição */}
              <TextInput
                label="Descrição (opcional)"
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                mode="outlined"
                style={styles.input}
                multiline
                numberOfLines={2}
              />

              {/* Ativo/Inativo */}
              <View style={styles.switchRow}>
                <Text>Desconto ativo</Text>
                <Switch
                  value={formData.is_active}
                  onValueChange={(value) => setFormData({ ...formData, is_active: value })}
                />
              </View>

              {/* Botões */}
              <View style={styles.formButtons}>
                <Button
                  mode="outlined"
                  onPress={() => {
                    setShowFormModal(false);
                    resetForm();
                  }}
                  style={styles.formButton}
                >
                  Cancelar
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSave}
                  loading={createMutation.isPending || updateMutation.isPending}
                  style={styles.formButton}
                >
                  {editingId ? 'Atualizar' : 'Criar'}
                </Button>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Diálogos */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Sucesso!"
        message={dialogMessage}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setShowSuccessDialog(false)}
        onCancel={() => setShowSuccessDialog(false)}
        type="success"
        icon="checkmark-circle"
      />

      <ConfirmDialog
        visible={showErrorDialog}
        title="Erro"
        message={dialogMessage}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setShowErrorDialog(false)}
        onCancel={() => setShowErrorDialog(false)}
        type="danger"
        icon="alert-circle"
      />

      <ConfirmDialog
        visible={showDeleteDialog}
        title="Confirmar exclusão"
        message={`Deseja remover o desconto para ${deleteTarget?.method}?`}
        confirmText="Remover"
        cancelText="Cancelar"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
        type="danger"
        icon="trash"
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
    padding: 24,
  },
  // Header Clean
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  backIconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  headerInfo: {
    flex: 1,
    marginLeft: theme.spacing.md,
    alignItems: 'center',
  },
  greeting: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.9,
  },
  placeholderButton: {
    width: 40,
    height: 40,
  },
  // Estatísticas
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    elevation: 1,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  // Filtros
  filterContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  filterChipActive: {
    backgroundColor: Colors.light.primary + '15',
    borderColor: Colors.light.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
  filterChipTextActive: {
    color: Colors.light.primary,
  },
  filterBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeActive: {
    backgroundColor: Colors.light.primary,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  filterBadgeTextActive: {
    color: '#fff',
  },
  // Lista
  listContent: {
    paddingTop: 8,
    paddingBottom: 80,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
  },
  loadingText: {
    marginTop: 16,
    color: Colors.light.textSecondary,
  },
  // Card compacto para grid 2 colunas
  cardWrapper: {
    width: '47%',
    marginHorizontal: 6,
    marginBottom: 12,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  cardContent: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  // Ícone do método centralizado
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.light.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  methodIcon: {
    fontSize: 24,
  },
  // Nome do método centralizado
  methodName: {
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    color: Colors.light.text,
  },
  // Percentual em destaque
  discountPercentage: {
    fontWeight: '700',
    color: Colors.light.primary,
    textAlign: 'center',
  },
  discountLabel: {
    color: Colors.light.textSecondary,
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 8,
  },
  // Descrição compacta
  descriptionText: {
    color: Colors.light.textSecondary,
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 6,
    width: '100%',
  },
  // Status badge compacto
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusDotActive: {
    backgroundColor: Colors.light.success,
  },
  statusDotInactive: {
    backgroundColor: Colors.light.error,
  },
  statusText: {
    fontSize: 10,
  },
  statusTextActive: {
    color: Colors.light.success,
  },
  statusTextInactive: {
    color: Colors.light.error,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.light.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    elevation: 24,
  },
  modalContent: {
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontWeight: '700',
    color: Colors.light.text,
  },
  closeButton: {
    padding: 4,
  },
  label: {
    marginBottom: 8,
    marginTop: 8,
  },
  methodButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  methodButton: {
    marginRight: 8,
    marginBottom: 8,
  },
  input: {
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  formButton: {
    flex: 1,
  },
});
