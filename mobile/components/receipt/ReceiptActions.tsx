/**
 * Comprovante para a cliente: mandar pelo WhatsApp (texto pronto, direto no telefone dela quando há cadastro) e PDF.
 * Vale para a tela de venda concluída e para o detalhe da venda. O texto e o PDF vêm do servidor, então os dois sempre
 * mostram o mesmo e nunca levam custo. O PDF sai sempre em A6: ninguém precisa escolher papel.
 */
import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import { useSaleReceipt } from '@/hooks/useSaleReceipt';
import { useBrandingColors } from '@/store/brandingStore';
import { parseApiError } from '@/utils/apiError';
import { openReceiptPdf, receiptWhatsappUrl, sendReceiptViaStoreWhatsapp } from '@/services/receiptService';

interface Props {
  saleId: number;
  saleNumber: string;
  /** Troco dado em dinheiro (só aparece no comprovante; não fica gravado) */
  change?: number;
}

export default function ReceiptActions({ saleId, saleNumber, change }: Props) {
  const brand = useBrandingColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [sending, setSending] = useState(false);

  // Já baixado antes do toque: o clique abre o WhatsApp na hora (o navegador bloqueia janela aberta depois de esperar)
  const { data: info, isError } = useSaleReceipt(saleId, change);

  const storeReady = !!info?.store_whatsapp.connected && !!info.whatsapp_url; // número oficial ligado e cliente com telefone válido

  const sendFromStore = async () => {
    setError('');
    setSent('');
    setSending(true);
    try {
      const r = await sendReceiptViaStoreWhatsapp(saleId, change);
      setSent(
        r.mode === 'pdf'
          ? `Comprovante enviado para ${r.customer} pelo WhatsApp da loja.`
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
      await openReceiptPdf(saleId, saleNumber, change);
    } catch (e) {
      setError(parseApiError(e) || 'Não consegui gerar o comprovante agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const number = info?.store_whatsapp.number;
  const who = info?.receipt.customer
    ? (info.whatsapp_url
      ? (storeReady ? `Sai pelo WhatsApp da loja${number ? ` (${number})` : ''} para ${info.receipt.customer}.` : `Vai direto para ${info.receipt.customer}.`)
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
            variant="primary" size="lg" fullWidth icon="logo-whatsapp" label="Enviar pelo WhatsApp da loja"
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

      <AppButton
        variant="secondary" size="md" fullWidth icon="document-text-outline" label="Abrir ou compartilhar PDF"
        onPress={openPdf} loading={busy} disabled={busy}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.hint}>Comprovante sem valor fiscal.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.card, borderRadius: 16, padding: theme.spacing.md, gap: theme.spacing.sm + 2,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  title: { fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  note: { fontSize: theme.fontSize.md - 1, color: Colors.light.textSecondary },
  hint: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  ok: { fontSize: theme.fontSize.md - 1, color: Colors.light.success, fontWeight: theme.fontWeight.semibold },
  error: { fontSize: theme.fontSize.md - 1, color: Colors.light.error, fontWeight: theme.fontWeight.semibold },
});
