import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { getImageUrl } from '@/constants/Config';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency } from '@/utils/format';
import type { ProductGrouped } from '@/types';

interface ProductGroupCardProps {
  product: ProductGrouped;
  onPress: () => void;
}

export default function ProductGroupCard({ product, onPress }: ProductGroupCardProps) {
  const [imageError, setImageError] = useState(false);
  const brandingColors = useBrandingColors();

  const hasVariants = product.variant_count > 1;
  const stockText = product.total_stock > 0 ? `${product.total_stock} un.` : 'Sem estoque';
  const priceText = product.min_price === product.max_price
    ? formatCurrency(product.min_price)
    : `${formatCurrency(product.min_price)} - ${formatCurrency(product.max_price)}`;
  const lowStockThreshold = product.min_stock_threshold ?? 3;

  const stockStatus = (() => {
    if (product.total_stock === 0) {
      return {
        backgroundColor: Colors.light.error + '14',
        borderColor: Colors.light.error + '2E',
        color: Colors.light.error,
        icon: 'close-circle' as const,
      };
    }

    if (product.total_stock <= lowStockThreshold) {
      return {
        backgroundColor: Colors.light.warning + '16',
        borderColor: Colors.light.warning + '33',
        color: Colors.light.warning,
        icon: 'warning' as const,
      };
    }

    return {
      backgroundColor: Colors.light.success + '14',
      borderColor: Colors.light.success + '2E',
      color: Colors.light.success,
      icon: 'checkmark-circle' as const,
    };
  })();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.72}>
      <View style={styles.card}>
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: brandingColors.primary + '12' }]}>
            {product.image_url && !imageError ? (
              <Image
                source={{ uri: getImageUrl(product.image_url) }}
                style={styles.productImage}
                resizeMode="cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <Ionicons name="cube-outline" size={24} color={brandingColors.primary} />
            )}
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.name} numberOfLines={2}>
              {product.name}
            </Text>

            <View style={styles.metaRow}>
              {product.brand ? (
                <Text style={styles.brand} numberOfLines={1}>
                  {product.brand}
                </Text>
              ) : (
                <Text style={styles.brandMuted}>Sem marca</Text>
              )}
            </View>

            <Text style={[styles.price, { color: brandingColors.primary }]} numberOfLines={1}>
              {priceText}
            </Text>
          </View>

          <View style={styles.badgesColumn}>
            {hasVariants ? (
              <View
                style={[
                  styles.variantBadge,
                  {
                    backgroundColor: brandingColors.primary + '12',
                    borderColor: brandingColors.primary + '24',
                  },
                ]}
              >
                <Ionicons name="layers-outline" size={11} color={brandingColors.primary} />
                <Text style={[styles.variantText, { color: brandingColors.primary }]} numberOfLines={1}>
                  {product.variant_count} variações
                </Text>
              </View>
            ) : (
              <View style={styles.badgePlaceholder} />
            )}

            <View
              style={[
                styles.stockBadge,
                {
                  backgroundColor: stockStatus.backgroundColor,
                  borderColor: stockStatus.borderColor,
                },
              ]}
            >
              <Ionicons name={stockStatus.icon} size={12} color={stockStatus.color} />
              <Text style={[styles.stockText, { color: stockStatus.color }]} numberOfLines={1}>
                {stockText}
              </Text>
            </View>
          </View>

          <View style={styles.chevronColumn}>
            <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 4,
    gap: theme.spacing.sm + 2,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: theme.borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  productImage: {
    width: '100%',
    height: '100%',
    borderRadius: theme.borderRadius.xl,
  },
  infoContainer: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  brand: {
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.xs,
    minWidth: 0,
  },
  brandMuted: {
    color: Colors.light.textTertiary,
    fontSize: theme.fontSize.xs,
  },
  badgesColumn: {
    width: 110,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 0,
  },
  variantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    gap: 4,
    flexShrink: 0,
  },
  badgePlaceholder: {
    minHeight: 20,
  },
  variantText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  price: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  chevronColumn: {
    width: 20,
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    gap: 4,
    flexShrink: 0,
  },
  stockText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});