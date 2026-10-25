/**
 * Aceite dos termos depois do login: aparece para quem ainda não aceitou a versão atual
 * (contas criadas antes dos termos, ou quando a versão muda). Só continua depois do aceite.
 */
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import AppButton from '@/components/ui/AppButton';
import { TermsCheckbox } from '@/components/legal/TermsCheckbox';
import { ProvadorLogo } from '@/components/branding/ProvadorLogo';
import { BRAND } from '@/constants/Brand';
import { LEGAL_VERSION } from '@/constants/legal';
import { acceptLegal } from '@/services/legalService';
import { useAuthStore } from '@/store/authStore';
import { useBrandingColors } from '@/store/brandingStore';

export default function AceiteTermosScreen() {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const brand = useBrandingColors().primary;

  const handleAccept = async () => {
    if (!checked) {
      setError('Marque a caixa para continuar.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await acceptLegal(LEGAL_VERSION);
      await queryClient.invalidateQueries({ queryKey: ['legal-status'] });
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(
        e?.response?.status === 409
          ? 'Os termos foram atualizados. Feche e abra o app de novo para ver a versão atual.'
          : 'Não foi possível registrar o aceite. Verifique a conexão e tente de novo.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <ProvadorLogo size={56} variant="icon" />
          <Text style={styles.title} accessibilityRole="header">Termos de Uso e Privacidade</Text>
          <Text style={styles.body}>
            Para continuar usando o Provador, leia e aceite os Termos de Uso e a Política de Privacidade.
            Eles explicam como o sistema funciona, o que a loja pode fazer e como cuidamos dos dados da loja e dos seus clientes.
          </Text>
          <View style={styles.links}>
            <TouchableOpacity style={[styles.linkBtn, { backgroundColor: brand + '14' }]} onPress={() => router.push('/termos')} accessibilityRole="link">
              <Text style={[styles.linkText, { color: brand }]}>Ler os Termos de Uso</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.linkBtn, { backgroundColor: brand + '14' }]} onPress={() => router.push('/privacidade')} accessibilityRole="link">
              <Text style={[styles.linkText, { color: brand }]}>Ler a Política de Privacidade</Text>
            </TouchableOpacity>
          </View>
          <TermsCheckbox
            checked={checked}
            onChange={(v) => {
              setChecked(v);
              if (v) setError(undefined);
            }}
            color={brand}
            error={error}
          />
          <View style={styles.actions}>
            <AppButton variant="primary" size="lg" fullWidth label={saving ? 'Registrando...' : 'Aceitar e continuar'} onPress={handleAccept} loading={saving} disabled={saving} />
            <TouchableOpacity onPress={() => logout()} style={styles.logout} accessibilityRole="button">
              <Text style={styles.logoutText}>Sair da conta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BRAND.mist },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  title: { fontSize: 24, fontWeight: '800', color: BRAND.ink, letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 23, color: '#3D3553' },
  links: { gap: 8 },
  linkBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
  linkText: { fontWeight: '700', fontSize: 15 },
  actions: { gap: 4, marginTop: 4 },
  logout: { alignItems: 'center', paddingVertical: 12 },
  logoutText: { color: '#6B6480', fontWeight: '600' },
});
