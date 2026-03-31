/**
 * ProductLabel - Etiqueta de produto com QR Code e logo da loja
 *
 * Gera uma etiqueta impressa com:
 * - Logo da loja (quando configurado)
 * - QR Code do produto (SKU, ID, variante)
 * - Nome, Preço, SKU, Variação
 *
 * Pode ser exportada como imagem via ViewShot.
 */

import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Text } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingStore } from '@/store/brandingStore';

export interface LabelData {
  productId: number;
  variantId?: number;
  sku: string;
  name: string;
  price: number;
  size?: string;
  color?: string;
}

interface ProductLabelProps {
  data: LabelData;
  size?: 'small' | 'medium' | 'large';
  showPrice?: boolean;
  showSku?: boolean;
  showLogo?: boolean;
}

const SIZES = {
  small:  { width: 150, qrSize: 52,  nameFontSize: 9,  priceFontSize: 12, skuFontSize: 8,  logoSize: 14, padding: 6  },
  medium: { width: 200, qrSize: 72,  nameFontSize: 11, priceFontSize: 15, skuFontSize: 9,  logoSize: 18, padding: 10 },
  large:  { width: 280, qrSize: 104, nameFontSize: 13, priceFontSize: 19, skuFontSize: 11, logoSize: 24, padding: 14 },
};

const formatPrice = (price: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

export default function ProductLabel({
  data,
  size = 'medium',
  showPrice = true,
  showSku = true,
  showLogo = true,
}: ProductLabelProps) {
  const { branding } = useBrandingStore();
  const dim = SIZES[size];

  const qrData = JSON.stringify({
    sku: data.sku,
    id: data.productId,
    ...(data.variantId ? { vid: data.variantId } : {}),
    type: 'product',
  });

  const variantLine = [data.color, data.size].filter(Boolean).join(' / ');

  return (
    <View style={[styles.container, { width: dim.width }]}>
      <View style={[styles.label, { padding: dim.padding, borderColor: branding.primaryColor + '40' }]}>

        {/* Header: logo + nome da loja */}
        {showLogo && (
          <View style={styles.header}>
            {branding.logoUri ? (
              <Image
                source={{ uri: branding.logoUri }}
                style={[styles.logo, { width: dim.logoSize, height: dim.logoSize, borderRadius: dim.logoSize / 2 }]}
              />
            ) : null}
            <Text style={[styles.storeName, { fontSize: dim.skuFontSize, color: branding.primaryColor }]}
              numberOfLines={1}>
              {branding.name}
            </Text>
          </View>
        )}

        {/* QR Code */}
        <View style={styles.qrWrapper}>
          <QRCode
            value={qrData}
            size={dim.qrSize}
            backgroundColor="white"
            color={Colors.light.text}
          />
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={[styles.name, { fontSize: dim.nameFontSize }]} numberOfLines={2}>
            {data.name}
          </Text>
          {variantLine.length > 0 && (
            <Text style={[styles.variant, { fontSize: dim.skuFontSize }]}>
              {variantLine}
            </Text>
          )}
          {showPrice && (
            <Text style={[styles.price, { fontSize: dim.priceFontSize, color: branding.primaryColor }]}>
              {formatPrice(data.price)}
            </Text>
          )}
          {showSku && (
            <Text style={[styles.sku, { fontSize: dim.skuFontSize - 1 }]}>
              {data.sku}
            </Text>
          )}
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 4,
  },
  label: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    gap: 6,
  },
  header: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    alignSelf: 'center',
    width: '100%',
  },
  logo: {
    resizeMode: 'cover',
  },
  storeName: {
    fontWeight: theme.fontWeight.bold,
    textAlign: 'center',
    width: '100%',
  },
  qrWrapper: {
    backgroundColor: '#fff',
    padding: 2,
  },
  info: {
    alignItems: 'center',
    width: '100%',
    gap: 2,
  },
  name: {
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.text,
    textAlign: 'center',
  },
  variant: {
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  price: {
    fontWeight: theme.fontWeight.extrabold,
  },
  sku: {
    fontFamily: 'monospace',
    color: Colors.light.textSecondary,
    letterSpacing: 0.5,
  },
});
