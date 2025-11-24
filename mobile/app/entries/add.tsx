/**
 * Stock Entry Add Screen - Nova Entrada de Estoque
 * 
 * Funcionalidades:
 * - Escolher tipo de entrada (Viagem, Online, Local)
 * - Formulário com fornecedor, NF, pagamento
 * - Lista de produtos com busca
 * - Cálculo automático do total
 * - Validação completa
 */

import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Modal,
} from 'react-native';
import {
  TextInput,
  Button,
  HelperText,
  Text,
  Card,
  Chip,
  Menu,
  IconButton,
  Divider,
  Surface,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrips } from '@/hooks/useTrips';
import { useProducts } from '@/hooks';
import { createStockEntry } from '@/services/stockEntryService';
import { formatCurrency } from '@/utils/format';
import { dateMask, cnpjMask, phoneMask } from '@/utils/masks';
import { Colors, theme } from '@/constants/Colors';
import { EntryType, StockEntryCreate, EntryItem, Product } from '@/types';

interface EntryItemForm extends EntryItem {
  id: string; // ID temporário para gerenciar a lista
  product?: Product;
}

export default function AddStockEntryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Estados do formulário
  const [selectedType, setSelectedType] = useState<EntryType>(EntryType.LOCAL);
  const [entryDate, setEntryDate] = useState('');
  const [tripId, setTripId] = useState<number | undefined>();
  const [supplierName, setSupplierName] = useState('');
  const [supplierCnpj, setSupplierCnpj] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<EntryItemForm[]>([]);

  // Estados de UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tripMenuVisible, setTripMenuVisible] = useState(false);
  const [productMenuVisible, setProductMenuVisible] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);

  // Queries
  const { data: trips = [] } = useTrips({ status: undefined, limit: 100 });
  const { data: products = [] } = useProducts({ limit: 100 });

  /**
   * Filtrar produtos por busca
   */
  const filteredProducts = products.filter((p: Product) => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku.toLowerCase().includes(productSearch.toLowerCase())
  );

  /**
   * Mutation para criar entrada
   */
  const createMutation = useMutation({
    mutationFn: createStockEntry,
    onSuccess: (createdEntry) => {
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      
      Alert.alert(
        'Sucesso!',
        `Entrada ${createdEntry.entry_code} criada com sucesso`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    },
    onError: (error: any) => {
      const errorMessage = error.message || 'Erro ao criar entrada';
      Alert.alert('Erro', errorMessage);
    },
  });

  /**
   * Adicionar produto à lista
   */
  const handleAddProduct = (product: Product) => {
    const newItem: EntryItemForm = {
      id: Date.now().toString(),
      product_id: product.id,
      quantity_received: 1,
      unit_cost: product.cost_price || 0,
      notes: '',
      product,
    };

    setItems([...items, newItem]);
    setProductMenuVisible(false);
    setProductSearch('');
  };

  /**
   * Atualizar item da lista
   */
  const handleUpdateItem = (index: number, field: keyof EntryItemForm, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  /**
   * Remover item da lista
   */
  const handleRemoveItem = (index: number) => {
    Alert.alert(
      'Remover Produto',
      'Deseja remover este produto da entrada?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            const newItems = items.filter((_, i) => i !== index);
            setItems(newItems);
          },
        },
      ]
    );
  };

  /**
   * Calcular total da entrada
   */
  const calculateTotal = (): number => {
    return items.reduce((sum, item) => {
      return sum + (item.quantity_received * item.unit_cost);
    }, 0);
  };

  /**
   * Validar formulário
   */
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!supplierName.trim()) {
      newErrors.supplierName = 'Fornecedor é obrigatório';
    }

    if (selectedType === EntryType.TRIP && !tripId) {
      newErrors.tripId = 'Selecione uma viagem';
    }

    if (items.length === 0) {
      newErrors.items = 'Adicione pelo menos um produto';
    }

    // Validar cada item
    items.forEach((item, index) => {
      if (item.quantity_received <= 0) {
        newErrors[`item_${index}_quantity`] = 'Quantidade inválida';
      }
      if (item.unit_cost < 0) {
        newErrors[`item_${index}_cost`] = 'Custo inválido';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Submeter formulário
   */
  const handleSubmit = async () => {
    if (!validate()) {
      Alert.alert('Atenção', 'Preencha todos os campos obrigatórios');
      return;
    }

    // Converter data de DD/MM/YYYY para YYYY-MM-DD
    const formatDateToISO = (date: string): string => {
      const cleaned = date.replace(/\D/g, '');
      if (cleaned.length === 8) {
        const day = cleaned.substring(0, 2);
        const month = cleaned.substring(2, 4);
        const year = cleaned.substring(4, 8);
        return `${year}-${month}-${day}`;
      }
      return new Date().toISOString().split('T')[0];
    };

    const entryData: StockEntryCreate = {
      entry_date: entryDate ? formatDateToISO(entryDate) : new Date().toISOString().split('T')[0],
      entry_type: selectedType,
      trip_id: selectedType === EntryType.TRIP ? tripId : undefined,
      supplier_name: supplierName.trim(),
      supplier_cnpj: supplierCnpj.trim() || undefined,
      supplier_contact: supplierContact.trim() || undefined,
      invoice_number: invoiceNumber.trim() || undefined,
      payment_method: paymentMethod.trim() || undefined,
      notes: notes.trim() || undefined,
      items: items.map(item => ({
        product_id: item.product_id,
        quantity_received: item.quantity_received,
        unit_cost: item.unit_cost,
        notes: item.notes || undefined,
      })),
    };

    createMutation.mutate(entryData);
  };

  const total = calculateTotal();
  const selectedTrip = trips.find(t => t.id === tripId);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header Gradiente */}
      <LinearGradient
        colors={[Colors.light.primary, Colors.light.primary]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nova Entrada</Text>
          <View style={styles.headerPlaceholder} />
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Tipo de Entrada */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tipo de Entrada</Text>
          <View style={styles.typeButtons}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                selectedType === EntryType.TRIP && styles.typeButtonActive,
              ]}
              onPress={() => setSelectedType(EntryType.TRIP)}
            >
              <Ionicons
                name="car-outline"
                size={32}
                color={selectedType === EntryType.TRIP ? Colors.light.primary : Colors.light.textSecondary}
              />
              <Text style={[
                styles.typeButtonText,
                selectedType === EntryType.TRIP && styles.typeButtonTextActive,
              ]}>
                Viagem
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeButton,
                selectedType === EntryType.ONLINE && styles.typeButtonActive,
              ]}
              onPress={() => setSelectedType(EntryType.ONLINE)}
            >
              <Ionicons
                name="cart-outline"
                size={32}
                color={selectedType === EntryType.ONLINE ? Colors.light.primary : Colors.light.textSecondary}
              />
              <Text style={[
                styles.typeButtonText,
                selectedType === EntryType.ONLINE && styles.typeButtonTextActive,
              ]}>
                Online
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeButton,
                selectedType === EntryType.LOCAL && styles.typeButtonActive,
              ]}
              onPress={() => setSelectedType(EntryType.LOCAL)}
            >
              <Ionicons
                name="business-outline"
                size={32}
                color={selectedType === EntryType.LOCAL ? Colors.light.primary : Colors.light.textSecondary}
              />
              <Text style={[
                styles.typeButtonText,
                selectedType === EntryType.LOCAL && styles.typeButtonTextActive,
              ]}>
                Local
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Seleção de Viagem (se tipo = TRIP) */}
        {selectedType === EntryType.TRIP && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Viagem *</Text>
            <Menu
              visible={tripMenuVisible}
              onDismiss={() => setTripMenuVisible(false)}
              anchor={
                <TouchableOpacity
                  style={[styles.selectButton, errors.tripId && styles.selectButtonError]}
                  onPress={() => setTripMenuVisible(true)}
                >
                  <Text style={styles.selectButtonText}>
                    {selectedTrip ? `${selectedTrip.trip_code} - ${selectedTrip.destination}` : 'Selecionar viagem'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={Colors.light.textSecondary} />
                </TouchableOpacity>
              }
            >
              {trips.map((trip) => (
                <Menu.Item
                  key={trip.id}
                  onPress={() => {
                    setTripId(trip.id);
                    setTripMenuVisible(false);
                  }}
                  title={`${trip.trip_code} - ${trip.destination}`}
                />
              ))}
            </Menu>
            {errors.tripId && (
              <HelperText type="error">{errors.tripId}</HelperText>
            )}
          </View>
        )}

        {/* Data e Fornecedor */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informações Gerais</Text>

          <View style={styles.inputGroup}>
            <TextInput
              label="Data da Entrada *"
              value={entryDate}
              onChangeText={(text) => {
                setEntryDate(dateMask(text));
                setErrors({ ...errors, entryDate: '' });
              }}
              mode="outlined"
              placeholder="DD/MM/AAAA"
              keyboardType="numeric"
              maxLength={10}
              left={<TextInput.Icon icon="calendar" />}
              error={!!errors.entryDate}
            />
            {errors.entryDate ? (
              <HelperText type="error">{errors.entryDate}</HelperText>
            ) : (
              <HelperText type="info">Formato: DD/MM/AAAA</HelperText>
            )}
          </View>

          <View style={styles.inputGroup}>
            <TextInput
              label="Nome do Fornecedor *"
              value={supplierName}
              onChangeText={setSupplierName}
              mode="outlined"
              error={!!errors.supplierName}
              left={<TextInput.Icon icon="store" />}
            />
            {errors.supplierName && (
              <HelperText type="error">{errors.supplierName}</HelperText>
            )}
          </View>

          <View style={styles.inputGroup}>
            <TextInput
              label="CNPJ"
              value={supplierCnpj}
              onChangeText={(text) => {
                setSupplierCnpj(cnpjMask(text));
                setErrors({ ...errors, supplierCnpj: '' });
              }}
              mode="outlined"
              keyboardType="numeric"
              placeholder="00.000.000/0000-00"
              maxLength={18}
              left={<TextInput.Icon icon="card-account-details" />}
              error={!!errors.supplierCnpj}
            />
            {errors.supplierCnpj && (
              <HelperText type="error">{errors.supplierCnpj}</HelperText>
            )}
          </View>

          <View style={styles.inputGroup}>
            <TextInput
              label="Contato"
              value={supplierContact}
              onChangeText={(text) => {
                setSupplierContact(phoneMask(text));
                setErrors({ ...errors, supplierContact: '' });
              }}
              mode="outlined"
              keyboardType="phone-pad"
              placeholder="(00) 00000-0000"
              maxLength={15}
              left={<TextInput.Icon icon="phone" />}
              error={!!errors.supplierContact}
            />
            {errors.supplierContact && (
              <HelperText type="error">{errors.supplierContact}</HelperText>
            )}
          </View>
        </View>

        {/* Nota Fiscal e Pagamento */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pagamento</Text>

          <View style={styles.inputGroup}>
            <TextInput
              label="Número da NF"
              value={invoiceNumber}
              onChangeText={setInvoiceNumber}
              mode="outlined"
              placeholder="Ex: 12345"
              left={<TextInput.Icon icon="receipt" />}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Forma de Pagamento</Text>
            <View style={styles.paymentChips}>
              {['PIX', 'Cartão', 'Dinheiro', 'Boleto'].map((method) => (
                <Chip
                  key={method}
                  selected={paymentMethod === method}
                  onPress={() => setPaymentMethod(method)}
                  style={styles.paymentChip}
                  mode={paymentMethod === method ? 'flat' : 'outlined'}
                >
                  {method}
                </Chip>
              ))}
            </View>
            <TextInput
              label="Ou digite outro método"
              value={paymentMethod}
              onChangeText={setPaymentMethod}
              mode="outlined"
              placeholder="Ex: Transferência"
              left={<TextInput.Icon icon="cash" />}
              style={{ marginTop: 8 }}
            />
          </View>
        </View>

        {/* Lista de Produtos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Produtos ({items.length})</Text>
            <Button
              mode="outlined"
              onPress={() => setProductMenuVisible(true)}
              icon="plus"
              compact
            >
              Adicionar
            </Button>
          </View>

          {errors.items && (
            <HelperText type="error">{errors.items}</HelperText>
          )}

          {/* Modal de Produtos */}
          <Modal
            visible={productMenuVisible}
            transparent
            animationType="slide"
            onRequestClose={() => {
              setProductMenuVisible(false);
              setProductSearch('');
            }}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Adicionar Produto</Text>
                  <IconButton
                    icon="close"
                    size={24}
                    onPress={() => {
                      setProductMenuVisible(false);
                      setProductSearch('');
                    }}
                  />
                </View>

                <TextInput
                  placeholder="Buscar produto..."
                  value={productSearch}
                  onChangeText={setProductSearch}
                  mode="outlined"
                  left={<TextInput.Icon icon="magnify" />}
                  style={styles.searchInput}
                />

                <ScrollView style={styles.productList}>
                  {filteredProducts.map((product: Product) => (
                    <TouchableOpacity
                      key={product.id}
                      style={styles.productItem}
                      onPress={() => handleAddProduct(product)}
                    >
                      <View>
                        <Text style={styles.productName}>{product.name}</Text>
                        <Text style={styles.productPrice}>
                          Custo: {formatCurrency(product.cost_price || 0)}
                        </Text>
                      </View>
                      <IconButton icon="plus" size={20} />
                    </TouchableOpacity>
                  ))}
                  {filteredProducts.length === 0 && (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>Nenhum produto encontrado</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Lista de Items */}
          {items.map((item, index) => (
            <Card key={item.id} style={styles.itemCard}>
              <Card.Content>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>{item.product?.name || `Produto #${item.product_id}`}</Text>
                  <IconButton
                    icon="close"
                    size={20}
                    onPress={() => handleRemoveItem(index)}
                  />
                </View>

                <View style={styles.itemRow}>
                  <View style={styles.itemInput}>
                    <TextInput
                      label="Quantidade"
                      value={item.quantity_received.toString()}
                      onChangeText={(text) => handleUpdateItem(index, 'quantity_received', parseInt(text) || 0)}
                      keyboardType="numeric"
                      mode="outlined"
                      dense
                      error={!!errors[`item_${index}_quantity`]}
                    />
                  </View>

                  <View style={styles.itemInput}>
                    <TextInput
                      label="Custo Unit."
                      value={item.unit_cost.toString()}
                      onChangeText={(text) => handleUpdateItem(index, 'unit_cost', parseFloat(text) || 0)}
                      keyboardType="decimal-pad"
                      mode="outlined"
                      dense
                      error={!!errors[`item_${index}_cost`]}
                    />
                  </View>
                </View>

                <View style={styles.itemTotal}>
                  <Text style={styles.itemTotalLabel}>Subtotal:</Text>
                  <Text style={styles.itemTotalValue}>
                    {formatCurrency(item.quantity_received * item.unit_cost)}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          ))}
        </View>

        {/* Observações */}
        <View style={styles.inputGroup}>
          <TextInput
            label="Observações"
            value={notes}
            onChangeText={setNotes}
            mode="outlined"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Resumo */}
        {items.length > 0 && (
          <Surface style={styles.summaryCard} elevation={2}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Produtos</Text>
              <Text style={styles.summaryValue}>{items.length} {items.length === 1 ? 'item' : 'itens'}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Quantidade Total</Text>
              <Text style={styles.summaryValue}>
                {items.reduce((sum, item) => sum + item.quantity_received, 0)} unidades
              </Text>
            </View>
            <Divider style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total da Entrada</Text>
              <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
            </View>
          </Surface>
        )}

        {/* Botões */}
        <View style={styles.actions}>
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={createMutation.isPending}
            disabled={createMutation.isPending || items.length === 0}
            style={styles.submitButton}
            contentStyle={styles.submitButtonContent}
          >
            Salvar Entrada
          </Button>

          <Button
            mode="outlined"
            onPress={() => router.back()}
            disabled={createMutation.isPending}
          >
            Cancelar
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  headerPlaceholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 12,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    backgroundColor: Colors.light.card,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.light.border,
  },
  typeButtonActive: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primaryLight,
  },
  typeButtonText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  typeButtonTextActive: {
    color: Colors.light.primary,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 8,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.light.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  selectButtonError: {
    borderColor: Colors.light.error,
  },
  selectButtonText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.light.text,
  },
  searchInput: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  productList: {
    maxHeight: 400,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  productName: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.light.text,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  itemCard: {
    marginBottom: 12,
    backgroundColor: Colors.light.card,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  itemInput: {
    flex: 1,
  },
  itemTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  itemTotalLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  itemTotalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  paymentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  paymentChip: {
    marginRight: 0,
  },
  summaryCard: {
    backgroundColor: Colors.light.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  summaryDivider: {
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  actions: {
    marginTop: 8,
    gap: 12,
  },
  submitButton: {
    backgroundColor: Colors.light.primary,
  },
  submitButtonContent: {
    paddingVertical: 8,
  },
});
