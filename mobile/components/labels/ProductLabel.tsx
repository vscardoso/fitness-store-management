/**
 * ProductLabel - Etiqueta de produto com QR Code e logo no centro
 *
 * Recebe widthPx/heightPx que espelham exatamente as dimensões físicas
 * do formato escolhido (mm × PREVIEW_SCALE). O ViewShot captura o grid
 * completo e buildPrintHtml define width/height em mm no HTML para que
 * a impressora respeite as dimensões físicas reais.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
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
  /** Largura em px = widthMm × PREVIEW_SCALE */
  widthPx: number;
  /** Altura em px = heightMm × PREVIEW_SCALE */
  heightPx: number;
  showPrice?: boolean;
  showSku?: boolean;
  showLogo?: boolean;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

export default function ProductLabel({
  data,
  widthPx,
  heightPx,
  showPrice = true,
  showSku = true,
  showLogo = true,
}: ProductLabelProps) {
  const { branding } = useBrandingStore();

  // Tamanhos derivados proporcionalmente das dimensões físicas
  const padding     = Math.max(3, Math.round(Math.min(widthPx, heightPx) * 0.05));
  const innerH      = heightPx - padding * 2;
  const qrSize      = Math.round(innerH * 0.58);
  const logoSize    = Math.round(qrSize * 0.18);
  const nameFontSize  = Math.min(Math.round(innerH * 0.11), 14);
  const priceFontSize = Math.min(Math.round(innerH * 0.15), 18);
  const skuFontSize   = Math.min(Math.round(innerH * 0.08), 10);

  const qrData = JSON.stringify({
    sku: data.sku,
    id: data.productId,
    ...(data.variantId ? { vid: data.variantId } : {}),
    type: 'product',
  });

  const variantLine = [data.color, data.size].filter(Boolean).join(' / ');

  return (
    <View style={[styles.container, { width: widthPx, height: heightPx }]}>
      <View style={[
        styles.label,
        { padding, borderColor: branding.primaryColor + '40' },
      ]}>
        {/* QR Code com logo embutida no centro */}
        <View style={styles.qrWrapper}>
          <QRCode
            value={qrData}
            size={qrSize}
            backgroundColor="white"
            color={Colors.light.text}
            logo={showLogo && branding.logoUri ? { uri: branding.logoUri } : undefined}
            logoSize={logoSize}
            logoBackgroundColor="#fff"
            logoBorderRadius={Math.round(logoSize / 4)}
          />
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={[styles.name, { fontSize: nameFontSize }]} numberOfLines={2}>
            {data.name}
          </Text>
          {variantLine.length > 0 && (
            <Text style={[styles.variant, { fontSize: skuFontSize }]}>
              {variantLine}
            </Text>
          )}
          {showPrice && (
            <Text style={[styles.price, { fontSize: priceFontSize, color: branding.primaryColor }]}>
              {formatPrice(data.price)}
            </Text>
          )}
          {showSku && (
            <Text style={[styles.sku, { fontSize: Math.max(skuFontSize - 1, 6) }]}>
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
    overflow: 'hidden',
  },
  label: {
    flex: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  qrWrapper: {
    backgroundColor: '#fff',
    padding: 1,
  },
  info: {
    alignItems: 'center',
    width: '100%',
    gap: 1,
    paddingHorizontal: 2,
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
    letterSpacing: 0.3,
  },
});
