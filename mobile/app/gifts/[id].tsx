/** Detalhe do brinde: o que saiu, custo para a loja, comprovante para a pessoa validar e, se foi engano, cancelar (mesmo mês). Brinde não aceita devolução. */
import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
import PdfActions from '@/components/ui/PdfActions';
import { cancelGift, getGift, getGiftReceipt, getGiftReceiptPdf, sendGiftReceiptViaStoreWhatsapp } from '@/services/giftService';

export default function GiftDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gid = Number(id);
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const { data: g, isLoading, error } = useQuery({ queryKey: ['gift', gid], queryFn: () => getGift(gid), enabled: admin && !!gid });
  const { data: receipt } = useQuery({ queryKey: ['gift-receipt', gid], queryFn: () => getGiftReceipt(gid), enabled: admin && !!gid });

  const [sheet, setSheet] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [sendMsg, setSendMsg] = useState('');
  const [sendOk, setSendOk] = useState('');

  const doCancel = useMutation({
    mutationFn: () => cancelGift(gid, reason),
    onSuccess: async () => { setSheet(false); setReason(''); setMsg(''); await queryClient.invalidateQueries(); },
    onError: (e) => setMsg(parseApiError(e) || 'Não foi possível cancelar.'),
  });
  const doSend = useMutation({
    mutationFn: () => sendGiftReceiptViaStoreWhatsapp(gid),
    onSuccess: (r) => { setSendMsg(''); setSendOk(`Enviado para ${r.customer} pelo WhatsApp da loja.`); queryClient.invalidateQueries({ queryKey: ['gift-receipt', gid] }); },
    onError: (e) => { setSendOk(''); setSendMsg(parseApiError(e) || 'Não foi possível enviar.'); },
  });

  if (!admin) return <Redirect href="/(tabs)/more" />;
  if (isLoading || !g) {
    return (
      <View style={styles.container}>
        <PageHeader title="Brinde" showBackButton backFallback="/gifts" />
        {error ? <View style={styles.center}><Text style={styles.title}>{parseApiError(error) || 'Não foi possível carregar.'}</Text></View> : <ScreenLoader message="Carregando brinde..." />}
      </View>
    );
  }
  const cancelled = g.status === 'cancelled';
  const canSendStore = !!receipt?.store_whatsapp.connected && !!receipt?.receipt.customer_phone && !cancelled;
  const waUrl = receipt ? receipt.whatsapp_url || `https://wa.me/?text=${encodeURIComponent(receipt.text)}` : null;

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
              <Text style={styles.name}>{i.quantity}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Comprovante para a pessoa</Text>
          <Text style={styles.meta}>Ela valida o que ganhou. Não mostra custo, fornecedor nem código interno: só as peças e o valor de vitrine.</Text>
          {!!sendOk && <Text style={[styles.meta, { color: Colors.light.success, fontWeight: '700' }]}>{sendOk}</Text>}
          {!!sendMsg && <Text style={styles.error}>{sendMsg}</Text>}
          {canSendStore && (
            <Button mode="contained" buttonColor={brand.primary} icon="whatsapp" loading={doSend.isPending} disabled={doSend.isPending}
              onPress={() => { setSendMsg(''); setSendOk(''); doSend.mutate(); }}>
              Enviar pelo WhatsApp da loja
            </Button>
          )}
          <Button mode={canSendStore ? 'outlined' : 'contained'} buttonColor={canSendStore ? undefined : brand.primary} textColor={canSendStore ? brand.primary : undefined}
            icon="whatsapp" disabled={!waUrl} onPress={() => waUrl && Linking.openURL(waUrl).catch(() => setSendMsg('Não consegui abrir o WhatsApp neste aparelho.'))}>
            Abrir no meu WhatsApp
          </Button>
          <PdfActions getPdf={() => getGiftReceiptPdf(gid, g.gift_number)} cacheKey={String(gid)} prefetch shareLabel="Baixar PDF" variant="outlined" size="md" />
          {!receipt?.receipt.customer_phone && <Text style={styles.meta}>Sem telefone de cliente cadastrada: use o PDF ou escolha o contato no WhatsApp.</Text>}
        </View>

        {!cancelled && (
          <View style={{ gap: 10 }}>
            <Button mode="outlined" textColor={Colors.light.error} icon="close-circle-outline" onPress={() => { setMsg(''); setSheet(true); }}>Cancelar este brinde (engano)</Button>
            <Text style={styles.meta}>Cancelar vale só no mesmo mês e desfaz o brinde por inteiro: as peças voltam ao estoque e o custo sai do mês. Brinde não aceita devolução.</Text>
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={sheet} onDismiss={() => setSheet(false)} title="Cancelar o brinde" icon="close-circle-outline"
        actions={[{ label: 'Cancelar brinde', variant: 'danger', loading: doCancel.isPending, disabled: reason.trim().length < 3, onPress: () => { setMsg(''); doCancel.mutate(); } }]}>
        <View style={{ gap: 10 }}>
          {!!msg && <Text style={styles.error}>{msg}</Text>}
          <Text style={styles.meta}>As peças voltam ao estoque nas mesmas entradas de onde saíram, e o custo sai do mês.</Text>
          <TextInput mode="outlined" label="Motivo do cancelamento" value={reason} onChangeText={setReason} activeOutlineColor={brand.primary} />
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
  error: { color: Colors.light.error, fontWeight: '600' },
});
