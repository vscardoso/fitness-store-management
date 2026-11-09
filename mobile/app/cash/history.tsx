/** Histórico dos caixas (gerente e admin): data, quem abriu e fechou, esperado, contado e a diferença de cada um. */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import { ClosedSummary, diffColor, Line } from '@/components/cash/CashParts';
import { Colors } from '@/constants/Colors';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { differenceText } from '@/utils/cashMoney';
import { parseApiError } from '@/utils/apiError';
import { getCashSession, getCashSessions } from '@/services/cashService';
import { useDesktopContentStyle, useScrollBleed } from '@/hooks/useLayout';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';

export default function CashHistoryScreen() {
  // PC: a rolagem ocupa a largura toda (barra na borda da janela), conteúdo na coluna
  const bleed = useScrollBleed();
  const desktopColumn = useDesktopContentStyle();
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading, isRefetching, refetch, error } = useQuery({ queryKey: ['cash', 'sessions'], queryFn: () => getCashSessions(0, 60) });
  const detail = useQuery({
    queryKey: ['cash', 'session', openId],
    queryFn: () => getCashSession(openId as number),
    enabled: openId !== null,
  });

  return (
    <View style={styles.container}>
      <PageHeader title="Histórico do caixa" subtitle="Cada abertura e fechamento" showBackButton />
      {/* notebook: corpo da tela numa coluna central (no celular é só uma View com flex 1) */}
      <View style={[{ flex: 1 }, desktopColumn]}>
      <ScrollView
          style={bleed.scrollStyle} contentContainerStyle={[styles.content, bleed.contentStyle]} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        {isLoading && <ActivityIndicator size="large" style={{ marginTop: 24 }} />}
        {!!error && <Text style={styles.error}>{parseApiError(error) || 'Não foi possível carregar o histórico.'}</Text>}
        {!isLoading && !error && (data?.length ?? 0) === 0 && <Text style={styles.empty}>Nenhum caixa aberto ainda.</Text>}
        {(data ?? []).map((s) => {
          const d = s.status === 'closed' ? differenceText(s.difference ?? 0, formatCurrency) : null;
          const expanded = openId === s.id;
          return (
            <View key={s.id} style={styles.card}>
              <TouchableOpacity onPress={() => setOpenId(expanded ? null : s.id)} activeOpacity={0.7}>
                <View style={styles.head}>
                  <Text style={styles.title}>{formatDateTime(s.opened_at)}</Text>
                  <Text style={[styles.badge, { color: d ? diffColor(d.kind) : Colors.light.info }]}>{d ? d.text : 'Aberto'}</Text>
                </View>
                <Text style={styles.small}>
                  {s.opened_by ?? '-'}
                  {s.closed_at ? ` · fechou ${formatDateTime(s.closed_at)}${s.closed_by ? ` (${s.closed_by})` : ''}` : ''}
                </Text>
                {s.status === 'closed' && (
                  <Text style={styles.small}>
                    Esperado {formatCurrency(s.expected_amount ?? 0)} · Contado {formatCurrency(s.counted_amount ?? 0)}
                  </Text>
                )}
              </TouchableOpacity>
              {expanded && (
                <View style={{ marginTop: 10 }}>
                  {detail.isLoading && <ActivityIndicator />}
                  {detail.data && detail.data.status === 'closed' && <ClosedSummary s={detail.data} />}
                  {detail.data && detail.data.status === 'open' && (
                    <Line label="Esperado na gaveta agora" value={detail.data.expected_amount} />
                  )}
                  {(detail.data?.movements ?? []).map((m) => (
                    <View key={m.id} style={styles.mov}>
                      <Text style={styles.small}>
                        {m.reason_label}
                        {m.note ? ` · ${m.note}` : ''}
                      </Text>
                      <Text style={[styles.small, { color: m.kind === 'supply' ? Colors.light.success : Colors.light.error, fontWeight: '700' }]}>
                        {m.kind === 'supply' ? '+' : '-'} {formatCurrency(m.amount)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  badge: { fontSize: 14, fontWeight: '800' },
  small: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 3 },
  mov: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 6 },
  error: { color: Colors.light.error, marginTop: 8 },
  empty: { textAlign: 'center', color: Colors.light.textSecondary, marginTop: 32 },
});
