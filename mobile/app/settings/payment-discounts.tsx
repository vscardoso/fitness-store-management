/**
 * Tela de ConfiguraÃ§Ã£o de Descontos por Forma de Pagamento
 * Apenas ADMIN pode acessar e modificar
 */

import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TextInput,
  Switch,
  Animated,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
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
import PageHeader from '@/components/layout/PageHeader';
import { useBrandingColors } from '@/store/brandingStore';
import useBackToList from '@/hooks/useBackToList';

/**
 * MÃ©todos de pagamento disponÃ­veis
 */
const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX', icon: 'ðŸ’³' },
  { value: 'cash', label: 'Dinheiro', icon: 'ðŸ’µ' },
  { value: 'debit_card', label: 'DÃ©bito', icon: 'ðŸ’³' },
  { value: 'credit_card', label: 'CrÃ©dito', icon: 'ðŸ’³' },
  { value: 'bank_transfer', label: 'TransferÃªncia', icon: 'ðŸ¦' },
];

interface DiscountFormData {
  payment_method: string;
  discount_percentage: string;
  description: string;
  is_active: boolean;
}

export default function PaymentDiscountsScreen() {
  const { goBack } = useBackToList('/(tabs)/more');
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();

  // AnimaÃ§Ãµes de entrada
  const headerScale = useRef(new Animated.Value(0.94)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslate = useRef(new Animated.Value(24)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

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

  // Auto-refresh + animaÃ§Ã£o de entrada quando a tela recebe foco
  useFocusEffect(
    useCallback(() => {
      refetch();
      headerScale.setValue(0.94);
      headerOpacity.setValue(0);
      contentTranslate.setValue(24);
      contentOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(headerScale, { toValue: 1, useNativeDriver: true }),
        Animated.timing(headerOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(140),
          Animated.parallel([
            Animated.spring(contentTranslate, { toValue: 0, useNativeDriver: true }),
            Animated.timing(contentOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
          ]),
        ]),
      ]).start();
    }, [refetch])
  );

  // Mutation para criar desconto
  const createMutation = useMutation({
    mutationFn: createPaymentDiscount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-discounts'] });
      haptics.success();
      setDialogMessage('Desconto criado com sucesso!');
      setShowSuccessDialog(true);
      setShowFormModal(false);
      resetForm();
    },
    onError: (error: any) => {
      haptics.error();
      setDialogMessage(error.response?.data?.detail || 'NÃ£o foi possÃ­vel criar desconto');
      setShowErrorDialog(true);
    },
  });

  // Mutation para atualizar desconto
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PaymentDiscount> }) =>
      updatePaymentDiscount(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-discounts'] });
      haptics.success();
      setDialogMessage('Desconto atualizado com sucesso!');
      setShowSuccessDialog(true);
      setShowFormModal(false);
      setEditingId(null);
      resetForm();
    },
    onError: (error: any) => {
      haptics.error();
      setDialogMessage(error.response?.data?.detail || 'NÃ£o foi possÃ­vel atualizar desconto');
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
      setDialogMessage(error.response?.data?.detail || 'NÃ£o foi possÃ­vel remover desconto');
      setShowErrorDialog(true);
    },
  });

  /**
   * Resetar formulÃ¡rio
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
    // ValidaÃ§Ãµes
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

  // Obter label do mÃ©todo de pagamento
  const getMethodLabel = (method: string) => {
    return PAYMENT_METHODS.find(m => m.value === method)?.label || method;
  };

  // Obter Ã­cone do mÃ©todo de pagamento
  const getMethodIcon = (method: string) => {
    return PAYMENT_METHODS.find(m => m.value === method)?.icon || 'ðŸ’³';
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
      activeOpacity={0.75}
    >
      <View style={styles.card}>
        <View style={[styles.iconContainer, { backgroundColor: brandingColors.primary + '18' }]}>
          <Text style={styles.methodIcon}>{getMethodIcon(item.payment_method)}</Text>
        </View>
        <Text style={styles.methodName} numberOfLines={1}>
          {getMethodLabel(item.payment_method)}
        </Text>
        <Text style={[styles.discountPercentage, { color: brandingColors.primary }]}>
          {item.discount_percentage}%
        </Text>
        <Text style={styles.discountLabel}>de desconto</Text>
        {item.description ? (
          <Text style={styles.descriptionText} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <View style={[
          styles.statusBadge,
          { backgroundColor: item.is_active ? Colors.light.success + '18' : Colors.light.error + '18' },
        ]}>
          <View style={[styles.statusDot, { backgroundColor: item.is_active ? Colors.light.success : Colors.light.error }]} />
          <Text style={[styles.statusText, { color: item.is_active ? Colors.light.success : Colors.light.error }]}>
            {item.is_active ? 'ATIVO' : 'INATIVO'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  /**
   * Renderizar loading
   */
  if (isLoading && !isRefetching) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Descontos"
          subtitle="Formas de pagamento"
          showBackButton
          onBack={goBack}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={brandingColors.primary} />
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
        <PageHeader
          title="Descontos"
          subtitle="Formas de pagamento"
          showBackButton
          onBack={goBack}
        />
        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar descontos"
          description="Verifique sua conexÃ£o e tente novamente"
        />
      </View>
    );
  }

  const discountCount = filteredDiscounts?.length || 0;

  return (
    <View style={styles.container}>
      {/* Header animado */}
      <Animated.View style={{ transform: [{ scale: headerScale }], opacity: headerOpacity }}>
        <PageHeader
          title="Descontos"
          subtitle={`${discountCount} ${discountCount === 1 ? 'desconto' : 'descontos'}`}
          showBackButton
          onBack={goBack}
        />
      </Animated.View>

      <Animated.View style={{ flex: 1, transform: [{ translateY: contentTranslate }], opacity: contentOpacity }}>
        {/* EstatÃ­sticas */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>ATIVOS</Text>
            <Text style={styles.statValue}>{activeCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>INATIVOS</Text>
            <Text style={styles.statValue}>{inactiveCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TOTAL</Text>
            <Text style={styles.statValue}>{totalCount}</Text>
          </View>
        </View>

        {/* Filtros */}
        <View style={styles.filterContainer}>
          {[
            { key: 'active', label: 'Ativos', count: activeCount, icon: 'checkmark-circle-outline' as const },
            { key: 'inactive', label: 'Inativos', count: inactiveCount, icon: 'close-circle-outline' as const },
            { key: 'all', label: 'Todos', count: totalCount, icon: 'pricetags-outline' as const },
          ].map((f) => {
            const isActive = statusFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, isActive && { backgroundColor: brandingColors.primary + '15', borderColor: brandingColors.primary }]}
                onPress={() => setStatusFilter(f.key as any)}
                activeOpacity={0.7}
              >
                <Ionicons name={f.icon} size={16} color={isActive ? brandingColors.primary : Colors.light.textSecondary} />
                <Text style={[styles.filterChipText, isActive && { color: brandingColors.primary }]}>{f.label}</Text>
                <View style={[styles.filterBadge, isActive && { backgroundColor: brandingColors.primary }]}>
                  <Text style={[styles.filterBadgeText, isActive && { color: '#fff' }]}>{f.count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Lista */}
        <FlatList
          data={filteredDiscounts}
          renderItem={renderDiscount}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[brandingColors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="pricetags-outline"
              title={statusFilter !== 'all' ? 'Nenhum desconto encontrado' : 'Nenhum desconto configurado'}
              description={statusFilter !== 'all' ? 'Tente outro filtro' : 'Toque no botÃ£o + para configurar descontos'}
            />
          }
        />
      </Animated.View>

      {/* FAB */}
      <FAB onPress={handleAddNew} />

      {/* Modal de FormulÃ¡rio */}
      <Modal
        visible={showFormModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowFormModal(false);
          resetForm();
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContainer}>
            <ScrollView
              style={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingId ? 'Editar Desconto' : 'Novo Desconto'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowFormModal(false);
                    resetForm();
                  }}
                  style={styles.closeButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={22} color={Colors.light.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Forma de Pagamento */}
              <Text style={styles.label}>FORMA DE PAGAMENTO</Text>
              <View style={styles.methodButtons}>
                {PAYMENT_METHODS.map((method) => {
                  const isSelected = formData.payment_method === method.value;
                  return (
                    <TouchableOpacity
                      key={method.value}
                      style={[
                        styles.methodButton,
                        isSelected && { backgroundColor: brandingColors.primary + '18', borderColor: brandingColors.primary },
                      ]}
                      onPress={() => !editingId && setFormData({ ...formData, payment_method: method.value })}
                      activeOpacity={editingId ? 1 : 0.7}
                      disabled={editingId !== null}
                    >
                      <Text style={styles.methodButtonIcon}>{method.icon}</Text>
                      <Text style={[styles.methodButtonText, isSelected && { color: brandingColors.primary, fontWeight: '700' }]}>
                        {method.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Percentual */}
              <Text style={styles.label}>PERCENTUAL DE DESCONTO</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  value={formData.discount_percentage}
                  onChangeText={(text) => setFormData({ ...formData, discount_percentage: text })}
                  keyboardType="decimal-pad"
                  placeholder="Ex: 5"
                  placeholderTextColor={Colors.light.textTertiary}
                  style={styles.inputInner}
                />
                <View style={styles.inputSuffix}>
                  <Text style={styles.inputSuffixText}>%</Text>
                </View>
              </View>

              {/* DescriÃ§Ã£o */}
              <Text style={[styles.label, { marginTop: theme.spacing.md }]}>DESCRIÃ‡ÃƒO (OPCIONAL)</Text>
              <TextInput
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Ex: Desconto Ã  vista"
                placeholderTextColor={Colors.light.textTertiary}
                style={styles.textArea}
                multiline
              />

              {/* Switch */}
              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.switchLabel}>Desconto ativo</Text>
                  <Text style={styles.switchSubLabel}>DisponÃ­vel no checkout</Text>
                </View>
                <Switch
                  value={formData.is_active}
                  onValueChange={(value) => setFormData({ ...formData, is_active: value })}
                  trackColor={{ false: Colors.light.border, true: brandingColors.primary + '60' }}
                  thumbColor={formData.is_active ? brandingColors.primary : Colors.light.textTertiary}
                />
              </View>

              {/* BotÃµes */}
              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowFormModal(false);
                    resetForm();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveButtonWrapper, { flex: 1 }]}
                  onPress={handleSave}
                  activeOpacity={0.8}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  <LinearGradient
                    colors={brandingColors.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.saveButton}
                  >
                    {(createMutation.isPending || updateMutation.isPending) ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                        <Text style={styles.saveButtonText}>{editingId ? 'Atualizar' : 'Criar'}</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* DiÃ¡logos */}
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
        title="Confirmar exclusÃ£o"
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
    padding: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.sm,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  statLabel: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: Colors.light.textTertiary,
    marginBottom: 2,
  },
  statValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: Colors.light.text,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  filterChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  listContent: {
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xxl,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
  },
  cardWrapper: {
    width: '47%',
    marginHorizontal: 6,
    marginBottom: theme.spacing.sm,
  },
  card: {
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.sm + 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  methodIcon: {
    fontSize: 22,
  },
  methodName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
    color: Colors.light.text,
  },
  discountPercentage: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  discountLabel: {
    fontSize: theme.fontSize.xxs,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  descriptionText: {
    fontSize: theme.fontSize.xxs,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
    width: '100%',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
    marginTop: theme.spacing.xs,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.light.card,
    borderTopLeftRadius: theme.borderRadius.xxl,
    borderTopRightRadius: theme.borderRadius.xxl,
    maxHeight: '92%',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.border,
    alignSelf: 'center',
    marginBottom: theme.spacing.md,
  },
  modalContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: Colors.light.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: Colors.light.textTertiary,
    marginBottom: theme.spacing.sm,
  },
  methodButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  methodButtonIcon: {
    fontSize: 14,
  },
  methodButtonText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
  },
  inputInner: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    height: 52,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
  },
  textArea: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    minHeight: 80,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    marginBottom: theme.spacing.md,
    textAlignVertical: 'top',
  },
  inputSuffix: {
    paddingHorizontal: theme.spacing.md,
    height: 52,
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: Colors.light.border,
  },
  inputSuffixText: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  switchLabel: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.text,
  },
  switchSubLabel: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  formButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  cancelButton: {
    flex: 1,
    height: 52,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  saveButtonWrapper: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  saveButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
});
