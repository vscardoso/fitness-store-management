import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Text,
  ActivityIndicator,
  TextInput as RNTextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Colors, theme } from '@/constants/Colors';
import PageHeader from '@/components/layout/PageHeader';
import { useBrandingColors } from '@/store/brandingStore';
import { createShipment } from '@/services/conditionalService';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import ProductSelectionModal from '@/components/sale/ProductSelectionModal';
import { CreateShipmentDTO } from '@/types/conditional';
import { getCustomers } from '@/services/customerService';
import { searchCep } from '@/services/cepService';
import type { ProductGrouped, ProductVariant } from '@/types';

type Step = 1 | 2 | 3 | 4;

interface SelectedProduct {
  product_id: number;
  name: string;
  price: number;
  quantity_sent: number;
  max_stock?: number;
  variant_id?: number;
  variant_size?: string;
  variant_color?: string;
}

/**
 * Calcula e formata o prazo entre duas datas
 * - Se >= 1 dia: mostra em dias
 * - Se < 1 dia: mostra em horas
 */
const calculateDeadline = (departure: Date, returnDate: Date): { days: number; hours: number; formatted: string } => {
  const diffMs = returnDate.getTime() - departure.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays >= 1) {
    const days = Math.ceil(diffDays);
    return { days, hours: 0, formatted: `${days} ${days === 1 ? 'dia' : 'dias'}` };
  } else {
    const hours = Math.ceil(diffHours);
    return { days: 0, hours, formatted: `${hours} ${hours === 1 ? 'hora' : 'horas'}` };
  }
};

export default function CreateConditionalShipmentScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();

  const [step, setStep] = useState<Step>(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [notes, setNotes] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  
  // Datas de ida e devolução (NOVO)
  const [departureDateTime, setDepartureDateTime] = useState<Date | undefined>();
  const [returnDateTime, setReturnDateTime] = useState<Date | undefined>();
  
  // Campos de endereço separados
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);
  const headerAnim = React.useRef(new Animated.Value(0)).current;
  const contentAnim = React.useRef(new Animated.Value(0)).current;

  // Invalidar cache de produtos ao entrar na tela
  React.useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      headerAnim.setValue(0);
      contentAnim.setValue(0);

      Animated.spring(headerAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 14,
        stiffness: 120,
        mass: 0.9,
      }).start();

      Animated.spring(contentAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 16,
        stiffness: 110,
        mass: 1,
        delay: 140,
      }).start();
    }, [contentAnim, headerAnim])
  );

  // Preencher data/hora de ida ao entrar no Step 3.
  React.useEffect(() => {
    if (step !== 3 || departureDateTime) return;

    const now = new Date();
    now.setSeconds(0, 0);
    setDepartureDateTime(now);
  }, [step, departureDateTime]);

  // Estados para dialogs
  const [dialogConfig, setDialogConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info';
    onConfirm?: () => void;
  }>({ visible: false, title: '', message: '' });

  // Queries
  const { data: customers = [], isLoading: loadingCustomers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers({}),
    enabled: step === 1,
  });

  // Mutation
  const createMutation = useMutation({
    mutationFn: createShipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });
      setDialogConfig({
        visible: true,
        title: 'Sucesso',
        message: 'Envio condicional criado com sucesso!',
        type: 'success',
        onConfirm: () => {
          setDialogConfig({ ...dialogConfig, visible: false });
          router.back();
        },
      });
    },
    onError: (error: any) => {
      setDialogConfig({
        visible: true,
        title: 'Erro',
        message: error.response?.data?.detail || 'Erro ao criar envio condicional',
        type: 'danger',
        onConfirm: () => setDialogConfig({ ...dialogConfig, visible: false }),
      });
    },
  });

  const handleSelectProductVariant = (product: ProductGrouped, variant: ProductVariant) => {
    const existing = selectedProducts.find(
      (p) => p.product_id === product.id && p.variant_id === variant.id
    );
    if (existing) {
      if (existing.quantity_sent >= variant.current_stock) return;
      setSelectedProducts(selectedProducts.map((p) =>
        p.product_id === product.id && p.variant_id === variant.id
          ? { ...p, quantity_sent: p.quantity_sent + 1 }
          : p
      ));
    } else {
      setSelectedProducts([...selectedProducts, {
        product_id: product.id,
        name: product.name,
        price: Number(variant.price) || 0,
        quantity_sent: 1,
        max_stock: variant.current_stock,
        variant_id: variant.id,
        variant_size: variant.size || undefined,
        variant_color: variant.color || undefined,
      }]);
    }
    setShowProductModal(false);
  };

  const handleRemoveProduct = (productId: number, variantId?: number) => {
    setSelectedProducts(selectedProducts.filter(
      (p) => !(p.product_id === productId && p.variant_id === variantId)
    ));
  };

  const handleQuantityChange = (productId: number, variantId: number | undefined, delta: number) => {
    setSelectedProducts(
      selectedProducts.map((p) => {
        if (p.product_id !== productId || p.variant_id !== variantId) return p;
        const newQuantity = p.quantity_sent + delta;
        if (newQuantity < 1) return p;
        if (newQuantity > (p.max_stock || 999)) {
          setDialogConfig({
            visible: true,
            title: 'Limite de Estoque',
            message: `Quantidade máxima disponível: ${p.max_stock} unidades.`,
            type: 'warning',
            onConfirm: () => setDialogConfig({ ...dialogConfig, visible: false }),
          });
          return p;
        }
        return { ...p, quantity_sent: newQuantity };
      })
    );
  };
  const handleNext = () => {
    if (step === 1 && !selectedCustomerId) {
      setDialogConfig({
        visible: true,
        title: 'Atenção',
        message: 'Selecione um cliente para continuar',
        type: 'warning',
        onConfirm: () => setDialogConfig({ ...dialogConfig, visible: false }),
      });
      return;
    }
    if (step === 2 && selectedProducts.length === 0) {
      setDialogConfig({
        visible: true,
        title: 'Atenção',
        message: 'Adicione pelo menos um produto',
        type: 'warning',
        onConfirm: () => setDialogConfig({ ...dialogConfig, visible: false }),
      });
      return;
    }
    if (step === 3) {
      // Verificar apenas se os campos de step 3 ainda não foram preenchidos
      const needsAddress = !street && !number && !neighborhood && !city && !state && !zipCode;
      if (needsAddress || (!street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || !state.trim() || !zipCode.trim())) {
        setDialogConfig({
          visible: true,
          title: 'Atenção',
          message: 'Preencha todos os campos obrigatórios do endereço',
          type: 'warning',
          onConfirm: () => setDialogConfig({ ...dialogConfig, visible: false }),
        });
        return;
      }
      // Validar datas
      if (!departureDateTime || !returnDateTime) {
        setDialogConfig({
          visible: true,
          title: 'Atenção',
          message: 'Defina as datas de ida e devolução',
          type: 'warning',
          onConfirm: () => setDialogConfig({ ...dialogConfig, visible: false }),
        });
        return;
      }
      if (returnDateTime <= departureDateTime) {
        setDialogConfig({
          visible: true,
          title: 'Atenção',
          message: 'A data de devolução deve ser posterior à data de ida',
          type: 'warning',
          onConfirm: () => setDialogConfig({ ...dialogConfig, visible: false }),
        });
        return;
      }
    }
    // Ao avançar do step 1 para o 2, preencher endereço do cliente
    if (step === 1 && selectedCustomerId) {
      const customer = customers.find(c => c.id === selectedCustomerId);
      if (customer) {
        setStreet(customer.address || '');
        setNumber(customer.address_number || '');
        setNeighborhood(customer.neighborhood || '');
        setCity(customer.city || '');
        setState(customer.state || '');
        setZipCode(customer.zip_code || '');
      }
    }
    setStep((prev) => Math.min(4, prev + 1) as Step);
  };

  const handleBack = () => {
    setStep((prev) => Math.max(1, prev - 1) as Step);
  };

  /**
   * Busca automática de CEP ao digitar
   */
  const handleCepChange = async (text: string) => {
    const masked = text.replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9);
    setZipCode(masked);

    // Busca automática quando CEP estiver completo
    const cleanCep = masked.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      setLoadingCep(true);
      const cepData = await searchCep(cleanCep);
      setLoadingCep(false);

      if (cepData) {
        setStreet(cepData.logradouro || '');
        setNeighborhood(cepData.bairro || '');
        setCity(cepData.localidade || '');
        setState(cepData.uf || '');
      } else {
        Alert.alert('Aviso', 'CEP não encontrado');
      }
    }
  };

  /**
   * Busca manual de CEP (botão)
   */
  const handleSearchCep = async () => {
    const cleanCep = zipCode.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      Alert.alert('Aviso', 'Digite um CEP válido com 8 dígitos');
      return;
    }

    setLoadingCep(true);
    const cepData = await searchCep(cleanCep);
    setLoadingCep(false);

    if (cepData) {
      setStreet(cepData.logradouro || '');
      setNeighborhood(cepData.bairro || '');
      setCity(cepData.localidade || '');
      setState(cepData.uf || '');
    } else {
      Alert.alert('Erro', 'CEP não encontrado. Verifique o número digitado.');
    }
  };

  const handleSubmit = () => {
    if (!selectedCustomerId || selectedProducts.length === 0) return;

    // Montar endereço completo
    const fullAddress = `${street}, ${number}${complement ? ', ' + complement : ''}, ${neighborhood} - ${city}/${state} - CEP: ${zipCode}`;

    // Calcular deadline_days baseado na diferença entre as datas
    let calculatedDeadlineDays = 7; // Padrão
    if (departureDateTime && returnDateTime) {
      const deadline = calculateDeadline(departureDateTime, returnDateTime);
      // Backend espera dias (mínimo 1)
      calculatedDeadlineDays = deadline.days > 0 ? deadline.days : 1;
    }

    const shipmentData: CreateShipmentDTO = {
      customer_id: selectedCustomerId,
      items: selectedProducts.map((p) => ({
        product_id: p.product_id,
        variant_id: p.variant_id,
        quantity_sent: p.quantity_sent,
        unit_price: p.price,
      })),
      // Enviar datas em ISO format
      departure_datetime: departureDateTime?.toISOString(),
      return_datetime: returnDateTime?.toISOString(),
      // Calcular deadline_days automaticamente baseado nas datas
      deadline_days: calculatedDeadlineDays,
      shipping_address: fullAddress,
      notes: notes || undefined,
    };

    createMutation.mutate(shipmentData);
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const totalValue = selectedProducts.reduce(
    (sum, p) => sum + p.price * p.quantity_sent,
    0
  );
  const selectedItemsCount = selectedProducts.reduce((sum, p) => sum + p.quantity_sent, 0);
  const calculatedDays = departureDateTime && returnDateTime
    ? Math.ceil((returnDateTime.getTime() - departureDateTime.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          opacity: headerAnim,
          transform: [{ scale: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        }}
      >
        <PageHeader
          title="Novo Envio"
          subtitle={`Passo ${step} de 4`}
          showBackButton
          onBack={() => step > 1 ? handleBack() : router.back()}
        />
      </Animated.View>

      <Animated.View
        style={{
          opacity: contentAnim,
          transform: [{ translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        }}
      >
      <View style={styles.summaryHero}>
        <View style={styles.summaryHeroRow}>
          <View style={styles.summaryHeroCell}>
            <Text style={styles.summaryHeroLabel}>Cliente</Text>
            <Text style={styles.summaryHeroValue} numberOfLines={1}>{selectedCustomer ? selectedCustomer.full_name : 'Não selecionado'}</Text>
          </View>
          <View style={styles.summaryHeroDivider} />
          <View style={styles.summaryHeroCellSmall}>
            <Text style={styles.summaryHeroLabel}>Itens</Text>
            <Text style={styles.summaryHeroValue}>{selectedItemsCount}</Text>
          </View>
          <View style={styles.summaryHeroDivider} />
          <View style={styles.summaryHeroCellSmall}>
            <Text style={styles.summaryHeroLabel}>Total</Text>
            <Text style={styles.summaryHeroValue}>R$ {totalValue.toFixed(2)}</Text>
          </View>
        </View>
        <View style={styles.summaryHeroBadge}>
          <Ionicons name="time-outline" size={13} color={Colors.light.textSecondary} />
          <Text style={styles.summaryHeroBadgeText}>
            {calculatedDays > 0 ? `Prazo estimado: ${calculatedDays} dias` : 'Defina ida e devolução para calcular o prazo'}
          </Text>
        </View>
      </View>
      </Animated.View>

      {/* Progress Bar */}
      <View style={styles.progressBar}>
        <View style={styles.progressFlowRow}>
          {[
            { id: 1, label: '1 Cliente' },
            { id: 2, label: '2 Produtos' },
            { id: 3, label: '3 Envio' },
            { id: 4, label: '4 Revisão' },
          ].map((progressStep) => {
            const isCompleted = step > progressStep.id;
            const isCurrent = step === progressStep.id;
            const canGoToStep = progressStep.id <= step;

            return (
              <TouchableOpacity
                key={progressStep.id}
                activeOpacity={canGoToStep ? 0.75 : 1}
                disabled={!canGoToStep}
                onPress={() => {
                  if (canGoToStep) {
                    setStep(progressStep.id as Step);
                  }
                }}
                style={[
                  styles.progressPill,
                  isCompleted && {
                    backgroundColor: `${brandingColors.primary}1A`,
                    borderColor: `${brandingColors.primary}40`,
                  },
                  isCurrent && {
                    backgroundColor: brandingColors.primary,
                    borderColor: brandingColors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.progressPillText,
                    isCompleted && { color: brandingColors.primary },
                    isCurrent && styles.progressPillTextCurrent,
                  ]}
                  numberOfLines={1}
                >
                  {progressStep.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Step 1: Selecionar Cliente */}
      {step === 1 && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View>
            <Text style={styles.stepTitle}>Selecione o Cliente</Text>
            <Text style={styles.stepDescription}>
              Escolha o cliente que receberá as roupas em condicional
            </Text>

            {loadingCustomers ? (
              <ActivityIndicator style={{ marginTop: 32 }} />
            ) : (
              <View style={styles.listContainer}>
                {customers.map((customer) => {
                  const isSelected = selectedCustomerId === customer.id;
                  const initials = customer.full_name
                    .split(' ')
                    .map((w: string) => w[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();
                  return (
                  <TouchableOpacity
                    key={customer.id}
                    onPress={() => setSelectedCustomerId(customer.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.customerCard,
                        isSelected && styles.customerCardSelected,
                        isSelected && {
                          borderColor: brandingColors.primary,
                          backgroundColor: Colors.light.card,
                        },
                      ]}
                    >
                      <View style={styles.customerContent}>
                        {/* Avatar circle */}
                        <View style={[
                          styles.customerAvatar,
                          { backgroundColor: isSelected
                            ? `${brandingColors.primary}16`
                            : Colors.light.backgroundSecondary
                          }
                        ]}>
                          <Text style={[
                            styles.customerAvatarInitials,
                            { color: isSelected ? brandingColors.primary : Colors.light.textSecondary }
                          ]}>
                            {initials}
                          </Text>
                        </View>
                        <View style={styles.customerDetails}>
                          <Text style={styles.customerName}>
                            {customer.full_name}
                          </Text>
                          {customer.phone && (
                            <Text style={styles.customerPhone}>
                              {customer.phone}
                            </Text>
                          )}
                          {customer.city && (
                            <Text style={styles.customerCity}>
                              {customer.city}{customer.state ? `/${customer.state}` : ''}
                            </Text>
                          )}
                        </View>
                        {isSelected && (
                          <View style={styles.customerCheckBadge}>
                            <Ionicons name="checkmark-circle" size={28} color={brandingColors.primary} />
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Step 2: Adicionar Produtos */}
      {step === 2 && (
        <View style={[styles.content, styles.step2Content]}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>Adicione os Produtos</Text>
            <Text style={styles.stepDescription}>
              Selecione as roupas que serão enviadas
            </Text>
          </View>

          {/* Produtos Selecionados */}
          {selectedProducts.length > 0 && (
            <View style={styles.selectedProductsCard}>
              <View style={styles.selectedProductsCardContent}>
                <Text style={styles.sectionTitle}>
                  Produtos Selecionados ({selectedProducts.length})
                </Text>
                <ScrollView 
                  style={styles.selectedProductsScroll}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled={true}
                >
                  {selectedProducts.map((product) => (
                    <View key={`${product.product_id}_${product.variant_id || ''}`} style={styles.selectedProduct}>
                      <View style={styles.selectedProductInfo}>
                        <Text style={styles.selectedProductName} numberOfLines={1}>
                          {product.name}
                        </Text>
                        {(product.variant_size || product.variant_color) && (
                          <Text style={styles.selectedProductVariant}>
                            {[product.variant_size, product.variant_color].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                        <Text style={styles.selectedProductPrice}>
                          R$ {(Number(product.price) || 0).toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.quantityControls}>
                        <TouchableOpacity
                          style={[styles.qtyBtn, { backgroundColor: Colors.light.error }]}
                          onPress={() => handleQuantityChange(product.product_id, product.variant_id, -1)}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="remove" size={14} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.quantityText}>{product.quantity_sent}</Text>
                        <TouchableOpacity
                          style={[styles.qtyBtn, { backgroundColor: brandingColors.primary }]}
                          onPress={() => handleQuantityChange(product.product_id, product.variant_id, 1)}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="add" size={14} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.qtyBtnDelete}
                          onPress={() => handleRemoveProduct(product.product_id, product.variant_id)}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="trash-outline" size={14} color={Colors.light.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}

          {/* Botão para adicionar produtos via modal */}
          <TouchableOpacity
            onPress={() => setShowProductModal(true)}
            style={styles.addProductButton}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={brandingColors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryActionButtonGradient}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.primaryActionButtonText}>Adicionar Produto</Text>
            </LinearGradient>
          </TouchableOpacity>

          {selectedProducts.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="shirt-outline" size={64} color={Colors.light.textSecondary} />
              <Text style={styles.emptyStateTitle}>Nenhum produto selecionado</Text>
              <Text style={styles.emptyStateDescription}>
                Toque em "Adicionar Produto" para selecionar os itens do envio
              </Text>
            </View>
          )}

          <ProductSelectionModal
            visible={showProductModal}
            onDismiss={() => setShowProductModal(false)}
            onSelectProduct={handleSelectProductVariant}
            hasStock={true}
          />
        </View>
      )}

      {/* Step 3: Configurar Envio */}
      {step === 3 && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View>
            <Text style={styles.stepTitle}>Configure o Envio</Text>
            <Text style={styles.stepDescription}>
              Defina o prazo e endereço de entrega
            </Text>

            <View style={styles.formCard}>
              <View style={styles.formCardContent}>
                <Text style={styles.formSectionTitle}>Endereço de Entrega</Text>
                
                <View style={styles.cepContainer}>
                  <Text style={styles.nativeLabel}>CEP *</Text>
                  <View style={styles.cepFieldRow}>
                    <RNTextInput
                      value={zipCode}
                      onChangeText={handleCepChange}
                      keyboardType="number-pad"
                      style={[styles.nativeInput, styles.cepInputNative]}
                      placeholder="00000-000"
                      placeholderTextColor={Colors.light.textTertiary}
                      maxLength={9}
                    />
                    <TouchableOpacity
                      style={styles.cepSearchButton}
                      onPress={handleSearchCep}
                      activeOpacity={0.75}
                      disabled={loadingCep}
                    >
                      {loadingCep ? (
                        <ActivityIndicator size={16} color={brandingColors.primary} />
                      ) : (
                        <Ionicons name="search-outline" size={16} color={brandingColors.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.nativeLabel}>Rua/Logradouro *</Text>
                <RNTextInput
                  value={street}
                  onChangeText={setStreet}
                  style={styles.nativeInput}
                  placeholder="Nome da rua"
                  placeholderTextColor={Colors.light.textTertiary}
                />

                <View style={styles.row}>
                  <View style={styles.inputSmall}>
                    <Text style={styles.nativeLabel}>Número *</Text>
                    <RNTextInput
                      value={number}
                      onChangeText={setNumber}
                      style={styles.nativeInput}
                      placeholder="123"
                      placeholderTextColor={Colors.light.textTertiary}
                    />
                  </View>
                  <View style={styles.inputLarge}>
                    <Text style={styles.nativeLabel}>Complemento</Text>
                    <RNTextInput
                      value={complement}
                      onChangeText={setComplement}
                      style={styles.nativeInput}
                      placeholder="Apto, bloco..."
                      placeholderTextColor={Colors.light.textTertiary}
                    />
                  </View>
                </View>

                <Text style={styles.nativeLabel}>Bairro *</Text>
                <RNTextInput
                  value={neighborhood}
                  onChangeText={setNeighborhood}
                  style={styles.nativeInput}
                  placeholder="Nome do bairro"
                  placeholderTextColor={Colors.light.textTertiary}
                />

                <View style={styles.row}>
                  <View style={styles.inputLarge}>
                    <Text style={styles.nativeLabel}>Cidade *</Text>
                    <RNTextInput
                      value={city}
                      onChangeText={setCity}
                      style={styles.nativeInput}
                      placeholder="Cidade"
                      placeholderTextColor={Colors.light.textTertiary}
                    />
                  </View>
                  <View style={styles.inputSmall}>
                    <Text style={styles.nativeLabel}>Estado *</Text>
                    <RNTextInput
                      value={state}
                      onChangeText={setState}
                      style={styles.nativeInput}
                      placeholder="UF"
                      placeholderTextColor={Colors.light.textTertiary}
                      maxLength={2}
                      autoCapitalize="characters"
                    />
                  </View>
                </View>

                <Text style={styles.formSectionTitle}>Configurações do Envio</Text>

                <DateTimeInput
                  label="Data/Hora de Ida *"
                  value={departureDateTime}
                  onChange={setDepartureDateTime}
                  mode="datetime"
                  minimumDate={new Date()}
                  modern
                />

                <DateTimeInput
                  label="Data/Hora de Devolução *"
                  value={returnDateTime}
                  onChange={setReturnDateTime}
                  mode="datetime"
                  minimumDate={departureDateTime || new Date()}
                  modern
                />

                {/* Indicador de prazo calculado */}
                {departureDateTime && returnDateTime && (
                  <View style={styles.calculatedDeadlineCard}>
                    <View style={styles.calculatedDeadlineContent}>
                      <Ionicons name="time-outline" size={24} color={Colors.light.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: Colors.light.textSecondary, fontWeight: '600' }}>
                          Prazo Calculado
                        </Text>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.primary }}>
                          {Math.ceil((returnDateTime.getTime() - departureDateTime.getTime()) / (1000 * 60 * 60 * 24))} dias
                        </Text>
                        <Text style={{ fontSize: 11, color: Colors.light.textSecondary, marginTop: 2 }}>
                          Baseado nas datas de ida e volta
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                <Text style={styles.nativeLabel}>Observações (opcional)</Text>
                <RNTextInput
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  style={[styles.nativeInput, styles.nativeTextArea]}
                  placeholder="Informações adicionais..."
                  placeholderTextColor={Colors.light.textTertiary}
                  textAlignVertical="top"
                />
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Step 4: Revisão */}
      {step === 4 && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View>
            <Text style={styles.stepTitle}>Revisão do Envio</Text>
            <Text style={styles.stepDescription}>
              Confira os dados antes de criar o envio
            </Text>

            {/* Cliente */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardContent}>
                <Text style={styles.reviewLabel}>Cliente</Text>
                <Text style={styles.reviewValue}>
                  {selectedCustomer?.full_name}
                </Text>
                {selectedCustomer?.phone && (
                  <Text style={styles.reviewSubvalue}>
                    {selectedCustomer.phone}
                  </Text>
                )}
              </View>
            </View>

            {/* Produtos */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardContent}>
                <Text style={styles.reviewLabel}>
                  Produtos ({selectedProducts.length})
                </Text>
                {selectedProducts.map((product) => (
                  <View key={`${product.product_id}_${product.variant_id || ''}`} style={styles.reviewProduct}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewProductName}>
                        {product.quantity_sent}x {product.name}
                      </Text>
                      {(product.variant_size || product.variant_color) && (
                        <Text style={{ fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 }}>
                          {[product.variant_size, product.variant_color].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.reviewProductValue}>
                      R$ {((Number(product.price) || 0) * product.quantity_sent).toFixed(2)}
                    </Text>
                  </View>
                ))}
                <View style={styles.reviewDivider} />
                <View style={styles.reviewTotal}>
                  <Text style={styles.reviewTotalLabel}>Valor Total</Text>
                  <Text style={styles.reviewTotalValue}>
                    R$ {totalValue.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Endereço de Entrega */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardContent}>
                <Text style={styles.reviewLabel}>Endereço de Entrega</Text>
                <Text style={styles.reviewValue}>{street}, {number}{complement ? `, ${complement}` : ''}</Text>
                <Text style={styles.reviewValue}>{neighborhood} - {city}/{state}</Text>
                <Text style={styles.reviewValue}>CEP: {zipCode}</Text>
              </View>
            </View>

            {/* Configurações */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardContent}>
                <Text style={styles.reviewLabel}>Datas e Prazos</Text>
                {departureDateTime && (
                  <Text style={styles.reviewValue}>
                    Ida: {departureDateTime.toLocaleDateString('pt-BR')} às {departureDateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
                {returnDateTime && (
                  <Text style={styles.reviewValue}>
                    Devolução: {returnDateTime.toLocaleDateString('pt-BR')} às {returnDateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
                {departureDateTime && returnDateTime && (
                  <View style={styles.reviewDeadlineBadge}>
                    <Ionicons name="time" size={20} color={Colors.light.primary} />
                    <Text style={styles.reviewDeadlineText}>
                      Prazo: {Math.ceil((returnDateTime.getTime() - departureDateTime.getTime()) / (1000 * 60 * 60 * 24))} dias
                    </Text>
                  </View>
                )}
                {notes && <Text style={styles.reviewSubvalue}>Obs: {notes}</Text>}
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Footer com botões */}
      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity
            onPress={handleBack}
            style={[styles.footerButton, styles.secondaryActionButton]}
            disabled={createMutation.isPending}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back-outline" size={18} color={brandingColors.primary} />
            <Text style={[styles.secondaryActionButtonText, { color: brandingColors.primary }]}>Voltar</Text>
          </TouchableOpacity>
        )}
        {step < 4 ? (
          <TouchableOpacity
            onPress={handleNext}
            style={[styles.footerButton, styles.primaryActionButton, step === 1 && { flex: 1 }]}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={brandingColors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryActionButtonGradient}
            >
              <Ionicons name="arrow-forward-outline" size={18} color="#fff" />
              <Text style={styles.primaryActionButtonText}>Próximo</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSubmit}
            style={[styles.footerButton, styles.primaryActionButton]}
            disabled={createMutation.isPending}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={brandingColors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryActionButtonGradient}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size={18} color="#fff" />
              ) : (
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              )}
              <Text style={styles.primaryActionButtonText}>Criar Envio</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {/* ConfirmDialog */}
      <ConfirmDialog
        visible={dialogConfig.visible}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type || 'info'}
        confirmText="OK"
        onConfirm={() => {
          if (dialogConfig.onConfirm) {
            dialogConfig.onConfirm();
          } else {
            setDialogConfig({ ...dialogConfig, visible: false });
          }
        }}
        onCancel={() => setDialogConfig({ ...dialogConfig, visible: false })}
      />

      
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  progressBar: {
    paddingHorizontal: 20,
    paddingTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  summaryHero: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  summaryHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  summaryHeroCell: {
    flex: 1,
    minWidth: 0,
  },
  summaryHeroCellSmall: {
    minWidth: 64,
    alignItems: 'flex-start',
  },
  summaryHeroDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.light.border,
  },
  summaryHeroLabel: {
    fontSize: theme.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  summaryHeroValue: {
    marginTop: 2,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    fontWeight: '700',
  },
  summaryHeroBadge: {
    marginTop: theme.spacing.sm,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  summaryHeroBadgeText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  progressFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: theme.spacing.xs,
  },
  progressPill: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 6,
  },
  progressPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  progressPillTextCurrent: {
    color: '#fff',
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  step2Content: {
    paddingHorizontal: 20,
  },
  stepHeader: {
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.light.text,
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 8,
  },
  listContainer: {
    gap: 12,
  },
  customerCard: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    ...theme.shadows.sm,
  },
  customerCardSelected: {
    borderWidth: 1.5,
  },
  customerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: 12,
  },
  customerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  customerAvatarInitials: {
    fontSize: 16,
    fontWeight: '700',
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  customerPhone: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  customerCity: {
    fontSize: 12,
    color: Colors.light.textTertiary,
    marginTop: 1,
  },
  customerCheckBadge: {
    flexShrink: 0,
  },
  selectedProductsCard: {
    marginBottom: 16,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    ...theme.shadows.sm,
    maxHeight: 200,
  },
  selectedProductsCardContent: {
    padding: theme.spacing.md,
  },
  selectedProductsScroll: {
    maxHeight: 150,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 12,
  },
  selectedProduct: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  selectedProductInfo: {
    flex: 1,
    marginRight: 8,
  },
  selectedProductName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.light.text,
  },
  selectedProductVariant: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '500',
    marginTop: 1,
  },
  selectedProductPrice: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  addProductButton: {
    marginTop: 8,
    marginBottom: 16,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDelete: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.light.error + '40',
    backgroundColor: Colors.light.error + '10',
  },
  quantityText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.light.text,
    minWidth: 24,
    textAlign: 'center',
  },
  // Estilos do catálogo para produtos
  productSearchbar: {
    marginHorizontal: 0,
    marginTop: 4,
    marginBottom: 8,
    elevation: 1,
    borderRadius: 8,
  },
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
  catalogRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  catalogListContent: {
    paddingTop: 4,
    paddingBottom: 80,
    paddingHorizontal: 4,
  },
  catalogCard: {
    width: '48%',
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  catalogCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 6,
  },
  catalogProductName: {
    flex: 1,
    fontWeight: '600',
    lineHeight: 20,
    fontSize: 15,
  },
  brandChip: {
    backgroundColor: '#e3f2fd',
    minHeight: 24,
  },
  brandText: {
    fontSize: 11,
    color: '#1976d2',
    lineHeight: 14,
  },
  catalogPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  catalogPrice: {
    fontWeight: 'bold',
    color: Colors.light.primary,
    fontSize: 18,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  stockText: {
    fontSize: 12,
    fontWeight: '600',
  },
  catalogSku: {
    color: '#999',
    fontSize: 11,
  },
  catalogCardActions: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  catalogButtonContent: {
    height: 38,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingMoreText: {
    marginTop: 8,
    color: Colors.light.textSecondary,
    fontSize: 12,
  },
  endMessage: {
    textAlign: 'center',
    paddingVertical: 20,
    color: '#999',
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
    marginTop: 16,
  },
  emptyStateDescription: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  formCard: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    ...theme.shadows.sm,
  },
  formCardContent: {
    padding: theme.spacing.md,
  },
  formSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginTop: 12,
    marginBottom: 12,
  },
  input: {
    marginBottom: 16,
  },
  nativeLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.light.textTertiary,
    marginBottom: 6,
  },
  nativeInput: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md,
    minHeight: 52,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    marginBottom: 16,
  },
  nativeTextArea: {
    minHeight: 92,
    paddingTop: theme.spacing.sm,
  },
  cepContainer: {
    marginBottom: 16,
  },
  cepFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  cepInputNative: {
    flex: 1,
    marginBottom: 0,
  },
  cepSearchButton: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cepInput: {
    marginBottom: 0,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  inputSmall: {
    flex: 1,
    marginBottom: 0,
  },
  inputLarge: {
    flex: 2,
    marginBottom: 0,
  },
  calculatedDeadlineCard: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.primary + '12',
    borderWidth: 1,
    borderColor: Colors.light.primary + '24',
  },
  calculatedDeadlineContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  reviewCard: {
    borderRadius: theme.borderRadius.xl,
    marginBottom: 16,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  reviewCardContent: {
    padding: theme.spacing.md,
  },
  reviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  reviewValue: {
    fontSize: 16,
    color: Colors.light.text,
    marginBottom: 4,
  },
  reviewSubvalue: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  reviewProduct: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  reviewProductName: {
    fontSize: 14,
    color: Colors.light.text,
  },
  reviewProductValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  reviewDivider: {
    marginVertical: theme.spacing.sm,
    height: 1,
    backgroundColor: Colors.light.border,
  },
  reviewTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.light.text,
  },
  reviewTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.light.primary,
  },
  reviewDeadlineBadge: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: Colors.light.primary + '14',
  },
  reviewDeadlineText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  footerButton: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    minHeight: 52,
    overflow: 'hidden',
  },
  primaryActionButton: {
    ...theme.shadows.sm,
  },
  primaryActionButtonGradient: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
  },
  primaryActionButtonText: {
    fontSize: theme.fontSize.base,
    color: '#fff',
    fontWeight: '700',
  },
  secondaryActionButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryActionButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
});
