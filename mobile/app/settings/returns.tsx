/**
 * Prazo de troca e devolução da loja: quantos dias o cliente tem e se a loja devolve dinheiro
 * (ou só troca a peça). Só o administrador altera.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Switch, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';

import PageHeader from '@/components/layout/PageHeader';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getReturnSettings, updateReturnSettings } from '@/services/storeService';
import { parseApiError } from '@/utils/apiError';

export default function ReturnSettingsScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const [days, setDays] = useState('7');
  const [allowRefund, setAllowRefund] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getReturnSettings()
      .then((s) => {
        setDays(String(s.return_window_days));
        setAllowRefund(s.allow_money_refund);
      })
      .catch((e) => setError(parseApiError(e) || 'Não foi possível carregar.'));
  }, []);

  const save = async () => {
    const n = parseInt(days, 10);
    if (Number.isNaN(n) || n < 0 || n > 90) {
      setError('Informe um prazo entre 0 e 90 dias.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await updateReturnSettings({ return_window_days: n, allow_money_refund: allowRefund });
      setMessage('Salvo. Vale para as próximas trocas e devoluções.');
    } catch (e: any) {
      setError(parseApiError(e) || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Troca e devolução" subtitle="Prazo e regra da loja" showBackButton onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Prazo para trocar ou devolver</Text>
          <Text style={styles.note}>Quantos dias, depois da compra, o cliente pode trocar ou devolver uma peça.</Text>
          <TextInput
            mode="outlined"
            label="Dias"
            value={days}
            onChangeText={(t) => setDays(t.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
            style={styles.input}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Esta loja devolve dinheiro</Text>
              <Text style={styles.note}>
                Desligado: o cliente só troca a peça. Se a peça nova valer mais, ele paga a diferença na hora. Se valer menos, o app não
                deixa fechar a troca (a loja não devolve a diferença).
              </Text>
            </View>
            <Switch value={allowRefund} onValueChange={setAllowRefund} />
          </View>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!message && <Text style={[styles.ok, { color: brand.primary }]}>{message}</Text>}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving} buttonColor={brand.primary} style={{ marginTop: 8 }}>
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
  input: { marginTop: 12, backgroundColor: Colors.light.card },
  error: { color: Colors.light.error, marginTop: 6 },
  ok: { marginTop: 6, fontWeight: '600' },
});
