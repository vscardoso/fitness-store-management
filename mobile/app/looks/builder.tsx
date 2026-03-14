/**
 * Look Builder — Monta um look selecionando produtos e variantes.
 * Segue padrão visual da tela de produtos (ProductGroupCard).
 */
import { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
  Text as RNText,
} from 'react-native';
import { Text, Button, Card, Searchbar, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { getGroupedProducts } from '@/services/productService';
import { createLook } from '@/services/lookService';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import type { ProductGrouped, ProductVariant } from '@/types';

interface SelectedItem {
  product: ProductGrouped;
  variant: ProductVariant | null;
}

export default function LookBuilderScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [lookName, setLookName] = useState('');
  const [description, setDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [step, setStep] = useState<'info' | 'products'>('info');

  const { data: pages, isLoading } = useQuery({
    queryKey: ['grouped-products'],
    queryFn: () => getGroupedProducts({ limit: 200, skip: 0 }),
  });

  const allProducts: ProductGrouped[] = useMemo(() => {
    const arr = pages ?? [];
    if (!searchQuery.trim()) return arr;
    const q = searchQuery.toLowerCase();
    return arr.filter(
      (p: ProductGrouped) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand?.toLowerCase().includes(q) ?? false)
    );
  }, [pages, searchQuery]);

  const totalPrice = useMemo(
    () => selectedItems.reduce((acc, i) => acc + (i.variant?.price ?? i.product.min_price ?? 0), 0),
    [selectedItems]
  );

  const discount = selectedItems.length >= 3 ? 10 : 0;
  const finalPrice = totalPrice * (1 - discount / 100);

  const saveMutation = useMutation({
    mutationFn: () =>
      createLook({
        name: lookName.trim(),
        description: description.trim() || undefined,
        is_public: true,
        items: selectedItems.map((item, idx) => ({
          product_id: item.product.id,
          variant_id: item.variant?.id,
          position: idx,
        })),
      }),
    onSuccess: (look) => {
      queryClient.invalidateQueries({ queryKey: ['looks'] });
      router.replace(`/looks/${look.id}`);
    },
    onError: () => {
      Alert.alert('Erro', 'Não foi possível salvar o look. Tente novamente.');
    },
  });

  const handleSave = () => {
    if (!lookName.trim()) {
      Alert.alert('Nome obrigatório', 'Informe um nome para o look.');
      return;
    }
    if (selectedItems.length === 0) {
      Alert.alert('Adicione produtos', 'Selecione ao menos um produto.');
      return;
    }
    saveMutation.mutate();
  };

  const toggleProduct = (product: ProductGrouped) => {
    const exists = selectedItems.findIndex((i) => i.product.id === product.id);
    if (exists >= 0) {
      setSelectedItems((prev) => prev.filter((_, idx) => idx !== exists));
    } else {
      const variant = product.variants.find((v) => v.current_stock > 0) ?? product.variants[0] ?? null;
      setSelectedItems((prev) => [...prev, { product, variant }]);
    }
  };

  const isSelected = (productId: number) =>
    selectedItems.some((i) => i.product.id === productId);

  // ── Step 1: Informações do look ──────────────────────────────────────────
  if (step === 'info') {
    return (
      <View style={styles.container}>
        <PageHeader title="Novo Look" subtitle="Passo 1 de 2" />
        <View style={styles.formContainer}>
          <TextInput
            label="Nome do look *"
            value={lookName}
            onChangeText={setLookName}
            mode="outlined"
            placeholder="Ex: Look Treino Moderno"
            style={styles.input}
          />
          <TextInput
            label="Descrição (opcional)"
            value={description}
            onChangeText={setDescription}
            mode="outlined"
            multiline
            numberOfLines={3}
            placeholder="Descreva o estilo ou ocasião..."
            style={styles.input}
          />
          <Button
            mode="contained"
            onPress={() => {
              if (!lookName.trim()) {
                Alert.alert('Nome obrigatório', 'Informe um nome para o look.');
                return;
              }
              setStep('products');
            }}
            style={styles.nextButton}
            icon="arrow-forward"
          >
            Selecionar Produtos
          </Button>
        </View>
      </View>
    );
  }

  // ── Step 2: Seleção de produtos ──────────────────────────────────────────
  return (
    <View style={styles.container}>
      <PageHeader
        title={lookName}
        subtitle={`${selectedItems.length} peças selecionadas`}
        rightActions={[{ icon: 'arrow-back', onPress: () => setStep('info') }]}
      />

      <Searchbar
        placeholder="Buscar produto ou marca..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchbar}
      />

      {/* Resumo do look */}
      {selectedItems.length > 0 && (
        <Card style={styles.summaryCard}>
          <Card.Content style={styles.summaryContent}>
            <View style={styles.summaryLeft}>
              <Text style={styles.summaryLabel}>
                {selectedItems.length} peças • Total: {formatCurrency(totalPrice)}
              </Text>
              {discount > 0 && (
                <Text style={styles.discountText}>
                  Desconto 3+ peças: -{discount}% → {formatCurrency(finalPrice)}
                </Text>
              )}
            </View>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={saveMutation.isPending}
              compact
            >
              Salvar
            </Button>
          </Card.Content>
        </Card>
      )}

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={allProducts}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ProductSelectCard
              product={item}
              selected={isSelected(item.id)}
              onPress={() => toggleProduct(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="Nenhum produto encontrado"
              description="Tente buscar por outro termo"
            />
          }
        />
      )}
    </View>
  );
}

function ProductSelectCard({
  product,
  selected,
  onPress,
}: {
  product: ProductGrouped;
  selected: boolean;
  onPress: () => void;
}) {
  const priceText =
    product.min_price === product.max_price
      ? formatCurrency(product.min_price)
      : `${formatCurrency(product.min_price)} – ${formatCurrency(product.max_price)}`;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={[styles.card, selected && styles.cardSelected]}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.iconContainer}>
            {product.image_url ? (
              <Image
                source={{ uri: product.image_url }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="cube" size={28} color={Colors.light.primary} />
            )}
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.productName} numberOfLines={1}>
              {product.name}
            </Text>
            {product.brand && (
              <Text style={styles.productBrand}>{product.brand}</Text>
            )}
            {product.variant_count > 1 && (
              <RNText style={styles.variantText}>{product.variant_count} variações</RNText>
            )}
            <Text style={styles.productPrice}>{priceText}</Text>
          </View>

          <View style={[styles.checkContainer, selected && styles.checkActive]}>
            <Ionicons
              name={selected ? 'checkmark-circle' : 'add-circle-outline'}
              size={28}
              color={selected ? Colors.light.primary : Colors.light.textTertiary}
            />
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
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
  },
  formContainer: {
    padding: 16,
  },
  input: {
    marginBottom: 16,
    backgroundColor: Colors.light.card,
  },
  nextButton: {
    marginTop: 8,
    borderRadius: 12,
  },
  searchbar: {
    marginHorizontal: 16,
    marginBottom: 8,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: theme.borderRadius.lg,
    elevation: 2,
    backgroundColor: `${Colors.light.primary}10`,
  },
  summaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLeft: {
    flex: 1,
    marginRight: 12,
  },
  summaryLabel: {
    fontWeight: '600',
    fontSize: 13,
  },
  discountText: {
    fontSize: 12,
    color: Colors.light.success,
    marginTop: 2,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 80,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: Colors.light.primary,
    backgroundColor: `${Colors.light.primary}08`,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: `${Colors.light.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    flex: 1,
    marginRight: 8,
  },
  productName: {
    fontWeight: '600',
    fontSize: 14,
  },
  productBrand: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  variantText: {
    fontSize: 10,
    color: Colors.light.primary,
    marginTop: 2,
    fontWeight: '600',
  },
  productPrice: {
    fontSize: 13,
    color: Colors.light.primary,
    fontWeight: '700',
    marginTop: 4,
  },
  checkContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkActive: {},
});
