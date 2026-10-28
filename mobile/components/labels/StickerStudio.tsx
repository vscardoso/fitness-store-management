/**
 * Tela única de etiquetas: adesivo do verso da tag (a frente já vem impressa com a logo WA).
 * Prévia em escala real, medida (6x5 ou 5x6), quantidade por peça e dois destinos:
 *  - PDF para a gráfica: uma etiqueta por página, no tamanho exato;
 *  - folha A4 adesiva: impressora comum, com posição inicial para folha já usada.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { printTagLabels, STICKER_SIZES, stickersPerSheet, type TagLabelLayout } from '@/services/labelService';
import StickerPreview from '@/components/labels/StickerPreview';

export interface StickerItem {
  variantId: number;
  productName: string;
  color?: string | null;
  size?: string | null;
  price: number;
  code?: string | null; // '#101-1' (ou '#0123' nas peças antigas); vazio = o servidor cria ao gerar o PDF
  stock: number;
}

interface Props {
  items: StickerItem[];
  /** Quantidade inicial por peça (padrão 1). */
  initialQty?: Record<number, number>;
  /** Estúdio em lote: botão para escolher mais peças. */
  onAddMore?: () => void;
  onRemove?: (variantId: number) => void;
  /** Depois de gerar, o servidor pode ter criado códigos novos. */
  onGenerated?: () => void;
  /** Texto quando não há peças (produto sem variação, por exemplo). */
  emptyText?: string;
}

const MAX_PER_ITEM = 200;

const qrOf = (code?: string | null) => (code ? `PV${code}` : null);

export default function StickerStudio({ items, initialQty, onAddMore, onRemove, onGenerated, emptyText }: Props) {
  const brand = useBrandingColors();
  const { width } = useWindowDimensions();
  const [sizeId, setSizeId] = useState<(typeof STICKER_SIZES)[number]['id']>('6x5');
  const [qty, setQty] = useState<Record<number, number>>({});
  const [focusId, setFocusId] = useState<number | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [start, setStart] = useState(1);
  const [busy, setBusy] = useState<TagLabelLayout | null>(null);
  const [error, setError] = useState<string | null>(null);

  // peças novas na lista entram com a quantidade inicial; as que já tinham número mantêm o que foi digitado
  useEffect(() => {
    setQty((prev) => {
      const next = { ...prev };
      for (const it of items) if (next[it.variantId] == null) next[it.variantId] = initialQty?.[it.variantId] ?? 1;
      return next;
    });
  }, [items, initialQty]);

  const size = STICKER_SIZES.find((s) => s.id === sizeId) ?? STICKER_SIZES[0];
  const perSheet = stickersPerSheet(size.widthMm, size.heightMm);
  const chosen = items.map((it) => ({ it, q: qty[it.variantId] ?? 0 })).filter((x) => x.q > 0);
  const total = chosen.reduce((sum, x) => sum + x.q, 0);
  const sheets = total > 0 ? Math.ceil((total + start - 1) / perSheet) : 0;
  const shown = items.find((i) => i.variantId === focusId) ?? chosen[0]?.it ?? items[0];
  const pxPerMm = Math.max(2.4, Math.min(5, (width - 2 * theme.spacing.md - 2 * theme.spacing.lg) / size.widthMm));

  // trocar a medida muda quantas cabem por folha: a posição inicial volta ao 1 para não ficar fora da grade
  useEffect(() => setStart(1), [sizeId]);

  const set = (id: number, v: number) => setQty((p) => ({ ...p, [id]: Math.max(0, Math.min(MAX_PER_ITEM, v)) }));
  const fill = (fn: (it: StickerItem) => number) => setQty(Object.fromEntries(items.map((it) => [it.variantId, Math.max(0, Math.min(MAX_PER_ITEM, fn(it)))])));

  const generate = async (layout: TagLabelLayout) => {
    if (total === 0 || busy) return;
    setBusy(layout);
    setError(null);
    try {
      await printTagLabels(
        chosen.map((x) => ({ variantId: x.it.variantId, quantity: x.q })),
        { layout, startPosition: layout === 'a4' ? start : 1, widthMm: size.widthMm, heightMm: size.heightMm },
      );
      onGenerated?.();
    } catch (e: any) {
      setError(e?.message || 'Não foi possível gerar o PDF. Tente de novo.');
    } finally {
      setBusy(null);
    }
  };

  const label = (it: StickerItem) => [it.color, it.size].filter(Boolean).join(' · ') || 'Única';

  const styles = useMemo(() => makeStyles(brand.primary), [brand.primary]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Prévia: o adesivo como vai sair, em tamanho proporcional */}
        <View style={styles.previewCard}>
          {shown ? (
            <StickerPreview
              data={{ name: shown.productName, color: shown.color, size: shown.size, price: shown.price, code: shown.code, qr: qrOf(shown.code) }}
              widthMm={size.widthMm}
              heightMm={size.heightMm}
              pxPerMm={pxPerMm}
            />
          ) : (
            <Text style={styles.muted}>Escolha as peças para ver o adesivo.</Text>
          )}
          <Text style={styles.previewNote}>
            Adesivo do verso da tag, {size.name} ({size.note}). A frente com a logo WA já vem impressa.
            {shown && !shown.code ? ' O código desta peça é criado ao gerar o PDF.' : ''}
          </Text>
        </View>

        {/* Medida */}
        <Text style={styles.sectionTitle}>Medida do adesivo</Text>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {STICKER_SIZES.map((s) => {
            const on = s.id === sizeId;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.segmentBtn, on && styles.segmentOn]}
                onPress={() => setSizeId(s.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentMain, on && styles.segmentMainOn]}>{s.name}</Text>
                <Text style={[styles.segmentSub, on && styles.segmentSubOn]}>
                  {s.note} · {stickersPerSheet(s.widthMm, s.heightMm)} por folha A4
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Peças */}
        <View style={styles.listHead}>
          <Text style={styles.sectionTitle}>Peças e quantidades</Text>
          {onAddMore ? (
            <TouchableOpacity onPress={onAddMore} style={styles.addMore} accessibilityRole="button">
              <Ionicons name="add" size={16} color={brand.primary} />
              <Text style={styles.addMoreText}>Adicionar peças</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {items.length > 0 ? (
        <View style={styles.quick}>
          <TouchableOpacity style={styles.chip} onPress={() => fill(() => 1)}>
            <Text style={styles.chipText}>1 de cada</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip} onPress={() => fill((it) => it.stock)}>
            <Text style={styles.chipText}>Igual ao estoque</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip} onPress={() => fill(() => 0)}>
            <Text style={styles.chipText}>Zerar</Text>
          </TouchableOpacity>
        </View>
        ) : null}

        {items.length === 0 ? <Text style={styles.muted}>{emptyText ?? 'Nenhuma peça ainda. Toque em "Adicionar peças".'}</Text> : null}
        {items.map((it) => {
          const q = qty[it.variantId] ?? 0;
          const focused = it.variantId === shown?.variantId;
          return (
            <TouchableOpacity
              key={it.variantId}
              style={[styles.row, focused && styles.rowFocused, q === 0 && styles.rowOff]}
              onPress={() => setFocusId(it.variantId)}
              activeOpacity={0.8}
              accessibilityLabel={`${it.productName} ${label(it)}, ${q} etiquetas`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{label(it)}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {onAddMore ? `${it.productName} · ` : ''}
                  {it.code ?? 'sem código ainda'} · estoque {it.stock}
                </Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => set(it.variantId, q - 1)} accessibilityLabel="Menos uma etiqueta" hitSlop={6}>
                  <Ionicons name="remove" size={18} color={Colors.light.text} />
                </TouchableOpacity>
                <Text style={styles.qty}>{q}</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => set(it.variantId, q + 1)} accessibilityLabel="Mais uma etiqueta" hitSlop={6}>
                  <Ionicons name="add" size={18} color={Colors.light.text} />
                </TouchableOpacity>
              </View>
              {onRemove ? (
                <TouchableOpacity onPress={() => onRemove(it.variantId)} accessibilityLabel="Tirar da lista" hitSlop={8} style={{ marginLeft: 8 }}>
                  <Ionicons name="close-circle-outline" size={20} color={Colors.light.textTertiary} />
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          );
        })}

        {/* Folha A4: só abre se for imprimir em casa */}
        <TouchableOpacity style={styles.sheetToggle} onPress={() => setShowSheet((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showSheet }}>
          <Ionicons name="document-outline" size={18} color={Colors.light.textSecondary} />
          <Text style={styles.sheetToggleText}>Imprimir em casa, folha A4 adesiva</Text>
          <Ionicons name={showSheet ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.light.textTertiary} />
        </TouchableOpacity>
        {showSheet ? (
          <View style={styles.sheetBox}>
            <Text style={styles.muted}>Folha já usada? Toque na primeira posição livre. Cabem {perSheet} por folha.</Text>
            <View style={styles.grid}>
              {Array.from({ length: perSheet }, (_, i) => i + 1).map((pos) => {
                const used = pos < start;
                const on = pos === start;
                return (
                  <TouchableOpacity
                    key={pos}
                    style={[styles.cell, used && styles.cellUsed, on && styles.cellOn]}
                    onPress={() => setStart(pos)}
                    accessibilityLabel={`Começar na posição ${pos}`}
                  >
                    <Text style={[styles.cellText, used && styles.cellTextUsed, on && { color: brand.primary }]}>{used ? '✕' : pos}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.secondaryBtn, (total === 0 || !!busy) && styles.disabled]}
              onPress={() => generate('a4')}
              disabled={total === 0 || !!busy}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>
                {busy === 'a4' ? 'Gerando...' : total > 0 ? `Gerar folha A4 (${sheets} folha${sheets !== 1 ? 's' : ''})` : 'Escolha as quantidades'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Barra fixa: o que sai e para onde */}
      <View style={styles.bar}>
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        <View style={styles.barRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.barTotal}>{total} etiqueta{total !== 1 ? 's' : ''}</Text>
            <Text style={styles.barSub}>{size.name} · {size.note}</Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, (total === 0 || !!busy) && styles.disabled]}
            onPress={() => generate('roll')}
            disabled={total === 0 || !!busy}
            accessibilityRole="button"
          >
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={styles.primaryText}>{busy === 'roll' ? 'Gerando...' : 'PDF para a gráfica'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (primary: string) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.light.background },
    content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
    previewCard: {
      alignItems: 'center',
      backgroundColor: '#f4f4f5',
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.md,
    },
    previewNote: { marginTop: theme.spacing.sm, textAlign: 'center', fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
    sectionTitle: { fontSize: theme.fontSize.base, fontWeight: '800', color: Colors.light.text, marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
    muted: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
    segment: { flexDirection: 'row', gap: theme.spacing.sm },
    segmentBtn: { flex: 1, borderRadius: theme.borderRadius.xl, borderWidth: 1.5, borderColor: Colors.light.border, padding: theme.spacing.md, backgroundColor: Colors.light.card },
    segmentOn: { borderColor: primary, backgroundColor: primary + '12' },
    segmentMain: { fontSize: theme.fontSize.lg, fontWeight: '800', color: Colors.light.text },
    segmentMainOn: { color: primary },
    segmentSub: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, marginTop: 2 },
    segmentSubOn: { color: primary },
    listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    addMore: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
    addMoreText: { color: primary, fontWeight: '700', fontSize: theme.fontSize.sm },
    quick: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
    chip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.light.card },
    chipText: { fontSize: theme.fontSize.xs, fontWeight: '700', color: Colors.light.text },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.light.card,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1.5,
      borderColor: Colors.light.border,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    rowFocused: { borderColor: primary },
    rowOff: { opacity: 0.6 },
    rowTitle: { fontSize: theme.fontSize.sm, fontWeight: '800', color: Colors.light.text },
    rowSub: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, marginTop: 2 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stepBtn: { width: 34, height: 34, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: Colors.light.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.background },
    qty: { minWidth: 30, textAlign: 'center', fontSize: theme.fontSize.base, fontWeight: '800', color: Colors.light.text },
    sheetToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: theme.spacing.md, marginTop: theme.spacing.sm },
    sheetToggleText: { flex: 1, fontSize: theme.fontSize.sm, fontWeight: '700', color: Colors.light.textSecondary },
    sheetBox: { backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border, padding: theme.spacing.md, gap: theme.spacing.md },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    cell: { width: 48, height: 40, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border, alignItems: 'center', justifyContent: 'center' },
    cellUsed: { backgroundColor: '#f4f4f5' },
    cellOn: { borderColor: primary, backgroundColor: primary + '18' },
    cellText: { fontWeight: '700', color: Colors.light.text },
    cellTextUsed: { color: Colors.light.textTertiary },
    secondaryBtn: { borderRadius: theme.borderRadius.xl, borderWidth: 1.5, borderColor: primary, paddingVertical: 13, alignItems: 'center' },
    secondaryText: { color: primary, fontWeight: '800', fontSize: theme.fontSize.sm },
    bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Colors.light.background, borderTopWidth: 1, borderTopColor: Colors.light.border, padding: theme.spacing.md },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
    barTotal: { fontSize: theme.fontSize.lg, fontWeight: '800', color: Colors.light.text },
    barSub: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
    primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: primary, borderRadius: theme.borderRadius.xxl, paddingHorizontal: 20, paddingVertical: 14 },
    primaryText: { color: '#fff', fontWeight: '800', fontSize: theme.fontSize.base },
    disabled: { opacity: 0.45 },
    error: { color: '#b91c1c', fontSize: theme.fontSize.sm, marginBottom: theme.spacing.sm },
  });
