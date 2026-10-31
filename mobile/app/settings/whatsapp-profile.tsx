/**
 * Perfil comercial do número no WhatsApp (o que a cliente vê): recado, descrição, endereço, e-mail, sites e ramo.
 * Lido da Meta; só grava depois da confirmação na tela. A foto do perfil se troca no Gerenciador do WhatsApp.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useChatColors } from '@/hooks/useThemeColors';
import { getWhatsappProfile, saveWhatsappProfile, WaProfile } from '@/services/whatsappService';
import { parseApiError } from '@/utils/apiError';

const VERTICAL_LABEL: Record<string, string> = {
  APPAREL: 'Roupas e acessórios', BEAUTY: 'Beleza e cuidados', RETAIL: 'Varejo', HEALTH: 'Saúde', OTHER: 'Outro',
  UNDEFINED: 'Não informado', AUTO: 'Automotivo', EDU: 'Educação', ENTERTAIN: 'Entretenimento', EVENT_PLAN: 'Eventos',
  FINANCE: 'Finanças', GROCERY: 'Mercado', GOVT: 'Governo', HOTEL: 'Hotel', NONPROFIT: 'Sem fins lucrativos',
  PROF_SERVICES: 'Serviços profissionais', TRAVEL: 'Viagens', RESTAURANT: 'Restaurante', NOT_A_BIZ: 'Não é empresa',
};

export default function WhatsappProfileScreen() {
  const router = useRouter();
  const c = useChatColors();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['whatsapp-profile'], queryFn: getWhatsappProfile, retry: false });
  const [form, setForm] = useState({ about: '', address: '', description: '', email: '', site1: '', site2: '', vertical: '' });
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');

  const fill = (p: WaProfile) => setForm({
    about: p.about, address: p.address, description: p.description, email: p.email,
    site1: p.websites[0] ?? '', site2: p.websites[1] ?? '', vertical: p.vertical,
  });
  useEffect(() => { if (data) fill(data); }, [data]);

  const limits = data?.limits;
  const over = (v: string, max?: number) => !!max && v.length > max;
  const problem = !data ? '' :
    over(form.about, limits?.about) ? 'O recado passa do limite.' :
    over(form.address, limits?.address) ? 'O endereço passa do limite.' :
    over(form.description, limits?.description) ? 'A descrição passa do limite.' :
    over(form.email, limits?.email) ? 'O e-mail passa do limite.' : '';

  const doSave = async () => {
    setConfirm(false);
    setSaving(true);
    setErr('');
    setMessage('');
    try {
      const saved = await saveWhatsappProfile({
        about: form.about, address: form.address, description: form.description, email: form.email,
        websites: [form.site1, form.site2].map((w) => w.trim()).filter(Boolean), vertical: form.vertical,
      });
      qc.setQueryData(['whatsapp-profile'], saved);
      fill(saved);
      setMessage('Salvo no WhatsApp.');
    } catch (e: any) {
      setErr(parseApiError(e) || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, max?: number, multiline?: boolean) => (
    <View style={{ marginTop: 12 }}>
      <TextInput
        mode="outlined" label={label} value={form[key]} multiline={multiline} numberOfLines={multiline ? 4 : 1}
        onChangeText={(t) => setForm((f) => ({ ...f, [key]: t }))} style={{ backgroundColor: c.surface }}
        autoCapitalize={key === 'email' || key.startsWith('site') ? 'none' : 'sentences'}
        keyboardType={key === 'email' ? 'email-address' : 'default'}
      />
      {!!max && <Text style={[styles.counter, { color: over(form[key], max) ? c.danger : c.textMuted }]}>{form[key].length} de {max}</Text>}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <PageHeader title="Perfil do WhatsApp" subtitle="O que a cliente vê" showBackButton onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isLoading ? (
          <Text style={{ color: c.textMuted }}>Lendo o perfil no WhatsApp…</Text>
        ) : error ? (
          <Text style={{ color: c.danger }}>{parseApiError(error) || 'Não foi possível ler o perfil.'}</Text>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.title, { color: c.text }]}>Perfil comercial</Text>
              <Text style={[styles.note, { color: c.textMuted }]}>
                É o que aparece para a cliente ao abrir os dados da loja. A foto do perfil se troca no Gerenciador do WhatsApp.
                Campo deixado em branco aqui não é apagado no WhatsApp.
              </Text>
              {field('about', 'Recado (aparece no topo)', limits?.about)}
              {field('description', 'Descrição da loja', limits?.description, true)}
              {field('address', 'Endereço', limits?.address)}
              {field('email', 'E-mail', limits?.email)}
              {field('site1', 'Site 1 (https://...)')}
              {field('site2', 'Site 2 (https://...)')}
              <Text style={[styles.label, { color: c.textMuted }]}>Ramo de atividade</Text>
              <View style={styles.chips}>
                {(data?.verticals ?? []).filter((v) => ['APPAREL', 'RETAIL', 'BEAUTY', 'HEALTH', 'OTHER'].includes(v)).map((v) => (
                  <TouchableOpacity
                    key={v} onPress={() => setForm((f) => ({ ...f, vertical: v }))} accessibilityRole="button"
                    style={[styles.chip, { borderColor: form.vertical === v ? c.accent : c.border, backgroundColor: form.vertical === v ? c.label.primary.bg : c.surface }]}
                  >
                    <Text style={{ color: form.vertical === v ? c.accent : c.textMuted, fontWeight: '600', fontSize: 13 }}>{VERTICAL_LABEL[v] ?? v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {!!problem && <Text style={{ color: c.danger, marginTop: 6 }}>{problem}</Text>}
            {!!err && <Text style={{ color: c.danger, marginTop: 6 }}>{err}</Text>}
            {!!message && <Text style={{ color: c.accent, marginTop: 6, fontWeight: '600' }}>{message}</Text>}
            <Button mode="contained" onPress={() => setConfirm(true)} loading={saving} disabled={saving || !!problem || !data} buttonColor={c.accent} style={{ marginTop: 8 }}>
              Salvar no WhatsApp
            </Button>
          </>
        )}
      </ScrollView>
      <ConfirmDialog
        visible={confirm}
        type="warning"
        title="Mudar o perfil no WhatsApp?"
        message="Isto muda o perfil que as clientes veem agora. Confira os textos antes de confirmar."
        confirmText="Salvar"
        cancelText="Voltar"
        onConfirm={doSave}
        onCancel={() => setConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  counter: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  label: { fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
});
