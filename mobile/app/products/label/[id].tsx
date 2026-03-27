import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { getProductById } from '@/services/productService';
import { getProductVariants, formatVariantLabel } from '@/services/productVariantService';
import ProductLabel, { LabelData } from '@/components/labels/ProductLabel';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors, theme } from '@/constants/Colors';
import type { ProductVariant } from '@/types/productVariant';

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

export default function ProductLabelScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const viewShotRef = useRef<ViewShot>(null);

  const [formatId,    setFormatId]    = useState('f14');
  const [showPrice,   setShowPrice]   = useState(true);
  const [showSku,     setShowSku]     = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [items,       setItems]       = useState<LabelItem[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [printDialog, setPrintDialog] = useState(false);
  const [errorDialog, setErrorDialog] = useState(false);

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

  useEffect(() => {
    if (!product || initialized || !variantsLoaded) return;
    const variantList = variants ?? [];
    if (variantList.length > 0) {
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
        quantity: 1,
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
  }, [product, variants, variantsLoaded, initialized]);

  const format = LABEL_FORMATS.find(f => f.id === formatId) ?? LABEL_FORMATS[1];

  const allLabels: LabelData[] = items.flatMap(item =>
    item.quantity > 0 ? Array.from({ length: item.quantity }, () => item.data) : []
  );

  const totalLabels = allLabels.length;
  const sheetsNeeded = totalLabels > 0 ? Math.ceil(totalLabels / format.perSheet) : 0;

  const changeQty = (key: string, delta: number) => {
    setItems(prev => prev.map(item =>
      item.key === key
        ? { ...item, quantity: Math.max(0, Math.min(99, item.quantity + delta)) }
        : item
    ));
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
      const uri = await captureRef(viewShotRef, { format: 'png', quality: 1 });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Etiquetas — ${product?.name}`,
        });
      }
    } catch {
      setErrorDialog(true);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    setPrintDialog(true);
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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Configuração */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="settings-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Configuração de Folha</Text>
            {sheetsNeeded > 0 && (
              <View style={styles.sheetChip}>
                <Ionicons name="document-text-outline" size={13} color={Colors.light.primary} />
                <Text style={styles.sheetChipText}>{sheetsNeeded} folha{sheetsNeeded !== 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.configLabel}>Formato de Papel Colante</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.formatScroll} contentContainerStyle={styles.formatScrollContent}>
              {LABEL_FORMATS.map(fmt => (
                <TouchableOpacity
                  key={fmt.id}
                  style={[styles.formatCard, formatId === fmt.id && styles.formatCardActive]}
                  onPress={() => setFormatId(fmt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.formatCardMain, formatId === fmt.id && styles.formatCardMainActive]}>
                    {fmt.label}
                  </Text>
                  <Text style={[styles.formatCardSub, formatId === fmt.id && styles.formatCardSubActive]}>
                    {fmt.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={[styles.chip, showPrice && styles.chipActive]}
                onPress={() => setShowPrice(!showPrice)}
              >
                <Ionicons name="pricetag-outline" size={14} color={showPrice ? '#fff' : Colors.light.textSecondary} />
                <Text style={[styles.chipText, showPrice && styles.chipTextActive]}>Preço</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, showSku && styles.chipActive]}
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
            <Ionicons name="layers-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>
              {items.length > 1 ? `Variações (${items.length})` : 'Quantidade'}
            </Text>
            <View style={styles.headerActions}>
              {items.some(i => i.stock > 0) && (
                <TouchableOpacity onPress={fillFromStock} style={styles.actionBtn}>
                  <Ionicons name="flash-outline" size={14} color={Colors.light.primary} />
                  <Text style={styles.actionBtnText}>Do estoque</Text>
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
                    <Ionicons name="remove" size={18} color={item.quantity <= 0 ? Colors.light.textTertiary : Colors.light.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyValue, item.quantity === 0 && styles.qtyZero]}>
                    {item.quantity}
                  </Text>
                  <TouchableOpacity
                    onPress={() => changeQty(item.key, 1)}
                    style={styles.qtyBtn}
                  >
                    <Ionicons name="add" size={18} color={Colors.light.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {totalLabels > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <View style={styles.totalRight}>
                  <Text style={styles.totalValue}>{totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''}</Text>
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
              <Ionicons name="eye-outline" size={20} color={Colors.light.primary} />
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

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          mode="outlined"
          onPress={handlePrint}
          icon="printer-outline"
          style={styles.footerBtn}
          disabled={totalLabels === 0}
        >
          Imprimir
        </Button>
        <Button
          mode="contained"
          onPress={handleShare}
          icon="share-variant"
          style={styles.footerBtn}
          loading={isExporting}
          disabled={totalLabels === 0 || isExporting}
        >
          Compartilhar
        </Button>
      </View>

      {/* Diálogo de impressão */}
      <ConfirmDialog
        visible={printDialog}
        type="info"
        icon="print-outline"
        title="Imprimir Etiquetas"
        message={`${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''} em ${sheetsNeeded} folha${sheetsNeeded !== 1 ? 's' : ''} (${format.label})\n\nCompartilhe a imagem e envie para a impressora compatível ou app de impressão.`}
        confirmText="Compartilhar"
        cancelText="Cancelar"
        onConfirm={handleShare}
        onCancel={() => setPrintDialog(false)}
        loading={isExporting}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

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
  formatScroll: { marginHorizontal: -4 },
  formatScrollContent: { gap: 8, paddingHorizontal: 4, paddingBottom: 4 },
  formatCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    minWidth: 76,
  },
  formatCardActive: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary + '12',
  },
  formatCardMain: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.light.textSecondary,
  },
  formatCardMainActive: { color: Colors.light.primary },
  formatCardSub: {
    fontSize: 10,
    color: Colors.light.textTertiary,
    marginTop: 2,
    textAlign: 'center',
  },
  formatCardSubActive: { color: Colors.light.primary + 'aa' },
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
    borderTopColor: Colors.light.primary + '30',
    backgroundColor: Colors.light.primary + '08',
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
  footerBtn: { flex: 1 },
});
