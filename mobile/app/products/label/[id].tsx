/**
 * Tela de Geração de Etiqueta do Produto
 *
 * Permite:
 * - Visualizar etiqueta com QR Code
 * - Escolher tamanho (P/M/G)
 * - Escolher quantidade
 * - Imprimir ou compartilhar
 */

import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { Text, Button, Card, SegmentedButtons, Chip } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

import { getProductById } from '@/services/productService';
import ProductLabel, { LabelData } from '@/components/labels/ProductLabel';
import { Colors, theme } from '@/constants/Colors';

type LabelSize = 'small' | 'medium' | 'large';

export default function ProductLabelScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const viewShotRef = useRef<ViewShot>(null);

  const [labelSize, setLabelSize] = useState<LabelSize>('medium');
  const [quantity, setQuantity] = useState(1);
  const [showPrice, setShowPrice] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Buscar dados do produto
  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', id],
    queryFn: () => getProductById(Number(id)),
    enabled: !!id,
  });

  const handleShare = async () => {
    if (!viewShotRef.current) return;

    setIsExporting(true);
    try {
      // Capturar a view como imagem
      const uri = await viewShotRef.current.capture?.();

      if (uri) {
        // Compartilhar
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `Etiqueta - ${product?.name}`,
          });
        } else {
          // Fallback para Share nativo
          await Share.share({
            url: uri,
            message: `Etiqueta do produto ${product?.name}`,
          });
        }
      }
    } catch (err) {
      console.error('Erro ao exportar etiqueta:', err);
      Alert.alert('Erro', 'Não foi possível exportar a etiqueta');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    Alert.alert(
      'Imprimir Etiqueta',
      'Para imprimir, compartilhe a imagem e envie para uma impressora compatível ou use um app de impressão.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Compartilhar', onPress: handleShare },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text>Carregando produto...</Text>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={48} color={Colors.light.error} />
        <Text style={styles.errorText}>Produto não encontrado</Text>
        <Button mode="contained" onPress={() => router.back()}>
          Voltar
        </Button>
      </View>
    );
  }

  const labelData: LabelData = {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    price: Number(product.price),
    size: product.size || undefined,
    color: product.color || undefined,
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Gerar Etiqueta</Text>
            <View style={styles.headerPlaceholder} />
          </View>
          <Text style={styles.headerSubtitle}>{product.name}</Text>
        </LinearGradient>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Preview da Etiqueta */}
        <Card style={styles.previewCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Preview</Text>

            <View style={styles.previewContainer}>
              <ViewShot
                ref={viewShotRef}
                options={{ format: 'png', quality: 1 }}
                style={styles.viewShot}
              >
                <View style={styles.labelsGrid}>
                  {Array.from({ length: Math.min(quantity, 4) }).map((_, index) => (
                    <ProductLabel
                      key={index}
                      data={labelData}
                      size={labelSize}
                      showPrice={showPrice}
                      showSku={showSku}
                    />
                  ))}
                </View>
                {quantity > 4 && (
                  <Text style={styles.moreLabelsText}>
                    + {quantity - 4} etiqueta(s)
                  </Text>
                )}
              </ViewShot>
            </View>
          </Card.Content>
        </Card>

        {/* Configurações */}
        <Card style={styles.configCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Configurações</Text>

            {/* Tamanho */}
            <Text style={styles.configLabel}>Tamanho da Etiqueta</Text>
            <SegmentedButtons
              value={labelSize}
              onValueChange={(value) => setLabelSize(value as LabelSize)}
              buttons={[
                { value: 'small', label: 'Pequena' },
                { value: 'medium', label: 'Média' },
                { value: 'large', label: 'Grande' },
              ]}
              style={styles.segmentedButtons}
            />

            {/* Quantidade */}
            <Text style={styles.configLabel}>Quantidade de Etiquetas</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Ionicons name="remove" size={24} color={Colors.light.primary} />
              </TouchableOpacity>
              <Text style={styles.quantityValue}>{quantity}</Text>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantity(Math.min(50, quantity + 1))}
              >
                <Ionicons name="add" size={24} color={Colors.light.primary} />
              </TouchableOpacity>
            </View>

            {/* Opções */}
            <Text style={styles.configLabel}>Exibir na Etiqueta</Text>
            <View style={styles.optionsRow}>
              <Chip
                selected={showPrice}
                onPress={() => setShowPrice(!showPrice)}
                style={styles.optionChip}
                showSelectedOverlay
              >
                💰 Preço
              </Chip>
              <Chip
                selected={showSku}
                onPress={() => setShowSku(!showSku)}
                style={styles.optionChip}
                showSelectedOverlay
              >
                🏷️ SKU
              </Chip>
            </View>
          </Card.Content>
        </Card>

        {/* Info do QR Code */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <View style={styles.infoRow}>
              <Ionicons name="qrcode" size={24} color={Colors.light.info} />
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>QR Code contém:</Text>
                <Text style={styles.infoDetail}>ID: {product.id}</Text>
                <Text style={styles.infoDetail}>SKU: {product.sku}</Text>
              </View>
            </View>
            <Text style={styles.infoHint}>
              Ao escanear na tela de vendas, o produto será identificado automaticamente.
            </Text>
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Footer com botões */}
      <View style={styles.footer}>
        <Button
          mode="outlined"
          onPress={handlePrint}
          icon="printer"
          style={styles.footerButton}
        >
          Imprimir
        </Button>
        <Button
          mode="contained"
          onPress={handleShare}
          icon="share-variant"
          style={styles.footerButton}
          loading={isExporting}
        >
          Compartilhar
        </Button>
      </View>
    </View>
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
    gap: 16,
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: Colors.light.textSecondary,
  },

  // Header
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.md,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.xl,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerPlaceholder: {
    width: 40,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },

  // Content
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: 100,
  },

  // Preview Card
  previewCard: {
    marginBottom: theme.spacing.md,
    borderRadius: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: theme.spacing.md,
  },
  previewContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  viewShot: {
    backgroundColor: '#f5f5f5',
  },
  labelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  moreLabelsText: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
  },

  // Config Card
  configCard: {
    marginBottom: theme.spacing.md,
    borderRadius: 16,
  },
  configLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.light.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  segmentedButtons: {
    marginBottom: theme.spacing.sm,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  quantityButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
    minWidth: 50,
    textAlign: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  optionChip: {
    flex: 1,
  },

  // Info Card
  infoCard: {
    borderRadius: 16,
    backgroundColor: Colors.light.info + '10',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  infoDetail: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: 'monospace',
  },
  infoHint: {
    fontSize: 12,
    color: Colors.light.info,
    fontStyle: 'italic',
    marginTop: 8,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  footerButton: {
    flex: 1,
  },
});
