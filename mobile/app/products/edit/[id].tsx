import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {
  TextInput,
  Button,
  HelperText,
  Menu,
  TouchableRipple,
  Text,
  ActivityIndicator,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DetailHeader from '@/components/layout/DetailHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import useBackToList from '@/hooks/useBackToList';
import { useQuery } from '@tanstack/react-query';
import { useCategories, useUpdateProduct } from '@/hooks';
import { getProductById, adjustProductQuantity } from '@/services/productService';
import { getProductStock } from '@/services/inventoryService';
import { Colors, theme } from '@/constants/Colors';
import type { ProductUpdate } from '@/types';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { categories, isLoading: loadingCategories } = useCategories();
  const updateMutation = useUpdateProduct();

  // Validar ID do produto
  const productId = id ? parseInt(id as string) : NaN;
  const isValidId = !isNaN(productId) && productId > 0;

  // Estados do formulário
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');

  // Estados de validação e UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [menuVisible, setMenuVisible] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showCostChangeDialog, setShowCostChangeDialog] = useState(false);
  const [pendingProductData, setPendingProductData] = useState<ProductUpdate | null>(null);
  const [originalCostPrice, setOriginalCostPrice] = useState<number | null>(null);
  // Estoque
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [newStock, setNewStock] = useState<string>('');
  const [increaseUnitCost, setIncreaseUnitCost] = useState<string>('');

  /**
   * Query: Buscar produto
   */
  const { data: product, isLoading: loadingProduct } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProductById(productId),
    enabled: isValidId,
  });

  /**
   * Preencher formulário com dados do produto
   */
  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setSku(product.sku || '');
      setBarcode(product.barcode || '');
      setDescription(product.description || '');
      setBrand(product.brand || '');
      setCategoryId(product.category_id);
      
      const safeToFixed = (value: any): string => {
        if (value == null) return '';
        const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
        if (isNaN(num)) return '';
        return num.toFixed(2);
      };

      // Formatar custo e preço de venda com segurança (aceita number ou string vinda da API)
      setCostPrice(safeToFixed(product.cost_price));
      setSalePrice(safeToFixed(product.price));
      
      // Armazenar custo original (converter para number se vier string)
      const originalCost = product.cost_price != null ? Number(product.cost_price) : null;
      setOriginalCostPrice(isNaN(originalCost as number) ? null : originalCost);
      
      console.log('📦 Produto carregado - Custo original:', product.cost_price);
      // Buscar estoque atual
      (async () => {
        try {
          const inv = await getProductStock(productId);
          setCurrentStock(inv.quantity || 0);
          setNewStock(String(inv.quantity || 0));
        } catch (e) {
          // fallback silencioso
        }
      })();
    }
  }, [product]);

  /**
   * Formatador seguro para valores monetários (retorna string "xx,xx" ou "—")
   */
  const formatMoney = (value: any): string => {
    if (value == null) return '—';
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (isNaN(num)) return '—';
    return num.toFixed(2).replace('.', ',');
  };

  /**
   * Validar campos obrigatórios
   */
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Nome é obrigatório';
    }

    if (!sku.trim()) {
      newErrors.sku = 'SKU é obrigatório';
    }

    if (!categoryId) {
      newErrors.categoryId = 'Categoria é obrigatória';
    }

    if (!costPrice || parseFloat(costPrice) <= 0) {
      newErrors.costPrice = 'Preço de custo inválido';
    }

    if (!salePrice || parseFloat(salePrice) <= 0) {
      newErrors.salePrice = 'Preço de venda inválido';
    }

    if (parseFloat(salePrice) < parseFloat(costPrice)) {
      newErrors.salePrice = 'Preço de venda deve ser maior que o custo';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Removido fluxo separado de ajuste de estoque (agora integrado ao salvar)

  /**
   * Salvar alterações
   */
  const handleSave = () => {
    // Validar ID novamente antes de salvar
    if (!isValidId) {
      return;
    }

    if (!validate()) {
      return;
    }

    const productData: ProductUpdate = {
      name: name.trim(),
      sku: sku.trim().toUpperCase(),
      barcode: barcode.trim() || undefined,
      description: description.trim() || undefined,
      brand: brand.trim() || undefined,
      category_id: categoryId!,
      cost_price: parseFloat(costPrice),
      price: parseFloat(salePrice),
    };

    // Verificar se cost_price mudou
    const newCost = parseFloat(costPrice);
    console.log('💰 Verificando mudança de custo:');
    console.log('  - Custo original:', originalCostPrice);
    console.log('  - Custo novo:', newCost);
    console.log('  - Diferença:', originalCostPrice !== null ? Math.abs(newCost - originalCostPrice) : 'N/A');
    
    if (originalCostPrice !== null && !isNaN(newCost) && Math.abs(newCost - originalCostPrice) > 0.01) {
      // Cost_price mudou - mostrar dialog de confirmação
      console.log('⚠️ Custo mudou! Mostrando dialog de confirmação');
      setPendingProductData(productData);
      setShowCostChangeDialog(true);
    } else {
      // Sem mudança no custo - salvar direto
      console.log('✅ Sem mudança no custo, salvando direto');
      updateMutation.mutate(
      { id: productId, data: productData },
      {
        onSuccess: async () => {
          console.log('✅ updateProduct sucesso: iniciando fluxo pós-salvar');

          // Verificar necessidade de ajuste de estoque
          const target = parseInt(newStock || '0', 10);
          const hasValidTarget = !isNaN(target);
          const needsAdjust = hasValidTarget && target !== currentStock;

          if (needsAdjust) {
            try {
              const increasing = target > currentStock;
              const payload: any = {
                new_quantity: target,
                reason: `Ajuste automático na edição (de ${currentStock} para ${target})`,
              };
              if (increasing) {
                // Usar custo informado para aumento ou cair para costPrice
                let unitCostRaw = increaseUnitCost || costPrice;
                let unitCost = parseFloat(String(unitCostRaw).replace(',', '.'));
                if (!isNaN(unitCost) && unitCost > 0) {
                  payload.unit_cost = unitCost;
                }
              }
              console.log('🔄 Ajustando estoque com payload:', payload);
              await adjustProductQuantity(productId, payload);
              setCurrentStock(target);
            } catch (err: any) {
              console.log('❌ Falha ao ajustar estoque após updateProduct:', err?.response?.data || err?.message);
              setErrors(prev => ({ ...prev, global: err?.response?.data?.detail || 'Falha ao ajustar estoque.' }));
              return; // Não mostrar diálogo de sucesso se ajuste falhar
            }
          }

          // Mostrar diálogo de sucesso
          setShowSuccessDialog(true);
        },
        onError: (error: any) => {
          console.log('❌ updateProduct erro:', error?.response?.status, error?.response?.data || error?.message);
          setErrors(prev => ({ ...prev, global: 'Falha ao atualizar produto. Verifique os dados.' }));
        },
      }
    );
              // Não bloqueia o fluxo - produto foi salvo
              setErrorMessage(
                `Produto atualizado, mas houve erro ao ajustar estoque: ${
                  err?.response?.data?.detail || err.message || 'Erro desconhecido'
                }`
              );
              setShowErrorDialog(true);
              return;
            }
          }

          setShowSuccessDialog(true);
        },
        onError: (error: any) => {
          console.log('❌ updateProduct erro:', error?.response?.status, error?.response?.data || error?.message);

          const message =
            error?.response?.data?.detail || error.message || 'Erro ao atualizar produto';
          setErrorMessage(message);
          setShowErrorDialog(true);
        },
      }
    );
    }
  };

  /**
   * Confirmar mudança de custo e salvar
   */
  const handleConfirmCostChange = () => {
    console.log('✅ Usuário confirmou mudança de custo');
    setShowCostChangeDialog(false);
    if (pendingProductData) {
      console.log('📤 Enviando atualização:', pendingProductData);
      updateMutation.mutate(
        { id: productId, data: pendingProductData },
        {
          onSuccess: async () => {
            console.log('✅ updateProduct sucesso (custo mudou)');
            
            // Verificar necessidade de ajuste de estoque
            const target = parseInt(newStock || '0', 10);
            const hasValidTarget = !isNaN(target);
            const needsAdjust = hasValidTarget && target !== currentStock;

            if (needsAdjust) {
              try {
                const increasing = target > currentStock;
                const payload: any = {
                  new_quantity: target,
                  reason: `Ajuste automático na edição (de ${currentStock} para ${target})`,
                };
                if (increasing) {
                  let unitCostRaw = increaseUnitCost || costPrice;
                  let unitCost = parseFloat(String(unitCostRaw).replace(',', '.'));
                  if (!isNaN(unitCost) && unitCost > 0) {
                    payload.unit_cost = unitCost;
                  }
                }
                await adjustProductQuantity(productId, payload);
                setCurrentStock(target);
              } catch (err: any) {
                setErrors(prev => ({ ...prev, global: err?.response?.data?.detail || 'Falha ao ajustar estoque.' }));
                return;
              }
            }

            setShowSuccessDialog(true);
          },
          onError: (error: any) => {
            setErrors(prev => ({ ...prev, global: 'Falha ao atualizar produto. Verifique os dados.' }));
          },
        }
      );
      setPendingProductData(null);
    }
  };

  /**
   * Aplicar ajuste de estoque com confirmação
   */
  const applyStockAdjustment = async () => {
    // Validar entrada
    const parsedNew = parseInt(newStock || '0', 10);
    if (isNaN(parsedNew) || parsedNew < 0) {
      setErrors(prev => ({ ...prev, global: 'Quantidade de estoque inválida' }));
      return;
    }

    const delta = parsedNew - currentStock;
    if (delta === 0) {
      setErrors(prev => ({ ...prev, global: 'Nenhuma mudança de estoque para aplicar.' }));
      return;
    }

    // Se aumento, exigir unit_cost
    let unitCostNumber: number | undefined = undefined;
    if (delta > 0) {
      const v = parseFloat((increaseUnitCost || '').replace(',', '.'));
      if (isNaN(v) || v < 0) {
        setErrors(prev => ({ ...prev, global: 'Informe o custo unitário para aumentar o estoque.' }));
        return;
      }
      unitCostNumber = v;
    }

    try {
      const payload: any = { new_quantity: parsedNew, reason: 'Ajuste manual pelo app' };
      if (unitCostNumber !== undefined) payload.unit_cost = unitCostNumber;
      await adjustProductQuantity(productId, payload);
      await queryClient.invalidateQueries({ queryKey: ['inventory', productId] });
      await queryClient.invalidateQueries({ queryKey: ['product', productId] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      setCurrentStock(parsedNew);
      setShowStockAdjustDialog(false);
      setErrors(prev => ({ ...prev, global: '' }));
      setTimeout(() => setShowSuccessDialog(true), 150);
    } catch (error: any) {
      setErrors(prev => ({ ...prev, global: error?.response?.data?.detail || 'Falha ao ajustar estoque.' }));
    }
  };

  /**
   * Cancelar mudança de custo
   */
  const handleCancelCostChange = () => {
    console.log('❌ Usuário cancelou mudança de custo');
    setShowCostChangeDialog(false);
    setPendingProductData(null);
  };

  /**
   * Formatar entrada de preço com centavos
   */
  const formatPriceInput = (text: string): string => {
    // Remove tudo exceto números
    const numbers = text.replace(/[^0-9]/g, '');
    
    if (numbers.length === 0) return '';
    
    // Converte para número com centavos
    const value = parseInt(numbers) / 100;
    
    // Formata com 2 casas decimais
    return value.toFixed(2);
  };

  /**
   * Formatar display de preço
   */
  const formatPriceDisplay = (value: string): string => {
    if (!value) return '';
    return value.replace('.', ',');
  };

  // Verificar ID inválido
  if (!isValidId) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle" size={64} color={Colors.light.error} />
        <Text style={styles.errorTitle}>ID inválido</Text>
        <Text style={styles.errorMessage}>O ID do produto fornecido não é válido.</Text>
        <Text
          style={styles.errorLink}
          onPress={() => router.push('/(tabs)/products')}
        >
          Voltar para produtos
        </Text>
      </View>
    );
  }

  if (loadingProduct) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={styles.loadingText}>Carregando produto...</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Produto não encontrado</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      {product && (
        <DetailHeader
          title="Editar Produto"
          entityName={product.name}
          backRoute="/(tabs)/products"
          editRoute=""
          onDelete={() => {}}
          badges={[]}
          metrics={[]}
        />
      )}

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
        {/* Informações Básicas */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Informações Básicas</Text>
          </View>
          <View style={styles.cardContent}>
            <TextInput
              label="Nome do Produto *"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setErrors({ ...errors, name: '' });
              }}
              mode="outlined"
              error={!!errors.name}
              style={styles.input}
              placeholder="Ex: Legging Fitness Preta"
            />
            {errors.name ? (
              <HelperText type="error">{errors.name}</HelperText>
            ) : null}

            <TextInput
              label="SKU (Código) *"
              value={sku}
              onChangeText={(text) => {
                setSku(text);
                setErrors({ ...errors, sku: '' });
              }}
              mode="outlined"
              error={!!errors.sku}
              style={styles.input}
              placeholder="Ex: LEG-FIT-001"
              autoCapitalize="characters"
            />
            {errors.sku ? (
              <HelperText type="error">{errors.sku}</HelperText>
            ) : null}

            <TextInput
              label="Código de Barras"
              value={barcode}
              onChangeText={setBarcode}
              mode="outlined"
              style={styles.input}
              placeholder="Ex: 7891234567890"
              keyboardType="numeric"
            />

            <TextInput
              label="Marca"
              value={brand}
              onChangeText={setBrand}
              mode="outlined"
              style={styles.input}
              placeholder="Ex: Nike, Adidas"
            />

            <TextInput
              label="Descrição"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              style={styles.input}
              placeholder="Descrição detalhada do produto"
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Categoria */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="list-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Categoria *</Text>
          </View>
          <View style={styles.cardContent}>
            {loadingCategories ? (
              <HelperText type="info">Carregando categorias...</HelperText>
            ) : categories.length === 0 ? (
              <HelperText type="error">Nenhuma categoria disponível. Cadastre categorias primeiro.</HelperText>
            ) : (
              <>
                <Menu
                  visible={menuVisible}
                  onDismiss={() => setMenuVisible(false)}
                  contentStyle={{ maxHeight: 300 }}
                  anchor={
                    <TouchableRipple
                      onPress={() => setMenuVisible(true)}
                      style={styles.categoryButton}
                    >
                      <View style={styles.categoryButtonContent}>
                        <Text style={categoryId ? styles.categoryText : styles.categoryPlaceholder}>
                          {categoryId 
                            ? categories.find(c => c.id === categoryId)?.name 
                            : 'Selecione uma categoria'}
                        </Text>
                        <Ionicons name="chevron-down" size={20} color="#999" />
                      </View>
                    </TouchableRipple>
                  }
                >
                  {categories.map((category) => (
                    <Menu.Item
                      key={category.id}
                      onPress={() => {
                        setMenuVisible(false);
                        setTimeout(() => {
                          setCategoryId(category.id);
                          setErrors({ ...errors, categoryId: '' });
                        }, 100);
                      }}
                      title={category.name}
                    />
                  ))}
                </Menu>
                {errors.categoryId ? (
                  <HelperText type="error">{errors.categoryId}</HelperText>
                ) : null}
              </>
            )}
          </View>
        </View>

        {/* Preços */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cash-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Preços</Text>
          </View>
          <View style={styles.cardContent}>
            <TextInput
              label="Preço de Venda (R$) *"
              value={formatPriceDisplay(salePrice)}
              onChangeText={(text) => {
                setSalePrice(formatPriceInput(text));
                setErrors({ ...errors, salePrice: '' });
              }}
              mode="outlined"
              error={!!errors.salePrice}
              style={styles.input}
              placeholder="0,00"
              keyboardType="numeric"
              left={<TextInput.Affix text="R$" />}
            />
            {errors.salePrice ? (
              <HelperText type="error">{errors.salePrice}</HelperText>
            ) : null}

            {/* Aviso sobre custo */}
            <View style={styles.warningBox}>
              <Ionicons name="information-circle" size={20} color={Colors.light.primary} />
              <Text style={styles.warningText}>
                Custo e quantidade são gerenciados pela tela de Entradas
              </Text>
            </View>
          </View>
        </View>

        {/* Estoque */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cube-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Estoque</Text>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Atual:</Text>
              <Text style={styles.infoValue}>{currentStock} un</Text>
            </View>
            <TextInput
              label="Ajustar para (un)"
              value={newStock}
              onChangeText={(t) => setNewStock(t.replace(/[^0-9]/g, ''))}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
              placeholder="0"
            />
            {(() => {
              const parsedNew = parseInt(newStock || '0', 10);
              const delta = (isNaN(parsedNew) ? 0 : parsedNew) - currentStock;
              if (delta > 0) {
                return (
                  <TextInput
                    label="Custo unitário (R$) para aumento"
                    value={increaseUnitCost}
                    onChangeText={(t) => setIncreaseUnitCost(t.replace(/[^0-9,\.]/g, '').replace(',', '.'))}
                    mode="outlined"
                    keyboardType="numeric"
                    style={styles.input}
                    placeholder="0,00"
                    left={<TextInput.Affix text="R$" />}
                  />
                );
              }
              return null;
            })()}
          </View>
        </View>

        {/* Botões de ação */}
        <View style={styles.actions}>
          {errors.global && (
            <Text style={{ color: Colors.light.error, textAlign: 'center', flex:1, fontSize:12 }}>
              {errors.global}
            </Text>
          )}
          <Button
            mode="outlined"
            onPress={() => router.back()}
            style={styles.button}
            disabled={updateMutation.isPending}
          >
            Cancelar
          </Button>

          <Button
            mode="contained"
            onPress={handleSave}
            style={[styles.button, styles.buttonPrimary]}
            loading={updateMutation.isPending}
            disabled={updateMutation.isPending}
          >
            Salvar Alterações
          </Button>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Dialog de Sucesso */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Produto Atualizado!"
        message="As alterações foram salvas com sucesso."
        confirmText="OK"
        onConfirm={() => {
          setShowSuccessDialog(false);
          router.replace(`/products/${productId}`);
        }}
        type="success"
        icon="checkmark-circle"
      />

      {/* Dialog de Confirmação de Mudança de Custo */}
      <ConfirmDialog
        visible={showCostChangeDialog}
        title="Atualizar Custo do Produto?"
        message={`Alterar o custo de R$ ${formatMoney(originalCostPrice)} para R$ ${formatMoney(costPrice)} irá atualizar automaticamente o custo unitário de todos os lotes em estoque deste produto.\n\nIsso garante que o valor do estoque reflita o custo correto. Deseja continuar?`}
        confirmText="Sim, Atualizar"
        cancelText="Cancelar"
        onConfirm={handleConfirmCostChange}
        onCancel={handleCancelCostChange}
        type="warning"
        icon="warning"
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  // Header com gradiente
  headerGradient: {
    paddingTop: 0, // SafeArea já cuidou do espaço
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  headerContent: {
    marginTop: 24, // Espaço consistente após SafeArea
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
    width: 40, // Placeholder para botões de ação
  },
  headerInfo: {
    alignItems: 'center',
  },
  headerEntityName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: '#fff',
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
    maxWidth: '85%',
    lineHeight: 20,
  },
  keyboardView: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: theme.spacing.md,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  cardContent: {
    padding: theme.spacing.md,
  },
  section: {
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.primary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    marginBottom: theme.spacing.sm,
    backgroundColor: Colors.light.background,
  },
  categoryButton: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  categoryButtonContent: {
    padding: 16,
    minHeight: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryText: {
    fontSize: 16,
    color: '#000',
  },
  categoryPlaceholder: {
    fontSize: 16,
    color: '#999',
  },
  marginInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2e7d32',
  },
  marginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  marginLabel: {
    color: '#2e7d32',
    fontWeight: '600',
    fontSize: 14,
  },
  marginValue: {
    fontWeight: '800',
    color: '#1b5e20',
    fontSize: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  button: {
    flex: 1,
    borderRadius: 12,
  },
  buttonPrimary: {
    backgroundColor: Colors.light.primary,
  },
  infoBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.light.error,
    marginTop: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 32,
  },
  errorLink: {
    fontSize: 14,
    color: Colors.light.primary,
    marginTop: 16,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.primary,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 18,
  },
});
