import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCategories } from '@/hooks/useCategories';
import { getProductById, updateProduct } from '@/services/productService';
import { Colors, theme } from '@/constants/Colors';
import type { ProductUpdate } from '@/types';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { categories, isLoading: loadingCategories } = useCategories();

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
      setCostPrice(product.cost_price?.toString() || '');
      setSalePrice(product.price?.toString() || '');
    }
  }, [product]);

  /**
   * Mutation para atualizar produto
   */
  const updateMutation = useMutation({
    mutationFn: (data: ProductUpdate) => updateProduct(productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      Alert.alert(
        'Sucesso!',
        'Produto atualizado com sucesso',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    },
    onError: (error: any) => {
      const errorMessage = error.message || 'Erro ao atualizar produto';
      Alert.alert('Erro', errorMessage);
    },
  });

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

  /**
   * Salvar alterações
   */
  const handleSave = () => {
    if (!validate()) {
      Alert.alert('Atenção', 'Preencha todos os campos obrigatórios');
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

    console.log('Dados do produto a serem atualizados:', JSON.stringify(productData, null, 2));
    updateMutation.mutate(productData);
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />

      {/* Header com gradiente */}
      <LinearGradient
        colors={[Colors.light.primary, '#7c4dff']}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/products')}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>
              Editar Produto
            </Text>

            <View style={styles.headerActions} />
          </View>

          {product && (
            <View style={styles.headerInfo}>
              <Text style={styles.headerEntityName}>{product.name}</Text>
              <Text style={styles.headerSubtitle}>Edite as informações abaixo</Text>
            </View>
          )}
        </View>
      </LinearGradient>

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
        <View style={styles.section}>
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

        {/* Categoria */}
        <View style={styles.section}>
          <HelperText type="info" style={styles.sectionTitle}>
            Categoria *
          </HelperText>
          
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
                    </View>
                  </TouchableRipple>
                }
              >
                {categories.map((category) => (
                  <Menu.Item
                    key={category.id}
                    onPress={() => {
                      console.log('Categoria selecionada:', category.id, category.name);
                      setMenuVisible(false);
                      // Usar setTimeout para garantir que o menu feche antes de atualizar o estado
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

        {/* Preços */}
        <View style={styles.section}>
          <HelperText type="info" style={styles.sectionTitle}>
            Preços
          </HelperText>

          <TextInput
            label="Preço de Custo (R$) *"
            value={formatPriceDisplay(costPrice)}
            onChangeText={(text) => {
              setCostPrice(formatPriceInput(text));
              setErrors({ ...errors, costPrice: '' });
            }}
            mode="outlined"
            error={!!errors.costPrice}
            style={styles.input}
            placeholder="0,00"
            keyboardType="numeric"
            left={<TextInput.Affix text="R$" />}
          />
          {errors.costPrice ? (
            <HelperText type="error">{errors.costPrice}</HelperText>
          ) : null}

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

          {/* Margem de lucro calculada */}
          {costPrice && salePrice && parseFloat(costPrice) > 0 && parseFloat(salePrice) > 0 && (
            <View style={styles.marginInfo}>
              <Text style={styles.marginLabel}>Margem de Lucro:</Text>
              <Text style={styles.marginValue}>
                {(
                  ((parseFloat(salePrice) - parseFloat(costPrice)) / parseFloat(costPrice)) * 100
                ).toFixed(1)}%
              </Text>
            </View>
          )}
        </View>

        {/* Botões de ação */}
        <View style={styles.actions}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5', // Background padrão
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
    borderRadius: 4,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  categoryButtonContent: {
    padding: 16,
    minHeight: 56,
    justifyContent: 'center',
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
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  marginLabel: {
    color: '#2e7d32',
    fontWeight: '600',
  },
  marginValue: {
    fontWeight: 'bold',
    color: '#1b5e20',
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  button: {
    flex: 1,
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
});
