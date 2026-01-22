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
  Card,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { useQuery } from '@tanstack/react-query';
import { getStockEntries } from '@/services/stockEntryService';
import { useCategories, useCreateProduct } from '@/hooks';
import { Colors, theme } from '@/constants/Colors';
import type { ProductCreate } from '@/types';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function AddProductScreen() {
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/products');
  const { categories, isLoading: loadingCategories } = useCategories();
  const createMutation = useCreateProduct();

  // Estados do formulário
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [minStock, setMinStock] = useState('5');

  // Estados de validação e UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [categoryMenuVisible, setCategoryMenuVisible] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showLinkEntryDialog, setShowLinkEntryDialog] = useState(false);
  const [createdProductId, setCreatedProductId] = useState<number | null>(null);

  // Verificar se existem entradas cadastradas
  const { data: existingEntries = [], isLoading: loadingEntries } = useQuery({
    queryKey: ['stock-entries', 'exists-check'],
    queryFn: () => getStockEntries({ limit: 5 }),
  });

  // Debug: log quando categorias carregarem
  useEffect(() => {
    console.log('Categorias carregadas:', categories.length);
    if (categories.length > 0) {
      console.log('Primeira categoria:', categories[0]);
    }
  }, [categories]);



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
   * Salvar produto
   */
  const handleSave = () => {
    if (!validate()) {
      setErrorMessage('Preencha todos os campos obrigatórios');
      setShowErrorDialog(true);
      return;
    }

    const productData: ProductCreate = {
      name: name.trim(),
      sku: sku.trim().toUpperCase(),
      barcode: barcode.trim() || undefined,
      description: description.trim() || undefined,
      brand: brand.trim() || undefined,
      category_id: categoryId!,
      cost_price: parseFloat(costPrice),
      price: parseFloat(salePrice), // Backend espera 'price', não 'sale_price'
      initial_stock: parseInt(minStock) || 0, // Estoque inicial
      min_stock: 5, // Estoque mínimo padrão
    };

    console.log('Dados do produto a serem enviados:', JSON.stringify(productData, null, 2));
    createMutation.mutate(productData, {
      onSuccess: (created) => {
        setCreatedProductId(created?.id ?? null);
        setShowSuccessDialog(true);
      },
      onError: (error: any) => {
        const message = error.message || 'Erro ao cadastrar produto';
        setErrorMessage(message);
        setShowErrorDialog(true);
      },
    });
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />

      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
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
              Novo Produto
            </Text>

            <View style={styles.headerPlaceholder} />
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.headerSubtitle}>
              Preencha os dados abaixo para cadastrar um novo produto
            </Text>
          </View>
        </View>
        </LinearGradient>
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {/* Informações Básicas */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="cube-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Informações Básicas</Text>
            </View>

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
          </Card.Content>
        </Card>

        {/* Categoria */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="grid-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Categoria</Text>
            </View>
          
          {loadingCategories ? (
            <HelperText type="info">Carregando categorias...</HelperText>
          ) : categories.length === 0 ? (
            <HelperText type="error">Nenhuma categoria disponível. Cadastre categorias primeiro.</HelperText>
          ) : (
            <>
              <Menu
                visible={categoryMenuVisible}
                onDismiss={() => setCategoryMenuVisible(false)}
                contentStyle={{ maxHeight: 300 }}
                anchor={
                  <TouchableRipple
                    onPress={() => setCategoryMenuVisible(true)}
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
                      setCategoryMenuVisible(false);
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
          </Card.Content>
        </Card>

        {/* Preços */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="cash-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Preços</Text>
            </View>

          <TextInput
            label="Preço de Custo (R$) *"
            value={costPrice}
            onChangeText={(text) => {
              setCostPrice(formatPriceInput(text));
              setErrors({ ...errors, costPrice: '' });
            }}
            mode="outlined"
            error={!!errors.costPrice}
            style={styles.input}
            placeholder="0.00"
            keyboardType="decimal-pad"
            left={<TextInput.Affix text="R$" />}
          />
          {errors.costPrice ? (
            <HelperText type="error">{errors.costPrice}</HelperText>
          ) : null}

          <TextInput
            label="Preço de Venda (R$) *"
            value={salePrice}
            onChangeText={(text) => {
              setSalePrice(formatPriceInput(text));
              setErrors({ ...errors, salePrice: '' });
            }}
            mode="outlined"
            error={!!errors.salePrice}
            style={styles.input}
            placeholder="0.00"
            keyboardType="decimal-pad"
            left={<TextInput.Affix text="R$" />}
          />
          {errors.salePrice ? (
            <HelperText type="error">{errors.salePrice}</HelperText>
          ) : null}

          <TextInput
            label="Preço Atacado (R$)"
            value={wholesalePrice}
            onChangeText={(text) => setWholesalePrice(formatPriceInput(text))}
            mode="outlined"
            style={styles.input}
            placeholder="0.00"
            keyboardType="decimal-pad"
            left={<TextInput.Affix text="R$" />}
          />
          <HelperText type="info">Opcional - para vendas em quantidade</HelperText>
          </Card.Content>
        </Card>

        {/* Estoque Mínimo */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="archive-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Estoque</Text>
            </View>

          <TextInput
            label="Estoque Mínimo"
            value={minStock}
            onChangeText={setMinStock}
            mode="outlined"
            style={styles.input}
            placeholder="5"
            keyboardType="numeric"
          />
          <HelperText type="info">
            Você será alertado quando o estoque atingir este valor
          </HelperText>
          </Card.Content>
        </Card>

        {/* Botões de ação */}
        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={goBack}
            style={styles.button}
            disabled={createMutation.isPending}
          >
            Cancelar
          </Button>

          <Button
            mode="contained"
            onPress={handleSave}
            style={[styles.button, styles.buttonPrimary]}
            loading={createMutation.isPending}
            disabled={createMutation.isPending}
          >
            Salvar Produto
          </Button>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Dialog de Sucesso */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Produto criado"
        message={
          existingEntries.length > 0
            ? 'Deseja vincular este produto a uma entrada agora?'
            : 'Nenhuma entrada encontrada. Deseja cadastrar uma nova entrada agora?'
        }
        confirmText={existingEntries.length > 0 ? 'Cadastrar nova' : 'Cadastrar entrada'}
        cancelText={existingEntries.length > 0 ? 'Selecionar existente' : ''}
        type="success"
        icon="checkmark-circle"
        onConfirm={() => {
          setShowSuccessDialog(false);
          // Navegar para cadastro de nova entrada
          router.push('/entries/add');
        }}
        onCancel={() => {
          setShowSuccessDialog(false);
          if (existingEntries.length > 0) {
            // Navegar para lista de entradas para selecionar
            router.push('/entries');
          } else {
            goBack();
          }
        }}
      />

      {/* Dialog de Erro */}
      <ConfirmDialog
        visible={showErrorDialog}
        title="Erro"
        message={errorMessage}
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
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.sm,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    marginTop: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
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
    fontWeight: 'bold' as const,
    color: '#fff',
  },
  headerPlaceholder: {
    width: 40,
  },
  headerInfo: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    maxWidth: '90%',
    alignSelf: 'center',
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.95,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: 'normal' as const,
  },
  content: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  section: {
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '600' as const,
    color: Colors.light.primary,
    marginBottom: theme.spacing.sm,
  },
  card: {
    marginBottom: theme.spacing.md,
    borderRadius: 16,
    elevation: 2,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.light.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  input: {
    marginBottom: theme.spacing.sm,
    backgroundColor: Colors.light.background,
  },
  categoryButton: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: Colors.light.background,
    marginBottom: theme.spacing.sm,
  },
  categoryButtonContent: {
    padding: theme.spacing.md,
    minHeight: 56,
    justifyContent: 'center',
  },
  categoryText: {
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
  },
  categoryPlaceholder: {
    fontSize: theme.fontSize.base,
    color: Colors.light.textTertiary,
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
  createBatchButton: {
    marginTop: theme.spacing.sm,
    borderColor: Colors.light.primary,
  },
});
