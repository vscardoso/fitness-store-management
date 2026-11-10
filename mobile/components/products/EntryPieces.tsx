/**
 * Peças de UMA entrada, na tela do produto: qual variação (cor e tamanho), o código da etiqueta, quantas restam, o custo e de QUAL
 * FORNECEDOR veio cada uma. Numa mesma entrada cada peça pode ser de um fornecedor; quem é gerente troca o fornecedor da peça aqui.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency } from '@/utils/format';

export interface EntryPiece {
  entry_item_id: number;
  quantity_received: number;
  quantity_remaining: number;
  quantity_sold?: number;
  quantity_removed?: number;
  unit_cost: number;
  variant_color?: string | null;
  variant_size?: string | null;
  variant_code?: string | null;
  variant_active?: boolean;
  item_supplier_id?: number | null;
  item_supplier_name?: string | null;
}

interface Props {
  pieces: EntryPiece[];
  canEdit: boolean;
  onChangeSupplier: (piece: EntryPiece) => void;
  showCost: boolean;
}

export const pieceLabel = (p: Pick<EntryPiece, 'variant_color' | 'variant_size'>) =>
  [p.variant_color, p.variant_size].filter(Boolean).join(' · ') || 'Peça única';

export default function EntryPieces({ pieces, canEdit, onChangeSupplier, showCost }: Props) {
  const brand = useBrandingColors();
  const [open, setOpen] = useState(false);
  const suppliers = [...new Set(pieces.map((p) => p.item_supplier_name).filter(Boolean))] as string[];

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Ver as peças desta entrada e o fornecedor de cada uma"
      >
        <Ionicons name="layers-outline" size={16} color={brand.primary} />
        <Text style={[styles.toggleText, { color: brand.primary }]}>
          {open ? 'Esconder as peças' : `Ver as ${pieces.length} peça${pieces.length !== 1 ? 's' : ''} e o fornecedor de cada uma`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={brand.primary} />
      </TouchableOpacity>

      {!open && suppliers.length > 1 ? <Text style={styles.hint}>Fornecedores: {suppliers.join(', ')}</Text> : null}

      {open ? (
        <View style={styles.list}>
          {pieces.map((p) => {
            const active = p.variant_active !== false;
            return (
              <View key={p.entry_item_id} style={[styles.row, !active && styles.rowOff]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={1}>{pieceLabel(p)}</Text>
                    {p.variant_code ? <Text style={styles.code}>{p.variant_code}</Text> : null}
                    {!active ? <Text style={styles.off}>variação excluída</Text> : null}
                  </View>
                  <Text style={styles.meta}>
                    {p.quantity_remaining} de {p.quantity_received} restantes
                    {showCost && p.unit_cost > 0 ? ` · ${formatCurrency(p.unit_cost)} a peça` : ''}
                    {(p.quantity_sold ?? 0) > 0 ? ` · ${p.quantity_sold} vendida${p.quantity_sold !== 1 ? 's' : ''}` : ''}
                    {(p.quantity_removed ?? 0) > 0 ? ` · ${p.quantity_removed} saiu sem venda` : ''}
                  </Text>
                  <Text style={styles.supplier} numberOfLines={1}>Fornecedor: {p.item_supplier_name ?? 'não informado'}</Text>
                </View>
                {canEdit && active ? (
                  <AppButton label="Trocar fornecedor" icon="swap-horizontal" variant="outlined" size="sm" onPress={() => onChangeSupplier(p)} />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: theme.spacing.xs, marginHorizontal: theme.spacing.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: theme.spacing.sm },
  toggleText: { flex: 1, fontSize: theme.fontSize.sm, fontWeight: '700' },
  hint: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, paddingHorizontal: theme.spacing.sm, paddingBottom: 4 },
  list: { gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg, backgroundColor: Colors.light.backgroundSecondary,
  },
  rowOff: { opacity: 0.6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: { fontSize: theme.fontSize.sm, fontWeight: '700', color: Colors.light.text },
  code: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  off: { fontSize: theme.fontSize.xs, color: Colors.light.errorDark, fontWeight: '600' },
  meta: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, marginTop: 2 },
  supplier: { fontSize: theme.fontSize.xs, fontWeight: '600', color: Colors.light.text, marginTop: 2 },
});
