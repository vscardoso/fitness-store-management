/**
 * "Quanto rendeu esta entrada": mostra, em linguagem simples, quanto foi gasto, quanto já voltou em vendas
 * e quanto sobrou. Também permite lançar uma despesa deste lote (frete, embalagem...).
 *
 * Regra de texto: nada de termo de contabilidade (CMV, ROI, rateio, margem bruta). A tela precisa
 * ser entendida por quem quer entender o dinheiro, não a contabilidade.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import BottomSheet from '@/components/ui/BottomSheet';
import { TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Colors, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getStockEntryAnalytics, getStockEntryCosts } from '@/services/stockEntryService';
import { createExpense, deleteExpense } from '@/services/expenseService';
import { updateStockEntry } from '@/services/stockEntryService';
import type { StockEntryCreate } from '@/types';
import { formatCurrency, formatPercent } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';

import { Money } from '@/components/ui/PriceDisplay';
interface Props {
  entryId: number;
  /** Quem pode lançar despesa do lote (gerente e admin). */
  canEdit: boolean;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function LotMoneyCard({ entryId, canEdit }: Props) {
  const brand = useBrandingColors();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState('');
  const [discountOpen, setDiscountOpen] = useState(false);
  // Desconto que a lixeira vai excluir (geral ou de um fornecedor) e fornecedor escolhido no formulário
  const [removeTarget, setRemoveTarget] = useState<null | { supplierId?: number; label: string; amount: number }>(null);
  const [discountSupplierId, setDiscountSupplierId] = useState<number | null>(null);
  const [discountText, setDiscountText] = useState('');

  const analytics = useQuery({ queryKey: ['lot-analytics', entryId], queryFn: () => getStockEntryAnalytics(entryId) });
  const costs = useQuery({ queryKey: ['lot-costs', entryId], queryFn: () => getStockEntryCosts(entryId) });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['lot-analytics', entryId] });
    queryClient.invalidateQueries({ queryKey: ['lot-costs', entryId] });
    queryClient.invalidateQueries({ queryKey: ['stock-entry', entryId] });
    queryClient.invalidateQueries({ queryKey: ['lot-profit-ranking'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };

  const addMutation = useMutation({
    mutationFn: () =>
      createExpense({
        amount: unmaskCurrency(amount),
        description: description.trim(),
        expense_date: todayISO(),
        stock_entry_id: entryId,
      }),
    onSuccess: () => {
      setFormOpen(false);
      setDescription('');
      setAmount('');
      setFormError('');
      refreshAll();
    },
    onError: (e: any) => setFormError(parseApiError(e) || 'Não foi possível salvar. Tente de novo.'),
  });

  const discountMutation = useMutation({
    mutationFn: (body: Partial<StockEntryCreate>) => updateStockEntry(entryId, body),
    onSuccess: () => {
      setDiscountOpen(false);
      setRemoveTarget(null);
      setFormError('');
      refreshAll();
    },
    onError: (e: any) => setFormError(parseApiError(e) || 'Não foi possível salvar. Tente de novo.'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => deleteExpense(id),
    onSuccess: refreshAll,
  });

  if (analytics.isLoading || costs.isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={brand.primary} />
      </View>
    );
  }
  if (!analytics.data || !costs.data) return null;

  const a = analytics.data;
  const c = costs.data;
  const received = a.total_quantity_received || 0;
  const perPieceBase = received > 0 ? c.merchandise_cost / received : 0;
  const perPieceFull = received > 0 ? c.total_investment / received : 0;
  const discount = c.discount_amount || 0;
  const generalDiscount = c.general_discount ?? c.discount_amount ?? 0;
  const supplierList = c.suppliers || [];
  const multiSupplier = supplierList.length > 1;
  const supplierName = (id?: number | null) => supplierList.find((s) => s.supplier_id === id)?.name || 'fornecedor';
  const hasExtra = c.extra_costs_total !== 0;
  const hasSales = a.total_quantity_sold > 0;
  const recovered = Math.max(0, Math.min(100, a.recovered_pct));
  const paidOff = a.recovered_pct >= 100;
  const profitColor = a.gross_profit >= 0 ? VALUE_COLORS.positive : VALUE_COLORS.negative;

  const submit = () => {
    if (!description.trim()) return setFormError('Diga o que foi essa despesa (ex.: frete).');
    if (unmaskCurrency(amount) <= 0) return setFormError('Informe quanto foi gasto.');
    setFormError('');
    addMutation.mutate();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Quanto rendeu esta entrada</Text>
      <Text style={styles.subtitle}>Quanto você gastou nesta compra, quanto já voltou em vendas e quanto sobrou.</Text>

      {/* 1. Quanto gastou */}
      <Text style={styles.blockTitle}>1. Quanto você gastou</Text>
      <Row label="Mercadoria (o que pagou ao fornecedor)" value={c.merchandise_cost} />
      {c.trip && c.trip.share_of_this_lot > 0 && (
        <Row
          label={`Viagem ${c.trip.trip_code} (a parte que coube a este lote)`}
          value={c.trip.share_of_this_lot}
          hint={`A viagem inteira custou ${formatCurrency(c.trip.trip_total_cost)} e é dividida entre os lotes dela, na proporção do que cada um custou.`}
        />
      )}
      {c.lot_expenses.map((e) => (
        <View key={e.id} style={styles.row}>
          <Text style={[styles.rowLabel, { flex: 1 }]} numberOfLines={2}>{e.description}</Text>
          <Text style={styles.rowValue}>{formatCurrency(e.amount)}</Text>
          {canEdit && (
            <TouchableOpacity
              onPress={() => removeMutation.mutate(e.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={`Apagar despesa ${e.description}`}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.light.textSecondary} style={{ marginLeft: 10 }} />
            </TouchableOpacity>
          )}
        </View>
      ))}
      {generalDiscount > 0 && (
        <DiscountRow
          label={multiSupplier ? 'Desconto geral da entrada' : 'Desconto do fornecedor'}
          amount={generalDiscount}
          canEdit={canEdit}
          hint="Valor que o fornecedor abateu no fim da compra. Ele diminui o custo de cada peça."
          onRemove={() => setRemoveTarget({ label: 'o desconto geral', amount: generalDiscount })}
        />
      )}
      {supplierList.filter((s) => s.discount > 0).map((s) => (
        <DiscountRow
          key={s.supplier_id}
          label={`Desconto de ${s.name}`}
          amount={s.discount}
          canEdit={canEdit}
          hint={multiSupplier ? `Vale só para as peças de ${s.name}.` : undefined}
          onRemove={() => setRemoveTarget({ supplierId: s.supplier_id, label: `o desconto de ${s.name}`, amount: s.discount })}
        />
      ))}
      {(c.item_discounts_total ?? 0) > 0 && (
        <View>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { flex: 1 }]}>Desconto negociado nos preços das peças</Text>
            <Text style={[styles.rowValue, { color: VALUE_COLORS.positive }]}>{formatCurrency(c.item_discounts_total ?? 0)}</Text>
          </View>
          <Text style={styles.hint}>Diferença entre o preço de tabela e o que você pagou. Já está no valor pago pela mercadoria, por isso não é abatido de novo no total.</Text>
        </View>
      )}
      {supplierList.length > 1 && (
        <View style={{ marginTop: 6 }}>
          <Text style={[styles.rowLabel, styles.bold]}>Quanto cada fornecedor custou</Text>
          {supplierList.map((s) => (
            <View key={s.supplier_id} style={styles.row}>
              <Text style={[styles.rowLabel, { flex: 1 }]} numberOfLines={2}>
                {s.name}
                {s.discount > 0 ? ` (${formatCurrency(s.merchandise)} - ${formatCurrency(s.discount)} de desconto)` : ''}
              </Text>
              <Text style={styles.rowValue}>{formatCurrency(s.merchandise - s.discount)}</Text>
            </View>
          ))}
          <Text style={styles.hint}>Mercadoria de cada fornecedor já com o desconto dele. Frete e viagem entram à parte, nas linhas acima.</Text>
        </View>
      )}
      <View style={[styles.row, styles.totalRow]}>
        <Text style={[styles.rowLabel, styles.bold]}>Total gasto neste lote</Text>
        <Text style={[styles.rowValue, styles.bold]}>{formatCurrency(c.total_investment)}</Text>
      </View>
      {hasExtra && (
        <Text style={styles.note}>
          {c.extra_costs_total > 0
            ? 'Esses gastos extras entram no preço de custo de cada peça. '
            : 'O desconto entra no preço de custo de cada peça. '}
          Por isso cada peça deste lote custa <Text style={styles.bold}>{formatCurrency(perPieceFull)}</Text> (e não{' '}
          {formatCurrency(perPieceBase)}), uns {formatPercent(Math.abs(c.cost_increase_pct), 0)}{' '}
          {c.extra_costs_total > 0 ? 'a mais' : 'a menos'}. É esse custo que o app usa para calcular o seu lucro em cada venda.
        </Text>
      )}
      {canEdit && (
        <TouchableOpacity style={[styles.addButton, { borderColor: brand.primary }]} onPress={() => setFormOpen(true)}>
          <Ionicons name="add-circle-outline" size={18} color={brand.primary} />
          <Text style={[styles.addButtonText, { color: brand.primary }]}>Lançar despesa deste lote</Text>
        </TouchableOpacity>
      )}
      {canEdit && (
        <TouchableOpacity
          style={[styles.addButton, { borderColor: brand.primary }]}
          onPress={() => {
            // Com vários fornecedores o desconto é de um fornecedor por vez; com um só, vale para a entrada
            const first = multiSupplier ? supplierList[0] : null;
            setDiscountSupplierId(first ? first.supplier_id : null);
            const current = first ? first.discount : generalDiscount;
            setDiscountText(current > 0 ? maskCurrencyBR(String(Math.round(current * 100))) : '');
            setFormError('');
            setDiscountOpen(true);
          }}
        >
          <Ionicons name="pricetag-outline" size={18} color={brand.primary} />
          <Text style={[styles.addButtonText, { color: brand.primary }]}>
            {discount > 0 ? 'Alterar desconto do fornecedor' : multiSupplier ? 'Informar desconto de um fornecedor' : 'Informar desconto do fornecedor'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Antes de vender: o que esta entrada rende se tudo for vendido pelos preços de hoje */}
      <Text style={styles.blockTitle}>Se você vender tudo desta entrada</Text>
      <Row label="Gasto (mercadoria, frete e viagem)" value={a.total_investment} />
      <Row label="Venda prevista (pelos preços de hoje)" value={a.potential_revenue_total} valueColor={VALUE_COLORS.positive} />
      <View style={[styles.row, styles.totalRow]}>
        <Text style={[styles.rowLabel, styles.bold, { flex: 1 }]}>Lucro previsto</Text>
        <Text style={[styles.rowValue, styles.bold, { color: a.potential_profit_total >= 0 ? VALUE_COLORS.positive : VALUE_COLORS.negative }]}>
          {formatCurrency(a.potential_profit_total)}
        </Text>
      </View>
      <Text style={styles.note}>
        Markup de <Text style={styles.bold}>{formatPercent(a.markup_pct_total, 0)}</Text>: para cada R$ 100 que você gastou, a venda prevista põe R${' '}
        {a.markup_pct_total.toFixed(0)} de lucro por cima. Olhando pelo valor vendido, de cada R$ 100 vendidos, R${' '}
        {a.potential_margin_pct.toFixed(0)} são lucro.
      </Text>

      {/* 2. Quanto voltou */}
      <Text style={styles.blockTitle}>2. Quanto já voltou em vendas</Text>
      {hasSales ? (
        <>
          <Row label={`Você vendeu ${a.total_quantity_sold} de ${received} peças`} value={a.real_revenue} valueColor={VALUE_COLORS.positive} />
          <View style={styles.barBackground}>
            <View style={[styles.barFill, { width: `${recovered}%`, backgroundColor: paidOff ? VALUE_COLORS.positive : brand.primary }]} />
          </View>
          <Text style={styles.note}>
            {paidOff
              ? 'Este lote já se pagou por inteiro. O que vender daqui para frente é lucro.'
              : `Já voltou ${formatPercent(a.recovered_pct, 0)} do dinheiro que você gastou neste lote.`}
          </Text>
        </>
      ) : (
        <Text style={styles.note}>Você ainda não vendeu nada deste lote.</Text>
      )}

      {/* 3. Quanto sobrou */}
      {hasSales && (
        <>
          <Text style={styles.blockTitle}>3. Quanto sobrou até agora</Text>
          <Money style={[styles.bigNumber, { color: profitColor }]} value={Number(a.gross_profit)} />
          <Text style={styles.note}>
            {a.gross_profit >= 0
              ? `É o lucro das peças que já saíram, já descontado o custo delas (com a parte do frete e da viagem). De cada R$ 100 que você vendeu, R$ ${a.margin_pct.toFixed(0)} viraram lucro.`
              : 'As peças vendidas até agora ainda não cobriram o custo delas.'}
          </Text>
        </>
      )}

      {/* 4. Se vender tudo */}
      {a.total_quantity_remaining > 0 && (
        <View style={styles.forecast}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.light.textSecondary} />
          <Text style={styles.forecastText}>
            Ainda restam {a.total_quantity_remaining} peças (custaram {formatCurrency(a.stock_value_remaining)} para você). Se vender tudo pelos
            preços de hoje, o lucro final do lote seria de uns{' '}
            <Text style={styles.bold}>{formatCurrency(a.projected_profit_if_all_sold)}</Text>. É uma estimativa.
          </Text>
        </View>
      )}

      <ConfirmDialog
        visible={!!removeTarget}
        type="warning"
        title="Excluir desconto?"
        message={`Excluir ${removeTarget?.label ?? 'o desconto'} (${formatCurrency(removeTarget?.amount ?? 0)})? O custo das peças ${
          removeTarget?.supplierId ? 'desse fornecedor ' : ''
        }volta a subir. Peças já vendidas mantêm o custo da venda.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        onConfirm={() =>
          removeTarget &&
          discountMutation.mutate(
            removeTarget.supplierId
              ? { supplier_discounts: [{ supplier_id: removeTarget.supplierId, amount: 0 }] }
              : { discount_amount: 0 },
          )
        }
        onCancel={() => setRemoveTarget(null)}
      />

      <BottomSheet
        visible={discountOpen}
        onDismiss={() => { setDiscountOpen(false); setFormError(''); }}
        title="Desconto do fornecedor"
        subtitle={multiSupplier ? 'Escolha qual fornecedor deu o desconto' : 'Abate o custo de cada peça desta entrada'}
        icon="pricetag-outline"
        dismissOnBackdrop={!discountMutation.isPending}
        actions={[
          { label: 'Cancelar', onPress: () => { setDiscountOpen(false); setFormError(''); }, variant: 'secondary', disabled: discountMutation.isPending },
          {
            label: 'Salvar',
            variant: 'primary',
            loading: discountMutation.isPending,
            disabled: discountMutation.isPending,
            onPress: () => {
              const value = unmaskCurrency(discountText) || 0;
              if (multiSupplier) {
                if (discountSupplierId === null) return setFormError('Escolha o fornecedor.');
                const merchandise = supplierList.find((s) => s.supplier_id === discountSupplierId)?.merchandise ?? 0;
                if (value > merchandise) return setFormError('O desconto não pode passar do valor da mercadoria desse fornecedor.');
                discountMutation.mutate({ supplier_discounts: [{ supplier_id: discountSupplierId, amount: value }] });
              } else {
                discountMutation.mutate({ discount_amount: value });
              }
            },
          },
        ]}
      >
        <Text style={styles.note}>
          {multiSupplier
            ? 'O desconto reduz só o custo das peças do fornecedor escolhido. '
            : 'Se o fornecedor abateu um valor no fim da compra, informe o total do desconto. Ele reduz o custo de cada peça deste lote e aumenta o seu lucro. '}
          Para tirar o desconto, deixe em branco.
        </Text>
        {multiSupplier && (
          <View style={styles.chipRow}>
            {supplierList.map((s) => {
              const selected = discountSupplierId === s.supplier_id;
              return (
                <TouchableOpacity
                  key={s.supplier_id}
                  onPress={() => {
                    setDiscountSupplierId(s.supplier_id);
                    setDiscountText(s.discount > 0 ? maskCurrencyBR(String(Math.round(s.discount * 100))) : '');
                    setFormError('');
                  }}
                  activeOpacity={0.75}
                  style={[
                    styles.supplierChip,
                    selected && { borderColor: brand.primary, backgroundColor: brand.primary + '14' },
                  ]}
                >
                  <Ionicons name="business" size={14} color={selected ? brand.primary : Colors.light.textSecondary} />
                  <Text style={[styles.supplierChipText, selected && { color: brand.primary, fontWeight: '700' }]} numberOfLines={1}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <TextInput
          label={multiSupplier ? `Desconto de ${supplierName(discountSupplierId)}` : 'Quanto foi o desconto?'}
          value={discountText}
          onChangeText={(t) => setDiscountText(maskCurrencyBR(t))}
          mode="outlined"
          keyboardType="numeric"
          placeholder="0,00"
          left={<TextInput.Affix text="R$" />}
          style={styles.input}
        />
        {!!formError && <Text style={styles.error}>{formError}</Text>}
      </BottomSheet>

      <BottomSheet
        visible={formOpen}
        onDismiss={() => { setFormOpen(false); setFormError(''); }}
        title="Despesa deste lote"
        subtitle="Frete, embalagem, taxa, sacola"
        icon="receipt-outline"
        dismissOnBackdrop={!addMutation.isPending}
        actions={[
          { label: 'Cancelar', onPress: () => { setFormOpen(false); setFormError(''); }, variant: 'secondary', disabled: addMutation.isPending },
          { label: 'Salvar', onPress: submit, variant: 'primary', loading: addMutation.isPending, disabled: addMutation.isPending },
        ]}
      >
        <Text style={styles.note}>
          Use para gastos desta compra. O valor soma no custo das peças deste lote e só pesa no resultado do mês quando as peças forem
          vendidas. Para aluguel, luz e outros gastos da loja, use a tela Despesas.
        </Text>
        <TextInput
          label="O que foi? (ex.: frete)"
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          style={styles.input}
        />
        <TextInput
          label="Quanto custou?"
          value={amount}
          onChangeText={(t) => setAmount(maskCurrencyBR(t))}
          mode="outlined"
          keyboardType="numeric"
          placeholder="0,00"
          left={<TextInput.Affix text="R$" />}
          style={styles.input}
        />
        {!!formError && <Text style={styles.error}>{formError}</Text>}
      </BottomSheet>
    </View>
  );
}

function DiscountRow({
  label,
  amount,
  hint,
  canEdit,
  onRemove,
}: {
  label: string;
  amount: number;
  hint?: string;
  canEdit: boolean;
  onRemove: () => void;
}) {
  return (
    <View>
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { flex: 1 }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: VALUE_COLORS.positive }]}>{formatCurrency(-amount)}</Text>
        {canEdit && (
          <TouchableOpacity onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={`Excluir ${label}`}>
            <Ionicons name="trash-outline" size={18} color={Colors.light.textSecondary} style={{ marginLeft: 10 }} />
          </TouchableOpacity>
        )}
      </View>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

function Row({ label, value, hint, valueColor }: { label: string; value: number; hint?: string; valueColor?: string }) {
  return (
    <View>
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { flex: 1 }]}>{label}</Text>
        <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>{formatCurrency(value)}</Text>
      </View>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  subtitle: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 4, marginBottom: 8 },
  blockTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text, marginTop: 16, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rowLabel: { fontSize: 14, color: Colors.light.text, paddingRight: 8 },
  rowValue: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  totalRow: { borderTopWidth: 1, borderTopColor: Colors.light.border, marginTop: 4, paddingTop: 10 },
  bold: { fontWeight: '700' },
  hint: { fontSize: 12, color: Colors.light.textSecondary, marginBottom: 4 },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 6 },
  bigNumber: { fontSize: 28, fontWeight: '800' },
  barBackground: { height: 10, borderRadius: 5, backgroundColor: Colors.light.border, marginTop: 8, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  forecast: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  forecastText: { flex: 1, fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  addButtonText: { fontSize: 14, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  supplierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    maxWidth: '100%',
  },
  supplierChipText: { fontSize: 13, color: Colors.light.text, flexShrink: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 18, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  input: { marginTop: 12, backgroundColor: Colors.light.card },
  error: { color: VALUE_COLORS.negative, marginTop: 10, fontSize: 13 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cancelText: { color: Colors.light.text, fontWeight: '600' },
  saveButton: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  saveText: { color: '#fff', fontWeight: '700' },
});
