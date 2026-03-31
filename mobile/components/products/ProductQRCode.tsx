import { View, StyleSheet, Text } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingStore } from '@/store/brandingStore';
import type { Product } from '@/types';
import { formatCurrency } from '@/utils/format';

interface QRCodePayload {
  id?: number;
  variantId?: number;
  sku?: string | null;
  name?: string;
  price?: number | null;
  size?: string | null;
  color?: string | null;
}

interface ProductQRCodeProps {
  product: Product;
  size?: number;
  includePrice?: boolean;
  showLabel?: boolean;
  payload?: QRCodePayload;
}

export default function ProductQRCode({
  product,
  size = 200,
  includePrice = true,
  showLabel = true,
  payload,
}: ProductQRCodeProps) {
  const { branding } = useBrandingStore();

  const encodedId = payload?.id ?? product.id;
  const encodedSku = payload?.sku ?? product.sku;
  const encodedName = payload?.name ?? product.name;
  const encodedPrice = payload?.price ?? product.price;
  const encodedVariantId = payload?.variantId;
  const encodedColor = payload?.color;
  const encodedSize = payload?.size;

  const displayVariant = [encodedColor, encodedSize].filter(Boolean).join(' · ');

  const qrData = JSON.stringify({
    type: encodedVariantId ? 'fitness-variant' : 'fitness-product',
    id: encodedId,
    variant_id: encodedVariantId,
    sku: encodedSku,
    name: encodedName,
    color: encodedColor,
    size: encodedSize,
    price: includePrice ? encodedPrice : undefined,
    store: branding.name,
    v: 1,
  });

  return (
    <View style={styles.container}>
      <View style={styles.qrWrapper}>
        <QRCode
          value={qrData}
          size={size}
          color={Colors.light.text}
          backgroundColor="#fff"
          logo={branding.logoUri ? { uri: branding.logoUri } : undefined}
          logoSize={size * 0.18}
          logoBackgroundColor="#fff"
          logoBorderRadius={4}
          quietZone={8}
        />
      </View>
      {showLabel && (
        <View style={styles.label}>
          <Text style={styles.productName} numberOfLines={2}>{encodedName}</Text>
          {displayVariant ? (
            <Text style={styles.variant} numberOfLines={1}>{displayVariant}</Text>
          ) : null}
          <Text style={styles.sku}>{encodedSku || '-'}</Text>
          {includePrice && encodedPrice != null && (
            <Text style={styles.price}>{formatCurrency(encodedPrice)}</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  qrWrapper: {
    padding: theme.spacing.md,
    backgroundColor: '#fff',
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.md,
  },
  label: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  productName: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.text,
    textAlign: 'center',
    maxWidth: 240,
  },
  sku: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    fontFamily: 'monospace',
  },
  variant: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    fontWeight: theme.fontWeight.medium,
  },
  price: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.primary,
  },
});
