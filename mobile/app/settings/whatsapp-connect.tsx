/**
 * Conectar o WhatsApp da loja ao Provador (Embedded Signup da Meta, com coexistência: o número continua no app
 * WhatsApp Business do celular e as conversas ficam espelhadas aqui). Só admin. Só no navegador.
 * Mostra o número conectado, o estado da conexão (avisa se caiu) e o andamento da cópia do histórico.
 */
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { formatDateTime } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import {
  finishWhatsappEmbeddedSignup, getWhatsappConnectStatus, type WaConnectedNumber,
} from '@/services/whatsappConnectService';
import { EmbeddedSignupCancelled, runEmbeddedSignup } from '@/utils/metaEmbeddedSignup';
import ScreenLoader from '@/components/ui/ScreenLoader';

const STATUS_LABEL: Record<string, { text: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  connected: { text: 'Conectado', color: Colors.light.success, icon: 'checkmark-circle' },
  attention: { text: 'Precisa de atenção', color: Colors.light.warning, icon: 'alert-circle' },
  disconnected: { text: 'Desconectado', color: Colors.light.error, icon: 'close-circle' },
};

const HISTORY_LABEL: Record<string, string> = {
  requested: 'Pedida à Meta, aguardando',
  receiving: 'Copiando',
  done: 'Concluída',
  declined: 'A loja não autorizou compartilhar o histórico',
  failed: 'Falhou',
};

function NumberCard({ n }: { n: WaConnectedNumber }) {
  const st = STATUS_LABEL[n.connection_status] ?? STATUS_LABEL.connected;
  const hist = n.history_sync?.status;
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="logo-whatsapp" size={22} color={Colors.light.success} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{n.verified_name || 'WhatsApp da loja'}</Text>
          <Text style={styles.note}>{n.display_phone_number || n.phone_number_id}</Text>
        </View>
        <View style={[styles.badge, { borderColor: st.color }]}>
          <Ionicons name={st.icon} size={14} color={st.color} />
          <Text style={[styles.badgeText, { color: st.color }]}>{st.text}</Text>
        </View>
      </View>
      <Text style={styles.note}>
        {n.is_coexistence
          ? 'Usado também no app WhatsApp Business do celular: as conversas de lá aparecem aqui.'
          : 'Usado só pelo Provador.'}
      </Text>
      {!!n.connected_at && <Text style={styles.small}>Conectado em {formatDateTime(n.connected_at)}</Text>}
      {!!n.warning && <Text style={[styles.note, { color: Colors.light.warning, fontWeight: '700' }]}>{n.warning}</Text>}
      {n.is_coexistence && !!hist && (
        <Text style={styles.small}>
          Histórico de conversas: {HISTORY_LABEL[hist] ?? hist}
          {n.history_sync.progress != null && hist !== 'done' ? ` (${n.history_sync.progress}%)` : ''}
        </Text>
      )}
    </View>
  );
}

export default function WhatsappConnectScreen() {
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-connect-status'],
    queryFn: getWhatsappConnectStatus,
    refetchInterval: 30_000, // acompanha a cópia do histórico e quedas de conexão
  });

  const ready = !!data?.app_id && !!data?.config_id;
  const isWeb = Platform.OS === 'web';

  const connect = async () => {
    if (!data?.app_id || !data?.config_id) return;
    setError('');
    setDone(false);
    setBusy(true);
    try {
      const r = await runEmbeddedSignup(data.app_id, data.config_id);
      await finishWhatsappEmbeddedSignup(r);
      setDone(true);
      await queryClient.invalidateQueries();
    } catch (e) {
      if (!(e instanceof EmbeddedSignupCancelled)) setError(parseApiError(e) || (e as Error)?.message || 'Não foi possível conectar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Conectar o WhatsApp" subtitle="Celular da loja e Provador no mesmo número" showBackButton backFallback="/(tabs)/more" />
      <ScrollView contentContainerStyle={[styles.content, desktop]}>
        {isLoading ? (
          <ScreenLoader inline />
        ) : (
          <>
            {(data?.numbers ?? []).map((n) => <NumberCard key={n.id} n={n} />)}

            <View style={styles.card}>
              <Text style={styles.title}>Conectar o WhatsApp do celular</Text>
              <Text style={styles.note}>
                O número continua funcionando no app WhatsApp Business do celular, e tudo o que entra e sai passa a
                aparecer também aqui no Provador, inclusive o que a loja responde pelo celular.
              </Text>
              <View style={{ gap: 6 }}>
                {[
                  'No celular: WhatsApp Business atualizado (2.24.17 ou mais novo) e aberto.',
                  'Toque em Conectar, entre com a conta do Facebook da loja e digite o número do celular.',
                  'No app do celular, aceite a mensagem da Meta ("Conectar") e permita compartilhar o histórico.',
                  'O Provador copia contatos e até 6 meses de conversas (grupos não vêm).',
                ].map((t, i) => (
                  <View key={i} style={styles.step}>
                    <Text style={[styles.stepNum, { color: brand.primary }]}>{i + 1}</Text>
                    <Text style={styles.stepText}>{t}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.small}>
                Ao conectar: o WhatsApp Web e outros aparelhos do número são desconectados (conecte de novo depois),
                listas de transmissão ficam só leitura e o celular precisa ser aberto pelo menos a cada 14 dias.
                Ligações continuam só no celular. Saudação e ausência continuam as do app do celular.
              </Text>

              {!isWeb ? (
                <Text style={styles.warn}>Para conectar, abra o Provador no navegador (app.provadorfit.com.br).</Text>
              ) : !ready ? (
                <Text style={styles.warn}>
                  A conexão ainda não está liberada: aguardando a aprovação da Meta e a configuração do Provador.
                </Text>
              ) : null}

              {!!error && <Text style={styles.error}>{error}</Text>}
              {done && <Text style={[styles.note, { color: Colors.light.success, fontWeight: '700' }]}>WhatsApp conectado. O histórico chega aos poucos.</Text>}

              <Button
                mode="contained"
                icon="whatsapp"
                buttonColor={brand.primary}
                onPress={connect}
                loading={busy}
                disabled={!isWeb || !ready || busy}
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
              >
                Conectar
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  small: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  warn: { fontSize: 13, lineHeight: 19, color: Colors.light.warning, fontWeight: '700' },
  error: { fontSize: 13, lineHeight: 19, color: Colors.light.error },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  step: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  stepNum: { fontWeight: '800', fontSize: 13, width: 16 },
  stepText: { flex: 1, fontSize: 13, lineHeight: 19, color: Colors.light.text },
});
