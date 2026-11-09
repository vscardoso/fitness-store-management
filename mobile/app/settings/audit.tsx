/**
 * Histórico de alterações: quem mexeu em dinheiro, estoque, vendas e pessoas, quando e por quê.
 * Só o administrador vê. Os registros não podem ser apagados nem editados.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors } from '@/constants/Colors';
import HScroll from '@/components/ui/HScroll';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { useAuth } from '@/hooks/useAuth';
import { getAuditPage, type AuditCategory, type AuditRow } from '@/services/auditService';
import { describeAudit } from '@/utils/auditText';
import { parseApiError } from '@/utils/apiError';
import { parseApiDate } from '@/utils/format';
import { isAdminRole } from '@/utils/roles';

const PAGE = 30;
const CATEGORIES: { key: AuditCategory | null; label: string }[] = [
  { key: null, label: 'Alterações' },
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'estoque', label: 'Estoque' },
  { key: 'vendas', label: 'Vendas' },
  { key: 'pessoas', label: 'Pessoas' },
  { key: 'acessos', label: 'Acessos (quem entrou)' },
];

const dayKey = (iso: string) => {
  const d = parseApiDate(iso);
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};
const hour = (iso: string) =>
  parseApiDate(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const brand = useBrandingColors();   // cores da loja (cada loja tem a sua paleta depois do login)
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipOn, active && { backgroundColor: brand.primary, borderColor: brand.primary }]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AuditHistoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const desktopContent = useDesktopContentStyle();
  const admin = isAdminRole(user?.role);
  const brand = useBrandingColors();
  const [category, setCategory] = useState<AuditCategory | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [people, setPeople] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (skip: number) => {
    if (skip === 0) setLoading(true); else setMore(true);
    setError('');
    try {
      const page = await getAuditPage({ category, userId, skip, limit: PAGE });
      setRows((old) => (skip === 0 ? page.items : [...old, ...page.items]));
      setTotal(page.total_count);
      setPeople((old) => {
        const next = { ...old };
        page.items.forEach((r) => { if (r.user_id) next[r.user_id] = r.user_name || r.user_email || `Usuário ${r.user_id}`; });
        return next;
      });
    } catch (e: any) {
      setError(parseApiError(e) || 'Não foi possível carregar o histórico.');
    } finally {
      setLoading(false);
      setMore(false);
    }
  }, [category, userId]);

  useEffect(() => { if (admin) load(0); }, [admin, load]);

  const groups = useMemo(() => {
    const out: { day: string; rows: AuditRow[] }[] = [];
    rows.forEach((r) => {
      const day = dayKey(r.created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.rows.push(r); else out.push({ day, rows: [r] });
    });
    return out;
  }, [rows]);

  if (!admin) {
    return (
      <View style={styles.container}>
        <PageHeader title="Histórico de alterações" showBackButton backFallback="/(tabs)/more" />
        <EmptyState icon="lock-closed-outline" title="Você não tem permissão" description="Só o administrador da loja vê o histórico de alterações." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader title="Histórico de alterações" subtitle="Quem mexeu em quê" showBackButton backFallback="/(tabs)/more" />
      <ScrollView contentContainerStyle={[styles.content, desktopContent]}>
        <Text style={styles.intro}>
          Tudo que alguém muda em valores fica aqui, com o nome de quem fez. Estes registros não podem ser apagados nem editados.
        </Text>
        <HScroll contentContainerStyle={styles.chips} style={styles.chipsWrap}>
          {CATEGORIES.map((c) => (
            <Chip key={c.label} label={c.label} active={category === c.key} onPress={() => setCategory(c.key)} />
          ))}
        </HScroll>
        {Object.keys(people).length > 0 && (
          <HScroll contentContainerStyle={styles.chips} style={styles.chipsWrap}>
            <Chip label="Todas as pessoas" active={userId === null} onPress={() => setUserId(null)} />
            {Object.entries(people).map(([id, name]) => (
              <Chip key={id} label={name} active={userId === Number(id)} onPress={() => setUserId(Number(id))} />
            ))}
          </HScroll>
        )}

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={brand.primary} /></View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : groups.length === 0 ? (
          <EmptyState icon="time-outline" title="Nada registrado ainda" description="Quando alguém alterar um valor, aparece aqui." />
        ) : (
          <>
            <Text style={styles.count}>{total} {total === 1 ? 'registro' : 'registros'} no total</Text>
            {groups.map((g) => (
              <View key={g.day} style={styles.group}>
                <Text style={styles.day}>{g.day}</Text>
                {g.rows.map((r) => {
                  const s = describeAudit(r);
                  return (
                    <View key={r.id} style={styles.card}>
                      <Text style={styles.text}>{s.text}</Text>
                      {!!s.reason && <Text style={styles.reason}>Motivo: {s.reason}</Text>}
                      <Text style={styles.time}>às {hour(r.created_at)}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
            {rows.length < total && (
              <TouchableOpacity style={styles.moreBtn} onPress={() => load(rows.length)} disabled={more} accessibilityRole="button">
                <Text style={[styles.moreText, { color: brand.primary }]}>{more ? 'Carregando...' : 'Ver mais antigos'}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48 },
  intro: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginBottom: 12 },
  // uma linha só, sem quebrar: o HScroll põe setas nas pontas quando há mais chips escondidos
  chips: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 8, paddingRight: 8 },
  chipsWrap: { marginBottom: 12, flexGrow: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card },
  chipOn: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  chipTextOn: { color: Colors.light.card },
  center: { paddingVertical: 48, alignItems: 'center' },
  error: { color: Colors.light.error, marginTop: 12 },
  count: { fontSize: 12, color: Colors.light.textSecondary, marginBottom: 8 },
  group: { marginBottom: 12, gap: 8 },
  day: { fontSize: 13, fontWeight: '700', color: Colors.light.textSecondary, textTransform: 'capitalize', marginTop: 4 },
  card: { backgroundColor: Colors.light.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.light.border },
  text: { fontSize: 15, lineHeight: 21, color: Colors.light.text, fontWeight: '600' },
  reason: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 4 },
  time: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 6 },
  moreBtn: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card, marginTop: 4 },
  moreText: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
});
