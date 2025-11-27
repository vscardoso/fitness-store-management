/**
 * Stock Entry Add Screen - Nova Entrada de Estoque
 *
 * Funcionalidades:
 * - Escolher tipo de entrada (Viagem, Online, Local)
 * - Formulário com fornecedor, NF, pagamento
 * - Lista de produtos com busca
 * - Cálculo automático do total
 * - Validação completa
 * - Suporte a produto pré-selecionado do catálogo
 */

import { useState, useEffect } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrips } from '@/hooks/useTrips';
import { useProducts } from '@/hooks';
import { createStockEntry } from '@/services/stockEntryService';
import { formatCurrency } from '@/utils/format';
import { cnpjMask, phoneMask } from '@/utils/masks';
import { Colors, theme } from '@/constants/Colors';
import { EntryType, StockEntryCreate, EntryItem, Product } from '@/types';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface EntryItemForm extends EntryItem {
  id: string; // ID temporário para gerenciar a lista
  product?: Product;
}

export default function AddStockEntryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Ler parâmetros da navegação (produto pré-selecionado do catálogo + viagem criada)
  const params = useLocalSearchParams<{
    preselectedProductId?: string;
    preselectedProductName?: string;
    preselectedQuantity?: string;
    preselectedPrice?: string;
    newTripId?: string;
    newTripCode?: string;
  }>();

  // Estados do formulário
  const [selectedType, setSelectedType] = useState<EntryType>(EntryType.LOCAL);
  const [entryCode, setEntryCode] = useState('');
  const [tripId, setTripId] = useState<number | undefined>();
  const [supplierName, setSupplierName] = useState('');
  const [supplierCnpj, setSupplierCnpj] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<EntryItemForm[]>([]);
  const [itemCosts, setItemCosts] = useState<Record<string, string>>({});

  // Estados de UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tripMenuVisible, setTripMenuVisible] = useState(false);
  const [productMenuVisible, setProductMenuVisible] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [showCreateTripDialog, setShowCreateTripDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdEntryCode, setCreatedEntryCode] = useState<string | undefined>();

  // Queries
  const { data: trips = [] } = useTrips({ status: undefined, limit: 100 });
  const { data: products = [] } = useProducts({ limit: 100 });

  /**
   * Pré-adicionar produto do catálogo (se veio dos parâmetros)
   */
  useEffect(() => {
    if (params.preselectedProductId && products.length > 0 && items.length === 0) {
      const productId = parseInt(params.preselectedProductId);
      const product = products.find((p: Product) => p.id === productId);

      if (product) {
        const quantity = params.preselectedQuantity ? parseInt(params.preselectedQuantity) : 1;
        const price = params.preselectedPrice ? parseFloat(params.preselectedPrice) : (product.cost_price || 0);

        // Converter price para formato aceito por formatCostInput (números inteiros representando centavos)
        const priceInCents = Math.round(price * 100).toString();
        const costFormatted = formatCostInput(priceInCents);

        const newItem: EntryItemForm = {
          id: Date.now().toString(),
          product_id: product.id,
          quantity_received: quantity,
          unit_cost: price,
          notes: '',
          product,
        };

        setItems([newItem]);
        setItemCosts({ [newItem.id]: costFormatted });
      }
    }
  }, [params.preselectedProductId, products]);

  /**
   * Auto-selecionar viagem recém-criada (quando volta de /trips/add)
   */
  useEffect(() => {
    if (params.newTripId && trips.length > 0) {
      const newTripIdNum = parseInt(params.newTripId);
      const trip = trips.find((t) => t.id === newTripIdNum);

      if (trip) {
        setSelectedType(EntryType.TRIP);
        setTripId(trip.id);

        // Mostrar feedback de sucesso
        Alert.alert(
          'Viagem Vinculada! ✓',
          `A viagem "${trip.trip_code} - ${trip.destination}" foi vinculada automaticamente a esta entrada.`,
          [{ text: 'Entendi' }]
        );
      }
    }
  }, [params.newTripId, trips]);

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
      // Invalidate stock entries queries
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['active-products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });

      setCreatedEntryCode(createdEntry.entry_code);
      setShowSuccessDialog(true);
    },
    onError: (error: any) => {
      const errorMessage = error.message || 'Erro ao criar entrada';
      Alert.alert('Erro', errorMessage);
    },
  });

  /**
   * Formatar custo unitário (formato brasileiro)
   */
  const formatCostInput = (text: string): string => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers.length === 0) return '0,00';
    const value = parseInt(numbers) / 100;
    return value.toFixed(2).replace('.', ',');
  };

  /**
   * Converter custo formatado para número
   */
  const parseCost = (value: string): number => {
    if (!value) return 0;
    const cleaned = value.replace(/[^\d,]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  };

  /**
   * Adicionar produto à lista
   */
  const handleAddProduct = (product: Product) => {
    const costFormatted = formatCostInput((product.cost_price || 0).toString().replace('.', ''));
    const newItem: EntryItemForm = {
      id: Date.now().toString(),
      product_id: product.id,
      quantity_received: 1,
      unit_cost: product.cost_price || 0,
      notes: '',
      product,
    };

    setItems([...items, newItem]);
    setItemCosts({ ...itemCosts, [newItem.id]: costFormatted });
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
   * Atualizar custo do item
   */
  const handleUpdateItemCost = (itemId: string, index: number, formattedValue: string) => {
    const numericValue = parseCost(formattedValue);
    setItemCosts({ ...itemCosts, [itemId]: formattedValue });
    handleUpdateItem(index, 'unit_cost', numericValue);
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

    if (!entryCode.trim()) {
      newErrors.entryCode = 'Código da entrada é obrigatório';
    }

    if (entryCode.trim().length < 5) {
      newErrors.entryCode = 'Código deve ter no mínimo 5 caracteres';
    }

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

  /** Calcular data da entrada (auto)
   * - Viagem: usa data de retorno (se existir) ou data da viagem
   * - Outros tipos: hoje
   */
  const computeEntryDateISO = (): string => {
    if (selectedType === EntryType.TRIP && tripId) {
      const trip = trips.find((t) => t.id === tripId);
      if (trip) {
        const baseDate = trip.return_time ? new Date(trip.return_time) : new Date(trip.trip_date);
        // Usar data local em vez de UTC
        const year = baseDate.getFullYear();
        const month = String(baseDate.getMonth() + 1).padStart(2, '0');
        const day = String(baseDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }
    // Usar data local em vez de UTC
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /**
   * Submeter formulário
   */
  const handleSubmit = async () => {
    if (!validate()) {
      Alert.alert('Atenção', 'Preencha todos os campos obrigatórios');
      return;
    }

    const entryData: StockEntryCreate = {
      entry_code: entryCode.trim(),
      entry_date: computeEntryDateISO(),
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
            onPress={() => router.push('/(tabs)/entries')}
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

        {/* Código e Data da Entrada */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informações Básicas</Text>
          
          <View style={styles.inputGroup}>
            <TextInput
              label="Código da Entrada *"
              value={entryCode}
              onChangeText={setEntryCode}
              mode="outlined"
              placeholder="Ex: ENTRADA-001 (mín. 5 caracteres)"
              maxLength={50}
              autoCapitalize="characters"
              error={!!errors.entryCode}
            />
            {errors.entryCode && (
              <HelperText type="error" visible={!!errors.entryCode}>
                {errors.entryCode}
              </HelperText>
            )}
          </View>

          <View style={styles.inputGroup}>
            <TextInput
              label="Data da Entrada (auto)"
              value={computeEntryDateISO().split('-').reverse().join('/')}
              mode="outlined"
              editable={false}
              left={<TextInput.Icon icon="calendar" />}
            />
            <HelperText type="info">
              Calculada automaticamente
            </HelperText>
          </View>
        </View>

        {/* Seleção de Viagem (se tipo = TRIP) */}
        {selectedType === EntryType.TRIP && (
          <View style={styles.inputGroup}>
            <View style={styles.labelWithAction}>
              <Text style={styles.label}>Viagem *</Text>
              <TouchableOpacity
                onPress={() => {
                  setTripMenuVisible(false);
                  setShowCreateTripDialog(true);
                }}
                style={styles.addButton}
              >
                <Ionicons name="add-circle" size={20} color={Colors.light.primary} />
                <Text style={styles.addButtonText}>Nova Viagem</Text>
              </TouchableOpacity>
            </View>
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
              {trips.length === 0 ? (
                <Menu.Item
                  onPress={() => {
                    setTripMenuVisible(false);
                    setShowCreateTripDialog(true);
                  }}
                  title="➕ Criar Nova Viagem"
                  titleStyle={{ color: Colors.light.primary, fontWeight: '600' }}
                />
              ) : (
                <>
                  <Menu.Item
                    onPress={() => {
                      setTripMenuVisible(false);
                      setShowCreateTripDialog(true);
                    }}
                    title="➕ Criar Nova Viagem"
                    titleStyle={{ color: Colors.light.primary, fontWeight: '600' }}
                  />
                  <Divider />
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
                </>
              )}
            </Menu>
            {errors.tripId && (
              <HelperText type="error">{errors.tripId}</HelperText>
            )}
            {trips.length === 0 && !errors.tripId && (
              <HelperText type="info">
                Nenhuma viagem cadastrada. Crie uma nova viagem para continuar.
              </HelperText>
            )}
          </View>
        )}

        {/* Fornecedor */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informações do Fornecedor</Text>

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
                      label="Custo Unit. (R$)"
                      value={itemCosts[item.id] || '0,00'}
                      onChangeText={(text) => handleUpdateItemCost(item.id, index, formatCostInput(text))}
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
            onPress={() => router.push('/(tabs)/entries')}
            disabled={createMutation.isPending}
          >
            Cancelar
          </Button>
        </View>
      </ScrollView>

      {/* Dialog de Criar Nova Viagem */}
      <ConfirmDialog
        visible={showCreateTripDialog}
        title="Criar Nova Viagem"
        message="Você será redirecionado para cadastrar uma nova viagem. Seus dados da entrada atual serão preservados."
        details={[
          'Cadastre a viagem com destino, data e custos',
          'Após salvar, você voltará automaticamente',
          'A viagem será vinculada automaticamente',
          'Continue preenchendo a entrada de estoque'
        ]}
        type="info"
        confirmText="Ir para Nova Viagem"
        cancelText="Cancelar"
        onConfirm={() => {
          setShowCreateTripDialog(false);
          router.push({
            pathname: '/trips/add',
            params: { from: 'entries' }
          });
        }}
        onCancel={() => setShowCreateTripDialog(false)}
        icon="airplane"
      />

      {/* Dialog de Sucesso da Entrada */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Entrada Criada! ✓"
        message={`A entrada ${createdEntryCode || ''} foi registrada com sucesso.`}
        details={[
          `${items.length} ${items.length === 1 ? 'item' : 'itens'} adicionados`,
          `Total: ${formatCurrency(total)}`,
          selectedType === EntryType.TRIP && selectedTrip ? `Viagem vinculada: ${selectedTrip.trip_code}` : 'Tipo: ' + (selectedType === EntryType.TRIP ? 'Viagem' : selectedType === EntryType.ONLINE ? 'Online' : 'Local'),
          'Você pode acompanhar performance (Sell-Through / ROI) após vendas',
        ].filter(Boolean)}
        type="success"
        confirmText="Ver Entradas"
        cancelText="Nova Entrada"
        onConfirm={() => {
          setShowSuccessDialog(false);
          router.push('/(tabs)/entries');
        }}
        onCancel={() => {
          // Reset para nova entrada rápida
          setShowSuccessDialog(false);
          setEntryCode('');
          setSupplierName('');
          setSupplierCnpj('');
          setSupplierContact('');
          setInvoiceNumber('');
          setPaymentMethod('');
          setNotes('');
          setItems([]);
          setItemCosts({});
          setTripId(undefined);
          setSelectedType(EntryType.LOCAL);
        }}
        icon="checkmark-circle"
      />
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
  labelWithAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: Colors.light.primaryLight,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.primary,
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
