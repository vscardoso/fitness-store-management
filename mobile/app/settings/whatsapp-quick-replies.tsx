/** Respostas rápidas do WhatsApp da loja: o atalho (/preco) abre o texto na conversa. {nome} vira o primeiro nome da cliente. */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useChatColors } from '@/hooks/useThemeColors';
import {
  createQuickReply, deleteQuickReply, listQuickReplies, updateQuickReply, WaQuickReply,
} from '@/services/whatsappService';
import { parseApiError } from '@/utils/apiError';

export default function WhatsappQuickRepliesScreen() {
  const router = useRouter();
  const c = useChatColors();
  const qc = useQueryClient();
  const { data = [], isLoading, error } = useQuery({ queryKey: ['whatsapp-quick-replies'], queryFn: listQuickReplies });
  const [editing, setEditing] = useState<WaQuickReply | 'new' | null>(null);
  const [shortcut, setShortcut] = useState('');
  const [text, setText] = useState('');
  const [formError, setFormError] = useState('');
  const [removing, setRemoving] = useState<WaQuickReply | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['whatsapp-quick-replies'] });
  const open = (r: WaQuickReply | 'new') => {
    setEditing(r); setFormError('');
    setShortcut(r === 'new' ? '' : r.shortcut); setText(r === 'new' ? '' : r.text);
  };
  const save = useMutation({
    mutationFn: () => (editing && editing !== 'new' ? updateQuickReply(editing.id, shortcut, text) : createQuickReply(shortcut, text)),
    onSuccess: () => { setEditing(null); refresh(); },
    onError: (e) => setFormError(parseApiError(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteQuickReply(id),
    onSuccess: () => { setRemoving(null); refresh(); },
  });

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <PageHeader title="Respostas rápidas" subtitle="Atalhos para a conversa" showBackButton onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.note, { color: c.textMuted }]}>
          Na conversa, digite / e escolha. O texto entra no campo e você revisa antes de enviar. Use {'{nome}'} para o primeiro nome da cliente.
        </Text>
        {isLoading ? <Text style={{ color: c.textMuted }}>Carregando…</Text> : error ? <Text style={{ color: c.danger }}>{parseApiError(error)}</Text> : null}
        {data.map((r) => (
          <TouchableOpacity key={r.id} onPress={() => open(r)} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="button">
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.accent, fontWeight: '700', fontSize: 15 }}>/{r.shortcut}</Text>
              <Text style={{ color: c.textMuted, fontSize: 13 }} numberOfLines={2}>{r.text}</Text>
            </View>
            <TouchableOpacity onPress={() => setRemoving(r)} accessibilityLabel={`Apagar /${r.shortcut}`} style={styles.del}>
              <Text style={{ color: c.danger, fontSize: 13, fontWeight: '600' }}>Apagar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
        {!isLoading && data.length === 0 && !error && <Text style={{ color: c.textMuted }}>Nenhuma resposta rápida ainda.</Text>}
        <Button mode="contained" onPress={() => open('new')} buttonColor={c.accent} style={{ marginTop: 8 }}>Nova resposta rápida</Button>
      </ScrollView>

      <BottomSheet
        visible={editing !== null}
        onDismiss={() => setEditing(null)}
        title={editing === 'new' ? 'Nova resposta rápida' : 'Editar resposta rápida'}
        icon="flash-outline"
        actions={[{ label: 'Salvar', onPress: () => save.mutate(), loading: save.isPending, disabled: save.isPending }]}
      >
        <View style={{ gap: 12, paddingVertical: 8 }}>
          <TextInput mode="outlined" label="Atalho (sem a barra)" value={shortcut} onChangeText={setShortcut} autoCapitalize="none" autoCorrect={false} maxLength={40} />
          <TextInput mode="outlined" label="Texto" value={text} onChangeText={setText} multiline numberOfLines={5} maxLength={1000} style={{ minHeight: 120 }} />
          <Text style={{ color: c.textMuted, fontSize: 12 }}>{text.length} de 1000 letras. Dica: "Oi, {'{nome}'}! Tudo bem?"</Text>
          {!!formError && <Text style={{ color: c.danger, fontSize: 13 }}>{formError}</Text>}
        </View>
      </BottomSheet>
      <ConfirmDialog
        visible={!!removing}
        type="danger"
        title="Apagar resposta rápida?"
        message={removing ? `O atalho /${removing.shortcut} deixa de existir.` : ''}
        confirmText="Apagar"
        cancelText="Voltar"
        onConfirm={() => removing && remove.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 10 },
  note: { fontSize: 13, lineHeight: 19 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 14, borderWidth: 1 },
  del: { paddingHorizontal: 6, paddingVertical: 6 },
});
