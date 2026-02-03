/**
 * Tela de Configuração de Descontos por Forma de Pagamento
 * Apenas ADMIN pode acessar e modificar
 */

import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Card, TextInput, Button, Switch } from 'react-native-paper';
import { useRouter } from 'expo-router';
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
  const { data: discounts, isLoading, error } = useQuery({
    queryKey: ['payment-discounts'],
    queryFn: () => getPaymentDiscounts(false), // Buscar todos (ativos e inativos)
  });

  // Mutation para criar desconto
  const createMutation = useMutation({
    mutationFn: createPaymentDiscount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-discounts'] });
      haptics.success();
      setDialogMessage('Desconto criado com sucesso!');
      setShowSuccessDialog(true);
      resetForm();
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
      queryClient.invalidateQueries({ queryKey: ['payment-discounts'] });
      haptics.success();
      setDialogMessage('Desconto atualizado com sucesso!');
      setShowSuccessDialog(true);
      setEditingId(null);
      resetForm();
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

  if (isLoading) {
    return (
      <View style={styles.container}>
        {/* Header Premium */}
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
                <Text style={styles.greeting}>Descontos de Pagamento</Text>
                <Text style={styles.headerSubtitle}>Configure descontos</Text>
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

  if (error) {
    return (
      <View style={styles.container}>
        {/* Header Premium */}
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
                <Text style={styles.greeting}>Descontos de Pagamento</Text>
                <Text style={styles.headerSubtitle}>Configure descontos</Text>
              </View>
              <View style={styles.placeholderButton} />
            </View>
          </LinearGradient>
        </View>

        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Erro ao carregar descontos</Text>
          <Button mode="contained" onPress={() => router.back()} style={styles.errorButton}>
            Voltar
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header Premium */}
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
              <Text style={styles.greeting}>Descontos de Pagamento</Text>
              <Text style={styles.headerSubtitle}>{discounts?.length || 0} descontos configurados</Text>
            </View>
            <View style={styles.placeholderButton} />
          </View>
        </LinearGradient>
      </View>

      <ScrollView style={styles.scrollView}>

        {/* Formulário */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {editingId ? 'Editar Desconto' : 'Novo Desconto'}
            </Text>

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
              {editingId && (
                <Button mode="outlined" onPress={resetForm} style={styles.formButton}>
                  Cancelar
                </Button>
              )}
              <Button
                mode="contained"
                onPress={handleSave}
                loading={createMutation.isPending || updateMutation.isPending}
                style={styles.formButton}
              >
                {editingId ? 'Atualizar' : 'Criar'}
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* Lista de Descontos Existentes */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Descontos Configurados
            </Text>

            {!discounts || discounts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Nenhum desconto configurado ainda</Text>
                <Text variant="bodySmall" style={styles.emptySubtext}>
                  Crie descontos para incentivar formas de pagamento específicas
                </Text>
              </View>
            ) : (
              discounts.map((discount, index) => (
                <View key={discount.id} style={[styles.discountItemWrapper, index > 0 && styles.discountItemMargin]}>
                  <View style={styles.discountItem}>
                    <View style={styles.discountHeader}>
                      <Text variant="titleMedium">
                        {getMethodIcon(discount.payment_method)} {getMethodLabel(discount.payment_method)}
                      </Text>
                      <View style={styles.discountActions}>
                        <TouchableOpacity
                          onPress={() => handleEdit(discount)}
                          style={styles.actionIconButton}
                        >
                          <Ionicons name="pencil" size={20} color={Colors.light.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDelete(discount.id, getMethodLabel(discount.payment_method))}
                          style={styles.actionIconButton}
                        >
                          <Ionicons name="trash" size={20} color={Colors.light.error} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.discountBody}>
                      <View style={styles.discountRow}>
                        <Text variant="bodyLarge" style={styles.percentageText}>
                          {discount.discount_percentage}% de desconto
                        </Text>
                        <Switch
                          value={discount.is_active}
                          onValueChange={() => handleToggleActive(discount)}
                        />
                      </View>

                      {discount.description && (
                        <Text variant="bodySmall" style={styles.description}>
                          {discount.description}
                        </Text>
                      )}

                      {!discount.is_active && (
                        <Text variant="bodySmall" style={styles.inactiveText}>
                          ⚠️ Desconto inativo
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              ))
            )}
          </Card.Content>
        </Card>

        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text variant="titleSmall">💡 Dica</Text>
            <Text variant="bodySmall" style={styles.infoText}>
              Incentive pagamentos que não têm taxas (PIX, dinheiro) com descontos maiores.
              Isso aumenta seu lucro e dá benefício ao cliente!
            </Text>
          </Card.Content>
        </Card>
      </ScrollView>

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
  // Header Premium
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
    textAlign: 'center',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  placeholderButton: {
    width: 40,
    height: 40,
  },
  // States
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    color: Colors.light.textSecondary,
  },
  errorText: {
    marginBottom: 16,
    color: Colors.light.error,
  },
  errorButton: {
    minWidth: 120,
  },
  scrollView: {
    flex: 1,
  },
  // Cards
  card: {
    margin: 16,
    marginTop: 8,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
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
    marginBottom: 16,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  formButton: {
    flex: 1,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    marginBottom: 8,
  },
  emptySubtext: {
    opacity: 0.6,
    textAlign: 'center',
  },
  discountItemWrapper: {
  },
  discountItemMargin: {
    marginVertical: 16,
  },
  discountItem: {
    paddingVertical: 8,
  },
  discountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  discountActions: {
    gap: 4,
    flexDirection: 'row',
  },
  actionIconButton: {
    padding: 8,
    borderRadius: theme.borderRadius.md,
  },
  discountBody: {
    marginTop: 8,
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  percentageText: {
    fontWeight: 'bold',
    color: Colors.light.primary,
  },
  description: {
    marginTop: 8,
    opacity: 0.7,
  },
  inactiveText: {
    marginTop: 8,
    color: Colors.light.warning,
  },
  infoCard: {
    margin: 16,
    marginTop: 8,
    backgroundColor: Colors.light.primaryLight,
  },
  infoText: {
    marginTop: 8,
    opacity: 0.8,
  },
});
