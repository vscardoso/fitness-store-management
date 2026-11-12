/**
 * Histórico dos caixas (gerente e admin): resumo de quantos bateram, sobraram ou faltaram, e a lista de cada abertura
 * e fechamento com quem abriu e fechou, esperado, contado e a diferença. Toque num caixa para ver o fechamento completo.
 */
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { ClosedSummary, Line } from '@/components/cash/CashParts';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { differenceText } from '@/utils/cashMoney';
import { parseApiError } from '@/utils/apiError';
import { getCashSession, getCashSessions } from '@/services/cashService';
import { useDesktopContentStyle, useScrollBleed } from '@/hooks/useLayout';
import ScreenLoader from '@/components/ui/ScreenLoader';

type Filter = 'all' | 'diff';

export default function CashHistoryScreen() {
  // PC: a rolagem ocupa a largura toda (barra na borda da janela), conteúdo na coluna
  const bleed = useScrollBleed();
  const desktopColumn = useDesktopContentStyle();
  const router = useRouter();
  const brand = useBrandingColors();
  const [openId, setOpenId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const { data, isLoading, isRefetching, refetch, error } = useQuery({ queryKey: ['cash', 'sessions'], queryFn: () => getCashSessions(0, 60) });
  const detail = useQuery({
    queryKey: ['cash', 'session', openId],
    queryFn: () => getCashSession(openId as number),
    enabled: openId !== null,
  });

  // resumo: só caixas fechados contam como "bateu", "sobrou" ou "faltou"
  const summary = useMemo(() => {
    const closed = (data ?? []).filter((s) => s.status === 'closed');
    let ok = 0; let over = 0; let short = 0; let net = 0;
    for (const s of closed) {
      const k = differenceText(s.difference ?? 0, formatCurrency).kind;
      if (k === 'ok') ok += 1; else if (k === 'over') over += 1; else short += 1;
      net += s.difference ?? 0;
    }
    return { closed: closed.length, ok, over, short, net: Math.round(net * 100) / 100 };
  }, [data]);

  const list = useMemo(() => {
    const all = data ?? [];
    if (filter === 'all') return all;
    return all.filter((s) => s.status === 'closed' && differenceText(s.difference ?? 0, formatCurrency).kind !== 'ok');
  }, [data, filter]);

  return (
    <View style={styles.container}>
      <PageHeader title="Histórico do caixa" subtitle="Cada abertura e fechamento" showBackButton />
      {/* notebook: corpo da tela numa coluna central (no celular é só uma View com flex 1) */}
      <View style={[{ flex: 1 }, desktopColumn]}>
      <ScrollView
          style={bleed.scrollStyle} contentContainerStyle={[styles.content, bleed.contentStyle]} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        {isLoading && <ScreenLoader inline />}
        {!!error && <Text style={styles.error}>{parseApiError(error) || 'Não foi possível carregar o histórico.'}</Text>}

        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <EmptyState
            icon="cash-outline"
            title="Nenhum caixa aberto ainda"
            description="Cada vez que você abre e fecha o caixa, o resultado da contagem aparece aqui."
            actionLabel="Abrir o caixa"
            onAction={() => router.push('/cash' as any)}
          />
        )}

        {summary.closed > 0 && (
          <View style={styles.summary} testID="cash-history-summary">
            <Text style={styles.eyebrow}>{`ÚLTIMOS ${summary.closed} CAIXAS FECHADOS`}</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryItem}><Text style={[styles.summaryNum, { color: Colors.light.success }]}>{summary.ok}</Text> bateram</Text>
              <Text style={styles.summaryItem}><Text style={[styles.summaryNum, { color: Colors.light.warning }]}>{summary.over}</Text> sobraram</Text>
              <Text style={styles.summaryItem}><Text style={[styles.summaryNum, { color: Colors.light.error }]}>{summary.short}</Text> faltaram</Text>
            </View>
            {summary.net !== 0 && (
              <Text style={styles.small}>
                {`Somando todos: ${summary.net > 0 ? 'sobrou' : 'faltou'} ${formatCurrency(Math.abs(summary.net))} na gaveta.`}
              </Text>
            )}
            <View style={styles.chips}>
              {([['all', 'Todos'], ['diff', 'Só com diferença']] as [Filter, string][]).map(([id, label]) => (
                <TouchableOpacity key={id} onPress={() => setFilter(id)} accessibilityRole="radio" accessibilityState={{ selected: filter === id }}
                  style={[styles.chip, filter === id && { backgroundColor: brand.primary, borderColor: brand.primary }]}>
                  <Text style={[styles.chipText, filter === id && { color: Colors.light.white }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {!isLoading && !error && (data?.length ?? 0) > 0 && list.length === 0 && (
          <Text style={styles.empty}>Nenhum caixa com diferença. Toque em Todos para ver a lista completa.</Text>
        )}

        {list.map((s) => {
          const d = s.status === 'closed' ? differenceText(s.difference ?? 0, formatCurrency) : null;
          const expanded = openId === s.id;
          return (
            <View key={s.id} style={styles.card}>
              <TouchableOpacity onPress={() => setOpenId(expanded ? null : s.id)} activeOpacity={0.7} accessibilityRole="button"
                accessibilityState={{ expanded }}>
                <View style={styles.head}>
                  <Text style={styles.title}>{formatDateTime(s.opened_at)}</Text>
                  <Badge label={d ? d.text : 'Aberto'} variant={d ? (d.kind === 'ok' ? 'success' : d.kind === 'over' ? 'warning' : 'error') : 'info'} size="sm" />
                </View>
                <Text style={styles.small}>
                  {`Aberto por ${s.opened_by ?? '-'}`}
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
                  {detail.isLoading && <ScreenLoader compact />}
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
                      <Text style={[styles.small, { color: m.kind === 'supply' ? Colors.light.success : Colors.light.error, fontWeight: theme.fontWeight.bold }]}>
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
  summary: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border, gap: 6 },
  eyebrow: { fontSize: 11, fontWeight: theme.fontWeight.extrabold, letterSpacing: 1, color: Colors.light.textSecondary },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
  summaryItem: { fontSize: theme.fontSize.md, color: Colors.light.text },
  summaryNum: { fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.extrabold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card },
  chipText: { fontSize: 13, color: Colors.light.text },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  small: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 3 },
  mov: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 6 },
  error: { color: Colors.light.error, marginTop: 8 },
  empty: { textAlign: 'center', color: Colors.light.textSecondary, marginTop: 24 },
});
