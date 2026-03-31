/**
 * Estúdio de Etiquetas — gera etiquetas de múltiplos produtos
 * aproveitando a folha inteira sem desperdício.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import ProductLabel, { LabelData } from '@/components/labels/ProductLabel';
import LabelProductPickerModal, { type PickedItem } from '@/components/labels/LabelProductPickerModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import PageHeader from '@/components/layout/PageHeader';
import { Colors } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { useBrandingColors } from '@/store/brandingStore';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface LabelFormat {
  id: string;
  label: string;        // "14/fl"
  perSheet: number;     // 14
  description: string;  // "2×7 · Médio"
  size: 'large' | 'medium' | 'small';
}

interface LabelItem {
  key: string;
  displayName: string;
  labelData: LabelData;
  stock: number;
  quantity: number;
}

interface FormatMetrics {
  sheets: number;
  remainder: number;
  utilization: number;
}

// ─── Formatos de papel colante ────────────────────────────────────────────────

const LABEL_FORMATS: LabelFormat[] = [
  { id: 'f10', label: '10/fl', perSheet: 10, description: '2×5 · Grande',   size: 'large'  },
  { id: 'f14', label: '14/fl', perSheet: 14, description: '2×7 · Médio',    size: 'medium' },
  { id: 'f21', label: '21/fl', perSheet: 21, description: '3×7 · Médio',    size: 'medium' },
  { id: 'f33', label: '33/fl', perSheet: 33, description: '3×11 · Pequeno', size: 'small'  },
  { id: 'f65', label: '65/fl', perSheet: 65, description: '5×13 · Mini',    size: 'small'  },
];

// ─── Componente ──────────────────────────────────────────────────────────────

export default function LabelStudioScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const viewShotRef = useRef<ViewShot>(null);

  const headerOpacity = useSharedValue(0);
  const headerScale = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY = useSharedValue(24);

  const [formatId,      setFormatId]      = useState('f14');
  const [autoBestFormat, setAutoBestFormat] = useState(true);
  const [showPrice,     setShowPrice]     = useState(true);
  const [showSku,       setShowSku]       = useState(true);
  const [items,         setItems]         = useState<LabelItem[]>([]);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [exporting,     setExporting]     = useState(false);
  const [printDialog,   setPrintDialog]   = useState(false);
  const [errorDialog,   setErrorDialog]   = useState(false);

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

  // ── Derivados ──────────────────────────────────────────────────────────────

  const format      = LABEL_FORMATS.find(f => f.id === formatId) ?? LABEL_FORMATS[1];
  const perSheet    = format.perSheet;
  const allLabels: LabelData[] = items.flatMap(i =>
    Array.from({ length: Math.max(0, i.quantity) }, () => i.labelData)
  );
  const totalLabels  = allLabels.length;
  const sheetsNeeded = totalLabels > 0 ? Math.ceil(totalLabels / perSheet) : 0;
  const lastPageFill = totalLabels > 0 ? ((totalLabels - 1) % perSheet) + 1 : 0;
  const emptySlots   = totalLabels > 0 ? perSheet - lastPageFill : 0;
  const utilizePct   = totalLabels > 0 ? Math.round((lastPageFill / perSheet) * 100) : 0;

  const getFormatMetrics = (targetPerSheet: number): FormatMetrics => {
    if (totalLabels <= 0) {
      return { sheets: 0, remainder: 0, utilization: 0 };
    }

    const sheets = Math.ceil(totalLabels / targetPerSheet);
    const remainder = (targetPerSheet - (totalLabels % targetPerSheet)) % targetPerSheet;
    const usedOnLastSheet = remainder === 0 ? targetPerSheet : targetPerSheet - remainder;
    const utilization = Math.round((usedOnLastSheet / targetPerSheet) * 100);

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

  const bestFormat = bestFormatId
    ? LABEL_FORMATS.find((fmt) => fmt.id === bestFormatId)
    : undefined;

  const bestFormatMetrics = bestFormat
    ? getFormatMetrics(bestFormat.perSheet)
    : undefined;

  useEffect(() => {
    if (!autoBestFormat) return;
    if (!bestFormatId) return;
    if (bestFormatId !== formatId) {
      setFormatId(bestFormatId);
    }
  }, [autoBestFormat, bestFormatId, formatId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Recebe seleção completa do picker e sincroniza com o estúdio */
  const handlePickConfirm = (picked: PickedItem[], selectedVariantIds: number[]) => {
    setItems(prev => {
      if (selectedVariantIds.length === 0) return [];

      const pickedMap = new Map<number, PickedItem>();
      picked.forEach((item) => pickedMap.set(item.variant.id, item));

      const prevMap = new Map<number, LabelItem>();
      prev.forEach((item) => {
        const variantId = Number(item.key.replace('v_', ''));
        if (!Number.isNaN(variantId)) {
          prevMap.set(variantId, item);
        }
      });

      const next: LabelItem[] = [];

      selectedVariantIds.forEach((variantId) => {
        const existing = prevMap.get(variantId);
        if (existing) {
          next.push(existing);
          return;
        }

        const pickedItem = pickedMap.get(variantId);
        if (!pickedItem) return;

        const { product, variant } = pickedItem;
        const parts = [variant.size, variant.color].filter(Boolean);
        next.push({
          key: `v_${variant.id}`,
          displayName: `${product.name}${parts.length > 0 ? ` · ${parts.join('/')}` : ''}`,
          labelData: {
            productId: product.id,
            sku: variant.sku ?? '',
            name: product.name,
            price: Number(variant.price),
            size: variant.size ?? undefined,
            color: variant.color ?? undefined,
          },
          stock: variant.current_stock ?? 0,
          quantity: 1,
        });
      });

      return next;
    });
  };

  const changeQty = (key: string, delta: number) => {
    setItems(prev => prev.map(i =>
      i.key === key ? { ...i, quantity: Math.max(0, Math.min(99, i.quantity + delta)) } : i
    ));
  };

  const removeItem = (key: string) => {
    setItems(prev => prev.filter(i => i.key !== key));
  };

  const fillFromStock = () => {
    setItems(prev => prev.map(i => ({
      ...i,
      quantity: i.stock > 0 ? i.stock : i.quantity,
    })));
  };

  const fillPage = () => {
    if (emptySlots === 0 || totalLabels === 0) return;
    // Distribui os espaços vazios para o último item adicionado
    const lastItem = items[items.length - 1];
    if (!lastItem) return;
    setItems(prev => prev.map(i =>
      i.key === lastItem.key
        ? { ...i, quantity: i.quantity + emptySlots }
        : i
    ));
  };

  const clearAll = () => {
    setItems([]);
  };

  const handleShare = async () => {
    if (!viewShotRef.current || totalLabels === 0) return;
    setPrintDialog(false);
    setExporting(true);
    try {
      const uri = await captureRef(viewShotRef, { format: 'png', quality: 1 });
      const ok = await Sharing.isAvailableAsync();
      if (ok) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `${totalLabels} etiquetas`,
        });
      }
    } catch {
      setErrorDialog(true);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    setPrintDialog(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Estúdio de Etiquetas"
          subtitle={
            totalLabels > 0
              ? `${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''} · ${sheetsNeeded} folha${sheetsNeeded !== 1 ? 's' : ''}`
              : 'Selecione produtos e defina quantidades'
          }
          showBackButton
          onBack={() => router.back()}
        />
      </Animated.View>

      <Animated.View style={[styles.scrollWrap, contentAnimStyle]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Configuração de folha ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="settings-outline" size={18} color={brandingColors.primary} />
            <Text style={styles.cardTitle}>Configuração</Text>
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
                    onPress={() => {
                      setAutoBestFormat(false);
                      setFormatId(fmt.id);
                    }}
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
                        {metrics.sheets > 0 ? `${metrics.sheets} folha${metrics.sheets !== 1 ? 's' : ''}` : '--'}
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

            <View style={styles.recommendationRow}>
              <TouchableOpacity
                style={[
                  styles.autoModeChip,
                  autoBestFormat && { borderColor: brandingColors.primary, backgroundColor: brandingColors.primary + '14' },
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
                <Text style={[styles.autoModeChipText, autoBestFormat && { color: brandingColors.primary }]}> 
                  {autoBestFormat ? 'Auto recomendado' : 'Formato travado'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.recommendationText}>
                {totalLabels > 0
                  ? `Melhor agora: ${bestFormat?.label ?? format.label}${
                      bestFormatMetrics
                        ? ` · ${bestFormatMetrics.sheets} folha${bestFormatMetrics.sheets !== 1 ? 's' : ''} · ${bestFormatMetrics.remainder} vaga${bestFormatMetrics.remainder !== 1 ? 's' : ''}`
                        : ''
                    }`
                  : 'Adicione itens para calcular o melhor formato automaticamente.'}
              </Text>
            </View>

            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  showPrice && { backgroundColor: brandingColors.primary, borderColor: brandingColors.primary },
                ]}
                onPress={() => setShowPrice(v => !v)}
              >
                <Ionicons name="pricetag-outline" size={14} color={showPrice ? '#fff' : Colors.light.textSecondary} />
                <Text style={[styles.chipText, showPrice && styles.chipTextActive]}>Preço</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.chip,
                  showSku && { backgroundColor: brandingColors.primary, borderColor: brandingColors.primary },
                ]}
                onPress={() => setShowSku(v => !v)}
              >
                <Ionicons name="barcode-outline" size={14} color={showSku ? '#fff' : Colors.light.textSecondary} />
                <Text style={[styles.chipText, showSku && styles.chipTextActive]}>SKU</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Aproveitamento da folha ── */}
        {totalLabels > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="albums-outline" size={18} color={brandingColors.primary} />
              <Text style={styles.cardTitle}>Aproveitamento da Folha</Text>
            </View>
            <View style={styles.cardContent}>
              {/* Linha de totais */}
              <View style={styles.utilizeStatsRow}>
                <View style={styles.utilizeStat}>
                  <Text style={styles.utilizeStatValue}>{sheetsNeeded}</Text>
                  <Text style={styles.utilizeStatLabel}>{sheetsNeeded === 1 ? 'folha' : 'folhas'} necessária{sheetsNeeded !== 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.utilizeStatDivider} />
                <View style={styles.utilizeStat}>
                  <Text style={styles.utilizeStatValue}>{lastPageFill}</Text>
                  <Text style={styles.utilizeStatLabel}>etiquetas na última</Text>
                </View>
                <View style={styles.utilizeStatDivider} />
                <View style={styles.utilizeStat}>
                  <Text style={[styles.utilizeStatValue, { color: emptySlots === 0 ? Colors.light.success : Colors.light.warning }]}>
                    {emptySlots === 0 ? '100%' : `${utilizePct}%`}
                  </Text>
                  <Text style={styles.utilizeStatLabel}>aproveitado</Text>
                </View>
              </View>

              {/* Barra de progresso simples */}
              <View style={styles.utilizeBarTrack}>
                <View style={[
                  styles.utilizeBarFill,
                  {
                    width: `${utilizePct}%` as any,
                    backgroundColor: emptySlots === 0 ? Colors.light.success : brandingColors.primary,
                  },
                ]} />
              </View>
              <Text style={styles.utilizeBarLabel}>
                {lastPageFill} de {perSheet} etiquetas por folha · {format.description}
              </Text>

              {/* Dica */}
              {emptySlots > 0 && (
                <View style={styles.utilizeTipRow}>
                  <Ionicons name="bulb-outline" size={14} color={Colors.light.warning} />
                  <Text style={styles.utilizeTipText}>
                    {emptySlots} espaço{emptySlots !== 1 ? 's' : ''} vazio{emptySlots !== 1 ? 's' : ''} na última folha.
                  </Text>
                  <TouchableOpacity onPress={fillPage} style={styles.fillPageBtn}>
                    <Text style={styles.fillPageBtnText}>Completar</Text>
                  </TouchableOpacity>
                </View>
              )}
              {emptySlots === 0 && (
                <View style={styles.utilizeTipRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={Colors.light.success} />
                  <Text style={[styles.utilizeTipText, { color: Colors.light.success }]}>
                    Folha 100% aproveitada — zero desperdício!
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Lista de produtos ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="layers-outline" size={18} color={brandingColors.primary} />
            <Text style={styles.cardTitle}>
              Produtos{items.length > 0 ? ` (${items.length})` : ''}
            </Text>
            <View style={styles.headerActions}>
              {items.some(i => i.stock > 0) && (
                <TouchableOpacity onPress={fillFromStock} style={styles.actionBtn}>
                  <Ionicons name="flash-outline" size={13} color={brandingColors.primary} />
                  <Text style={[styles.actionBtnText, { color: brandingColors.primary }]}>Do estoque</Text>
                </TouchableOpacity>
              )}
              {items.length > 0 && (
                <TouchableOpacity onPress={clearAll} style={styles.actionBtn}>
                  <Ionicons name="trash-outline" size={13} color={Colors.light.error} />
                  <Text style={[styles.actionBtnText, { color: Colors.light.error }]}>Limpar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.cardContent}>
            {/* Itens adicionados */}
            {items.map(item => (
              <View key={item.key} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.displayName}</Text>
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemPrice}>{formatCurrency(item.labelData.price)}</Text>
                    {item.stock > 0 && (
                      <Text style={styles.itemStock}>· {item.stock} em estoque</Text>
                    )}
                  </View>
                </View>

                <View style={styles.itemControls}>
                  <TouchableOpacity
                    onPress={() => changeQty(item.key, -1)}
                    style={[styles.qtyBtn, item.quantity <= 0 && styles.qtyBtnDisabled]}
                    disabled={item.quantity <= 0}
                  >
                    <Ionicons name="remove" size={16} color={item.quantity <= 0 ? Colors.light.textTertiary : Colors.light.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyValue, item.quantity === 0 && styles.qtyZero]}>
                    {item.quantity}
                  </Text>
                  <TouchableOpacity
                    onPress={() => changeQty(item.key, 1)}
                    style={styles.qtyBtn}
                  >
                    <Ionicons name="add" size={16} color={Colors.light.primary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => removeItem(item.key)}
                    style={styles.removeBtn}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="close" size={16} color={Colors.light.textTertiary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Botão adicionar */}
            <TouchableOpacity
              style={styles.addProductBtn}
              onPress={() => setModalOpen(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color={brandingColors.primary} />
              <View style={styles.addProductTextWrap}>
                <Text style={[styles.addProductText, { color: brandingColors.primary }]}>
                  {items.length === 0 ? 'Selecionar produtos' : 'Adicionar mais produtos'}
                </Text>
                <Text style={[styles.addProductSub, { color: brandingColors.primary + 'AA' }]}>Marque vários de uma vez</Text>
              </View>
            </TouchableOpacity>

            {/* Total */}
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

        {/* ── Preview ── */}
        {totalLabels > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="eye-outline" size={18} color={brandingColors.primary} />
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
                    {allLabels.map((data, i) => (
                      <ProductLabel
                        key={i}
                        data={data}
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
                    A imagem exportada contém todas as {totalLabels} etiquetas. Divida em {sheetsNeeded} folhas ao imprimir.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="pricetags-outline" size={48} color={Colors.light.textTertiary} />
            <Text style={styles.emptyTitle}>Nenhum produto</Text>
            <Text style={styles.emptyText}>
              Toque em "Adicionar produto" acima para começar a montar sua folha de etiquetas.
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
      </Animated.View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.footerAction, styles.footerActionSecondary, totalLabels === 0 && styles.footerActionDisabled]}
          onPress={handlePrint}
          disabled={totalLabels === 0}
          activeOpacity={0.75}
        >
          <Ionicons name="print-outline" size={18} color={Colors.light.textSecondary} />
          <Text style={styles.footerActionSecondaryText}>Imprimir</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.footerAction, totalLabels === 0 && styles.footerActionDisabled]}
          onPress={handleShare}
          disabled={totalLabels === 0 || exporting}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={exporting ? ['#9CA3AF', '#9CA3AF'] : brandingColors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.footerActionPrimaryGradient}
          >
            <Ionicons name={exporting ? 'hourglass-outline' : 'share-social-outline'} size={18} color="#fff" />
            <Text style={styles.footerActionPrimaryText}>{exporting ? 'Exportando...' : 'Compartilhar'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Modal de seleção em massa */}
      <LabelProductPickerModal
        visible={modalOpen}
        onDismiss={() => setModalOpen(false)}
        onConfirm={handlePickConfirm}
        alreadyAdded={new Set(items.map(i => i.key))}
      />

      {/* Diálogo de impressão */}
      <ConfirmDialog
        visible={printDialog}
        type="info"
        icon="print-outline"
        title="Imprimir Etiquetas"
        message={`${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''} · ${sheetsNeeded} folha${sheetsNeeded !== 1 ? 's' : ''} (${format.label})\n\nCompartilhe a imagem e envie para a impressora ou app de impressão.`}
        confirmText="Compartilhar"
        cancelText="Cancelar"
        onConfirm={handleShare}
        onCancel={() => setPrintDialog(false)}
        loading={exporting}
      />

      {/* Diálogo de erro de exportação */}
      <ConfirmDialog
        visible={errorDialog}
        type="danger"
        icon="alert-circle-outline"
        title="Erro ao Exportar"
        message="Não foi possível gerar a imagem das etiquetas. Verifique se o preview está visível e tente novamente."
        confirmText="OK"
        cancelText=""
        onConfirm={() => setErrorDialog(false)}
        onCancel={() => setErrorDialog(false)}
      />
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  scrollWrap: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14 },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
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
  cardContent: { padding: 16, gap: 0 },

  // Config
  configLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 10,
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
  formatCardMain: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.light.textSecondary,
  },
  formatCardSub: {
    fontSize: 10,
    color: Colors.light.textTertiary,
    marginTop: 2,
    textAlign: 'left',
  },
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
  recommendationRow: {
    marginTop: 10,
    gap: 8,
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
    gap: 5,
  },
  autoModeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  recommendationText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  chip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1.5, borderColor: Colors.light.border,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
  chipTextActive: { color: '#fff' },

  // Aproveitamento
  utilizeStatsRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  utilizeStat: { flex: 1, alignItems: 'center' },
  utilizeStatValue: { fontSize: 20, fontWeight: '800', color: Colors.light.text },
  utilizeStatLabel: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 2, textAlign: 'center' },
  utilizeStatDivider: { width: 1, backgroundColor: Colors.light.border, marginVertical: 4 },
  utilizeBarTrack: {
    height: 10,
    backgroundColor: Colors.light.border,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 6,
  },
  utilizeBarFill: { height: '100%' as any, borderRadius: 5 },
  utilizeBarLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 12,
    textAlign: 'center',
  },
  utilizeTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.light.backgroundSecondary,
    padding: 10,
    borderRadius: 8,
  },
  utilizeTipText: { flex: 1, fontSize: 12, color: Colors.light.textSecondary },
  fillPageBtn: {
    backgroundColor: Colors.light.warning + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  fillPageBtnText: { fontSize: 12, fontWeight: '700', color: Colors.light.warning },

  // Produtos
  headerActions: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: Colors.light.primary },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    gap: 8,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  itemPrice: { fontSize: 13, color: Colors.light.primary, fontWeight: '600' },
  itemStock: { fontSize: 12, color: Colors.light.textSecondary },
  itemControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.light.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnDisabled: { backgroundColor: Colors.light.backgroundSecondary },
  qtyValue: {
    fontSize: 16, fontWeight: '800', color: Colors.light.text,
    minWidth: 30, textAlign: 'center',
  },
  qtyZero: { color: Colors.light.textTertiary },
  removeBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    marginLeft: 4,
  },

  addProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.light.border,
    borderStyle: 'dashed',
    backgroundColor: Colors.light.backgroundSecondary,
  },
  addProductTextWrap: { flex: 1 },
  addProductText: { fontSize: 15, fontWeight: '600' },
  addProductSub: { fontSize: 12, marginTop: 1 },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  totalRight: { alignItems: 'flex-end' },
  totalValue: { fontSize: 16, fontWeight: '800' },
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
    backgroundColor: Colors.light.info + '12', borderRadius: 8,
  },
  hintText: { flex: 1, fontSize: 12, color: Colors.light.textSecondary, lineHeight: 17 },

  // Empty
  emptyState: {
    alignItems: 'center', paddingVertical: 36,
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1, borderColor: Colors.light.border,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  emptyText: {
    fontSize: 13, color: Colors.light.textSecondary,
    textAlign: 'center', paddingHorizontal: 28, lineHeight: 20,
  },

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
    borderRadius: 12,
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
    fontSize: 16,
    color: Colors.light.textSecondary,
    fontWeight: '700',
  },
  footerActionPrimaryGradient: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  footerActionPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footerActionDisabled: {
    opacity: 0.55,
  },
});
