/**
 * Tela única de etiquetas: adesivo do verso da tag (a frente já vem impressa com a logo WA).
 * Só monta as partes; a lógica e o fluxo (editar, gerar PDF, confirmar que imprimiu, desfazer) estão em `studio/useLabelPrint`.
 *
 *   prévia do adesivo
 *   1. O que imprimir      studio/LabelItems
 *   2. Como imprimir       studio/PrintSettings (tamanho e papel em lista)
 *   3. Folha               studio/SheetMap (só em folha)
 *   barra de baixo         studio/PrintBar (um botão principal por etapa)
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Colors, theme } from '@/constants/Colors';
import { sizeDims } from '@/services/labelService';
import StickerPreview from '@/components/labels/StickerPreview';
import { useScrollBleed } from '@/hooks/useLayout';
import LabelItems from './studio/LabelItems';
import PrintBar from './studio/PrintBar';
import PrintSettings from './studio/PrintSettings';
import RecentPrints from './studio/RecentPrints';
import SheetMap from './studio/SheetMap';
import { useLabelPrint, type StickerItem } from './studio/useLabelPrint';

export type { StickerItem } from './studio/useLabelPrint';

interface Props {
  items: StickerItem[];
  /** Quantidade inicial por peça (padrão: o estoque, ou 1). */
  initialQty?: Record<number, number>;
  /** Estúdio em lote: botão para escolher mais peças. */
  onAddMore?: () => void;
  onRemove?: (variantId: number) => void;
  /** Depois de gerar, o servidor pode ter criado códigos novos. */
  onGenerated?: () => void;
  /** Texto quando não há peças (produto sem variação, por exemplo). */
  emptyText?: string;
  /** Peças que vieram da fila de impressão: confirmar que imprimiu tira da fila. */
  fromQueue?: boolean;
  /** Entrada de origem (impressão direta da entrada), para contar o que já saiu dela. */
  entryId?: number | null;
  /** Depois que a pessoa confirma que imprimiu (ou desfaz). */
  onPrinted?: () => void;
}

const qrOf = (code?: string | null) => (code ? `PV${code}` : null);
const PAPER_NAME = { sheet: 'folha 10 × 15', a4: 'folha A4', roll: 'uma por página' } as const;

export default function StickerStudio({ items, initialQty, onAddMore, onRemove, onGenerated, emptyText, fromQueue, entryId, onPrinted }: Props) {
  const bleed = useScrollBleed();   // PC: a rolagem ocupa a largura toda, o conteúdo fica na coluna
  const { width } = useWindowDimensions();
  const p = useLabelPrint({ items, initialQty, fromQueue, entryId, onGenerated, onPrinted });
  const [focusId, setFocusId] = useState<number | undefined>(undefined);

  const shown = items.find((i) => i.variantId === focusId) ?? p.chosen[0]?.it ?? items[0];
  const pxPerMm = Math.max(2.4, Math.min(5, (width - 2 * theme.spacing.md - 2 * theme.spacing.lg) / p.size.widthMm));
  const summary = `${p.size.name} · ${PAPER_NAME[p.paper]}${p.paper === 'roll' ? '' : `, ${p.sheets} folha${p.sheets !== 1 ? 's' : ''}`}`;
  const styles = useMemo(() => makeStyles(), []);

  return (
    <View style={styles.root}>
      <ScrollView style={bleed.scrollStyle} contentContainerStyle={[styles.content, bleed.contentStyle]} keyboardShouldPersistTaps="handled">
        <View style={styles.preview}>
          {shown ? (
            <StickerPreview
              data={{ name: shown.productName, color: shown.color, size: shown.size, price: shown.price, code: shown.code, qr: qrOf(shown.code) }}
              widthMm={p.size.widthMm}
              heightMm={p.size.heightMm}
              pxPerMm={pxPerMm}
            />
          ) : (
            <Text style={styles.muted}>Escolha as peças para ver o adesivo.</Text>
          )}
          <Text style={styles.previewNote}>
            Adesivo do verso da tag, {sizeDims(p.size.widthMm, p.size.heightMm)} cm. A frente com a logo WA já vem impressa.
            {shown && !shown.code ? ' O código desta peça é criado ao gerar o PDF.' : ''}
          </Text>
        </View>

        <LabelItems
          items={items} qty={p.qty} focusId={shown?.variantId} onFocus={setFocusId} onChange={p.setQuantity} onFill={p.fill}
          showProduct={!!(onAddMore || fromQueue)} onRemove={onRemove} onAddMore={onAddMore} emptyText={emptyText}
        />
        <PrintSettings size={p.size} onSize={p.chooseSize} paper={p.paper} onPaper={p.choosePaper} perA4={p.perA4} perThermal={p.perThermal} />
        {p.paper !== 'roll' ? (
          <SheetMap
            start={p.start} onPick={p.setStart} onNewSheet={p.newSheet} perSheet={p.perSheet} total={p.total} sheets={p.sheets}
            leftover={p.leftover} usedCells={p.usedCells}
            lastJob={p.step === 'done' ? null : p.lastJob} onUndo={p.undo} undoing={p.busy === 'undo'}
          />
        ) : null}
        <RecentPrints />
        <View style={{ height: 200 }} />
      </ScrollView>
      <PrintBar p={p} summary={summary} />
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl, gap: theme.spacing.lg },
  preview: { alignItems: 'center', backgroundColor: '#f4f4f5', borderRadius: theme.borderRadius.xl, padding: theme.spacing.lg },
  previewNote: { marginTop: theme.spacing.sm, textAlign: 'center', fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  muted: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
});
