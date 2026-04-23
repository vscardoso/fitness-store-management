import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { getProductById } from '@/services/productService';
import { formatVariantLabel, getProductVariants } from '@/services/productVariantService';
import PageHeader from '@/components/layout/PageHeader';
import useBackToList from '@/hooks/useBackToList';
import ProductLabel, { LabelData } from '@/components/labels/ProductLabel';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { ProductVariant } from '@/types/productVariant';

type LegacyFileSystemWithEncoding = typeof LegacyFileSystem & {
  EncodingType?: {
    Base64?: string;
  };
};

interface LabelFormat {
  id: string;
  label: string;
  perSheet: number;
  description: string;
  widthMm: number;
  heightMm: number;
  cols: number;
}

interface FormatMetrics {
  sheets: number;
  remainder: number;
  utilization: number;
}

// Formatos baseados em folhas PIMACO padrão A4
const LABEL_FORMATS: LabelFormat[] = [
  { id: 'f10', label: '10/fl', perSheet: 10, description: '2×5 · 99×57mm',  widthMm: 99.1, heightMm: 57.0, cols: 2 },
  { id: 'f14', label: '14/fl', perSheet: 14, description: '2×7 · 99×38mm',  widthMm: 99.1, heightMm: 38.1, cols: 2 },
  { id: 'f21', label: '21/fl', perSheet: 21, description: '3×7 · 64×38mm',  widthMm: 63.5, heightMm: 38.1, cols: 3 },
  { id: 'f33', label: '33/fl', perSheet: 33, description: '3×11 · 64×30mm', widthMm: 63.5, heightMm: 29.6, cols: 3 },
  { id: 'f65', label: '65/fl', perSheet: 65, description: '5×13 · 38×21mm', widthMm: 38.1, heightMm: 21.2, cols: 5 },
];

// Escala de preview: 3px por mm → qualidade suficiente para captura via ViewShot
const PREVIEW_SCALE = 3;

export default function ProductQRCodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/products');
  const brandingColors = useBrandingColors();
  const labelCaptureRef = React.useRef<ViewShot | null>(null) as React.RefObject<ViewShot>;
  const [formatId, setFormatId] = React.useState('f14');
  const [autoBestFormat, setAutoBestFormat] = React.useState(true);
  const [showPrice, setShowPrice] = React.useState(true);
  const [showSku, setShowSku] = React.useState(true);
  const [isPrinting, setIsPrinting] = React.useState(false);

  const base64Encoding =
    (LegacyFileSystem as LegacyFileSystemWithEncoding).EncodingType?.Base64 ?? 'base64';

  const headerOpacity = useSharedValue(0);
  const headerScale = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY = useSharedValue(24);

  useFocusEffect(
    React.useCallback(() => {
      headerOpacity.value = 0;
      headerScale.value = 0.94;
      contentOpacity.value = 0;
      contentTransY.value = 24;

      headerOpacity.value = withTiming(1, {
        duration: 380,
        easing: Easing.out(Easing.quad),
      });
      headerScale.value = withSpring(1, { damping: 18, stiffness: 200 });

      contentOpacity.value = withTiming(1, {
        duration: 480,
        easing: Easing.out(Easing.quad),
      });
      contentTransY.value = withSpring(0, { damping: 20, stiffness: 180 });
    }, [contentOpacity, contentTransY, headerOpacity, headerScale])
  );

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  const [selectedVariantId, setSelectedVariantId] = React.useState<number | null>(null);
  const [selectedLabelVariantIds, setSelectedLabelVariantIds] = React.useState<number[]>([]);

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => getProductById(Number(id)),
    enabled: !!id,
  });

  const { data: variants, isLoading: isVariantsLoading } = useQuery({
    queryKey: ['product-variants', id],
    queryFn: () => getProductVariants(Number(id)),
    enabled: !!id,
  });

  const activeVariants = React.useMemo(
    () => (variants || []).filter((variant) => variant.is_active !== false),
    [variants]
  );

  const hasVariants = activeVariants.length > 0;

  React.useEffect(() => {
    if (!hasVariants) {
      setSelectedVariantId(null);
      setSelectedLabelVariantIds([]);
      return;
    }

    setSelectedVariantId((current) => {
      if (current && activeVariants.some((variant) => variant.id === current)) {
        return current;
      }
      return activeVariants[0].id;
    });

    setSelectedLabelVariantIds((current) => {
      const validIds = current.filter((id) => activeVariants.some((variant) => variant.id === id));
      if (validIds.length > 0) {
        return validIds;
      }
      return [activeVariants[0].id];
    });
  }, [activeVariants, hasVariants]);

  const selectedVariant: ProductVariant | null = React.useMemo(() => {
    if (!hasVariants) return null;
    return activeVariants.find((variant) => variant.id === selectedVariantId) || activeVariants[0] || null;
  }, [activeVariants, hasVariants, selectedVariantId]);

  const selectedFormat = React.useMemo(
    () => LABEL_FORMATS.find((format) => format.id === formatId) || LABEL_FORMATS[1],
    [formatId]
  );

  const labelData: LabelData | undefined = React.useMemo(() => {
    if (!product) return undefined;

    if (!selectedVariant) {
      return {
        productId: product.id,
        sku: product.sku || '-',
        name: product.name,
        price: Number(product.price || 0),
      };
    }

    return {
      productId: product.id,
      variantId: selectedVariant.id,
      sku: selectedVariant.sku || product.sku || '-',
      name: `${product.name} - ${formatVariantLabel(selectedVariant)}`,
      price: Number(selectedVariant.price || 0),
      color: selectedVariant.color || undefined,
      size: selectedVariant.size || undefined,
    };
  }, [product, selectedVariant]);

  const labelItems: LabelData[] = React.useMemo(() => {
    if (!product) return [];

    if (hasVariants) {
      const selectedVariants = activeVariants.filter((variant) =>
        selectedLabelVariantIds.includes(variant.id)
      );

      const variantsToRender =
        selectedVariants.length > 0
          ? selectedVariants
          : selectedVariant
            ? [selectedVariant]
            : [activeVariants[0]];

      return variantsToRender.map((variant) => ({
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku || product.sku || '-',
        name: `${product.name} - ${formatVariantLabel(variant)}`,
        price: Number(variant.price || 0),
        color: variant.color || undefined,
        size: variant.size || undefined,
      }));
    }

    return labelData ? [labelData] : [];
  }, [activeVariants, hasVariants, labelData, product, selectedLabelVariantIds, selectedVariant]);

  const totalLabelItems = labelItems.length;

  const getFormatMetrics = React.useCallback((perSheet: number): FormatMetrics => {
    if (totalLabelItems <= 0) {
      return { sheets: 0, remainder: 0, utilization: 0 };
    }

    const sheets = Math.ceil(totalLabelItems / perSheet);
    const remainder = (perSheet - (totalLabelItems % perSheet)) % perSheet;
    const usedOnLastSheet = remainder === 0 ? perSheet : perSheet - remainder;
    const utilization = Math.round((usedOnLastSheet / perSheet) * 100);

    return { sheets, remainder, utilization };
  }, [totalLabelItems]);

  const bestFormatId = React.useMemo(() => {
    if (totalLabelItems <= 0) return undefined;

    return LABEL_FORMATS
      .map((format) => ({ format, metrics: getFormatMetrics(format.perSheet) }))
      .sort((a, b) => {
        if (a.metrics.sheets !== b.metrics.sheets) {
          return a.metrics.sheets - b.metrics.sheets;
        }
        if (a.metrics.remainder !== b.metrics.remainder) {
          return a.metrics.remainder - b.metrics.remainder;
        }
        return b.metrics.utilization - a.metrics.utilization;
      })[0]?.format.id;
  }, [getFormatMetrics, totalLabelItems]);

  React.useEffect(() => {
    if (!autoBestFormat) return;
    if (!bestFormatId) return;
    if (bestFormatId !== formatId) {
      setFormatId(bestFormatId);
    }
  }, [autoBestFormat, bestFormatId, formatId]);

  const selectedFormatMetrics = React.useMemo(
    () => getFormatMetrics(selectedFormat.perSheet),
    [getFormatMetrics, selectedFormat.perSheet]
  );

  const toggleLabelVariant = (variantId: number) => {
    setSelectedLabelVariantIds((current) => {
      const alreadySelected = current.includes(variantId);
      if (alreadySelected) {
        if (current.length <= 1) return current;
        return current.filter((id) => id !== variantId);
      }
      return [...current, variantId];
    });
  };

  const selectAllLabelVariants = () => {
    setSelectedLabelVariantIds(activeVariants.map((variant) => variant.id));
  };

  const captureCardUri = async (ref: React.RefObject<ViewShot>, unavailableMessage: string) => {
    if (!ref.current) {
      throw new Error(unavailableMessage);
    }

    if (typeof ref.current.capture === 'function') {
      return ref.current.capture();
    }

    return captureRef(ref.current, { format: 'png', quality: 1 });
  };

  const isPrintCancelledError = (error: unknown) => {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return (
      message.includes('printing did not complete') ||
      message.includes('did not complete') ||
      message.includes('cancel')
    );
  };

  const buildPrintHtml = (base64: string, title: string, gridWidthMm: number, gridHeightMm: number) => {
    const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            @page { margin: 0; size: auto; }
            body { margin: 0; padding: 0; background: #ffffff; }
            img {
              display: block;
              width: ${gridWidthMm.toFixed(1)}mm;
              height: ${gridHeightMm.toFixed(1)}mm;
            }
          </style>
        </head>
        <body>
          <img src="data:image/png;base64,${base64}" alt="${safeTitle}" />
        </body>
      </html>
    `;
  };

  const handleShare = async () => {
    if (!product) return;

    try {
      const uri = await captureCardUri(
        labelCaptureRef,
        'Preview da etiqueta indisponivel no momento.'
      );
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Compartilhamento não disponível neste dispositivo.');
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle:
          hasVariants && labelItems.length > 1
            ? `Etiquetas - ${product.name}`
            : selectedVariant
              ? `Etiqueta - ${formatVariantLabel(selectedVariant)}`
              : `Etiqueta - ${product.name}`,
      });
    } catch {
      Alert.alert('Erro', 'Não foi possível compartilhar a etiqueta.');
    }
  };

  const handlePrint = async () => {
    if (!product) return;

    setIsPrinting(true);
    try {
      const uri = await captureCardUri(
        labelCaptureRef,
        'Preview da etiqueta indisponivel no momento.'
      );
      const base64 = await LegacyFileSystem.readAsStringAsync(uri, {
        encoding: base64Encoding as any,
      });

      const printTitle =
        hasVariants && labelItems.length > 1
          ? `Etiquetas - ${product.name} - ${labelItems.length} variacoes - ${selectedFormat.label}`
          : selectedVariant
            ? `Etiqueta - ${product.name} - ${formatVariantLabel(selectedVariant)} - ${selectedFormat.label}`
            : `Etiqueta - ${product.name} - ${selectedFormat.label}`;

      // Dimensões físicas exatas do grid para impressão precisa
      const rows = Math.ceil(Math.max(labelItems.length, 1) / selectedFormat.cols);
      const gridWidthMm = selectedFormat.cols * selectedFormat.widthMm;
      const gridHeightMm = rows * selectedFormat.heightMm;

      await Print.printAsync({
        html: buildPrintHtml(base64, printTitle, gridWidthMm, gridHeightMm),
      });
    } catch (printError) {
      if (isPrintCancelledError(printError)) {
        setIsPrinting(false);
        return;
      }

      try {
        const uri = await captureCardUri(
          labelCaptureRef,
          'Preview da etiqueta indisponivel no momento.'
        );
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: 'Etiqueta',
          });
        } else {
          Alert.alert('Erro', 'Nao foi possivel abrir a impressao nem compartilhar.');
        }
      } catch {
        Alert.alert('Erro', 'Nao foi possivel imprimir.');
      }
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Etiqueta"
          subtitle={
            product
              ? hasVariants
                ? `${product.name} · ${activeVariants.length} variação${activeVariants.length !== 1 ? 'ões' : ''}`
                : product.name
              : 'Gerar etiquetas do produto'
          }
          showBackButton
          onBack={goBack}
        />
      </Animated.View>

      <Animated.View style={[styles.scrollWrap, contentAnimStyle]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {isLoading && (
            <View style={styles.stateCard}>
              <ActivityIndicator size="small" color={brandingColors.primary} />
              <Text style={styles.stateTitle}>Carregando etiqueta...</Text>
              <Text style={styles.stateSubtitle}>Buscando dados do produto.</Text>
            </View>
          )}

          {!isLoading && !product && (
            <View style={styles.stateCard}>
              <Ionicons name="alert-circle-outline" size={26} color={Colors.light.warning} />
              <Text style={styles.stateTitle}>Produto não encontrado</Text>
              <Text style={styles.stateSubtitle}>Não foi possível carregar os dados para esse QR Code.</Text>
            </View>
          )}

          {product && (
            <>
              {hasVariants && (
                <View style={styles.variantsCard}>
                  <View style={styles.variantsHeader}>
                    <Ionicons name="layers-outline" size={18} color={brandingColors.primary} />
                    <Text style={styles.variantsTitle}>
                      Selecionar variações
                    </Text>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.variantsList}>
                    {activeVariants.map((variant) => {
                      const selected = selectedLabelVariantIds.includes(variant.id);
                      return (
                        <TouchableOpacity
                          key={variant.id}
                          style={[
                            styles.variantChip,
                            selected && {
                              borderColor: brandingColors.primary,
                              backgroundColor: brandingColors.primary + '12',
                            },
                          ]}
                          onPress={() => toggleLabelVariant(variant.id)}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.variantChipTitle, selected && { color: brandingColors.primary }]} numberOfLines={1}>
                            {formatVariantLabel(variant)}
                          </Text>
                          <Text style={styles.variantChipSku} numberOfLines={1}>{variant.sku}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.variantActionsRow}>
                    <TouchableOpacity
                      style={styles.variantActionButton}
                      onPress={selectAllLabelVariants}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="checkmark-done-outline" size={14} color={brandingColors.primary} />
                      <Text style={[styles.variantActionText, { color: brandingColors.primary }]}>Selecionar todas</Text>
                    </TouchableOpacity>

                    <Text style={styles.variantActionSummary}>
                      {selectedLabelVariantIds.length} de {activeVariants.length} selecionadas
                    </Text>
                  </View>
                </View>
              )}

              {labelData && (
                <>
                  <View style={styles.labelOptionsCard}>
                    <Text style={styles.labelOptionsTitle}>Configuração da Etiqueta</Text>

                    <View style={styles.formatRow}>
                      {LABEL_FORMATS.map((format) => {
                        const selected = format.id === formatId;
                        const isBest = format.id === bestFormatId;
                        const metrics = getFormatMetrics(format.perSheet);
                        return (
                          <TouchableOpacity
                            key={format.id}
                            style={[
                              styles.formatChip,
                              selected && {
                                borderColor: brandingColors.primary,
                                backgroundColor: brandingColors.primary + '12',
                              },
                            ]}
                            onPress={() => {
                              setAutoBestFormat(false);
                              setFormatId(format.id);
                            }}
                            activeOpacity={0.75}
                          >
                            <View style={styles.formatChipTop}>
                              <Text style={[styles.formatChipText, selected && { color: brandingColors.primary }]}>
                                {format.label}
                              </Text>
                              {isBest && totalLabelItems > 0 && (
                                <View style={styles.bestChip}>
                                  <Text style={styles.bestChipText}>Melhor</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.formatChipSub, selected && { color: brandingColors.primary + 'CC' }]}>
                              {format.description}
                            </Text>
                            <Text style={styles.formatChipMeta}>
                              {metrics.sheets > 0
                                ? `${metrics.sheets} folha${metrics.sheets !== 1 ? 's' : ''} · ${metrics.remainder} vaga${metrics.remainder !== 1 ? 's' : ''}`
                                : 'sem etiquetas'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {totalLabelItems > 0 && (
                      <View style={styles.bestFormatHint}>
                        <Ionicons name="sparkles-outline" size={14} color={brandingColors.primary} />
                        <Text style={styles.bestFormatHintText}>
                          Recomendado agora: {LABEL_FORMATS.find((format) => format.id === bestFormatId)?.label || selectedFormat.label}
                          {' · '}
                          {selectedFormatMetrics.sheets} folha{selectedFormatMetrics.sheets !== 1 ? 's' : ''}
                          {' · '}
                          {selectedFormatMetrics.remainder} vaga{selectedFormatMetrics.remainder !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.autoModeChip,
                        autoBestFormat && {
                          borderColor: brandingColors.primary,
                          backgroundColor: brandingColors.primary + '14',
                        },
                      ]}
                      onPress={() => {
                        const nextValue = !autoBestFormat;
                        setAutoBestFormat(nextValue);
                        if (nextValue && bestFormatId) {
                          setFormatId(bestFormatId);
                        }
                      }}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={autoBestFormat ? 'lock-open-outline' : 'lock-closed-outline'}
                        size={13}
                        color={autoBestFormat ? brandingColors.primary : Colors.light.textSecondary}
                      />
                      <Text
                        style={[
                          styles.autoModeChipText,
                          autoBestFormat && { color: brandingColors.primary },
                        ]}
                      >
                        {autoBestFormat ? 'Auto recomendado' : 'Formato travado'}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.toggleRow}>
                      <TouchableOpacity
                        style={[
                          styles.toggleChip,
                          showPrice && {
                            backgroundColor: brandingColors.primary,
                            borderColor: brandingColors.primary,
                          },
                        ]}
                        onPress={() => setShowPrice((v) => !v)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="cash-outline" size={14} color={showPrice ? '#fff' : Colors.light.textSecondary} />
                        <Text style={[styles.toggleChipText, showPrice && styles.toggleChipTextActive]}>Preço</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.toggleChip,
                          showSku && {
                            backgroundColor: brandingColors.primary,
                            borderColor: brandingColors.primary,
                          },
                        ]}
                        onPress={() => setShowSku((v) => !v)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="barcode-outline" size={14} color={showSku ? '#fff' : Colors.light.textSecondary} />
                        <Text style={[styles.toggleChipText, showSku && styles.toggleChipTextActive]}>SKU</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.labelCard}>
                    <ViewShot
                      ref={labelCaptureRef}
                      options={{ format: 'png', quality: 1 }}
                      style={styles.labelShot}
                    >
                      <View style={styles.labelGrid}>
                        {labelItems.map((item, index) => (
                          <ProductLabel
                            key={`${item.variantId ?? 'base'}-${index}`}
                            data={item}
                            widthPx={Math.round(selectedFormat.widthMm * PREVIEW_SCALE)}
                            heightPx={Math.round(selectedFormat.heightMm * PREVIEW_SCALE)}
                            showPrice={showPrice}
                            showSku={showSku}
                          />
                        ))}
                      </View>
                    </ViewShot>
                  </View>
                </>
              )}

              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>Conteúdo da etiqueta</Text>
                <Text style={styles.infoRow} numberOfLines={1}>ID: {product.id}</Text>
                <Text style={styles.infoRow} numberOfLines={1}>Formato: {selectedFormat.label} · {selectedFormat.description}</Text>
                {hasVariants ? (
                  <Text style={styles.infoRow} numberOfLines={1}>
                    Variações selecionadas: {labelItems.length}
                  </Text>
                ) : selectedVariant ? (
                  <Text style={styles.infoRow} numberOfLines={2}>
                    Variação: {formatVariantLabel(selectedVariant)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.primaryAction}
                  activeOpacity={0.8}
                  onPress={handleShare}
                >
                  <View style={[styles.primaryActionGradient, { backgroundColor: brandingColors.primary }]}> 
                    <Ionicons
                      name="download-outline"
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.primaryActionText}>
                      {hasVariants && labelItems.length > 1
                        ? 'Exportar Etiquetas'
                        : 'Exportar Etiqueta'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryAction}
                  activeOpacity={0.75}
                  onPress={handlePrint}
                  disabled={isPrinting}
                >
                  <Ionicons name="print-outline" size={18} color={Colors.light.textSecondary} />
                  <Text style={styles.secondaryActionText}>
                    {isPrinting
                      ? 'Imprimindo...'
                      : hasVariants && labelItems.length > 1
                        ? 'Imprimir Etiquetas'
                        : 'Imprimir Etiqueta'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  scrollWrap: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  variantsCard: {
    width: '100%',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  variantsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  variantsTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  variantsList: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.xs,
  },
  variantChip: {
    minWidth: 132,
    maxWidth: 180,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: 2,
  },
  variantChipTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.text,
  },
  variantChipSku: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontFamily: 'monospace',
  },
  actions: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  primaryAction: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  primaryActionGradient: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  primaryActionText: {
    color: '#fff',
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.bold,
  },
  secondaryAction: {
    minHeight: 50,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  secondaryActionText: {
    fontSize: theme.fontSize.base,
    color: Colors.light.textSecondary,
    fontWeight: theme.fontWeight.semibold,
  },
  infoCard: {
    width: '100%',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    ...theme.shadows.sm,
  },
  infoTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  infoRow: {
    fontSize: theme.fontSize.md,
    color: Colors.light.text,
  },
  stateCard: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  stateTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.text,
  },
  stateSubtitle: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  labelOptionsCard: {
    width: '100%',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  labelOptionsTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  formatChip: {
    width: '31%',
    minWidth: 92,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  formatChipTop: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  formatChipText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.text,
    fontWeight: theme.fontWeight.bold,
  },
  formatChipSub: {
    marginTop: 2,
    fontSize: 10,
    color: Colors.light.textSecondary,
    fontWeight: theme.fontWeight.medium,
    textAlign: 'center',
  },
  formatChipMeta: {
    marginTop: 2,
    fontSize: 9,
    color: Colors.light.textTertiary,
    fontWeight: theme.fontWeight.medium,
    textAlign: 'center',
  },
  bestChip: {
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: Colors.light.success + '20',
    borderWidth: 1,
    borderColor: Colors.light.success + '45',
  },
  bestChipText: {
    fontSize: 8,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.success,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  bestFormatHint: {
    minHeight: 36,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  bestFormatHintText: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: theme.fontWeight.medium,
  },
  autoModeChip: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoModeChipText: {
    fontSize: 11,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  variantActionsRow: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  variantActionButton: {
    minHeight: 34,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  variantActionText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  variantActionSummary: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: theme.fontWeight.medium,
  },
  toggleChip: {
    flex: 1,
    minHeight: 38,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  toggleChipText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: theme.fontWeight.semibold,
  },
  toggleChipTextActive: {
    color: '#fff',
  },
  labelCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  labelShot: {
    backgroundColor: '#fff',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xs,
  },
  labelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
});
