import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import MessageMedia from '@/components/whatsapp/MessageMedia';
import LabelChip from '@/components/whatsapp/LabelChip';
import LabelPicker from '@/components/whatsapp/LabelPicker';
import {
  getConversation, listQuickReplies, listWhatsappLabels, markConversationRead, sendWhatsappFile, sendWhatsappText,
  setConversationLabels, WaMessage,
} from '@/services/whatsappService';
import * as ImagePicker from 'expo-image-picker';
import { useChatColors } from '@/hooks/useThemeColors';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { fillQuickReply, filterQuickReplies, slashQuery } from '@/utils/quickReply';
import { parseApiError } from '@/utils/apiError';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';

const STATUS_LABEL: Record<string, string> = { sent: 'Enviada', delivered: 'Entregue', read: 'Lida', failed: 'Falhou' };

const hour = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

function dayLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

type Row = { kind: 'day'; key: string; label: string } | { kind: 'msg'; key: string; msg: WaMessage };

export default function WhatsappConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = parseInt(id, 10);
  const c = useChatColors();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const [text, setText] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Row>>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['whatsapp-conversation', convId],
    queryFn: () => getConversation(convId),
    refetchInterval: 10000,
    enabled: !!convId,
  });
  const { data: quick = [] } = useQuery({ queryKey: ['whatsapp-quick-replies'], queryFn: listQuickReplies });
  const { data: allLabels = [] } = useQuery({ queryKey: ['whatsapp-labels'], queryFn: listWhatsappLabels });

  const unread = data?.unread_count ?? 0;
  useEffect(() => {
    if (!convId || unread === 0) return;
    markConversationRead(convId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-unread'] });
    }).catch(() => {});
  }, [convId, unread, queryClient]);

  const afterSend = () => {
    setText('');
    setErro(null);
    queryClient.invalidateQueries({ queryKey: ['whatsapp-conversation', convId] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
  };
  const send = useMutation({ mutationFn: (t: string) => sendWhatsappText(convId, t), onSuccess: afterSend, onError: (e) => setErro(parseApiError(e)) });
  const sendFile = useMutation({
    mutationFn: (f: { uri: string; name: string; type: string }) => sendWhatsappFile(convId, f, text),
    onSuccess: afterSend,
    onError: (e) => setErro(parseApiError(e)),
  });
  const saveLabels = useMutation({
    mutationFn: (ids: number[]) => setConversationLabels(convId, ids),
    onSuccess: () => {
      setLabelsOpen(false);
      setLabelsError(null);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversation', convId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
    onError: (e) => setLabelsError(parseApiError(e)),
  });

  const attach = async () => {
    setErro(null);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
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

  const windowOpen = data?.window_open ?? false;
  const canSend = windowOpen && text.trim().length > 0 && !send.isPending;
  const customerName = data?.customer_id ? data.name : null;

  // atalho "/": lista as respostas rápidas; escolher preenche o campo e a atendente revisa antes de enviar
  const slash = slashQuery(text);
  const suggestions = useMemo(() => (slash === null ? [] : filterQuickReplies(quick, slash).slice(0, 6)), [slash, quick]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let last = '';
    for (const m of data?.messages ?? []) {
      const day = m.sent_at ? new Date(m.sent_at).toDateString() : '';
      if (day && day !== last) { out.push({ kind: 'day', key: `d${day}`, label: dayLabel(m.sent_at) }); last = day; }
      out.push({ kind: 'msg', key: `m${m.id}`, msg: m });
    }
    return out;
  }, [data?.messages]);

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'day') {
      return (
        <View style={styles.dayWrap}>
          <Text style={[styles.day, { color: c.textMuted, backgroundColor: c.surface, borderColor: c.border }]}>{item.label}</Text>
        </View>
      );
    }
    const m = item.msg;
    const mine = m.direction === 'out';
    return (
      <View style={[
        styles.bubble,
        mine ? [styles.mine, { backgroundColor: c.bubbleOut }] : [styles.theirs, { backgroundColor: c.bubbleIn, borderColor: c.bubbleInBorder }],
      ]}>
        {m.media && <MessageMedia message={m} mine={mine} />}
        {(m.text || !m.media) && (
          <Text style={[styles.msgText, { color: mine ? c.bubbleOutText : c.bubbleInText }]}>{m.text ?? `(${m.type})`}</Text>
        )}
        <Text style={[styles.meta, { color: mine ? c.bubbleOutMuted : c.textMuted }]}>
          {hour(m.sent_at)}{mine ? `  ${STATUS_LABEL[m.status] ?? m.status}` : ''}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: c.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageHeader title={data?.name ?? 'Conversa'} subtitle={data?.phone ?? undefined} />
      <View style={[styles.labelsBar, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.labelsList}>
          {(data?.labels ?? []).map((l) => <LabelChip key={l.id} name={l.name} colorKey={l.color_key} small />)}
          {(data?.labels ?? []).length === 0 && <Text style={{ color: c.textMuted, fontSize: 12 }}>Sem etiquetas</Text>}
        </View>
        <TouchableOpacity onPress={() => setLabelsOpen(true)} style={styles.labelsBtn} accessibilityRole="button" accessibilityLabel="Editar etiquetas">
          <Ionicons name="pricetags-outline" size={16} color={c.accent} />
          <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600' }}>Etiquetas</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={c.accent} /></View>
      ) : isError ? (
        <EmptyState icon="alert-circle-outline" title="Não consegui abrir a conversa" description={parseApiError(error)} />
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}
      <View style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: (keyboard > 0 ? keyboard : insets.bottom) + 10 }]}>
        {suggestions.length > 0 && (
          <View style={[styles.suggest, { backgroundColor: c.surface, borderColor: c.border }]}>
            {suggestions.map((r) => (
              <TouchableOpacity key={r.id} style={styles.suggestRow} onPress={() => setText(fillQuickReply(r.text, customerName))} accessibilityRole="button">
                <Text style={[styles.suggestKey, { color: c.accent }]}>/{r.shortcut}</Text>
                <Text style={[styles.suggestText, { color: c.textMuted }]} numberOfLines={1}>{r.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {slash !== null && suggestions.length === 0 && (
          <Text style={{ color: c.textMuted, fontSize: 12 }}>
            {quick.length === 0 ? 'Nenhuma resposta rápida cadastrada. Quem administra cria em Mais, WhatsApp, Respostas rápidas.' : 'Nenhuma resposta rápida com esse atalho.'}
          </Text>
        )}
        {!windowOpen && !isLoading && (
          <View style={[styles.banner, { backgroundColor: c.warningSoft }]}>
            <Ionicons name="time-outline" size={16} color={c.warning} />
            <Text style={[styles.bannerText, { color: c.text }]}>
              Passou de 24 horas desde a última mensagem da cliente. O WhatsApp só deixa responder com um modelo aprovado, e isso ainda não está disponível aqui.
            </Text>
          </View>
        )}
        {erro && <Text style={{ fontSize: 12, color: c.danger }}>{erro}</Text>}
        <View style={styles.inputRow}>
          <TouchableOpacity onPress={attach} disabled={!windowOpen || sendFile.isPending} style={[styles.attachBtn, (!windowOpen || sendFile.isPending) && { opacity: 0.4 }]} accessibilityLabel="Anexar foto ou PDF">
            <Ionicons name="attach" size={22} color={c.textMuted} />
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }, !windowOpen && { opacity: 0.5 }]}
            value={text}
            onChangeText={setText}
            editable={windowOpen}
            placeholder={windowOpen ? 'Escreva a resposta (/ para respostas rápidas)' : 'Janela de 24 h fechada'}
            placeholderTextColor={c.textMuted}
            multiline
            maxLength={4096}
          />
          <TouchableOpacity
            onPress={() => send.mutate(text.trim())}
            disabled={!canSend}
            style={[styles.sendBtn, { backgroundColor: c.accent }, !canSend && { opacity: 0.4 }]}
            accessibilityLabel="Enviar mensagem"
          >
            <Ionicons name="send" size={18} color={c.bubbleOutText} />
          </TouchableOpacity>
        </View>
      </View>
      <LabelPicker
        visible={labelsOpen}
        onDismiss={() => setLabelsOpen(false)}
        all={allLabels}
        selectedIds={(data?.labels ?? []).map((l) => l.id)}
        saving={saveLabels.isPending}
        error={labelsError}
        onSave={(ids) => saveLabels.mutate(ids)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  labelsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  labelsList: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  labelsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  dayWrap: { alignItems: 'center', marginVertical: 6 },
  day: { fontSize: 12, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 5 },
  theirs: { alignSelf: 'flex-start', borderWidth: 1, borderBottomLeftRadius: 5 },
  msgText: { fontSize: 15, lineHeight: 21 },
  meta: { fontSize: 11, alignSelf: 'flex-end' },
  footer: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, gap: 6 },
  suggest: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  suggestKey: { fontSize: 14, fontWeight: '700', minWidth: 70 },
  suggestText: { flex: 1, fontSize: 13 },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 12 },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 17 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  attachBtn: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 42, maxHeight: 130, borderWidth: 1, borderRadius: 21, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
