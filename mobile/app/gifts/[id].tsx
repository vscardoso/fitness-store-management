/** Detalhe do brinde: o que saiu, custo para a loja, e as duas saídas: cancelar (engano, mesmo mês) ou devolver (a peça voltou). */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import BottomSheet from '@/components/ui/BottomSheet';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/utils/roles';
import { formatCurrency, formatDate } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { cancelGift, getGift, returnGift } from '@/services/giftService';

export default function GiftDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gid = Number(id);
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const { data: g, isLoading, error } = useQuery({ queryKey: ['gift', gid], queryFn: () => getGift(gid), enabled: admin && !!gid });

  const [sheet, setSheet] = useState<'cancel' | 'return' | null>(null);
  const [reason, setReason] = useState('');
  const [qty, setQty] = useState<Record<number, number>>({});
  const [msg, setMsg] = useState('');

  const done = async () => { setSheet(null); setReason(''); setQty({}); setMsg(''); await queryClient.invalidateQueries(); };
  const doCancel = useMutation({ mutationFn: () => cancelGift(gid, reason), onSuccess: done, onError: (e) => setMsg(parseApiError(e) || 'Não foi possível cancelar.') });
  const doReturn = useMutation({
    mutationFn: () => returnGift(gid, Object.entries(qty).filter(([, q]) => q > 0).map(([k, q]) => ({ gift_item_id: Number(k), quantity: q }))),
    onSuccess: done, onError: (e) => setMsg(parseApiError(e) || 'Não foi possível devolver.'),
  });

  if (!admin) return <View style={styles.container}><PageHeader title="Brinde" showBackButton backFallback="/gifts" /><View style={styles.center}><Text style={styles.title}>Só o administrador vê os brindes.</Text></View></View>;
  if (isLoading || !g) {
    return (
      <View style={styles.container}>
        <PageHeader title="Brinde" showBackButton backFallback="/gifts" />
        {error ? <View style={styles.center}><Text style={styles.title}>{parseApiError(error) || 'Não foi possível carregar.'}</Text></View> : <ScreenLoader message="Carregando brinde..." />}
      </View>
    );
  }
  const cancelled = g.status === 'cancelled';
  const returnable = g.items.some((i) => i.quantity - i.quantity_returned > 0);
  const picked = Object.values(qty).reduce((n, q) => n + q, 0);

  return (
    <View style={styles.container}>
      <PageHeader title={g.gift_number} subtitle={cancelled ? 'Cancelado' : 'Dado sem cobrança'} showBackButton backFallback="/gifts" />
      <ScrollView contentContainerStyle={[styles.content, desktop]}>
        <View style={styles.card}>
          <Row label="Para" value={g.recipient || '—'} />
          <Row label="Motivo" value={g.reason_label + (g.reason_note ? `: ${g.reason_note}` : '')} />
          <Row label="Dado em" value={`${formatDate(g.created_at ?? '')}${g.given_by_name ? ` por ${g.given_by_name}` : ''}`} />
          {!!g.related_sale_id && <Row label="Junto da venda" value={`nº ${g.related_sale_id}`} />}
          <Row label="Custo para a loja" value={formatCurrency(cancelled ? 0 : g.net_cost)} strong />
          {g.cost_returned > 0 && <Row label="Voltou ao estoque" value={`${formatCurrency(g.cost_returned)} de custo`} />}
          <Row label="Valor de vitrine" value={formatCurrency(g.list_value)} />
          {cancelled && <Row label="Cancelamento" value={g.cancel_reason ?? ''} />}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Peças</Text>
          {g.items.map((i) => (
            <View key={i.id} style={styles.line}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{i.product_name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{i.variant_label || 'Sem cor e tamanho'}</Text>
              </View>
              <Text style={styles.name}>{i.quantity - i.quantity_returned}{i.quantity_returned ? ` de ${i.quantity}` : ''}</Text>
            </View>
          ))}
        </View>

        {!cancelled && (
          <View style={{ gap: 10 }}>
            {returnable && (
              <Button mode="contained" buttonColor={brand.primary} icon="arrow-undo-outline" onPress={() => { setMsg(''); setSheet('return'); }}>Peça voltou ao estoque</Button>
            )}
            {!g.items.some((i) => i.quantity_returned > 0) && (
              <Button mode="outlined" textColor={Colors.light.error} icon="close-circle-outline" onPress={() => { setMsg(''); setSheet('cancel'); }}>Cancelar este brinde (engano)</Button>
            )}
            <Text style={styles.meta}>Cancelar vale só no mesmo mês e desfaz o brinde por inteiro. Se a pessoa devolveu a peça, use "Peça voltou ao estoque": o custo volta a favor da loja no dia da devolução. Brinde nunca devolve dinheiro.</Text>
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={sheet === 'cancel'} onDismiss={() => setSheet(null)} title="Cancelar o brinde" icon="close-circle-outline"
        actions={[{ label: 'Cancelar brinde', variant: 'danger', loading: doCancel.isPending, disabled: reason.trim().length < 3, onPress: () => { setMsg(''); doCancel.mutate(); } }]}>
        <View style={{ gap: 10 }}>
          {!!msg && <Text style={styles.error}>{msg}</Text>}
          <Text style={styles.meta}>As peças voltam ao estoque nas mesmas entradas de onde saíram, e o custo sai do mês.</Text>
          <TextInput mode="outlined" label="Motivo do cancelamento" value={reason} onChangeText={setReason} activeOutlineColor={brand.primary} />
        </View>
      </BottomSheet>

      <BottomSheet visible={sheet === 'return'} onDismiss={() => setSheet(null)} title="Peça voltou ao estoque" icon="arrow-undo-outline"
        actions={[{ label: 'Confirmar devolução', variant: 'primary', loading: doReturn.isPending, disabled: picked <= 0, onPress: () => { setMsg(''); doReturn.mutate(); } }]}>
        <View style={{ gap: 10 }}>
          {!!msg && <Text style={styles.error}>{msg}</Text>}
          {g.items.filter((i) => i.quantity - i.quantity_returned > 0).map((i) => {
            const livre = i.quantity - i.quantity_returned;
            const q = qty[i.id] ?? 0;
            return (
              <View key={i.id} style={styles.line}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{i.product_name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{i.variant_label || ''} · pode voltar até {livre}</Text>
                </View>
                <View style={styles.stepper}>
                  <TouchableOpacity onPress={() => setQty({ ...qty, [i.id]: Math.max(0, q - 1) })} hitSlop={8} accessibilityLabel="Devolver uma a menos"><Ionicons name="remove-circle-outline" size={26} color={brand.primary} /></TouchableOpacity>
                  <Text style={styles.qty}>{q}</Text>
                  <TouchableOpacity onPress={() => setQty({ ...qty, [i.id]: Math.min(livre, q + 1) })} hitSlop={8} accessibilityLabel="Devolver mais uma"><Ionicons name="add-circle-outline" size={26} color={brand.primary} /></TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={[styles.value, strong && { fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { padding: theme.spacing.md, gap: 12, paddingBottom: theme.spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  name: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  meta: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  value: { fontSize: 14, fontWeight: '600', color: Colors.light.text, flexShrink: 1, textAlign: 'right' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qty: { minWidth: 22, textAlign: 'center', fontSize: 16, fontWeight: '700', color: Colors.light.text },
  error: { color: Colors.light.error, fontWeight: '600' },
});
