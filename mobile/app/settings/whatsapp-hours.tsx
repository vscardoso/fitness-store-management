/**
 * Horário comercial e mensagem de ausência do WhatsApp da loja. Fora do horário, a cliente que escreve recebe a
 * ausência (uma vez a cada 24 h); dentro do horário vale a saudação. Horário de Brasília. Só o administrador altera.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, Switch, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';

import PageHeader from '@/components/layout/PageHeader';
import { useChatColors } from '@/hooks/useThemeColors';
import { getWhatsappAway, saveWhatsappAway, WaHours } from '@/services/whatsappService';
import { parseApiError } from '@/utils/apiError';

const DAYS: { key: keyof WaHours; label: string }[] = [
  { key: 'mon', label: 'Segunda' }, { key: 'tue', label: 'Terça' }, { key: 'wed', label: 'Quarta' }, { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' }, { key: 'sat', label: 'Sábado' }, { key: 'sun', label: 'Domingo' },
];
const EMPTY: WaHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
const maskTime = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};

export default function WhatsappHoursScreen() {
  const router = useRouter();
  const c = useChatColors();
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState('');
  const [hours, setHours] = useState<WaHours>(EMPTY);
  const [max, setMax] = useState(1000);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getWhatsappAway()
      .then((a) => { setEnabled(a.enabled); setText(a.text); setHours(a.hours); setMax(a.max_chars); setLoaded(true); })
      .catch((e) => setError(parseApiError(e) || 'Não foi possível carregar.'));
  }, []);

  const setInterval_ = (day: keyof WaHours, i: number, pos: 0 | 1, value: string) =>
    setHours((h) => ({ ...h, [day]: h[day].map((p, k) => (k === i ? (pos === 0 ? [maskTime(value), p[1]] : [p[0], maskTime(value)]) : p)) as [string, string][] }));
  const addInterval = (day: keyof WaHours) => setHours((h) => ({ ...h, [day]: [...h[day], ['09:00', '18:00']] as [string, string][] }));
  const removeInterval = (day: keyof WaHours, i: number) => setHours((h) => ({ ...h, [day]: h[day].filter((_, k) => k !== i) }));
  const copyToWeekdays = () => setHours((h) => ({ ...h, tue: h.mon, wed: h.mon, thu: h.mon, fri: h.mon }));

  const save = async () => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const a = await saveWhatsappAway(enabled, text, hours);
      setEnabled(a.enabled); setText(a.text); setHours(a.hours);
      setMessage(a.enabled ? 'Salvo. A ausência está ligada.' : 'Salvo. A ausência está desligada.');
    } catch (e: any) {
      setError(parseApiError(e) || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <PageHeader title="Horário e ausência" subtitle="WhatsApp da loja" showBackButton onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.title, { color: c.text }]}>Horário em que a loja atende</Text>
          <Text style={[styles.note, { color: c.textMuted }]}>Horário de Brasília. Dia sem faixa conta como fechado. Use o formato 09:00.</Text>
          {DAYS.map(({ key, label }) => (
            <View key={key} style={styles.dayRow}>
              <Text style={[styles.dayName, { color: c.text }]}>{label}</Text>
              <View style={{ flex: 1, gap: 6 }}>
                {hours[key].length === 0 && <Text style={{ color: c.textMuted, fontSize: 13, paddingVertical: 8 }}>Fechado</Text>}
                {hours[key].map((p, i) => (
                  <View key={i} style={styles.interval}>
                    <TextInput mode="outlined" dense value={p[0]} onChangeText={(t) => setInterval_(key, i, 0, t)} style={styles.time} keyboardType="numeric" maxLength={5} accessibilityLabel={`${label}, abre`} />
                    <Text style={{ color: c.textMuted }}>às</Text>
                    <TextInput mode="outlined" dense value={p[1]} onChangeText={(t) => setInterval_(key, i, 1, t)} style={styles.time} keyboardType="numeric" maxLength={5} accessibilityLabel={`${label}, fecha`} />
                    <TouchableOpacity onPress={() => removeInterval(key, i)} accessibilityLabel={`Remover faixa de ${label}`} style={styles.rm}>
                      <Text style={{ color: c.danger, fontSize: 18 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity onPress={() => addInterval(key)} accessibilityRole="button">
                  <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600' }}>+ faixa de horário</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={copyToWeekdays} style={{ marginTop: 12 }} accessibilityRole="button">
            <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600' }}>Copiar a segunda para terça a sexta</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: c.text }]}>Mensagem de ausência</Text>
              <Text style={[styles.note, { color: c.textMuted }]}>
                Quando a cliente escreve com a loja fechada, ela recebe esta mensagem uma vez a cada 24 horas (no lugar da saudação).
                Dentro do horário continua valendo a saudação.
              </Text>
            </View>
            <Switch value={enabled} onValueChange={setEnabled} disabled={!loaded} />
          </View>
          <TextInput
            mode="outlined" label="Texto da ausência" value={text} onChangeText={(t) => setText(t.slice(0, max))} multiline numberOfLines={5}
            style={{ marginTop: 12, backgroundColor: c.surface, minHeight: 120 }} disabled={!loaded}
          />
          <Text style={[styles.counter, { color: c.textMuted }]}>{text.length} de {max} letras</Text>
        </View>

        {!!error && <Text style={{ color: c.danger, marginTop: 6 }}>{error}</Text>}
        {!!message && <Text style={{ color: c.accent, marginTop: 6, fontWeight: '600' }}>{message}</Text>}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving || !loaded} buttonColor={c.accent} style={{ marginTop: 8 }}>Salvar</Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  dayRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'flex-start' },
  dayName: { width: 70, fontSize: 14, fontWeight: '600', paddingTop: 10 },
  interval: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { width: 84, height: 40 },
  rm: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  counter: { fontSize: 12, marginTop: 6, textAlign: 'right' },
});
