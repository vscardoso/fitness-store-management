import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Button,
  TextInput,
  Card,
  Chip,
  List,
  Divider,
  ActivityIndicator,
  IconButton,
  Searchbar,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQueryClient, useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { Colors, theme } from '@/constants/Colors';
import { createShipment } from '@/services/conditionalService';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { CreateShipmentDTO, CreateShipmentItemDTO } from '@/types/conditional';
import { getCustomers } from '@/services/customerService';
import { getProducts } from '@/services/productService';
import { searchCep } from '@/services/cepService';

const PAGE_SIZE = 20;

type Step = 1 | 2 | 3 | 4;

interface SelectedProduct {
  product_id: number;
  name: string;
  price: number;
  quantity_sent: number;
  max_stock?: number;
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

  const [step, setStep] = useState<Step>(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [deadlineDays, setDeadlineDays] = useState('7');
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  
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

  // Invalidar cache de produtos ao entrar na tela
  React.useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['products-conditional'] });
  }, []);

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

  // Infinite Query para produtos com paginação (estilo catálogo)
  const {
    data: productsData,
    isLoading: loadingProducts,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchProducts,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['products-conditional', productSearch],
    queryFn: async ({ pageParam = 0 }) => {
      const params = {
        limit: PAGE_SIZE,
        skip: pageParam * PAGE_SIZE,
        search: productSearch || undefined,
        has_stock: true, // CRITICAL: Apenas produtos com estoque (FIFO)
      };
      console.log('🔍 Chamando API com params:', params);
      const products = await getProducts(params);
      console.log('📥 Resposta da API:', products.length, 'produtos');
      return products;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) {
        return undefined;
      }
      return allPages.length;
    },
    initialPageParam: 0,
    enabled: step === 2,
  });

  // Flatten all pages into a single array
  const products = React.useMemo(() => {
    const flattened = productsData?.pages?.flat() ?? [];
    console.log('📦 Produtos com estoque (conditional):', flattened.length, flattened.map(p => ({ id: p.id, name: p.name, stock: p.current_stock })));
    return flattened;
  }, [productsData]);

  // Mutation
  const createMutation = useMutation({
    mutationFn: createShipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });
      setDialogConfig({
        visible: true,
        title: 'Sucesso',
        message: 'Envio condicional criado com sucesso!',
        type: 'info',
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

  const handleAddProduct = (productId: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const stockAvailable = product.current_stock || 0;
    if (stockAvailable <= 0) {
      setDialogConfig({
        visible: true,
        title: 'Estoque Insuficiente',
        message: 'Este produto não possui estoque disponível para envio condicional.',
        type: 'warning',
        onConfirm: () => setDialogConfig({ ...dialogConfig, visible: false }),
      });
      return;
    }

    const existing = selectedProducts.find((p) => p.product_id === productId);
    if (existing) {
      if (existing.quantity_sent >= stockAvailable) {
        setDialogConfig({
          visible: true,
          title: 'Limite de Estoque',
          message: `Você já selecionou toda a quantidade disponível em estoque (${stockAvailable} un.).`,
          type: 'warning',
          onConfirm: () => setDialogConfig({ ...dialogConfig, visible: false }),
        });
        return;
      }
      setSelectedProducts(
        selectedProducts.map((p) =>
          p.product_id === productId
            ? { ...p, quantity_sent: p.quantity_sent + 1 }
            : p
        )
      );
    } else {
      setSelectedProducts([
        ...selectedProducts,
        {
          product_id: productId,
          name: product.name,
          price: Number(product.price) || 0,
          quantity_sent: 1,
          max_stock: stockAvailable,
        },
      ]);
    }
  };

  const handleRemoveProduct = (productId: number) => {
    setSelectedProducts(selectedProducts.filter((p) => p.product_id !== productId));
  };

  const handleQuantityChange = (productId: number, delta: number) => {
    const product = products.find((p) => p.id === productId);
    const maxStock = product?.current_stock || 0;

    setSelectedProducts(
      selectedProducts.map((p) => {
        if (p.product_id === productId) {
          const newQuantity = p.quantity_sent + delta;
          
          // Validar limites
          if (newQuantity < 1) return p;
          if (newQuantity > maxStock) {
            setDialogConfig({
              visible: true,
              title: 'Limite de Estoque',
              message: `Quantidade máxima disponível: ${maxStock} unidades.`,
              type: 'warning',
              onConfirm: () => setDialogConfig({ ...dialogConfig, visible: false }),
            });
            return p;
          }
          
          return { ...p, quantity_sent: newQuantity };
        }
        return p;
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

  return (
    <View style={styles.container}>
      {/* Header Premium com gradiente */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitle}>
              <Text style={styles.title}>Novo Envio</Text>
              <Text style={styles.stepIndicator}>
                Passo {step} de 4
              </Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Progress Bar */}
      <View style={styles.progressBar}>
        {[1, 2, 3, 4].map((s) => (
          <View
            key={s}
            style={[
              styles.progressStep,
              step >= s && styles.progressStepActive,
            ]}
          />
        ))}
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
                {customers.map((customer) => (
                  <TouchableOpacity
                    key={customer.id}
                    onPress={() => setSelectedCustomerId(customer.id)}
                    activeOpacity={0.7}
                  >
                    <Card
                      style={[
                        styles.customerCard,
                        selectedCustomerId === customer.id &&
                          styles.customerCardSelected,
                      ]}
                    >
                      <Card.Content style={styles.customerContent}>
                        <View style={styles.customerInfo}>
                          <Ionicons
                            name="person-circle"
                            size={40}
                            color={
                              selectedCustomerId === customer.id
                                ? Colors.light.primary
                                : Colors.light.textSecondary
                            }
                          />
                          <View style={styles.customerDetails}>
                            <Text style={styles.customerName}>
                              {customer.full_name}
                            </Text>
                            {customer.phone && (
                              <Text style={styles.customerPhone}>
                                {customer.phone}
                              </Text>
                            )}
                          </View>
                        </View>
                        {selectedCustomerId === customer.id && (
                          <Ionicons
                            name="checkmark-circle"
                            size={24}
                            color={Colors.light.primary}
                          />
                        )}
                      </Card.Content>
                    </Card>
                  </TouchableOpacity>
                ))}
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

          {/* Produtos Selecionados com ScrollView */}
          {selectedProducts.length > 0 && (
            <Card style={styles.selectedProductsCard}>
              <Card.Content>
                <Text style={styles.sectionTitle}>
                  Produtos Selecionados ({selectedProducts.length})
                </Text>
                <ScrollView 
                  style={styles.selectedProductsScroll}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled={true}
                >
                  {selectedProducts.map((product) => (
                    <View key={product.product_id} style={styles.selectedProduct}>
                      <View style={styles.selectedProductInfo}>
                        <Text style={styles.selectedProductName} numberOfLines={1}>
                          {product.name}
                        </Text>
                        <Text style={styles.selectedProductPrice}>
                          R$ {(Number(product.price) || 0).toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.quantityControls}>
                        <IconButton
                          icon="minus"
                          size={16}
                          onPress={() => handleQuantityChange(product.product_id, -1)}
                        />
                        <Text style={styles.quantityText}>{product.quantity_sent}</Text>
                        <IconButton
                          icon="plus"
                          size={16}
                          onPress={() => handleQuantityChange(product.product_id, 1)}
                        />
                        <IconButton
                          icon="delete"
                          size={20}
                          iconColor={Colors.light.error}
                          onPress={() => handleRemoveProduct(product.product_id)}
                        />
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </Card.Content>
            </Card>
          )}

          {/* Barra de busca */}
          <Searchbar
            placeholder="Buscar produtos..."
            onChangeText={setProductSearch}
            value={productSearch}
            style={styles.productSearchbar}
          />

          {/* Lista de Produtos Disponíveis - Estilo Catálogo */}
          {loadingProducts && !products.length ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
              <Text style={styles.loadingText}>Carregando produtos...</Text>
            </View>
          ) : (
            <FlatList
              data={products}
              renderItem={({ item }) => {
                  const isSelected = selectedProducts.some(
                    (p) => p.product_id === item.id
                  );
                  return (
                    <Card style={styles.catalogCard} mode="elevated" elevation={2}>
                      <Card.Content>
                        <View style={styles.catalogCardHeader}>
                          <Text
                            variant="titleMedium"
                            style={styles.catalogProductName}
                            numberOfLines={2}
                          >
                            {item.name}
                          </Text>
                          {item.brand && (
                            <Chip
                              mode="flat"
                              compact
                              style={styles.brandChip}
                              textStyle={styles.brandText}
                            >
                              {item.brand}
                            </Chip>
                          )}
                        </View>

                        <View style={styles.catalogPriceRow}>
                          <Text variant="headlineSmall" style={styles.catalogPrice}>
                            R$ {(Number(item.price) || 0).toFixed(2)}
                          </Text>
                        </View>

                        <View style={styles.stockRow}>
                          <Ionicons
                            name="cube-outline"
                            size={14}
                            color={item.current_stock > 0 ? Colors.light.success : Colors.light.error}
                          />
                          <Text
                            variant="bodySmall"
                            style={[
                              styles.stockText,
                              { color: item.current_stock > 0 ? Colors.light.success : Colors.light.error }
                            ]}
                          >
                            Estoque: {item.current_stock || 0} un.
                          </Text>
                        </View>

                        {item.sku && (
                          <Text variant="bodySmall" style={styles.catalogSku}>
                            SKU: {item.sku}
                          </Text>
                        )}
                      </Card.Content>

                      <Card.Actions style={styles.catalogCardActions}>
                        <Button
                          mode={isSelected ? 'outlined' : 'contained'}
                          onPress={() => handleAddProduct(item.id)}
                          disabled={isSelected}
                          icon={isSelected ? 'check' : 'plus'}
                          contentStyle={styles.catalogButtonContent}
                        >
                          {isSelected ? 'Adicionado' : 'Adicionar'}
                        </Button>
                      </Card.Actions>
                    </Card>
                  );
                }}
                keyExtractor={(item, index) => `${item.id}-${index}`}
                numColumns={2}
                columnWrapperStyle={styles.catalogRow}
                contentContainerStyle={styles.catalogListContent}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefetching}
                    onRefresh={refetchProducts}
                    colors={[Colors.light.primary]}
                  />
                }
                onEndReached={() => {
                  if (hasNextPage && !isFetchingNextPage) {
                    fetchNextPage();
                  }
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  isFetchingNextPage ? (
                    <View style={styles.footerLoader}>
                      <ActivityIndicator size="small" color={Colors.light.primary} />
                      <Text style={styles.loadingMoreText}>
                        Carregando mais produtos...
                      </Text>
                    </View>
                  ) : !hasNextPage && products.length > 0 ? (
                    <Text style={styles.endMessage}>
                      {products.length} produtos carregados
                    </Text>
                  ) : null
                }
                ListEmptyComponent={
                  !loadingProducts ? (
                    <View style={styles.emptyState}>
                      <Ionicons
                        name="shirt-outline"
                        size={64}
                        color={Colors.light.textSecondary}
                      />
                      <Text style={styles.emptyStateTitle}>
                        {productSearch ? 'Nenhum produto encontrado' : 'Sem produtos'}
                      </Text>
                      <Text style={styles.emptyStateDescription}>
                        {productSearch
                          ? 'Tente buscar por outro termo'
                          : 'Nenhum produto disponível no momento'}
                      </Text>
                    </View>
                  ) : null
                }
              />
            )}
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

            <Card style={styles.formCard}>
              <Card.Content>
                <Text style={styles.formSectionTitle}>Endereço de Entrega</Text>
                
                <View style={styles.cepContainer}>
                  <TextInput
                    label="CEP *"
                    value={zipCode}
                    onChangeText={handleCepChange}
                    mode="outlined"
                    keyboardType="number-pad"
                    style={[styles.input, styles.cepInput]}
                    placeholder="00000-000"
                    maxLength={9}
                    right={
                      <TextInput.Icon
                        icon={loadingCep ? 'loading' : 'magnify'}
                        onPress={handleSearchCep}
                        disabled={loadingCep}
                      />
                    }
                  />
                </View>

                <TextInput
                  label="Rua/Logradouro *"
                  value={street}
                  onChangeText={setStreet}
                  mode="outlined"
                  style={styles.input}
                  placeholder="Nome da rua"
                />

                <View style={styles.row}>
                  <TextInput
                    label="Número *"
                    value={number}
                    onChangeText={setNumber}
                    mode="outlined"
                    style={[styles.input, styles.inputSmall]}
                    placeholder="123"
                  />
                  <TextInput
                    label="Complemento"
                    value={complement}
                    onChangeText={setComplement}
                    mode="outlined"
                    style={[styles.input, styles.inputLarge]}
                    placeholder="Apto, bloco..."
                  />
                </View>

                <TextInput
                  label="Bairro *"
                  value={neighborhood}
                  onChangeText={setNeighborhood}
                  mode="outlined"
                  style={styles.input}
                  placeholder="Nome do bairro"
                />

                <View style={styles.row}>
                  <TextInput
                    label="Cidade *"
                    value={city}
                    onChangeText={setCity}
                    mode="outlined"
                    style={[styles.input, styles.inputLarge]}
                    placeholder="Cidade"
                  />
                  <TextInput
                    label="Estado *"
                    value={state}
                    onChangeText={setState}
                    mode="outlined"
                    style={[styles.input, styles.inputSmall]}
                    placeholder="UF"
                    maxLength={2}
                  />
                </View>

                <Text style={styles.formSectionTitle}>Configurações do Envio</Text>

                <DateTimeInput
                  label="Data/Hora de Ida *"
                  value={departureDateTime}
                  onChange={setDepartureDateTime}
                  mode="datetime"
                  minimumDate={new Date()}
                />

                <DateTimeInput
                  label="Data/Hora de Devolução *"
                  value={returnDateTime}
                  onChange={setReturnDateTime}
                  mode="datetime"
                  minimumDate={departureDateTime || new Date()}
                />

                {/* Indicador de prazo calculado */}
                {departureDateTime && returnDateTime && (
                  <Card style={{ marginBottom: 16, backgroundColor: '#E3F2FD' }}>
                    <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
                    </Card.Content>
                  </Card>
                )}

                <TextInput
                  label="Observações (opcional)"
                  value={notes}
                  onChangeText={setNotes}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  style={styles.input}
                  placeholder="Informações adicionais..."
                />
              </Card.Content>
            </Card>
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
            <Card style={styles.reviewCard}>
              <Card.Content>
                <Text style={styles.reviewLabel}>Cliente</Text>
                <Text style={styles.reviewValue}>
                  {selectedCustomer?.full_name}
                </Text>
                {selectedCustomer?.phone && (
                  <Text style={styles.reviewSubvalue}>
                    {selectedCustomer.phone}
                  </Text>
                )}
              </Card.Content>
            </Card>

            {/* Produtos */}
            <Card style={styles.reviewCard}>
              <Card.Content>
                <Text style={styles.reviewLabel}>
                  Produtos ({selectedProducts.length})
                </Text>
                {selectedProducts.map((product) => (
                  <View key={product.product_id} style={styles.reviewProduct}>
                    <Text style={styles.reviewProductName}>
                      {product.quantity_sent}x {product.name}
                    </Text>
                    <Text style={styles.reviewProductValue}>
                      R$ {((Number(product.price) || 0) * product.quantity_sent).toFixed(2)}
                    </Text>
                  </View>
                ))}
                <Divider style={{ marginVertical: 12 }} />
                <View style={styles.reviewTotal}>
                  <Text style={styles.reviewTotalLabel}>Valor Total</Text>
                  <Text style={styles.reviewTotalValue}>
                    R$ {totalValue.toFixed(2)}
                  </Text>
                </View>
              </Card.Content>
            </Card>

            {/* Endereço de Entrega */}
            <Card style={styles.reviewCard}>
              <Card.Content>
                <Text style={styles.reviewLabel}>Endereço de Entrega</Text>
                <Text style={styles.reviewValue}>{street}, {number}{complement ? `, ${complement}` : ''}</Text>
                <Text style={styles.reviewValue}>{neighborhood} - {city}/{state}</Text>
                <Text style={styles.reviewValue}>CEP: {zipCode}</Text>
              </Card.Content>
            </Card>

            {/* Configurações */}
            <Card style={styles.reviewCard}>
              <Card.Content>
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
                  <View style={{ marginTop: 12, padding: 12, backgroundColor: '#E3F2FD', borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="time" size={20} color={Colors.light.primary} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.light.primary }}>
                      Prazo: {Math.ceil((returnDateTime.getTime() - departureDateTime.getTime()) / (1000 * 60 * 60 * 24))} dias
                    </Text>
                  </View>
                )}
                {notes && <Text style={styles.reviewSubvalue}>Obs: {notes}</Text>}
              </Card.Content>
            </Card>
          </View>
        </ScrollView>
      )}

      {/* Footer com botões */}
      <View style={styles.footer}>
        {step > 1 && (
          <Button
            mode="outlined"
            onPress={handleBack}
            style={styles.footerButton}
            disabled={createMutation.isPending}
          >
            Voltar
          </Button>
        )}
        {step < 4 ? (
          <Button
            mode="contained"
            onPress={handleNext}
            style={[styles.footerButton, step === 1 && { flex: 1 }]}
          >
            Próximo
          </Button>
        ) : (
          <Button
            mode="contained"
            onPress={handleSubmit}
            style={styles.footerButton}
            loading={createMutation.isPending}
            disabled={createMutation.isPending}
          >
            Criar Envio
          </Button>
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
    backgroundColor: Colors.light.backgroundSecondary,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  stepIndicator: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
    marginTop: 2,
  },
  progressBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    marginBottom: 20,
    gap: 8,
  },
  progressStep: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.light.border,
    borderRadius: 2,
  },
  progressStepActive: {
    backgroundColor: Colors.light.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  step2Content: {
    paddingHorizontal: 12,
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
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  customerCardSelected: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary + '08',
  },
  customerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  selectedProductsCard: {
    marginBottom: 16,
    borderRadius: 12,
    maxHeight: 200,
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
  selectedProductPrice: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    borderRadius: 12,
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
  cepContainer: {
    marginBottom: 16,
  },
  cepInput: {
    marginBottom: 0,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputSmall: {
    flex: 1,
    marginBottom: 0,
  },
  inputLarge: {
    flex: 2,
    marginBottom: 0,
  },
  reviewCard: {
    borderRadius: 12,
    marginBottom: 16,
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
  },
});
