/**
 * Peças da tela de Despesas, usadas na lista, no detalhe e no lançar:
 *  - CategoryField: a categoria num campo só (ícone + nome); toque abre a folha com a lista. Antes eram 8 pílulas que ocupavam
 *    metade da tela do celular;
 *  - OwnerDrawNotice: aviso quando o texto parece retirada de sócio, empréstimo ou fatura (não é gasto da loja);
 *  - ExpenseRow: uma despesa na lista, com de onde saiu o dinheiro e os avisos que importam.
 * Cores só por token do tema; botões pelo AppButton; texto no singular e plural certos.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/ui/AppButton';
import Badge from '@/components/ui/Badge';
import BottomSheet from '@/components/ui/BottomSheet';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency } from '@/utils/format';
import { accountLine, approvalText, looksLikeOwnerDraw } from '@/utils/expenseLogic';
import type { Expense, ExpenseCategory } from '@/types/expense';

type IconName = keyof typeof Ionicons.glyphMap;

/** Bolinha colorida com o ícone da categoria (a mesma da lista). */
export function CategoryDot({ category, size = 44 }: { category?: { color?: string | null; icon?: string | null } | null; size?: number }) {
  return (
    <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: category?.color ?? Colors.light.textTertiary }]}>
      <Ionicons name={((category?.icon ?? 'ellipsis-horizontal-outline') as IconName)} size={Math.round(size * 0.45)} color={Colors.light.white} />
    </View>
  );
}

export function CategoryField({ label = 'Categoria', categories, value, onChange }: {
  label?: string; categories: ExpenseCategory[]; value: ExpenseCategory | null; onChange: (c: ExpenseCategory | null) => void;
}) {
  const brand = useBrandingColors();
  const [open, setOpen] = useState(false);
  if (categories.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.75} accessibilityRole="button"
        accessibilityLabel={`${label}: ${value?.name ?? 'nenhuma'}. Toque para escolher`} testID="expense-category-field">
        {value ? <CategoryDot category={value} size={32} /> : <Ionicons name="pricetag-outline" size={22} color={Colors.light.textTertiary} />}
        <Text style={[styles.fieldText, !value && { color: Colors.light.textTertiary }]} numberOfLines={1}>{value?.name ?? 'Escolher categoria'}</Text>
        <Ionicons name="chevron-down" size={18} color={Colors.light.textSecondary} />
      </TouchableOpacity>
      <BottomSheet visible={open} onDismiss={() => setOpen(false)} title="Categoria" subtitle="Para onde foi este gasto" icon="pricetags-outline">
        <View style={{ gap: 4 }}>
          {categories.map((c) => {
            const on = value?.id === c.id;
            return (
              <TouchableOpacity key={c.id} style={[styles.option, on && { backgroundColor: Colors.light.backgroundSecondary }]} activeOpacity={0.75}
                onPress={() => { onChange(on ? null : c); setOpen(false); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                accessibilityLabel={c.name} testID={`expense-category-${c.id}`}>
                <CategoryDot category={c} size={36} />
                <Text style={styles.optionText}>{c.name}</Text>
                {on && <Ionicons name="checkmark-circle" size={22} color={brand.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
}

/** Sugestão (não bloqueia): o que o lojista escreveu parece retirada, e retirada não é gasto da loja. */
export function OwnerDrawNotice({ text, onOpenDraws, compact }: { text: string; onOpenDraws: () => void; compact?: boolean }) {
  if (!looksLikeOwnerDraw(text)) return null;
  return (
    <View style={styles.notice} testID="owner-draw-notice" accessibilityRole="alert">
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.light.warningDark} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.noticeTitle}>Isto parece retirada de sócio</Text>
          {!compact && (
            <Text style={styles.noticeText}>
              Retirada tira dinheiro da conta, mas não é gasto da loja. Lançada como despesa, ela faz o lucro do mês parecer menor do que é. Lance em Retiradas e empréstimos.
            </Text>
          )}
        </View>
      </View>
      <AppButton variant="outlined" size="sm" icon="swap-vertical-outline" label="Lançar como retirada" onPress={onOpenDraws} />
    </View>
  );
}

/** Uma despesa na lista. Segunda linha: categoria · de onde saiu o dinheiro. O que importa vira selo (e só o que importa). */
export function ExpenseRow({ item, accountName, financeStarted, onPress }: {
  item: Expense; accountName?: string; financeStarted: boolean; onPress: () => void;
}) {
  const acc = accountLine(item, accountName, financeStarted);
  const lot = !!item.stock_entry_id;
  const draw = looksLikeOwnerDraw(item.description);
  const pending = item.pending_approval;
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.75} onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${item.description}, ${formatCurrency(item.amount)}${acc ? `, ${acc.text}` : ''}`} testID={`expense-row-${item.id}`}>
      <CategoryDot category={item.category} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.description}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.category?.name ?? 'Sem categoria'}
          {!!acc && <Text style={acc.tone === 'warn' ? styles.rowMetaWarn : undefined}>{` · ${acc.text}`}</Text>}
        </Text>
        {(pending || draw || item.is_recurring) && (
          <View style={styles.badges}>
            {pending && <Badge label={pending.kind === 'delete' ? 'Pedido para apagar' : 'Pedido para mudar'} variant="warning" size="sm" icon="hourglass-outline" />}
            {draw && !lot && <Badge label="Parece retirada" variant="warning" size="sm" icon="information-circle-outline" />}
            {item.is_recurring && <Badge label="Fixa" variant="primary" size="sm" icon="repeat" />}
          </View>
        )}
      </View>
      <Text style={[styles.rowAmount, lot && { color: Colors.light.textSecondary }]}>{formatCurrency(item.amount)}</Text>
    </TouchableOpacity>
  );
}

/** Aviso do pedido de aprovação em andamento (detalhe da despesa). */
export function ApprovalNotice({ pending, onOpen }: { pending: NonNullable<Expense['pending_approval']>; onOpen: () => void }) {
  return (
    <View style={styles.notice} testID="expense-approval-notice">
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Ionicons name="hourglass-outline" size={20} color={Colors.light.warningDark} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.noticeTitle}>{approvalText(pending)}</Text>
          <Text style={styles.noticeText}>{`${pending.requested_by_name ? `${pending.requested_by_name} pediu. ` : ''}O saldo só muda depois que todos aprovarem.`}</Text>
        </View>
      </View>
      <AppButton variant="outlined" size="sm" icon="shield-checkmark-outline" label="Ver pedidos" onPress={onOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { justifyContent: 'center', alignItems: 'center' },
  fieldLabel: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, borderRadius: theme.borderRadius.md,
    borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.white,
  },
  fieldText: { flex: 1, fontSize: theme.fontSize.base, color: Colors.light.text },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: theme.borderRadius.md },
  optionText: { flex: 1, fontSize: theme.fontSize.base, color: Colors.light.text },
  notice: {
    gap: 10, padding: 12, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: Colors.light.warning,
    backgroundColor: Colors.light.warningLight,
  },
  noticeTitle: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  noticeText: { fontSize: theme.fontSize.sm, lineHeight: 18, color: Colors.light.textSecondary },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: 14, marginBottom: theme.spacing.sm,
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: Colors.light.border,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  rowMeta: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  rowMetaWarn: { color: Colors.light.warningDark, fontWeight: theme.fontWeight.semibold },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  rowAmount: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: Colors.light.error },
});
