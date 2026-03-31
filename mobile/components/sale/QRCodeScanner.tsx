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
  /** Retorna quantas unidades desse item já estão no carrinho */
  getCartQuantity?: (product: Product) => number;
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
  getCartQuantity,
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
      // Prioridade: SKU (estável) > ID (pode mudar ao recriar banco)
      let product: Product | null = null;

      if (data.sku) {
        try {
          product = await getProductBySku(data.sku);
        } catch {
          // SKU não encontrado — tenta por ID como último recurso
          if (data.id) {
            product = await getProductById(data.id);
          }
        }
      } else if (data.id) {
        product = await getProductById(data.id);
      }

      if (!product) {
        throw new Error('Produto não encontrado. Verifique se o cadastro ainda existe.');
      }

      // Quando o scan veio por SKU de variante, preserva a variação no payload
      if (data.sku && Array.isArray((product as any).variants)) {
        const matchedVariant = (product as any).variants.find(
          (variant: any) => variant?.sku === data.sku
        );

        if (matchedVariant) {
          const labelParts = [matchedVariant.size, matchedVariant.color].filter(Boolean);
          product = {
            ...product,
            sku: matchedVariant.sku || data.sku,
            price: Number(matchedVariant.price ?? product.price),
            current_stock: Number(matchedVariant.current_stock ?? 0),
            size: matchedVariant.size ?? product.size,
            color: matchedVariant.color ?? product.color,
            variant_id: matchedVariant.id,
            variant_label: labelParts.length > 0 ? labelParts.join(' / ') : undefined,
          } as Product;
        }
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
                <View style={styles.productHeaderIconWrap}>
                  <Ionicons name="checkmark-circle" size={24} color={Colors.light.success} />
                </View>
                <View style={styles.productHeaderTextWrap}>
                  <Text style={styles.productFoundText}>Produto encontrado</Text>
                  <Text style={styles.productFoundSubtext}>Confirme os dados e a quantidade para adicionar</Text>
                </View>
              </View>

              <View style={styles.productInfo}>
                <Text style={styles.productName}>{scannedProduct.name}</Text>
                <View style={styles.productMetaRow}>
                  {(scannedProduct.color || scannedProduct.size) && (
                    <View style={styles.metaChip}>
                      <Ionicons name="color-filter-outline" size={12} color={Colors.light.info} />
                      <Text style={styles.metaChipText}>
                        {[scannedProduct.color, scannedProduct.size].filter(Boolean).join(' • ')}
                      </Text>
                    </View>
                  )}
                  <View style={styles.metaChip}>
                    <Ionicons name="barcode-outline" size={12} color={Colors.light.textSecondary} />
                    <Text style={styles.metaChipText}>SKU {scannedProduct.sku}</Text>
                  </View>
                </View>
                <Text style={styles.productPrice}>
                  {new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  }).format(Number(scannedProduct.price))}
                </Text>
              </View>

              {/* Quantidade */}
              {(() => {
                const totalStock = scannedProduct.current_stock ?? 0;
                const inCart = getCartQuantity ? getCartQuantity(scannedProduct) : 0;
                const available = Math.max(0, totalStock - inCart);
                const atLimit = quantity >= available;
                const outOfStock = available === 0;
                return (
                  <View style={styles.quantitySection}>
                    <View style={styles.quantityLabelRow}>
                      <Text style={styles.quantityLabel}>Quantidade</Text>
                      <View style={[styles.stockBadgeInline, outOfStock && styles.stockBadgeInlineEmpty]}>
                        <Ionicons
                          name={outOfStock ? 'alert-circle-outline' : 'cube-outline'}
                          size={12}
                          color={outOfStock ? Colors.light.error : Colors.light.success}
                        />
                        <Text style={[styles.stockInfo, outOfStock && styles.stockInfoEmpty]}>
                        {outOfStock
                          ? 'Sem estoque disponível'
                          : `${available} disponível${available !== 1 ? 'is' : ''}${inCart > 0 ? ` (${inCart} no carrinho)` : ''}`}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.quantityControls}>
                      <TouchableOpacity
                        style={[styles.quantityButton, quantity <= 1 && styles.quantityButtonDisabled]}
                        onPress={() => setQuantity(Math.max(1, quantity - 1))}
                        disabled={quantity <= 1}
                      >
                        <Ionicons name="remove" size={24} color={quantity <= 1 ? Colors.light.textTertiary : Colors.light.primary} />
                      </TouchableOpacity>
                      <Text style={[styles.quantityValue, outOfStock && styles.quantityValueEmpty]}>{quantity}</Text>
                      <TouchableOpacity
                        style={[styles.quantityButton, atLimit && styles.quantityButtonDisabled]}
                        onPress={() => !atLimit && setQuantity(quantity + 1)}
                        disabled={atLimit}
                      >
                        <Ionicons name="add" size={24} color={atLimit ? Colors.light.textTertiary : Colors.light.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}

              {/* Botões */}
              {(() => {
                const totalStock = scannedProduct.current_stock ?? 0;
                const inCart = getCartQuantity ? getCartQuantity(scannedProduct) : 0;
                const available = Math.max(0, totalStock - inCart);
                return (
                  <View style={styles.actionButtons}>
                    <Button
                      mode="outlined"
                      onPress={handleScanAnother}
                      style={[styles.actionButton, styles.secondaryActionButton]}
                      contentStyle={styles.actionButtonContent}
                      labelStyle={[styles.actionButtonLabel, styles.secondaryActionButtonLabel]}
                      icon="qrcode-scan"
                    >
                      Escanear Outro
                    </Button>
                    <Button
                      mode="contained"
                      onPress={handleAddToCart}
                      style={[styles.actionButton, styles.primaryActionButton]}
                      contentStyle={styles.actionButtonContent}
                      labelStyle={[styles.actionButtonLabel, styles.primaryActionButtonLabel]}
                      icon="cart-plus"
                      disabled={available === 0}
                      buttonColor={Colors.light.success}
                    >
                      Adicionar
                    </Button>
                  </View>
                );
              })()}
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
    backgroundColor: 'rgba(0,0,0,0.74)',
    justifyContent: 'center',
    padding: 20,
  },
  productCard: {
    borderRadius: theme.borderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  productHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  productHeaderTextWrap: {
    flex: 1,
  },
  productFoundText: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: Colors.light.text,
    marginBottom: 2,
  },
  productFoundSubtext: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },
  productInfo: {
    marginBottom: 16,
  },
  productName: {
    fontSize: theme.fontSize.base,
    fontWeight: '800',
    color: Colors.light.text,
    marginBottom: 4,
  },
  productMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  metaChipText: {
    fontSize: 10,
    color: Colors.light.textSecondary,
    fontWeight: '700',
  },
  productPrice: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '800',
    color: Colors.light.primary,
  },

  // Quantidade
  quantitySection: {
    marginBottom: 18,
    padding: 12,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  quantityLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  quantityLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
  },
  stockBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.successLight,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stockBadgeInlineEmpty: {
    backgroundColor: Colors.light.errorLight,
  },
  stockInfo: {
    fontSize: 11,
    color: Colors.light.success,
    fontWeight: '700',
  },
  stockInfoEmpty: {
    color: Colors.light.error,
    fontWeight: '700',
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
  quantityButtonDisabled: {
    backgroundColor: Colors.light.backgroundSecondary,
  },
  quantityValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
    minWidth: 40,
    textAlign: 'center',
  },
  quantityValueEmpty: {
    color: Colors.light.textTertiary,
  },

  // Botões
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
  },
  actionButtonContent: {
    height: 46,
  },
  actionButtonLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  secondaryActionButton: {
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  secondaryActionButtonLabel: {
    color: Colors.light.textSecondary,
  },
  primaryActionButton: {
    borderWidth: 0,
  },
  primaryActionButtonLabel: {
    color: '#fff',
  },
});
