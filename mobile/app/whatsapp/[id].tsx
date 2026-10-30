import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { getConversation, markConversationRead, sendWhatsappText, sendWhatsappFile, WaMessage } from '@/services/whatsappService';
import MessageMedia from '@/components/whatsapp/MessageMedia';
import * as ImagePicker from 'expo-image-picker';
import { useBrandingColors } from '@/store/brandingStore';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { parseApiError } from '@/utils/apiError';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';

const STATUS_LABEL: Record<string, string> = { sent: 'Enviada', delivered: 'Entregue', read: 'Lida', failed: 'Falhou' };

function hour(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
}

export default function WhatsappConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = parseInt(id, 10);
  const brand = useBrandingColors();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const [text, setText] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const listRef = useRef<FlatList<WaMessage>>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['whatsapp-conversation', convId],
    queryFn: () => getConversation(convId),
    refetchInterval: 10000,
    enabled: !!convId,
  });

  // abrir a conversa zera as não lidas (e de novo quando chega mensagem nova com a tela aberta)
  const unread = data?.unread_count ?? 0;
  useEffect(() => {
    if (!convId || unread === 0) return;
    markConversationRead(convId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-unread'] });
    }).catch(() => {});
  }, [convId, unread, queryClient]);

  const send = useMutation({
    mutationFn: (t: string) => sendWhatsappText(convId, t),
    onSuccess: () => {
      setText('');
      setErro(null);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversation', convId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
    onError: (e) => setErro(parseApiError(e)),
  });

  const sendFile = useMutation({
    mutationFn: (f: { uri: string; name: string; type: string }) => sendWhatsappFile(convId, f, text),
    onSuccess: () => {
      setText('');
      setErro(null);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversation', convId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
    onError: (e) => setErro(parseApiError(e)),
  });

  const attach = async () => {
    setErro(null);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // no navegador o seletor de arquivos aceita foto e PDF
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,application/pdf';
      input.onchange = () => {
        const f = input.files?.[0];
        if (f) sendFile.mutate({ uri: URL.createObjectURL(f), name: f.name, type: f.type || 'application/octet-stream' });
      };
      input.click();
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    const asset = !res.canceled ? res.assets?.[0] : null;
    if (asset) sendFile.mutate({ uri: asset.uri, name: asset.fileName || 'foto.jpg', type: asset.mimeType || 'image/jpeg' });
  };

  const messages = data?.messages ?? [];
  const windowOpen = data?.window_open ?? false;
  const canSend = windowOpen && text.trim().length > 0 && !send.isPending;

  const bubble = ({ item }: { item: WaMessage }) => {
    const mine = item.direction === 'out';
    return (
      <View style={[styles.bubble, mine ? [styles.mine, { backgroundColor: brand.primary }] : styles.theirs]}>
        {item.media && <MessageMedia message={item} mine={mine} />}
        {(item.text || !item.media) && (
          <Text style={[styles.msgText, mine && { color: '#FFFFFF' }]}>{item.text ?? `(${item.type})`}</Text>
        )}
        <Text style={[styles.meta, mine && { color: '#FFFFFFCC' }]}>
          {hour(item.sent_at)}{mine ? ` · ${STATUS_LABEL[item.status] ?? item.status}` : ''}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageHeader title={data?.name ?? 'Conversa'} subtitle={data?.phone ?? undefined} />
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={brand.primary} /></View>
      ) : isError ? (
        <EmptyState icon="alert-circle-outline" title="Não consegui abrir a conversa" description={parseApiError(error)} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={bubble}
          contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}
      <View style={[styles.footer, { paddingBottom: (keyboard > 0 ? keyboard : insets.bottom) + 10 }]}>
        {!windowOpen && !isLoading && (
          <Text style={styles.closedNote}>
            Passou de 24 horas desde a última mensagem da cliente. O WhatsApp só deixa responder com um modelo aprovado, e isso ainda não está disponível aqui.
          </Text>
        )}
        {erro && <Text style={styles.error}>{erro}</Text>}
        <View style={styles.inputRow}>
          <TouchableOpacity
            onPress={attach}
            disabled={!windowOpen || sendFile.isPending}
            style={[styles.attachBtn, (!windowOpen || sendFile.isPending) && { opacity: 0.4 }]}
            accessibilityLabel="Anexar foto ou PDF"
          >
            <Ionicons name="attach" size={22} color="#5B5670" />
          </TouchableOpacity>
          <TextInput
            style={[styles.input, !windowOpen && { opacity: 0.5 }]}
            value={text}
            onChangeText={setText}
            editable={windowOpen}
            placeholder={windowOpen ? 'Escreva a resposta' : 'Janela de 24 h fechada'}
            multiline
            maxLength={4096}
          />
          <TouchableOpacity
            onPress={() => send.mutate(text.trim())}
            disabled={!canSend}
            style={[styles.sendBtn, { backgroundColor: brand.primary }, !canSend && { opacity: 0.4 }]}
            accessibilityLabel="Enviar mensagem"
          >
            <Ionicons name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E3EE', borderBottomLeftRadius: 4 },
  msgText: { fontSize: 15, color: '#160F28' },
  meta: { fontSize: 11, color: '#5B5670', marginTop: 3, alignSelf: 'flex-end' },
  footer: { paddingHorizontal: 12, paddingTop: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E6E3EE', gap: 6 },
  closedNote: { fontSize: 12, color: '#B45309' },
  error: { fontSize: 12, color: '#B91C1C' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderColor: '#E6E3EE', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, color: '#160F28', backgroundColor: '#FAFAFC' },
  attachBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
