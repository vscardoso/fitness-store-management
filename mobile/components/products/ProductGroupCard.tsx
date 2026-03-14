import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Image } from 'react-native';
import { Card } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import type { ProductGrouped } from '@/types';

interface ProductGroupCardProps {
  product: ProductGrouped;
  onPress: () => void;
}

export default function ProductGroupCard({ product, onPress }: ProductGroupCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const hasVariants = product.variant_count > 1;
  const stockText = product.total_stock > 0 ? `${product.total_stock} un.` : 'Sem estoque';
  const priceText = product.min_price === product.max_price 
    ? formatCurrency(product.min_price)
    : `${formatCurrency(product.min_price)} - ${formatCurrency(product.max_price)}`;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={styles.card}>
        <Card.Content style={styles.content}>
          {/* Left: Image/Icon */}
          <View style={styles.iconContainer}>
            {product.image_url && !imageError ? (
              <Image
                source={{ uri: product.image_url }}
                style={styles.productImage}
                resizeMode="cover"
                onError={() => setImageError(true)}
                onLoad={() => setImageLoaded(true)}
              />
            ) : (
              <Ionicons name="cube" size={32} color={Colors.light.primary} />
            )}
          </View>

          {/* Middle: Info */}
          <View style={styles.infoContainer}>
            <Text style={styles.name} numberOfLines={1}>
              {product.name}
            </Text>

            {product.brand && (
              <Text style={styles.brand} numberOfLines={1}>
                {product.brand}
              </Text>
            )}

            {/* Variants Badge */}
            {hasVariants && (
              <View style={styles.variantBadge}>
                <Ionicons name="layers" size={10} color="#fff" />
                <Text style={styles.variantText}>{product.variant_count} variações</Text>
              </View>
            )}

            {/* Price Range */}
            <Text style={styles.price}>
              {priceText}
            </Text>
          </View>

          {/* Right: Stock & Chevron */}
          <View style={styles.rightContainer}>
            <View style={[
              styles.stockBadge,
              product.total_stock === 0 && styles.stockBadgeEmpty,
            ]}>
              <Ionicons
                name={product.total_stock === 0 ? "close-circle" : "checkmark-circle"}
                size={12}
                color="#fff"
              />
              <Text style={styles.stockText}>{stockText}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={Colors.light.textTertiary}
            />
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
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
    borderRadius: theme.borderRadius.full,
  },
  infoContainer: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontWeight: '600',
    marginBottom: 2,
  },
  brand: {
    color: Colors.light.textSecondary,
    fontSize: 11,
    marginBottom: 6,
  },
  variantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 6,
    gap: 4,
  },
  variantText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  price: {
    color: Colors.light.primary,
    fontWeight: '700',
  },
  rightContainer: {
    alignItems: 'center',
    gap: 6,
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.success,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  stockBadgeEmpty: {
    backgroundColor: Colors.light.error,
  },
  stockText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
});