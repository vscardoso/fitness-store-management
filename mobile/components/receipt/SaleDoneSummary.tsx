/**
 * Resumo da venda que acabou de ser concluída (tela "Venda concluída").
 *
 * Ordem de importância para quem está no balcão: quanto foi, como foi pago, para quem. Os itens ficam recolhidos (a lista
 * de 7 peças empurrava o resto da tela para baixo) e abrem com um toque. O brinde aparece a "sem cobrança".
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import PaymentLines from '@/components/receipt/PaymentLines';
import { Money } from '@/components/ui/PriceDisplay';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { itemsDiscountOf } from '@/utils/itemDiscount';
import type { SaleWithDetails } from '@/types';

interface Props {
  sale: SaleWithDetails;
  /** Brindes dados junto com a venda (vêm do comprovante do servidor) */
  gifts?: { name: string; variant: string | null; quantity: number }[];
}

export default function SaleDoneSummary({ sale, gifts = [] }: Props) {
  const brand = useBrandingColors();
  const [open, setOpen] = useState(false);
  const pieces = sale.items.reduce((n, i) => n + Number(i.quantity || 0), 0);
  const itemsDiscount = itemsDiscountOf(sale.items as any);
  const discount = itemsDiscount + Number(sale.discount_amount || 0);

  return (
    <View style={styles.card}>
      <View style={styles.hero}>
        <View style={[styles.okIcon, { backgroundColor: Colors.light.successLight }]}>
          <Ionicons name="checkmark" size={30} color={Colors.light.success} />
        </View>
        <Text style={styles.caption}>Total da venda</Text>
        <Money value={Number(sale.total_amount)} size={40} color={Colors.light.success} />
        <Text style={styles.sub} numberOfLines={2}>
          {pieces} peça{pieces === 1 ? '' : 's'}{sale.customer_name ? ` · ${sale.customer_name}` : ''}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{(sale.payments?.length ?? 0) > 1 ? 'Pagamentos' : 'Pagamento'}</Text>
        <PaymentLines payments={sale.payments ?? []} fallbackMethod={sale.payment_method} fallbackAmount={Number(sale.total_amount)} />
        {discount > 0 && (
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: Colors.light.warning }]}>Descontos</Text>
            <Text style={[styles.rowValue, { color: Colors.light.warning }]}>- {formatCurrency(discount)}</Text>
          </View>
        )}
        {gifts.map((g, i) => (
          <View key={i} style={styles.row}>
            <View style={styles.giftLeft}>
              <Ionicons name="gift-outline" size={16} color={brand.primary} />
              <Text style={styles.giftText} numberOfLines={2}>
                Brinde · {g.quantity > 1 ? `${g.quantity}x ` : ''}{g.name}{g.variant ? ` (${g.variant})` : ''}
              </Text>
            </View>
            <Text style={styles.rowValue}>sem cobrança</Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.toggle} onPress={() => setOpen((v) => !v)} accessibilityRole="button"
        accessibilityLabel={open ? 'Esconder os itens' : `Ver os ${sale.items.length} itens`}>
        <Text style={[styles.toggleText, { color: brand.primary }]}>
          {open ? 'Esconder os itens' : `Ver os ${sale.items.length} ${sale.items.length === 1 ? 'item' : 'itens'}`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={brand.primary} />
      </Pressable>

      {open && (
        <View style={styles.items}>
          {sale.items.map((item, i) => {
            const name = item.product?.name || item.product?.description || 'Produto';
            const variant = (item as any).variant_label as string | undefined;
            const line = Number((item as any).discount_amount ?? 0);
            const gross = Number(item.unit_price) * item.quantity;
            return (
              <View key={i} style={styles.item}>
                <Text style={styles.itemQty}>{item.quantity}x</Text>
                <View style={styles.itemMid}>
                  <Text style={styles.itemName} numberOfLines={2}>{name}</Text>
                  {!!variant && <Text style={styles.itemMeta}>{variant}</Text>}
                  {line > 0 && <Text style={[styles.itemMeta, { color: Colors.light.warning }]}>desconto de {formatCurrency(line)}</Text>}
                </View>
                <View style={styles.itemRight}>
                  {line > 0 && <Text style={styles.strike}>{formatCurrency(gross)}</Text>}
                  <Text style={styles.itemPrice}>{formatCurrency(gross - line)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.meta} selectable>{sale.sale_number} · {formatDateTime(sale.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.card, borderRadius: 16, borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.md, gap: theme.spacing.md, ...theme.shadows.sm,
  },
  hero: { alignItems: 'center', gap: theme.spacing.xs, paddingVertical: theme.spacing.xs },
  okIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.xs },
  caption: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  sub: { fontSize: theme.fontSize.md, color: Colors.light.textSecondary, textAlign: 'center' },
  section: { gap: theme.spacing.sm, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: Colors.light.border },
  sectionTitle: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },
  rowLabel: { flex: 1, fontSize: theme.fontSize.md },
  rowValue: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, color: Colors.light.text, flexShrink: 0 },
  giftLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  giftText: { flex: 1, fontSize: theme.fontSize.md, color: Colors.light.text },
  toggle: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xs,
    borderTopWidth: 1, borderTopColor: Colors.light.border,
  },
  toggleText: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  items: { gap: theme.spacing.sm },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  itemQty: { width: 28, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  itemMid: { flex: 1, minWidth: 0 },
  itemName: { fontSize: theme.fontSize.md, color: Colors.light.text },
  itemMeta: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  itemRight: { alignItems: 'flex-end', flexShrink: 0 },
  strike: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, textDecorationLine: 'line-through' },
  itemPrice: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  meta: { fontSize: theme.fontSize.xs, color: Colors.light.textTertiary, textAlign: 'center' },
});
