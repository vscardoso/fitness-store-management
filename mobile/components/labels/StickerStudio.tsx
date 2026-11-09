/**
 * Tela única de etiquetas: adesivo do verso da tag (a frente já vem impressa com a logo WA).
 * Prévia em escala real, medida (4,7 x 4,2 cm por padrão, outras prontas ou qualquer uma de 3 a 10 cm), quantidade por
 * peça e o papel (fica lembrado no aparelho):
 *  - Folha A4 (padrão): várias por folha, encostadas, com linha de corte no tamanho exato; posição inicial para folha já usada;
 *  - Uma por página: no tamanho exato, para a gráfica ou impressora de etiqueta.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import {
  cmText, customSticker, DEFAULT_STICKER, parseCm, printTagLabels, sizeDims, STICKER_SIZES, stickersPerSheet, stickersPerThermalSheet,
  type StickerSize, type TagLabelLayout,
} from '@/services/labelService';
import StickerPreview from '@/components/labels/StickerPreview';
import { useScrollBleed } from '@/hooks/useLayout';

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
const SIZE_KEY = '@provador:etiqueta_medida';   // última medida usada neste aparelho
const PAPER_KEY = '@provador:etiqueta_papel';    // último papel usado (a4, sheet ou roll)
const SHEET_KEY = '@provador:etiqueta_folha';    // onde parou a última folha: { paper, w, h, next } (a impressora não sabe o que já foi usado, o app lembra)

function sizeFrom(w: number, h: number): StickerSize {
  return STICKER_SIZES.find((s) => s.widthMm === w && s.heightMm === h) ?? customSticker(w, h);
}

const qrOf = (code?: string | null) => (code ? `PV${code}` : null);

export default function StickerStudio({ items, initialQty, onAddMore, onRemove, onGenerated, emptyText }: Props) {
  // PC: a rolagem ocupa a largura toda (barra na borda da janela), conteúdo na coluna
  const bleed = useScrollBleed();
  const brand = useBrandingColors();
  const { width } = useWindowDimensions();
  const [size, setSize] = useState<StickerSize>(DEFAULT_STICKER);
  const [customOpen, setCustomOpen] = useState(false);
  const [wText, setWText] = useState('');
  const [hText, setHText] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [focusId, setFocusId] = useState<number | null>(null);
  const [paper, setPaper] = useState<TagLabelLayout>('a4');
  const [start, setStart] = useState(1);
  const [busy, setBusy] = useState<TagLabelLayout | null>(null);
  const [error, setError] = useState<string | null>(null);

  // peças novas na lista entram com a quantidade inicial; as que já tinham número mantêm o que foi digitado
  useEffect(() => {
    setQty((prev) => {
      const next = { ...prev };
      // uma etiqueta por PEÇA: começa com a quantidade em estoque (sem estoque, 1); "1 de cada" continua no atalho
      for (const it of items) {
        if (next[it.variantId] == null) next[it.variantId] = initialQty?.[it.variantId] ?? (it.stock > 0 ? Math.min(MAX_PER_ITEM, it.stock) : 1);
      }
      return next;
    });
  }, [items, initialQty]);

  // volta à medida usada da última vez (sem armazenamento, fica a 4,7 x 4,2 cm)
  useEffect(() => {
    AsyncStorage.getItem(SIZE_KEY)
      .then((raw) => {
        const v = raw ? JSON.parse(raw) : null;
        if (v && parseCm(cmText(v.w)) === v.w && parseCm(cmText(v.h)) === v.h) setSize(sizeFrom(v.w, v.h));
      })
      .catch(() => {});
    AsyncStorage.getItem(PAPER_KEY)
      .then((raw) => { if (raw === 'a4' || raw === 'roll' || raw === 'sheet') setPaper(raw); })
      .catch(() => {});
  }, []);

  const choosePaper = (p: TagLabelLayout) => {
    setPaper(p);
    AsyncStorage.setItem(PAPER_KEY, p).catch(() => {});
  };

  const chooseSize = (s: StickerSize) => {
    setSize(s);
    setCustomError(null);
    AsyncStorage.setItem(SIZE_KEY, JSON.stringify({ w: s.widthMm, h: s.heightMm })).catch(() => {});
  };
  const applyCustom = () => {
    const w = parseCm(wText);
    const h = parseCm(hText);
    if (w == null || h == null) {
      setCustomError('Digite largura e altura em centímetros, de 3 a 10 (ex.: 6 e 5, ou 6,5 e 5,5).');
      return;
    }
    chooseSize(sizeFrom(w, h));
    setCustomOpen(false);
  };
  const perA4 = stickersPerSheet(size.widthMm, size.heightMm);
  const perThermal = stickersPerThermalSheet(size.widthMm, size.heightMm);
  const perSheet = paper === 'sheet' ? Math.max(1, perThermal) : perA4;
  const chosen = items.map((it) => ({ it, q: qty[it.variantId] ?? 0 })).filter((x) => x.q > 0);
  const total = chosen.reduce((sum, x) => sum + x.q, 0);
  const sheets = total > 0 ? Math.ceil((total + start - 1) / perSheet) : 0;
  const shown = items.find((i) => i.variantId === focusId) ?? chosen[0]?.it ?? items[0];
  const pxPerMm = Math.max(2.4, Math.min(5, (width - 2 * theme.spacing.md - 2 * theme.spacing.lg) / size.widthMm));

  // a folha que sobrou da última impressão: o app começa na próxima posição livre, sem a pessoa precisar contar.
  // Trocou a medida ou o papel (muda quantas cabem): volta ao 1 para não ficar fora da grade.
  const [continuing, setContinuing] = useState(false);
  useEffect(() => {
    let alive = true;
    setStart(1); setContinuing(false);
    if (paper === 'roll') return;
    AsyncStorage.getItem(SHEET_KEY).then((raw) => {
      const v = raw ? JSON.parse(raw) : null;
      if (alive && v && v.paper === paper && v.w === size.widthMm && v.h === size.heightMm && v.next > 1 && v.next <= perSheet) {
        setStart(v.next); setContinuing(true);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [paper, size.widthMm, size.heightMm, perSheet]);
  const newSheet = () => {
    setStart(1); setContinuing(false);
    AsyncStorage.removeItem(SHEET_KEY).catch(() => {});
  };

  const set = (id: number, v: number) => setQty((p) => ({ ...p, [id]: Math.max(0, Math.min(MAX_PER_ITEM, v)) }));
  const fill = (fn: (it: StickerItem) => number) => setQty(Object.fromEntries(items.map((it) => [it.variantId, Math.max(0, Math.min(MAX_PER_ITEM, fn(it)))])));

  const generate = async (layout: TagLabelLayout) => {
    if (total === 0 || busy) return;
    setBusy(layout);
    setError(null);
    try {
      await printTagLabels(
        chosen.map((x) => ({ variantId: x.it.variantId, quantity: x.q })),
        { layout, startPosition: layout === 'roll' ? 1 : start, widthMm: size.widthMm, heightMm: size.heightMm },
      );
      if (layout !== 'roll') {
        // onde a próxima impressão deve começar: 1 se a folha foi toda usada, senão a primeira posição que sobrou
        const used = (start - 1 + total) % perSheet;
        const next = used === 0 ? 1 : used + 1;
        setStart(next); setContinuing(next > 1);
        AsyncStorage.setItem(SHEET_KEY, JSON.stringify({ paper: layout, w: size.widthMm, h: size.heightMm, next })).catch(() => {});
      }
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
      <ScrollView
          style={bleed.scrollStyle} contentContainerStyle={[styles.content, bleed.contentStyle]} keyboardShouldPersistTaps="handled">
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
            Adesivo do verso da tag, {sizeDims(size.widthMm, size.heightMm)} cm. A frente com a logo WA já vem impressa.
            {shown && !shown.code ? ' O código desta peça é criado ao gerar o PDF.' : ''}
          </Text>
        </View>

        {/* Medida */}
        <Text style={styles.sectionTitle}>Medida do adesivo</Text>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {[...STICKER_SIZES, ...(size.id === 'custom' ? [size] : [])].map((s) => {
            const on = s.widthMm === size.widthMm && s.heightMm === size.heightMm;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.segmentBtn, on && styles.segmentOn]}
                onPress={() => chooseSize(s)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                activeOpacity={0.8}
              >
                {/* desenho na proporção real: mostra de bate-pronto qual lado é a largura */}
                <View style={styles.sizeShapeBox}>
                  <View style={[styles.sizeShape, on && { borderColor: brand.primary },
                    { width: 30 * Math.min(1, s.widthMm / Math.max(s.widthMm, s.heightMm)), height: 30 * Math.min(1, s.heightMm / Math.max(s.widthMm, s.heightMm)) }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.segmentMain, on && styles.segmentMainOn]}>{s.name}</Text>
                  <Text style={[styles.segmentSub, on && styles.segmentSubOn]}>{sizeDims(s.widthMm, s.heightMm)}</Text>
                  <Text style={[styles.segmentSub, on && styles.segmentSubOn]}>
                    {s.note ? `${s.note} · ` : ''}{stickersPerSheet(s.widthMm, s.heightMm)} por folha A4
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={styles.customToggle}
          onPress={() => {
            setWText(cmText(size.widthMm));
            setHText(cmText(size.heightMm));
            setCustomError(null);
            setCustomOpen((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: customOpen }}
        >
          <Ionicons name="resize-outline" size={16} color={brand.primary} />
          <Text style={styles.addMoreText}>Outro tamanho</Text>
        </TouchableOpacity>
        {customOpen ? (
          <View style={styles.sheetBox}>
            <Text style={styles.muted}>Medida da etiqueta em centímetros (de 3 a 10). Largura é o lado de cima.</Text>
            <View style={styles.customRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Largura (cm)</Text>
                <TextInput style={styles.input} value={wText} onChangeText={setWText} keyboardType="decimal-pad" placeholder="6" accessibilityLabel="Largura em centímetros" />
              </View>
              <Text style={styles.times}>×</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Altura (cm)</Text>
                <TextInput style={styles.input} value={hText} onChangeText={setHText} keyboardType="decimal-pad" placeholder="5" accessibilityLabel="Altura em centímetros" />
              </View>
            </View>
            {customError ? <Text style={styles.error} accessibilityLiveRegion="polite">{customError}</Text> : null}
            <TouchableOpacity style={styles.secondaryBtn} onPress={applyCustom} accessibilityRole="button">
              <Text style={styles.secondaryText}>Usar esta medida</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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

        {/* Papel: A4 (várias por folha, com marcas de corte) ou uma por página (gráfica/térmica) */}
        <Text style={styles.paperTitle}>Papel</Text>
        <View style={styles.paperRow}>
          {([
            { key: 'a4' as TagLabelLayout, icon: 'grid-outline' as const, title: 'Folha A4', note: `${perA4} por folha, com linha de corte` },
            { key: 'sheet' as TagLabelLayout, icon: 'apps-outline' as const, title: 'Folha 10 × 15', note: perThermal > 0 ? `${perThermal} por folha térmica, para cortar` : 'Não cabe: use etiqueta menor' },
            { key: 'roll' as TagLabelLayout, icon: 'document-outline' as const, title: 'Uma por página', note: 'Gráfica ou impressora de etiqueta' },
          ]).map((o) => {
            const on = paper === o.key;
            return (
              <TouchableOpacity
                key={o.key}
                style={[styles.paperOpt, on && styles.paperOptOn]}
                onPress={() => choosePaper(o.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Ionicons name={o.icon} size={20} color={on ? brand.primary : Colors.light.textSecondary} />
                <Text style={[styles.paperOptTitle, on && { color: brand.primary }]}>{o.title}</Text>
                <Text style={styles.paperOptNote}>{o.note}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {paper !== 'roll' ? (
          <View style={styles.sheetBox}>
            <Text style={styles.sheetTitle}>
              {start === 1
                ? 'Folha nova: a impressão começa na posição 1.'
                : `Folha que sobrou: começa na posição ${start}. Os espaços com ✕ já foram usados.`}
            </Text>
            <Text style={styles.muted}>
              {total > 0
                ? `${total} etiqueta${total !== 1 ? 's' : ''} = ${sheets} folha${sheets !== 1 ? 's' : ''}`
                  + ((start - 1 + total) % perSheet === 0 ? ', sem sobra.' : `; a última fica com ${(start - 1 + total) % perSheet} de ${perSheet} usadas e o app guarda o resto para a próxima vez.`)
                : 'Escolha as quantidades para ver quantas folhas vão precisar.'}
            </Text>
            {continuing || start > 1 ? (
              <TouchableOpacity onPress={newSheet} accessibilityRole="button" accessibilityLabel="Usar folha nova" style={styles.newSheetBtn}>
                <Text style={styles.newSheetText}>Coloquei uma folha nova (começar no 1)</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.muted}>Para mudar o ponto de partida à mão, toque na posição:</Text>
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
            <Text style={styles.barSub}>
              {size.name} · {paper === 'roll' ? 'uma por página' : `${paper === 'sheet' ? '10 × 15' : 'A4'}, ${sheets} folha${sheets !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, (total === 0 || !!busy) && styles.disabled]}
            onPress={() => generate(paper)}
            disabled={total === 0 || !!busy}
            accessibilityRole="button"
          >
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={styles.primaryText}>{busy ? 'Gerando...' : 'Gerar PDF'}</Text>
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
    paperTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text, marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
    paperRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
    paperOpt: {
      flex: 1, minWidth: 0, gap: 2, padding: theme.spacing.md,
      borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card,
    },
    paperOptOn: { borderColor: primary, backgroundColor: primary + '0D' },
    paperOptTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
    paperOptNote: { fontSize: 12, color: Colors.light.textSecondary },
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
    segment: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    segmentBtn: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, flexGrow: 1, flexBasis: '45%', borderRadius: theme.borderRadius.xl, borderWidth: 1.5, borderColor: Colors.light.border, padding: theme.spacing.md, backgroundColor: Colors.light.card },
    sizeShapeBox: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    sizeShape: { borderWidth: 2, borderColor: Colors.light.textSecondary, borderRadius: 3 },
    segmentOn: { borderColor: primary, backgroundColor: primary + '12' },
    segmentMain: { fontSize: theme.fontSize.lg, fontWeight: '800', color: Colors.light.text },
    segmentMainOn: { color: primary },
    segmentSub: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, marginTop: 2 },
    segmentSubOn: { color: primary },
    sheetTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
    newSheetBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: primary },
    newSheetText: { color: primary, fontWeight: '700', fontSize: 13 },
    customToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: theme.spacing.sm, alignSelf: 'flex-start' },
    customRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
    inputLabel: { fontSize: theme.fontSize.xs, fontWeight: '700', color: Colors.light.textSecondary, marginBottom: 4 },
    input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: theme.borderRadius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: Colors.light.text, backgroundColor: Colors.light.background },
    times: { fontSize: theme.fontSize.lg, fontWeight: '800', color: Colors.light.textSecondary, paddingBottom: 10 },
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
