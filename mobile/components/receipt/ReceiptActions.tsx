/**
 * Comprovante para a cliente: mandar pelo WhatsApp (texto pronto, direto no telefone dela quando há cadastro)
 * e PDF em 58 mm, 80 mm ou A6. Vale para a tela de venda concluída e para o detalhe da venda.
 * O texto e o PDF vêm do servidor, então os dois sempre mostram o mesmo e nunca levam custo.
 */
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';

import AppButton from '@/components/ui/AppButton';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { parseApiError } from '@/utils/apiError';
import {
  RECEIPT_SIZES, getReceipt, getSavedReceiptSize, openReceiptPdf, receiptWhatsappUrl, saveReceiptSize, sendReceiptViaStoreWhatsapp,
  type ReceiptSize,
} from '@/services/receiptService';

interface Props {
  saleId: number;
  saleNumber: string;
  /** Troco dado em dinheiro (só aparece no comprovante; não fica gravado) */
  change?: number;
}

export default function ReceiptActions({ saleId, saleNumber, change }: Props) {
  const brand = useBrandingColors();
  const [size, setSize] = useState<ReceiptSize>('80');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { getSavedReceiptSize().then(setSize); }, []);

  // Já baixado antes do toque: o clique abre o WhatsApp na hora (o navegador bloqueia janela aberta depois de esperar)
  const { data: info, isError } = useQuery({
    queryKey: ['sale-receipt', saleId, change ?? 0],
    queryFn: () => getReceipt(saleId, change),
    staleTime: 60_000,
  });

  const storeReady = !!info?.store_whatsapp.connected && !!info.whatsapp_url; // número oficial ligado e cliente com telefone válido

  const sendFromStore = async () => {
    setError('');
    setSent('');
    setSending(true);
    try {
      const r = await sendReceiptViaStoreWhatsapp(saleId, change);
      setSent(
        r.mode === 'pdf'
          ? `Comprovante enviado para ${r.customer} pelo WhatsApp da loja${r.store_number ? ` (${r.store_number})` : ''}.`
          : `Mensagem com o resumo enviada para ${r.customer} pelo WhatsApp da loja.`,
      );
    } catch (e) {
      setError(parseApiError(e) || 'Não consegui enviar agora. Tente de novo.');
    } finally {
      setSending(false);
    }
  };

  const sendWhatsapp = () => {
    if (!info) return;
    setError('');
    Linking.openURL(receiptWhatsappUrl(info)).catch(() => setError('Não consegui abrir o WhatsApp neste aparelho.'));
  };

  const openPdf = async () => {
    setError('');
    setBusy(true);
    try {
      await openReceiptPdf(saleId, saleNumber, size, change);
    } catch (e) {
      setError(parseApiError(e) || 'Não consegui gerar o comprovante agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const pick = (s: ReceiptSize) => { setSize(s); saveReceiptSize(s); };
  const who = info?.receipt.customer
    ? (info.whatsapp_url
      ? (storeReady ? `Sai pelo WhatsApp da loja para ${info.receipt.customer}.` : `Vai direto para ${info.receipt.customer}.`)
      : `${info.receipt.customer} está sem telefone válido: você escolhe o contato.`)
    : 'Venda sem cliente: você escolhe o contato no WhatsApp.';

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="receipt-outline" size={20} color={brand.primary} />
        <Text style={styles.title}>Comprovante para a cliente</Text>
      </View>
      <Text style={styles.note}>
        {isError ? 'Não consegui carregar o comprovante. Puxe a tela para atualizar.' : who}
      </Text>

      {storeReady ? (
        <>
          <AppButton
            variant="primary" size="lg" fullWidth icon="logo-whatsapp"
            label={`Enviar pelo WhatsApp da loja${info?.store_whatsapp.number ? ` (${info.store_whatsapp.number})` : ''}`}
            onPress={sendFromStore} loading={sending} disabled={sending}
          />
          {!!sent && <Text style={styles.ok}>{sent}</Text>}
          <AppButton
            variant="secondary" size="md" fullWidth icon="open-outline" label="Abrir no meu WhatsApp"
            onPress={sendWhatsapp} disabled={!info}
          />
        </>
      ) : (
        <AppButton
          variant="primary" size="lg" fullWidth icon="logo-whatsapp" label="Enviar pelo WhatsApp"
          onPress={sendWhatsapp} disabled={!info}
        />
      )}

      <Text style={styles.label}>Comprovante em PDF</Text>
      <View style={styles.chips}>
        {RECEIPT_SIZES.map((s) => {
          const on = s.key === size;
          return (
            <Pressable
              key={s.key} onPress={() => pick(s.key)} accessibilityRole="button" accessibilityLabel={`Papel ${s.label}`}
              style={[styles.chip, on && { backgroundColor: brand.primary, borderColor: brand.primary }]}
            >
              <Text style={[styles.chipText, on && { color: '#fff' }]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{RECEIPT_SIZES.find((s) => s.key === size)?.hint}</Text>
      <AppButton
        variant="secondary" size="lg" fullWidth icon="document-text-outline" label="Abrir ou compartilhar PDF"
        onPress={openPdf} loading={busy} disabled={busy}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.hint}>Comprovante sem valor fiscal.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, gap: 10,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  note: { fontSize: 13, color: Colors.light.textSecondary },
  label: { fontSize: 13, fontWeight: '700', color: Colors.light.text, marginTop: 6 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.light.text },
  hint: { fontSize: 12, color: Colors.light.textSecondary },
  ok: { fontSize: 13, color: Colors.light.success, fontWeight: '600' },
  error: { fontSize: 13, color: Colors.light.error, fontWeight: '600' },
});
