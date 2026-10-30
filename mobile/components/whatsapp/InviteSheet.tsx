/**
 * "Convidar para o WhatsApp da loja": a cliente escreve primeiro para o número oficial (abre a janela de 24 h em que a
 * loja responde com texto livre). Monta o link wa.me com um texto pronto, copia, compartilha e mostra o QR para imprimir.
 * Com `customerPhone`, também abre o WhatsApp de quem está usando o app com o convite já escrito para a cliente.
 */
import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform, Share, Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import BottomSheet from '@/components/ui/BottomSheet';
import { getWhatsappInvite } from '@/services/whatsappService';
import { useBrandingStore } from '@/store/brandingStore';
import { parseApiError } from '@/utils/apiError';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  customerName?: string;
  customerPhone?: string | null;
}

function digits(phone?: string | null): string {
  const d = (phone || '').replace(/\D/g, '');
  if (!d) return '';
  return d.length <= 11 ? `55${d}` : d;
}

export default function InviteSheet({ visible, onDismiss, customerName, customerPhone }: Props) {
  const storeName = useBrandingStore((s) => s.branding?.name) || 'nossa loja';
  const [message, setMessage] = useState('');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setNote(null);
      setMessage(`Oi${customerName ? `, ${customerName.split(' ')[0]}` : ''}! Aqui é a ${storeName}. Me chame por este WhatsApp para ver as novidades e tirar dúvidas.`);
    }
  }, [visible, customerName, storeName]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['whatsapp-invite'],
    queryFn: () => getWhatsappInvite(),
    enabled: visible,
    staleTime: 60 * 60 * 1000,
  });

  const link = data ? `${data.link}${data.link.includes('?') ? '&' : '?'}text=${encodeURIComponent(`Oi! Vim pelo convite da ${storeName}.`)}` : '';
  const full = link ? `${message}\n${link}` : message;

  const copy = async () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(full);
        setNote('Convite copiado.');
        return;
      } catch { /* cai no compartilhar */ }
    }
    await share();
  };

  const share = async () => {
    try {
      await Share.share({ message: full });
    } catch {
      setNote('Não consegui compartilhar. Copie o link e envie.');
    }
  };

  const sendToCustomer = async () => {
    const to = digits(customerPhone);
    if (!to) return;
    const url = `https://wa.me/${to}?text=${encodeURIComponent(full)}`;
    if (Platform.OS === 'web') window.open(url, '_blank');
    else await Linking.openURL(url).catch(() => setNote('Não consegui abrir o WhatsApp.'));
  };

  const actions = [
    ...(customerPhone && link ? [{ label: 'Enviar para a cliente', onPress: sendToCustomer, icon: 'logo-whatsapp' as const }] : []),
    { label: 'Copiar convite', onPress: copy, variant: 'secondary' as const, disabled: !link, icon: 'copy-outline' as const },
    { label: 'Compartilhar', onPress: share, variant: 'secondary' as const, disabled: !link, icon: 'share-outline' as const },
  ];

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Convidar para o WhatsApp da loja"
      subtitle="A cliente escreve primeiro e você responde por aqui"
      icon="logo-whatsapp"
      actions={actions}
    >
      <View style={styles.body}>
        {isLoading && <Text style={styles.muted}>Buscando o número da loja…</Text>}
        {isError && <Text style={styles.error}>{parseApiError(error)}</Text>}
        {link ? (
          <>
            <Text style={styles.label}>Mensagem do convite</Text>
            <TextInput style={styles.input} value={message} onChangeText={setMessage} multiline />
            <Text style={styles.label}>Link</Text>
            <Text style={styles.link} selectable>{link}</Text>
            <View style={styles.qr}>
              <QRCode value={link} size={160} />
              <Text style={styles.muted}>QR para imprimir ou mostrar no balcão</Text>
            </View>
          </>
        ) : null}
        {note && <Text style={styles.muted}>{note}</Text>}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 8, paddingVertical: 8 },
  label: { fontSize: 12, fontWeight: '600', color: '#5B5670' },
  input: { minHeight: 80, borderWidth: 1, borderColor: '#E6E3EE', borderRadius: 12, padding: 10, fontSize: 14, color: '#160F28', textAlignVertical: 'top' },
  link: { fontSize: 13, color: '#160F28' },
  qr: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  muted: { fontSize: 12, color: '#5B5670' },
  error: { fontSize: 13, color: '#B91C1C' },
});
