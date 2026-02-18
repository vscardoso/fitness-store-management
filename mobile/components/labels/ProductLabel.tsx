/**
 * ProductLabel - Componente visual da etiqueta de produto
 *
 * Gera uma etiqueta com:
 * - QR Code (contém ID e SKU do produto)
 * - Nome do produto
 * - Preço
 * - SKU
 *
 * Pode ser exportada como imagem ou impressa
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { Colors, theme } from '@/constants/Colors';

export interface LabelData {
  productId: number;
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
}

const SIZES = {
  small: { width: 150, qrSize: 60, fontSize: 10 },
  medium: { width: 200, qrSize: 80, fontSize: 12 },
  large: { width: 280, qrSize: 120, fontSize: 14 },
};

export default function ProductLabel({
  data,
  size = 'medium',
  showPrice = true,
  showSku = true,
}: ProductLabelProps) {
  const dimensions = SIZES[size];

  // Dados codificados no QR Code
  const qrData = JSON.stringify({
    id: data.productId,
    sku: data.sku,
    type: 'product',
  });

  // Formatar preço
  const formattedPrice = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(data.price);

  // Montar nome completo
  const fullName = [data.name, data.color, data.size].filter(Boolean).join(' - ');

  return (
    <View style={[styles.container, { width: dimensions.width }]}>
      {/* Borda pontilhada para indicar área de corte */}
      <View style={styles.cutLine}>
        {/* QR Code */}
        <View style={styles.qrContainer}>
          <QRCode
            value={qrData}
            size={dimensions.qrSize}
            backgroundColor="white"
            color="black"
          />
        </View>

        {/* Informações do produto */}
        <View style={styles.infoContainer}>
          <Text
            style={[styles.productName, { fontSize: dimensions.fontSize }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {fullName}
          </Text>

          {showPrice && (
            <Text style={[styles.price, { fontSize: dimensions.fontSize + 4 }]}>
              {formattedPrice}
            </Text>
          )}

          {showSku && (
            <Text style={[styles.sku, { fontSize: dimensions.fontSize - 2 }]}>
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
    padding: 8,
  },
  cutLine: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    borderRadius: 4,
    padding: 12,
    alignItems: 'center',
  },
  qrContainer: {
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  infoContainer: {
    alignItems: 'center',
    width: '100%',
  },
  productName: {
    fontWeight: '600',
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  price: {
    fontWeight: '800',
    color: Colors.light.primary,
    marginBottom: 4,
  },
  sku: {
    fontFamily: 'monospace',
    color: Colors.light.textSecondary,
    letterSpacing: 1,
  },
});
