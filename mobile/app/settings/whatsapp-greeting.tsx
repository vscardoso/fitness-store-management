/**
 * Saudação automática do WhatsApp da loja: a mensagem que a cliente recebe quando escreve para o número oficial
 * (uma vez a cada janela de 24 h). Só o administrador altera. Fica desligada até alguém ligar aqui.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Switch, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';

import PageHeader from '@/components/layout/PageHeader';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getWhatsappGreeting, saveWhatsappGreeting } from '@/services/whatsappService';
import { parseApiError } from '@/utils/apiError';

export default function WhatsappGreetingScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState('');
  const [max, setMax] = useState(1000);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getWhatsappGreeting()
      .then((g) => {
        setEnabled(g.enabled);
        setText(g.text);
        setMax(g.max_chars);
        setLoaded(true);
      })
      .catch((e) => setError(parseApiError(e) || 'Não foi possível carregar.'));
  }, []);

  const save = async () => {
    setError('');
    setMessage('');
    if (enabled && !text.trim()) {
      setError('Escreva a mensagem antes de ligar a saudação.');
      return;
    }
    setSaving(true);
    try {
      const g = await saveWhatsappGreeting(enabled, text);
      setEnabled(g.enabled);
      setText(g.text);
      setMessage(g.enabled ? 'Salvo. A saudação está ligada.' : 'Salvo. A saudação está desligada.');
    } catch (e: any) {
      setError(parseApiError(e) || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Saudação automática" subtitle="WhatsApp da loja" showBackButton onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Responder sozinha quando a cliente escreve</Text>
              <Text style={styles.note}>
                A cliente recebe a mensagem abaixo uma vez a cada 24 horas, na primeira mensagem dela. Quem continua escrevendo
                na mesma conversa não recebe de novo. Esta mensagem não custa pela tabela da Meta (atendimento dentro da janela).
              </Text>
            </View>
            <Switch value={enabled} onValueChange={setEnabled} disabled={!loaded} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Mensagem</Text>
          <TextInput
            mode="outlined"
            label="Texto da saudação"
            value={text}
            onChangeText={(t) => setText(t.slice(0, max))}
            multiline
            numberOfLines={6}
            style={styles.input}
            disabled={!loaded}
          />
          <Text style={styles.counter}>{text.length} de {max} letras</Text>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!message && <Text style={[styles.ok, { color: brand.primary }]}>{message}</Text>}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving || !loaded} buttonColor={brand.primary} style={{ marginTop: 8 }}>
          Salvar
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 4 },
  input: { marginTop: 12, backgroundColor: Colors.light.card, minHeight: 140 },
  counter: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 6, textAlign: 'right' },
  error: { color: Colors.light.error, marginTop: 6 },
  ok: { marginTop: 6, fontWeight: '600' },
});
