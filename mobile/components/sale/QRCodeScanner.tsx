/**
 * QRCodeScanner - Scanner de QR Code para vendas
 *
 * Lê etiquetas de produtos e adiciona ao carrinho automaticamente
 *
 * Fluxo:
 * 1. Abre câmera
 * 2. Lê QR Code da etiqueta
 * 3. Busca produto pelo ID/SKU
 * 4. Mostra confirmação
 * 5. Adiciona ao carrinho
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Dimensions,
  Alert,
} from 'react-native';
import { Text, Button, Card, ActivityIndicator } from 'react-native-paper';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { getProductById, getProductBySku } from '@/services/productService';
import type { Product } from '@/types';

interface QRCodeScannerProps {
  visible: boolean;
  onClose: () => void;
  onProductScanned: (product: Product, quantity: number) => void;
}

interface ScannedData {
  id?: number;
  sku?: string;
  type?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.7;

export default function QRCodeScanner({
  visible,
  onClose,
  onProductScanned,
}: QRCodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Reset ao abrir
  useEffect(() => {
    if (visible) {
      setScanned(false);
      setScannedProduct(null);
      setQuantity(1);
      setError(null);
    }
  }, [visible]);

  // Handler do scan
  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    if (scanned || isLoading) return;

    setScanned(true);
    setIsLoading(true);
    setError(null);

    // Vibrar para feedback
    Vibration.vibrate(100);

    try {
      // Parse do QR Code
      let data: ScannedData;
      try {
        data = JSON.parse(result.data);
      } catch {
        // Se não for JSON, tenta como SKU direto
        data = { sku: result.data };
      }

      // Validar dados
      if (!data.id && !data.sku) {
        throw new Error('QR Code inválido. Use uma etiqueta gerada pelo sistema.');
      }

      // Buscar produto
      let product: Product | null = null;

      if (data.id) {
        product = await getProductById(data.id);
      } else if (data.sku) {
        product = await getProductBySku(data.sku);
      }

      if (!product) {
        throw new Error('Produto não encontrado no sistema.');
      }

      setScannedProduct(product);
    } catch (err: any) {
      setError(err.message || 'Erro ao processar QR Code');
      // Permitir novo scan após erro
      setTimeout(() => setScanned(false), 2000);
    } finally {
      setIsLoading(false);
    }
  };

  // Adicionar ao carrinho
  const handleAddToCart = () => {
    if (scannedProduct) {
      onProductScanned(scannedProduct, quantity);
      onClose();
    }
  };

  // Escanear outro
  const handleScanAnother = () => {
    setScanned(false);
    setScannedProduct(null);
    setQuantity(1);
    setError(null);
  };

  if (!visible) return null;

  // Verificar permissão
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color={Colors.light.textSecondary} />
          <Text style={styles.permissionTitle}>Acesso à Câmera</Text>
          <Text style={styles.permissionText}>
            Precisamos de acesso à câmera para escanear as etiquetas dos produtos.
          </Text>
          <Button mode="contained" onPress={requestPermission} style={styles.permissionButton}>
            Permitir Acesso
          </Button>
          <Button mode="text" onPress={onClose}>
            Cancelar
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Câmera */}
      <CameraView
        style={StyleSheet.absoluteFill}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      />

      {/* Overlay escuro com área de scan */}
      <View style={styles.overlay}>
        {/* Topo */}
        <View style={styles.overlaySection}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.instructions}>
            Aponte a câmera para o QR Code da etiqueta
          </Text>
        </View>

        {/* Área de scan */}
        <View style={styles.scanAreaContainer}>
          <View style={styles.scanArea}>
            {/* Cantos */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Loading */}
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>Buscando produto...</Text>
              </View>
            )}
          </View>
        </View>

        {/* Rodapé */}
        <View style={styles.overlaySection}>
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color={Colors.light.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Modal de produto encontrado */}
      {scannedProduct && (
        <View style={styles.productModal}>
          <Card style={styles.productCard}>
            <Card.Content>
              <View style={styles.productHeader}>
                <Ionicons name="checkmark-circle" size={32} color={Colors.light.success} />
                <Text style={styles.productFoundText}>Produto Encontrado!</Text>
              </View>

              <View style={styles.productInfo}>
                <Text style={styles.productName}>{scannedProduct.name}</Text>
                {(scannedProduct.color || scannedProduct.size) && (
                  <Text style={styles.productVariant}>
                    {[scannedProduct.color, scannedProduct.size].filter(Boolean).join(' - ')}
                  </Text>
                )}
                <Text style={styles.productSku}>SKU: {scannedProduct.sku}</Text>
                <Text style={styles.productPrice}>
                  {new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  }).format(Number(scannedProduct.price))}
                </Text>
              </View>

              {/* Quantidade */}
              <View style={styles.quantitySection}>
                <Text style={styles.quantityLabel}>Quantidade:</Text>
                <View style={styles.quantityControls}>
                  <TouchableOpacity
                    style={styles.quantityButton}
                    onPress={() => setQuantity(Math.max(1, quantity - 1))}
                  >
                    <Ionicons name="remove" size={24} color={Colors.light.primary} />
                  </TouchableOpacity>
                  <Text style={styles.quantityValue}>{quantity}</Text>
                  <TouchableOpacity
                    style={styles.quantityButton}
                    onPress={() => setQuantity(quantity + 1)}
                  >
                    <Ionicons name="add" size={24} color={Colors.light.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Botões */}
              <View style={styles.actionButtons}>
                <Button
                  mode="outlined"
                  onPress={handleScanAnother}
                  style={styles.actionButton}
                  icon="qrcode-scan"
                >
                  Escanear Outro
                </Button>
                <Button
                  mode="contained"
                  onPress={handleAddToCart}
                  style={styles.actionButton}
                  icon="cart-plus"
                >
                  Adicionar
                </Button>
              </View>
            </Card.Content>
          </Card>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },

  // Permissão
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: 20,
    marginBottom: 10,
  },
  permissionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 30,
  },
  permissionButton: {
    marginBottom: 10,
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  overlaySection: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructions: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    marginTop: 60,
  },

  // Área de scan
  scanAreaContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#fff',
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 14,
  },

  // Erro
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  errorText: {
    color: Colors.light.error,
    fontSize: 14,
  },

  // Modal de produto
  productModal: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  productCard: {
    borderRadius: 16,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  productFoundText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.success,
  },
  productInfo: {
    marginBottom: 20,
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  productVariant: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  productSku: {
    fontSize: 12,
    color: Colors.light.textTertiary,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.light.primary,
  },

  // Quantidade
  quantitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    padding: 12,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
  },
  quantityLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.light.text,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
    minWidth: 40,
    textAlign: 'center',
  },

  // Botões
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
});
