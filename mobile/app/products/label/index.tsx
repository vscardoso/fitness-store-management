/**
 * Estúdio de Etiquetas — gera etiquetas de múltiplos produtos
 * aproveitando a folha inteira sem desperdício.
 */

import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import ProductLabel, { LabelData } from '@/components/labels/ProductLabel';
import LabelProductPickerModal, { type PickedItem } from '@/components/labels/LabelProductPickerModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import PageHeader from '@/components/layout/PageHeader';
import { Colors } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';

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
  const viewShotRef = useRef<ViewShot>(null);

  const [formatId,      setFormatId]      = useState('f14');
  const [showPrice,     setShowPrice]     = useState(true);
  const [showSku,       setShowSku]       = useState(true);
  const [items,         setItems]         = useState<LabelItem[]>([]);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [exporting,     setExporting]     = useState(false);
  const [printDialog,   setPrintDialog]   = useState(false);
  const [errorDialog,   setErrorDialog]   = useState(false);

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

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Recebe N itens do picker e os adiciona/incrementa no estúdio */
  const handlePickConfirm = (picked: PickedItem[]) => {
    setItems(prev => {
      const next = [...prev];
      for (const { product, variant } of picked) {
        const key = `v_${variant.id}`;
        const idx = next.findIndex(i => i.key === key);
        if (idx >= 0) {
          next[idx] = { ...next[idx], quantity: Math.min(99, next[idx].quantity + 1) };
        } else {
          const parts = [variant.size, variant.color].filter(Boolean);
          next.push({
            key,
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
        }
      }
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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* ── Configuração de folha ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="settings-outline" size={18} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Configuração</Text>
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
                onPress={() => setShowPrice(v => !v)}
              >
                <Ionicons name="pricetag-outline" size={14} color={showPrice ? '#fff' : Colors.light.textSecondary} />
                <Text style={[styles.chipText, showPrice && styles.chipTextActive]}>Preço</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, showSku && styles.chipActive]}
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
              <Ionicons name="albums-outline" size={18} color={Colors.light.primary} />
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
                    backgroundColor: emptySlots === 0 ? Colors.light.success : Colors.light.primary,
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
            <Ionicons name="layers-outline" size={18} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>
              Produtos{items.length > 0 ? ` (${items.length})` : ''}
            </Text>
            <View style={styles.headerActions}>
              {items.some(i => i.stock > 0) && (
                <TouchableOpacity onPress={fillFromStock} style={styles.actionBtn}>
                  <Ionicons name="flash-outline" size={13} color={Colors.light.primary} />
                  <Text style={styles.actionBtnText}>Do estoque</Text>
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
              <Ionicons name="add-circle-outline" size={20} color={Colors.light.primary} />
              <View style={styles.addProductTextWrap}>
                <Text style={styles.addProductText}>
                  {items.length === 0 ? 'Selecionar produtos' : 'Adicionar mais produtos'}
                </Text>
                <Text style={styles.addProductSub}>Marque vários de uma vez</Text>
              </View>
            </TouchableOpacity>

            {/* Total */}
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

        {/* ── Preview ── */}
        {totalLabels > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="eye-outline" size={18} color={Colors.light.primary} />
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
          loading={exporting}
          disabled={totalLabels === 0 || exporting}
        >
          Compartilhar
        </Button>
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
    borderColor: Colors.light.primary,
    borderStyle: 'dashed',
    backgroundColor: Colors.light.primary + '06',
  },
  addProductTextWrap: { flex: 1 },
  addProductText: { fontSize: 15, fontWeight: '600', color: Colors.light.primary },
  addProductSub: { fontSize: 12, color: Colors.light.primary + 'aa', marginTop: 1 },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.light.primary + '08',
    borderWidth: 1,
    borderColor: Colors.light.primary + '25',
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
  footerBtn: { flex: 1 },
});
