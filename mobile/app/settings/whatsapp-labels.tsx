/** Etiquetas das conversas do WhatsApp da loja. São só do Provador (as do app WhatsApp Business não sincronizam com a API). */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LabelChip from '@/components/whatsapp/LabelChip';
import { useChatColors } from '@/hooks/useThemeColors';
import { LABEL_COLOR_KEYS } from '@/constants/tokens';
import {
  createWhatsappLabel, deleteWhatsappLabel, listWhatsappLabels, updateWhatsappLabel, WaLabel,
} from '@/services/whatsappService';
import { parseApiError } from '@/utils/apiError';

export default function WhatsappLabelsScreen() {
  const router = useRouter();
  const c = useChatColors();
  const qc = useQueryClient();
  const { data = [], isLoading, error } = useQuery({ queryKey: ['whatsapp-labels'], queryFn: listWhatsappLabels });
  const [editing, setEditing] = useState<WaLabel | 'new' | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>('primary');
  const [formError, setFormError] = useState('');
  const [removing, setRemoving] = useState<WaLabel | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['whatsapp-labels'] });
    qc.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
  };
  const open = (l: WaLabel | 'new') => { setEditing(l); setFormError(''); setName(l === 'new' ? '' : l.name); setColor(l === 'new' ? 'primary' : l.color_key); };
  const save = useMutation({
    mutationFn: () => (editing && editing !== 'new' ? updateWhatsappLabel(editing.id, name, color) : createWhatsappLabel(name, color)),
    onSuccess: () => { setEditing(null); refresh(); },
    onError: (e) => setFormError(parseApiError(e)),
  });
  const remove = useMutation({ mutationFn: (id: number) => deleteWhatsappLabel(id), onSuccess: () => { setRemoving(null); refresh(); } });

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <PageHeader title="Etiquetas" subtitle="Organize as conversas" showBackButton onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.note, { color: c.textMuted }]}>
          As etiquetas aparecem só para a equipe e ajudam a filtrar a lista de conversas. Elas não aparecem no app WhatsApp Business do celular.
        </Text>
        {isLoading ? <Text style={{ color: c.textMuted }}>Carregando…</Text> : error ? <Text style={{ color: c.danger }}>{parseApiError(error)}</Text> : null}
        {data.map((l) => (
          <View key={l.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <LabelChip name={l.name} colorKey={l.color_key} onPress={() => open(l)} />
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => open(l)} accessibilityLabel={`Editar ${l.name}`}><Text style={{ color: c.accent, fontWeight: '600', fontSize: 13 }}>Editar</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setRemoving(l)} accessibilityLabel={`Apagar ${l.name}`}><Text style={{ color: c.danger, fontWeight: '600', fontSize: 13 }}>Apagar</Text></TouchableOpacity>
          </View>
        ))}
        {!isLoading && data.length === 0 && !error && <Text style={{ color: c.textMuted }}>Nenhuma etiqueta ainda.</Text>}
        <Button mode="contained" onPress={() => open('new')} buttonColor={c.accent} style={{ marginTop: 8 }}>Nova etiqueta</Button>
      </ScrollView>

      <BottomSheet
        visible={editing !== null}
        onDismiss={() => setEditing(null)}
        title={editing === 'new' ? 'Nova etiqueta' : 'Editar etiqueta'}
        icon="pricetags-outline"
        actions={[{ label: 'Salvar', onPress: () => save.mutate(), loading: save.isPending, disabled: save.isPending }]}
      >
        <View style={{ gap: 12, paddingVertical: 8 }}>
          <TextInput mode="outlined" label="Nome da etiqueta" value={name} onChangeText={setName} maxLength={40} />
          <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '600' }}>Cor</Text>
          <View style={styles.colors}>
            {LABEL_COLOR_KEYS.map((k) => (
              <LabelChip key={k} name={name.trim() || 'Exemplo'} colorKey={k} selected={color === k} onPress={() => setColor(k)} />
            ))}
          </View>
          {!!formError && <Text style={{ color: c.danger, fontSize: 13 }}>{formError}</Text>}
        </View>
      </BottomSheet>
      <ConfirmDialog
        visible={!!removing}
        type="danger"
        title="Apagar etiqueta?"
        message={removing ? `A etiqueta "${removing.name}" sai de todas as conversas.` : ''}
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
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, padding: 12, borderWidth: 1 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
