import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { getProductById } from '@/services/productService';
import { getProductVariants, formatVariantLabel } from '@/services/productVariantService';
import ProductLabel, { LabelData } from '@/components/labels/ProductLabel';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors, theme } from '@/constants/Colors';
import type { ProductVariant } from '@/types/productVariant';
import { useBrandingColors } from '@/store/brandingStore';

interface LabelFormat {
  id: string;
  label: string;
  perSheet: number;
  description: string;
  size: 'large' | 'medium' | 'small';
}

const LABEL_FORMATS: LabelFormat[] = [
  { id: 'f10', label: '10/fl', perSheet: 10, description: '2×5 · Grande',   size: 'large'  },
  { id: 'f14', label: '14/fl', perSheet: 14, description: '2×7 · Médio',    size: 'medium' },
  { id: 'f21', label: '21/fl', perSheet: 21, description: '3×7 · Médio',    size: 'medium' },
  { id: 'f33', label: '33/fl', perSheet: 33, description: '3×11 · Pequeno', size: 'small'  },
  { id: 'f65', label: '65/fl', perSheet: 65, description: '5×13 · Mini',    size: 'small'  },
];

interface LabelItem {
  key: string;
  label: string;
  data: LabelData;
  stock: number;
  quantity: number;
}

interface FormatMetrics {
  sheets: number;
  remainder: number;
  utilization: number;
}

type LegacyFileSystemWithEncoding = typeof LegacyFileSystem & {
  EncodingType?: {
    Base64?: string;
  };
};

export default function ProductLabelScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const { id, variantId } = useLocalSearchParams<{ id: string; variantId?: string }>();
  const viewShotRef = useRef<ViewShot>(null);

  const [formatId,    setFormatId]    = useState('f14');
  const [showPrice,   setShowPrice]   = useState(true);
  const [showSku,     setShowSku]     = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [items,       setItems]       = useState<LabelItem[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [printDialog, setPrintDialog] = useState(false);
  const [errorDialog, setErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('Não foi possível gerar a imagem das etiquetas. Verifique se o preview está visível e tente novamente.');

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

      headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
      headerScale.value = withSpring(1, { damping: 18, stiffness: 200 });
      contentOpacity.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) });
      contentTransY.value = withSpring(0, { damping: 20, stiffness: 180 });
    }, [])
  );

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => getProductById(Number(id)),
    enabled: !!id,
  });

  const { data: variants, isSuccess: variantsLoaded } = useQuery({
    queryKey: ['product-variants', id],
    queryFn: () => getProductVariants(Number(id)),
    enabled: !!id,
  });

  const preselectedVariantId =
    variantId && !Number.isNaN(Number(variantId)) ? Number(variantId) : null;

  useEffect(() => {
    if (!product || initialized || !variantsLoaded) return;
    const variantList = variants ?? [];
    if (variantList.length > 0) {
      const hasMatchingPreselected =
        preselectedVariantId != null && variantList.some((variant) => variant.id === preselectedVariantId);

      setItems(variantList.map(v => ({
        key: `variant-${v.id}`,
        label: formatVariantLabel(v),
        data: {
          productId: product.id,   // ID do produto, não da variante
          variantId: v.id,
          sku: v.sku,
          name: `${product.name} — ${formatVariantLabel(v)}`,
          price: Number(v.price),
          size: v.size || undefined,
          color: v.color || undefined,
        },
        stock: v.current_stock ?? 0,
        quantity: hasMatchingPreselected
          ? (v.id === preselectedVariantId ? 1 : 0)
          : 1,
      })));
    } else {
      setItems([{
        key: 'product',
        label: product.name,
        data: {
          productId: product.id,
          sku: product.sku ?? '',
          name: product.name,
          price: Number((product as any).price ?? 0),
          size: (product as any).size || undefined,
          color: (product as any).color || undefined,
        },
        stock: (product as any).current_stock ?? 0,
        quantity: 1,
      }]);
    }
    setInitialized(true);
  }, [product, variants, variantsLoaded, initialized, preselectedVariantId]);

  const format = LABEL_FORMATS.find(f => f.id === formatId) ?? LABEL_FORMATS[1];

  const allLabels: LabelData[] = items.flatMap(item =>
    item.quantity > 0 ? Array.from({ length: item.quantity }, () => item.data) : []
  );

  const totalLabels = allLabels.length;
  const sheetsNeeded = totalLabels > 0 ? Math.ceil(totalLabels / format.perSheet) : 0;

  const getFormatMetrics = (perSheet: number): FormatMetrics => {
    if (totalLabels <= 0) {
      return { sheets: 0, remainder: 0, utilization: 0 };
    }

    const sheets = Math.ceil(totalLabels / perSheet);
    const remainder = (perSheet - (totalLabels % perSheet)) % perSheet;
    const usedOnLastSheet = remainder === 0 ? perSheet : perSheet - remainder;
    const utilization = Math.round((usedOnLastSheet / perSheet) * 100);

    return { sheets, remainder, utilization };
  };

  const bestFormatId = totalLabels > 0
    ? LABEL_FORMATS
        .map((fmt) => ({ fmt, metrics: getFormatMetrics(fmt.perSheet) }))
        .sort((a, b) => {
          if (a.metrics.sheets !== b.metrics.sheets) {
            return a.metrics.sheets - b.metrics.sheets;
          }
          if (a.metrics.remainder !== b.metrics.remainder) {
            return a.metrics.remainder - b.metrics.remainder;
          }
          return b.metrics.utilization - a.metrics.utilization;
        })[0]?.fmt.id
    : undefined;

  const changeQty = (key: string, delta: number) => {
    setItems(prev => prev.map(item =>
      item.key === key
        ? { ...item, quantity: Math.max(0, Math.min(99, item.quantity + delta)) }
        : item
    ));
  };

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  };

  const isPrintCancelledError = (error: unknown) => {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return (
      message.includes('printing did not complete') ||
      message.includes('did not complete') ||
      message.includes('cancel')
    );
  };

  const capturePreviewUri = async () => {
    if (!viewShotRef.current) {
      throw new Error('Preview indisponível no momento. Abra a seção de preview e tente novamente.');
    }

    if (typeof viewShotRef.current.capture === 'function') {
      return viewShotRef.current.capture();
    }

    return captureRef(viewShotRef.current, { format: 'png', quality: 1 });
  };

  const fillFromStock = () => {
    setItems(prev => prev.map(item => ({
      ...item,
      quantity: item.stock > 0 ? item.stock : item.quantity,
    })));
  };

  const resetAll = () => {
    setItems(prev => prev.map(item => ({ ...item, quantity: 0 })));
  };

  const handleShare = async () => {
    if (!viewShotRef.current || totalLabels === 0) return;
    setPrintDialog(false);
    setIsExporting(true);
    try {
      const uri = await capturePreviewUri();
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Compartilhamento não disponível neste dispositivo.');
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Etiquetas — ${product?.name}`,
      });
    } catch (error) {
      console.error('[ProductLabel] Falha ao compartilhar etiquetas', error);
      setErrorMessage(getErrorMessage(error, 'Não foi possível exportar as etiquetas.'));
      setErrorDialog(true);
    } finally {
      setIsExporting(false);
    }
  };

  const openPrintDialog = () => {
    setPrintDialog(true);
  };

  const buildPrintHtml = (imageBase64: string) => {
    const safeProductName = (product?.name ?? 'Etiquetas').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            @page {
              size: A4;
              margin: 8mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              min-height: 100vh;
              padding: 18px 14px;
              background: radial-gradient(circle at top, #1f2937 0%, #111827 55%, #0b1220 100%);
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              color: #0f172a;
            }

            .sheet {
              width: 100%;
              max-width: 920px;
              margin: 0 auto;
              background: #ffffff;
              border: 1px solid #dbe2ea;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 22px 50px rgba(0, 0, 0, 0.28);
            }

            .sheet-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 10px;
              padding: 10px 12px;
              border-bottom: 1px solid #e5e7eb;
              background: #f8fafc;
            }

            .title {
              font-size: 12px;
              font-weight: 700;
              margin: 0;
            }

            .meta {
              font-size: 10px;
              color: #475569;
              margin: 2px 0 0 0;
            }

            .badge {
              font-size: 10px;
              font-weight: 700;
              color: #4338ca;
              background: #eef2ff;
              border: 1px solid #c7d2fe;
              border-radius: 999px;
              padding: 3px 8px;
              white-space: nowrap;
            }

            .image-wrap {
              padding: 10px;
              background: #ffffff;
            }

            .labels-image {
              width: 100%;
              height: auto;
              display: block;
              border-radius: 8px;
            }

            @media print {
              body {
                background: #ffffff;
                padding: 0;
              }

              .sheet {
                border: 0;
                border-radius: 0;
                box-shadow: none;
                max-width: 100%;
              }

              .sheet-header {
                background: #ffffff;
              }
            }
          </style>
        </head>
        <body>
          <main class="sheet">
            <header class="sheet-header">
              <div>
                <p class="title">${safeProductName}</p>
                <p class="meta">${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''} · ${format.label} · ${format.description}</p>
              </div>
              <span class="badge">${sheetsNeeded} folha${sheetsNeeded !== 1 ? 's' : ''}</span>
            </header>
            <section class="image-wrap">
              <img class="labels-image" src="data:image/png;base64,${imageBase64}" alt="Etiquetas" />
            </section>
          </main>
        </body>
      </html>
    `;
  };

  const handlePrint = async () => {
    if (!viewShotRef.current || totalLabels === 0) return;

    setPrintDialog(false);
    setIsExporting(true);

    try {
      const uri = await capturePreviewUri();
      const base64 = await LegacyFileSystem.readAsStringAsync(uri, {
        encoding: base64Encoding as any,
      });

      await Print.printAsync({
        html: buildPrintHtml(base64),
      });
    } catch (printError) {
      if (isPrintCancelledError(printError)) {
        console.log('[ProductLabel] Impressao cancelada pelo usuario.');
        return;
      }

      console.error('[ProductLabel] Falha ao imprimir. Tentando fallback de compartilhamento...', printError);
      try {
        const uri = await capturePreviewUri();
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
          throw new Error('Impressão indisponível e compartilhamento não suportado neste dispositivo.');
        }

        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Etiquetas — ${product?.name}`,
        });
      } catch (fallbackError) {
        console.error('[ProductLabel] Falha também no fallback de compartilhamento', fallbackError);
        setErrorMessage(
          getErrorMessage(
            fallbackError,
            'Não foi possível imprimir ou compartilhar as etiquetas. Verifique permissões e tente novamente.'
          )
        );
        setErrorDialog(true);
      }
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading || !product) {
    return (
      <View style={styles.center}>
        <Text>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Gerar Etiquetas"
          subtitle={
            totalLabels > 0
              ? `${product.name} · ${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''}`
              : product.name
          }
          showBackButton
          onBack={() => router.back()}
        />
      </Animated.View>

      <Animated.View style={[styles.scrollWrap, contentAnimStyle]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Configuração */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="settings-outline" size={20} color={brandingColors.primary} />
            <Text style={styles.cardTitle}>Configuração de Folha</Text>
            {sheetsNeeded > 0 && (
              <View style={[styles.sheetChip, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="document-text-outline" size={13} color={brandingColors.primary} />
                <Text style={[styles.sheetChipText, { color: brandingColors.primary }]}>{sheetsNeeded} folha{sheetsNeeded !== 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.configLabel}>Formato de Papel Colante</Text>
            <View style={styles.formatGrid}>
              {LABEL_FORMATS.map(fmt => {
                const selected = formatId === fmt.id;
                const metrics = getFormatMetrics(fmt.perSheet);
                const isBest = bestFormatId === fmt.id;

                return (
                  <TouchableOpacity
                    key={fmt.id}
                    style={[
                      styles.formatCard,
                      selected && {
                        borderColor: brandingColors.primary,
                        backgroundColor: brandingColors.primary + '12',
                      },
                    ]}
                    onPress={() => setFormatId(fmt.id)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.formatCardTop}>
                      <Text style={[styles.formatCardMain, selected && { color: brandingColors.primary }]}>
                        {fmt.label}
                      </Text>
                      {isBest && totalLabels > 0 && (
                        <View style={[styles.bestChip, { backgroundColor: Colors.light.success + '18' }]}>
                          <Text style={styles.bestChipText}>Melhor</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.formatCardSub, selected && { color: brandingColors.primary + 'AA' }]}> 
                      {fmt.description}
                    </Text>

                    <View style={styles.formatMetaRow}>
                      <Text style={styles.formatMetaText}>
                        {metrics.sheets > 0 ? `${metrics.sheets} folha${metrics.sheets !== 1 ? 's' : ''}` : '—'}
                      </Text>
                      <Text style={styles.formatMetaDot}>•</Text>
                      <Text style={styles.formatMetaText}>
                        {metrics.sheets > 0 ? `${metrics.remainder} vaga${metrics.remainder !== 1 ? 's' : ''}` : 'sem calculo'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  showPrice && { backgroundColor: brandingColors.primary, borderColor: brandingColors.primary },
                ]}
                onPress={() => setShowPrice(!showPrice)}
              >
                <Ionicons name="pricetag-outline" size={14} color={showPrice ? '#fff' : Colors.light.textSecondary} />
                <Text style={[styles.chipText, showPrice && styles.chipTextActive]}>Preço</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.chip,
                  showSku && { backgroundColor: brandingColors.primary, borderColor: brandingColors.primary },
                ]}
                onPress={() => setShowSku(!showSku)}
              >
                <Ionicons name="barcode-outline" size={14} color={showSku ? '#fff' : Colors.light.textSecondary} />
                <Text style={[styles.chipText, showSku && styles.chipTextActive]}>SKU</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Seleção de Variações / Quantidade */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
              <Ionicons name="layers-outline" size={20} color={brandingColors.primary} />
            <Text style={styles.cardTitle}>
              {items.length > 1 ? `Variações (${items.length})` : 'Quantidade'}
            </Text>
            <View style={styles.headerActions}>
              {items.some(i => i.stock > 0) && (
                <TouchableOpacity onPress={fillFromStock} style={styles.actionBtn}>
                  <Ionicons name="flash-outline" size={14} color={brandingColors.primary} />
                  <Text style={[styles.actionBtnText, { color: brandingColors.primary }]}>Do estoque</Text>
                </TouchableOpacity>
              )}
              {totalLabels > 0 && (
                <TouchableOpacity onPress={resetAll} style={styles.actionBtn}>
                  <Ionicons name="close-circle-outline" size={14} color={Colors.light.error} />
                  <Text style={[styles.actionBtnText, { color: Colors.light.error }]}>Limpar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.cardContent}>
            {items.map((item, idx) => (
              <View key={item.key} style={[styles.variantRow, idx < items.length - 1 && styles.variantRowBorder]}>
                <View style={styles.variantRowInfo}>
                  <Text style={styles.variantRowName} numberOfLines={1}>{item.label}</Text>
                  {item.stock > 0 && (
                    <Text style={styles.variantRowStock}>{item.stock} em estoque</Text>
                  )}
                </View>
                <View style={styles.qtyControl}>
                  <TouchableOpacity
                    onPress={() => changeQty(item.key, -1)}
                    style={[styles.qtyBtn, item.quantity <= 0 && styles.qtyBtnDisabled]}
                    disabled={item.quantity <= 0}
                  >
                    <Ionicons name="remove" size={18} color={item.quantity <= 0 ? Colors.light.textTertiary : brandingColors.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyValue, item.quantity === 0 && styles.qtyZero]}>
                    {item.quantity}
                  </Text>
                  <TouchableOpacity
                    onPress={() => changeQty(item.key, 1)}
                    style={[styles.qtyBtn, { backgroundColor: brandingColors.primary + '18' }]}
                  >
                    <Ionicons name="add" size={18} color={brandingColors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {totalLabels > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <View style={styles.totalRight}>
                  <Text style={[styles.totalValue, { color: brandingColors.primary }]}>{totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''}</Text>
                  <Text style={styles.totalSheets}>
                    {sheetsNeeded} folha{sheetsNeeded !== 1 ? 's' : ''} · {format.label} · {format.description}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Preview */}
        {totalLabels > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="eye-outline" size={20} color={brandingColors.primary} />
              <Text style={styles.cardTitle}>Preview</Text>
              {sheetsNeeded > 1 && (
                <View style={styles.extraChip}>
                  <Text style={styles.extraChipText}>+{sheetsNeeded - 1} folha{sheetsNeeded - 1 > 1 ? 's' : ''}</Text>
                </View>
              )}
            </View>
            <View style={styles.cardContent}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <ViewShot
                  ref={viewShotRef}
                  options={{ format: 'png', quality: 1 }}
                  style={styles.viewShot}
                >
                  <View style={styles.labelsGrid}>
                    {allLabels.map((labelData, i) => (
                      <ProductLabel
                        key={i}
                        data={labelData}
                        size={format.size}
                        showPrice={showPrice}
                        showSku={showSku}
                      />
                    ))}
                  </View>
                </ViewShot>
              </ScrollView>
              {sheetsNeeded > 1 && (
                <View style={styles.hintRow}>
                  <Ionicons name="information-circle-outline" size={14} color={Colors.light.info} />
                  <Text style={styles.hintText}>
                    Imagem exportada contém todas as {totalLabels} etiquetas. Divida em {sheetsNeeded} folhas ao imprimir.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {totalLabels === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="pricetag-outline" size={48} color={Colors.light.textTertiary} />
            <Text style={styles.emptyText}>
              Defina a quantidade de cada {items.length > 1 ? 'variação' : 'etiqueta'} acima
            </Text>
          </View>
        )}
      </ScrollView>
      </Animated.View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.footerAction, styles.footerActionSecondary, totalLabels === 0 && styles.footerActionDisabled]}
          onPress={openPrintDialog}
          disabled={totalLabels === 0}
          activeOpacity={0.75}
        >
          <Ionicons name="print-outline" size={18} color={Colors.light.textSecondary} />
          <Text style={styles.footerActionSecondaryText}>Imprimir</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.footerAction, totalLabels === 0 && styles.footerActionDisabled]}
          onPress={handleShare}
          disabled={totalLabels === 0 || isExporting}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isExporting ? ['#9CA3AF', '#9CA3AF'] : brandingColors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.footerActionPrimaryGradient}
          >
            {isExporting ? (
              <Ionicons name="hourglass-outline" size={18} color="#fff" />
            ) : (
              <Ionicons name="share-social-outline" size={18} color="#fff" />
            )}
            <Text style={styles.footerActionPrimaryText}>{isExporting ? 'Exportando...' : 'Compartilhar'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Diálogo de impressão */}
      <ConfirmDialog
        visible={printDialog}
        type="info"
        icon="print-outline"
        title="Imprimir Etiquetas"
        message={`${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''} em ${sheetsNeeded} folha${sheetsNeeded !== 1 ? 's' : ''} (${format.label})\n\nO app vai abrir o seletor nativo de impressao do sistema. Se nao houver servico disponivel, tentaremos compartilhar a imagem automaticamente.`}
        confirmText="Imprimir"
        cancelText="Cancelar"
        onConfirm={handlePrint}
        onCancel={() => setPrintDialog(false)}
        loading={isExporting}
      />

      {/* Diálogo de erro de exportação */}
      <ConfirmDialog
        visible={errorDialog}
        type="danger"
        icon="alert-circle-outline"
        title="Erro ao Exportar"
        message={errorMessage}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setErrorDialog(false)}
        onCancel={() => setErrorDialog(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollWrap: { flex: 1 },

  // Scroll
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 100, gap: 14 },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.light.text },
  cardContent: { padding: 16 },

  // Sheet chip
  sheetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.light.primary + '15',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
  },
  sheetChipText: { fontSize: 12, fontWeight: '700', color: Colors.light.primary },

  // Config
  configLabel: {
    fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary,
    marginTop: 14, marginBottom: 10,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  formatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  formatCard: {
    width: '48%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    minWidth: 120,
  },
  formatCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  formatCardActive: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary + '12',
  },
  formatCardMain: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.light.textSecondary,
  },
  formatCardMainActive: { color: Colors.light.primary },
  formatCardSub: {
    fontSize: 10,
    color: Colors.light.textTertiary,
    marginTop: 2,
    textAlign: 'left',
  },
  formatCardSubActive: { color: Colors.light.primary + 'aa' },
  formatMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  formatMetaText: {
    fontSize: 10,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  formatMetaDot: {
    fontSize: 10,
    color: Colors.light.textTertiary,
  },
  bestChip: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bestChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.light.success,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  optionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  chip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1.5, borderColor: Colors.light.border,
  },
  chipActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
  chipTextActive: { color: '#fff' },

  // Header actions
  headerActions: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: Colors.light.primary },

  // Variant rows
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  variantRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  variantRowInfo: { flex: 1 },
  variantRowName: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  variantRowStock: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },

  // Qty control
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.light.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnDisabled: { backgroundColor: Colors.light.backgroundSecondary },
  qtyValue: {
    fontSize: 18, fontWeight: '800', color: Colors.light.text,
    minWidth: 36, textAlign: 'center',
  },
  qtyZero: { color: Colors.light.textTertiary },

  // Total row
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  totalRight: { alignItems: 'flex-end' },
  totalValue: { fontSize: 16, fontWeight: '800', color: Colors.light.primary },
  totalSheets: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },

  // Preview
  extraChip: {
    backgroundColor: Colors.light.warning + '20',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  extraChipText: { fontSize: 12, fontWeight: '700', color: Colors.light.warning },
  viewShot: { backgroundColor: '#f5f5f5', padding: 8, borderRadius: 8 },
  labelsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  hintRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: 10, padding: 10,
    backgroundColor: Colors.light.info + '12',
    borderRadius: 8,
  },
  hintText: { flex: 1, fontSize: 12, color: Colors.light.textSecondary, lineHeight: 17 },

  // Empty
  emptyState: {
    alignItems: 'center', paddingVertical: 32,
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1, borderColor: Colors.light.border,
    gap: 10,
  },
  emptyText: { fontSize: 14, color: Colors.light.textSecondary, textAlign: 'center', paddingHorizontal: 24 },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: Colors.light.border,
  },
  footerAction: {
    flex: 1,
    minHeight: 52,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  footerActionSecondary: {
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerActionSecondaryText: {
    fontSize: theme.fontSize.base,
    color: Colors.light.textSecondary,
    fontWeight: '700',
  },
  footerActionPrimaryGradient: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
  },
  footerActionPrimaryText: {
    color: '#fff',
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  footerActionDisabled: {
    opacity: 0.55,
  },
});
