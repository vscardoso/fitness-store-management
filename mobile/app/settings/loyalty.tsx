/**
 * Programa de fidelidade da loja: liga ou desliga, quanto a cliente ganha, quanto cada ponto vale (cashback), mínimo
 * para usar e validade. Só o administrador altera. A frase de baixo mostra a regra em palavras para conferir.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Switch, TextInput } from 'react-native-paper';
import AppButton from '@/components/ui/AppButton';
import { useRouter } from 'expo-router';

import PageHeader from '@/components/layout/PageHeader';
import FormGrid from '@/components/layout/FormGrid';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { parseApiError } from '@/utils/apiError';
import { describeLoyalty } from '@/utils/loyaltyText';
import { getLoyaltySettings, updateLoyaltySettings } from '@/services/loyaltyService';
import ScreenLoader from '@/components/ui/ScreenLoader';

const num = (t: string) => {
  const n = parseFloat(String(t).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export default function LoyaltySettingsScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const desktopContent = useDesktopContentStyle();
  const [enabled, setEnabled] = useState(false);
  const [spend, setSpend] = useState('10');
  const [value, setValue] = useState('0,10');
  const [minRedeem, setMinRedeem] = useState('0');
  const [expires, setExpires] = useState(false);
  const [days, setDays] = useState('90');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);       // enquanto a configuração da loja não chegou, não mostra valores padrão
  const [loadFailed, setLoadFailed] = useState(false);   // se não carregou, não deixa salvar (gravaria os padrões por cima)
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getLoyaltySettings()
      .then((s) => {
        setEnabled(s.enabled);
        setSpend(String(s.spend_per_point).replace('.', ','));
        setValue(String(s.point_value).replace('.', ','));
        setMinRedeem(String(s.min_redeem));
        setExpires(!!s.expiry_days);
        if (s.expiry_days) setDays(String(s.expiry_days));
      })
      .catch((e) => { setLoadFailed(true); setError(parseApiError(e) || 'Não foi possível carregar.'); })
      .finally(() => setLoading(false));
  }, []);

  const rule = useMemo(() => ({
    enabled,
    spend_per_point: num(spend) || 0,
    point_value: num(value) || 0,
    min_redeem: num(minRedeem) || 0,
    expiry_days: expires ? (parseInt(days, 10) || null) : null,
  }), [enabled, spend, value, minRedeem, expires, days]);

  const save = async () => {
    setError('');
    setMessage('');
    if (enabled) {
      if (!(rule.spend_per_point >= 0.01)) return setError('Informe quantos reais gastos dão 1 ponto (a partir de R$ 0,01).');
      if (!(rule.point_value >= 0)) return setError('Informe quanto vale 1 ponto em reais (pode ser R$ 0,00 se não quiser permitir o uso).');
      if (expires && !(rule.expiry_days && rule.expiry_days >= 1 && rule.expiry_days <= 3650)) return setError('Informe a validade em dias (de 1 a 3650).');
    }
    setSaving(true);
    try {
      await updateLoyaltySettings({
        enabled, spend_per_point: rule.spend_per_point || 10, point_value: rule.point_value,
        min_redeem: rule.min_redeem, expiry_days: rule.expiry_days,
      });
      setMessage('Salvo. Vale para as próximas vendas. Os pontos que as clientes já têm continuam como estavam.');
    } catch (e: any) {
      setError(parseApiError(e) || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Fidelidade" subtitle="Pontos que viram desconto" showBackButton backFallback="/(tabs)/more" />
        <ScreenLoader />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader title="Fidelidade" subtitle="Pontos que viram desconto" showBackButton backFallback="/(tabs)/more" />
      <ScrollView contentContainerStyle={[styles.content, desktopContent]} keyboardShouldPersistTaps="handled">
        <FormGrid>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>A loja tem programa de fidelidade</Text>
                <Text style={styles.note}>
                  Ligado: a cliente cadastrada ganha pontos em cada compra e pode usar os pontos como desconto no PDV.
                  Desligado: ninguém ganha nem usa pontos.
                </Text>
              </View>
              <Switch color={brand.primary} value={enabled} onValueChange={setEnabled} />
            </View>
          </View>

          {enabled && (
            <>
              <View style={styles.card}>
                <Text style={styles.title}>Quanto a cliente ganha</Text>
                <Text style={styles.note}>A cada quantos reais em compras ela ganha 1 ponto. Vale sobre o que ela pagou, sem contar a parte paga com pontos.</Text>
                <TextInput
                  mode="outlined" label="Reais gastos para ganhar 1 ponto" value={spend}
                  onChangeText={(t) => setSpend(t.replace(/[^0-9,.]/g, ''))} keyboardType="decimal-pad"
                  left={<TextInput.Affix text="R$" />} style={styles.input}
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.title}>Quanto vale cada ponto (cashback)</Text>
                <Text style={styles.note}>Quando a cliente usa os pontos, cada um vira esse valor de desconto na compra.</Text>
                <TextInput
                  mode="outlined" label="Valor de 1 ponto" value={value}
                  onChangeText={(t) => setValue(t.replace(/[^0-9,.]/g, ''))} keyboardType="decimal-pad"
                  left={<TextInput.Affix text="R$" />} style={styles.input}
                />
                <TextInput
                  mode="outlined" label="Mínimo de pontos para poder usar (0 = sem mínimo)" value={minRedeem}
                  onChangeText={(t) => setMinRedeem(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" style={styles.input}
                />
              </View>

              <View style={styles.card}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>Os pontos vencem</Text>
                    <Text style={styles.note}>
                      A validade conta a partir da data de cada compra. O app usa primeiro os pontos que vencem antes.
                      Desligado: os pontos não vencem.
                    </Text>
                  </View>
                  <Switch color={brand.primary} value={expires} onValueChange={setExpires} />
                </View>
                {expires && (
                  <TextInput
                    mode="outlined" label="Dias de validade" value={days}
                    onChangeText={(t) => setDays(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" style={styles.input}
                  />
                )}
              </View>
            </>
          )}

          <View style={[styles.card, { backgroundColor: brand.primary + '10', borderColor: brand.primary + '40' }]}>
            <Text style={styles.title}>Como vai funcionar</Text>
            <Text style={styles.note}>{describeLoyalty(rule)}</Text>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!message && <Text style={[styles.ok, { color: brand.primary }]}>{message}</Text>}
        </FormGrid>

        <AppButton variant="primary" size="lg" fullWidth label="Salvar" onPress={save} loading={saving} disabled={saving || loadFailed} />
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
