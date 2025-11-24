import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { Product } from '@/types';
import { formatCurrency } from '@/utils/format';

interface ProductCardProps {
  product: Product;
  onPress: () => void;
}

export default function ProductCard({ product, onPress }: ProductCardProps) {
  const theme = useTheme();
  const currentStock = product.current_stock ?? 0;
  const minStock = product.min_stock_threshold ?? 5;

  /**
   * Status do estoque com cores e ícones
   */
  const getStockStatus = () => {
    if (currentStock === 0) {
      return {
        color: theme.colors.error,
        backgroundColor: theme.colors.errorContainer,
        text: 'Sem estoque',
        icon: 'close-circle' as const,
      };
    }
    // Estoque baixo: menor ou igual ao mínimo
    if (currentStock <= minStock) {
      return {
        color: '#F57C00',
        backgroundColor: '#FFF3E0',
        text: 'Estoque baixo',
        icon: 'alert-circle' as const,
      };
    }
    return {
      color: '#2E7D32',
      backgroundColor: '#E8F5E9',
      text: 'Disponível',
      icon: 'checkmark-circle' as const,
    };
  };

  const stockStatus = getStockStatus();

  return (
    <Card
      mode="elevated"
      elevation={2}
      style={styles.card}
      onPress={onPress}
    >
      <Card.Content style={styles.content}>
        {/* Badge de status */}
        <View style={styles.header}>
          <View
            style={[
              styles.badge,
              { backgroundColor: stockStatus.backgroundColor },
            ]}
          >
            <Ionicons
              name={stockStatus.icon}
              size={14}
              color={stockStatus.color}
              style={styles.badgeIcon}
            />
            <Text
              variant="labelSmall"
              style={[styles.badgeText, { color: stockStatus.color }]}
            >
              {stockStatus.text}
            </Text>
          </View>
        </View>

        {/* Nome do produto */}
        <Text
          variant="titleMedium"
          style={styles.name}
          numberOfLines={2}
        >
          {product.name}
        </Text>

        {/* SKU e Marca */}
        <View style={styles.metaRow}>
          <Text variant="bodySmall" style={styles.meta}>
            SKU: {product.sku}
          </Text>
          {product.brand && (
            <Text variant="bodySmall" style={styles.brand}>
              • {product.brand}
            </Text>
          )}
        </View>

        {/* Footer com preço e estoque */}
        <View style={styles.footer}>
          <View>
            <Text variant="labelSmall" style={styles.label}>
              Preço
            </Text>
            <Text
              variant="headlineSmall"
              style={[styles.price, { color: theme.colors.primary }]}
            >
              {formatCurrency(product.price)}
            </Text>
          </View>

          <View style={styles.stockInfo}>
            <Ionicons
              name="cube"
              size={20}
              color={theme.colors.secondary}
            />
            <View style={styles.stockTextContainer}>
              <Text variant="labelSmall" style={styles.label}>
                Estoque
              </Text>
              <Text variant="titleMedium" style={styles.stockValue}>
                {currentStock}
              </Text>
            </View>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '47%',
    marginHorizontal: 6,
    marginBottom: 12,
  },
  content: {
    padding: 12,
  },
  header: {
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeIcon: {
    marginRight: 4,
  },
  badgeText: {
    fontWeight: '600',
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  name: {
    fontWeight: '700',
    marginBottom: 6,
    lineHeight: 20,
    fontSize: 14,
  },
  metaRow: {
    flexDirection: 'column',
    marginBottom: 12,
  },
  meta: {
    color: '#757575',
    fontWeight: '500',
    fontSize: 11,
  },
  brand: {
    color: '#757575',
    fontSize: 11,
  },
  footer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
    gap: 10,
  },
  label: {
    color: '#9E9E9E',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  price: {
    fontWeight: '700',
    letterSpacing: -0.5,
    fontSize: 18,
  },
  stockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stockTextContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 8,
  },
  stockValue: {
    fontWeight: '600',
    color: '#424242',
  },
});
