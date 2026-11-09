/** Dar um brinde: peças, para quem, motivo. A peça sai do estoque sem cobrança; o custo vira a linha "Brindes" do Resultado do Mês. */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import BottomSheet from '@/components/ui/BottomSheet';
import OptionListField from '@/components/ui/OptionListField';
import { ProductPickerList } from '@/components/products/ProductPicker';
import CustomerSelectionModal from '@/components/sale/CustomerSelectionModal';
import { Button } from 'react-native-paper';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/utils/roles';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { createGift, REASON_OPTIONS, type GiftReason } from '@/services/giftService';
import type { Customer, ProductGrouped, ProductVariant } from '@/types';

interface Line { variant: ProductVariant; productName: string; quantity: number }

export default function NewGiftScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  // vindo da venda: o vínculo, a cliente e o motivo já vêm preenchidos
  const { saleId, customerId, customerName } = useLocalSearchParams<{ saleId?: string; customerId?: string; customerName?: string }>();

  const [lines, setLines] = useState<Line[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [who, setWho] = useState<'customer' | 'other'>(customerId ? 'customer' : 'other');
  const [customer, setCustomer] = useState<Customer | null>(customerId ? ({ id: Number(customerId), full_name: customerName || 'Cliente da venda' } as Customer) : null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [reason, setReason] = useState<GiftReason>(saleId ? 'with_sale' : 'courtesy');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const pieces = lines.reduce((n, l) => n + l.quantity, 0);
  const showcase = useMemo(() => lines.reduce((n, l) => n + (l.variant.price || 0) * l.quantity, 0), [lines]);

  const give = useMutation({
    mutationFn: () => createGift({
      items: lines.map((l) => ({ variant_id: l.variant.id, quantity: l.quantity })),
      reason_type: reason,
      reason_note: note.trim() || undefined,
      ...(who === 'customer' && customer ? { customer_id: customer.id } : { recipient_name: recipient.trim() }),
      ...(saleId ? { related_sale_id: Number(saleId) } : {}),
    }),
    onSuccess: async (g) => {
      await queryClient.invalidateQueries();
      router.replace(`/gifts/${g.id}` as any);
    },
    onError: (e) => setError(parseApiError(e) || 'Não foi possível dar o brinde.'),
  });

  const add = (g: ProductGrouped, v?: ProductVariant) => {
    if (!v) { setError('Esta peça ainda não tem cor e tamanho cadastrados.'); setPickerOpen(false); return; }
    setError('');
    setLines((cur) => {
      const i = cur.findIndex((l) => l.variant.id === v.id);
      if (i >= 0) return cur.map((l, k) => (k === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...cur, { variant: v, productName: g.name, quantity: 1 }];
    });
    setPickerOpen(false);
  };
  const setQty = (id: number, q: number) => setLines((cur) => cur.flatMap((l) => (l.variant.id !== id ? [l] : q <= 0 ? [] : [{ ...l, quantity: q }])));

  const ready = lines.length > 0 && (who === 'customer' ? !!customer : recipient.trim().length >= 3) && ((reason !== 'other' && reason !== 'voucher') || note.trim().length >= 3);

  if (!admin) return <Redirect href="/(tabs)/more" />;

  return (
    <View style={styles.container}>
      <PageHeader title="Dar um brinde" subtitle="Peça que sai sem cobrança" showBackButton backFallback="/gifts" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} keyboardShouldPersistTaps="handled">
        {!!saleId && <Text style={styles.linked}>Ligado à venda nº {saleId}. A venda não muda.</Text>}

        <View style={styles.card}>
          <Text style={styles.title}>Peças</Text>
          {lines.map((l) => (
            <View key={l.variant.id} style={styles.line}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{l.productName}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[l.variant.color, l.variant.size].filter(Boolean).join(' · ') || 'Sem cor e tamanho'}
                  {l.variant.display_code ? ` · ${l.variant.display_code}` : ''} · em estoque: {l.variant.current_stock}
                </Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity onPress={() => setQty(l.variant.id, l.quantity - 1)} hitSlop={8} accessibilityLabel="Tirar uma"><Ionicons name="remove-circle-outline" size={26} color={brand.primary} /></TouchableOpacity>
                <Text style={styles.qty}>{l.quantity}</Text>
                <TouchableOpacity onPress={() => setQty(l.variant.id, l.quantity + 1)} hitSlop={8} accessibilityLabel="Colocar mais uma"><Ionicons name="add-circle-outline" size={26} color={brand.primary} /></TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity style={[styles.addRow, { borderColor: brand.primary + '55', backgroundColor: brand.primary + '0F' }]} onPress={() => setPickerOpen(true)} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={22} color={brand.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{lines.length ? 'Escolher outra peça' : 'Escolher a peça'}</Text>
              <Text style={styles.meta}>Busque pelo nome, SKU ou código da etiqueta</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Para quem</Text>
          <OptionListField
            label="Quem recebe" value={who} onChange={(v) => { setWho(v); setError(''); }} icon="person-outline"
            options={[
              { value: 'customer', label: 'Cliente cadastrada', description: 'Escolha no cadastro de clientes', icon: 'people-outline' },
              { value: 'other', label: 'Outra pessoa', description: 'Escreva o nome, por exemplo a influenciadora', icon: 'person-add-outline' },
            ]}
          />
          {who === 'customer' ? (
            <TouchableOpacity style={styles.addRow} onPress={() => setCustomerOpen(true)} activeOpacity={0.8}>
              <Ionicons name="person-circle-outline" size={22} color={brand.primary} />
              <Text style={[styles.name, { flex: 1 }]}>{customer ? customer.full_name : 'Escolher a cliente'}</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
            </TouchableOpacity>
          ) : (
            <TextInput mode="outlined" label="Nome de quem recebe" value={recipient} onChangeText={setRecipient}
              placeholder="Ex.: Maria, @maria" activeOutlineColor={brand.primary} />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Motivo</Text>
          <OptionListField label="Por que está dando" value={reason} onChange={setReason} icon="help-circle-outline"
            options={REASON_OPTIONS.map((o) => ({ value: o.value, label: o.label, description: o.description }))} />
          <TextInput mode="outlined" label={reason === 'other' ? 'Qual o motivo? (obrigatório)' : reason === 'voucher' ? 'Número do voucher (obrigatório)' : 'Observação (opcional)'} value={note}
            onChangeText={setNote} activeOutlineColor={brand.primary} />
        </View>

        <View style={[styles.card, { backgroundColor: brand.primary + '10', borderColor: brand.primary + '40' }]}>
          <Text style={styles.title}>Resumo</Text>
          <Text style={styles.meta}>
            {pieces > 0
              ? `${pieces} peça${pieces === 1 ? '' : 's'} vão sair do estoque sem cobrança. Valor de vitrine: ${formatCurrency(showcase)}. O custo para a loja (o que você pagou por elas) aparece no Resultado do Mês como "Brindes".`
              : 'Escolha a peça para ver o resumo.'}
          </Text>
          <Text style={styles.meta}>Brinde não dá pontos e não entra em vendas nem no caixa.</Text>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
        <Button mode="contained" buttonColor={brand.primary} icon="gift-outline" disabled={!ready || give.isPending} loading={give.isPending}
          onPress={() => { setError(''); give.mutate(); }}>
          Dar brinde
        </Button>
      </ScrollView>

      <BottomSheet visible={pickerOpen} onDismiss={() => setPickerOpen(false)} title="Escolher a peça" icon="shirt-outline">
        <ProductPickerList onPick={add} />
      </BottomSheet>
      <CustomerSelectionModal
        visible={customerOpen} onDismiss={() => setCustomerOpen(false)} title="Escolher a cliente" subtitle="Quem vai receber o brinde"
        dismissLabel="Voltar" onSelectCustomer={(c) => { setCustomer(c); setCustomerOpen(false); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { padding: theme.spacing.md, gap: 12, paddingBottom: theme.spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  name: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  meta: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qty: { minWidth: 22, textAlign: 'center', fontSize: 16, fontWeight: '700', color: Colors.light.text },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border },
  linked: { fontSize: 13, color: Colors.light.textSecondary },
  error: { color: Colors.light.error, fontWeight: '600' },
});
