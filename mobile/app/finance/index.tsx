/**
 * Financeiro: uma tela só, três perguntas. (1) Quanto eu tenho? (2) O que vai entrar e sair? (3) Como foi o mês?
 * Cada atalho leva à tela de detalhe (contas e saldos, fiado, despesas a pagar, retiradas, relatório e fechamento do mês).
 * Os números vêm do servidor: saldo e suposição do fiado em `GET /finance/accounts`, contas a pagar em `/finance/payables`.
 */
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AppButton from '@/components/ui/AppButton';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import CashStatusCard from '@/components/cash/CashStatusCard';
import FiadoProjectionCard from '@/components/finance/FiadoProjectionCard';
import CardScheduleCard from '@/components/finance/CardScheduleCard';
import PendingPurchasesCard from '@/components/finance/PendingPurchasesCard';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/utils/roles';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { getFinanceOverview, listPayables } from '@/services/financeService';
import ScreenLoader from '@/components/ui/ScreenLoader';

type IconName = keyof typeof Ionicons.glyphMap;

function Shortcut({ icon, title, value, note, warn, onPress, color }: {
  icon: IconName; title: string; value?: string; note?: string; warn?: boolean; onPress: () => void; color: string;
}) {
  return (
    <TouchableOpacity style={styles.short} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={title}>
      <View style={[styles.icon, { backgroundColor: color + '18' }]}><Ionicons name={icon} size={20} color={color} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.shortTitle}>{title}</Text>
        {!!note && <Text style={[styles.note, warn && { color: Colors.light.error, fontWeight: '700' }]}>{note}</Text>}
      </View>
      {!!value && <Text style={styles.shortValue}>{value}</Text>}
      <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
    </TouchableOpacity>
  );
}

export default function FinanceHomeScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const { data, isLoading, refetch, isRefetching, error } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const { data: payables } = useQuery({
    queryKey: ['finance-payables', 'open'], queryFn: () => listPayables('open'), enabled: !!data?.started,
  });
  const go = (path: string) => router.push(path as any);

  if (isLoading) {
    return <ScreenLoader />;
  }

  const p = data?.projection;
  return (
    <View style={styles.container}>
      <PageHeader title="Financeiro" subtitle="Seu dinheiro em três perguntas" showBackButton backFallback="/(tabs)/more" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        {!!error && <Text style={styles.error}>{parseApiError(error)}</Text>}

        <Text style={styles.question}>1. Quanto eu tenho?</Text>
        <CashStatusCard />
        {!data?.started ? (
          <View style={styles.card}>
            <Ionicons name="storefront-outline" size={32} color={brand.primary} />
            <Text style={styles.title}>A loja já funcionava antes do Provador?</Text>
            <Text style={styles.text}>
              Informe quanto tem na gaveta, em cada banco e para receber da maquininha, e as contas a pagar que já existem.
              A partir do dia que você escolher, o app soma as vendas e desconta os pagamentos sozinho, conta por conta.
            </Text>
            {admin ? (
              <AppButton variant="primary" size="md" fullWidth label="Começar a controlar o dinheiro" onPress={() => go('/finance/setup')} />
            ) : (
              <Text style={styles.text}>Quem administra a loja faz esta etapa.</Text>
            )}
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Dinheiro em todas as contas (gaveta, bancos e maquininha)</Text>
              <Text style={[styles.total, data.total < 0 && { color: Colors.light.error }]}>{formatCurrency(data.total)}</Text>
              {data.accounts.map((a) => (
                <View key={a.id} style={styles.line}>
                  <Text style={styles.lineLabel}>{a.name}</Text>
                  <Text style={[styles.lineValue, a.balance < 0 && { color: Colors.light.error }]}>{formatCurrency(a.balance)}</Text>
                </View>
              ))}
              <AppButton variant="outlined" size="md" fullWidth icon="swap-horizontal-outline" label="Ver contas e transferir" onPress={() => go('/finance/accounts')} />
            </View>
            {!!data.purchases_pending && data.purchases_pending.count > 0 && <PendingPurchasesCard pending={data.purchases_pending} />}
            {!!data.card_schedule && <CardScheduleCard schedule={data.card_schedule} />}
            {!!p && <FiadoProjectionCard projection={p} />}

            <Text style={styles.question}>2. O que vai entrar e sair?</Text>
            <Shortcut icon="book-outline" color={Colors.light.warningDark} title="Fiado: quem me deve" onPress={() => go('/finance/receivables')}
              value={p ? formatCurrency(p.fiado_open) : undefined}
              note={p && p.fiado_overdue > 0 ? `${formatCurrency(p.fiado_overdue)} já venceu` : 'Receber e lançar fiado antigo'}
              warn={!!p && p.fiado_overdue > 0} />
            <Shortcut icon="receipt-outline" color="#DC2626" title="Despesas" onPress={() => go('/(tabs)/expenses')}
              value={payables ? formatCurrency(payables.open_total) : undefined}
              note={payables && payables.overdue_count > 0 ? `A pagar: ${payables.overdue_count} vencida(s), ${formatCurrency(payables.overdue_total)}` : 'Lançar gasto da loja e ver o que ainda vai vencer (valor: a pagar)'}
              warn={!!payables && payables.overdue_count > 0} />
            <Shortcut icon="swap-vertical-outline" color="#0E7490" title="Retiradas e empréstimos"
              note="Retirada de sócia, empréstimo, fatura do cartão (não é despesa)" onPress={() => go('/finance/entries')} />
            <Shortcut icon="warning-outline" color={Colors.light.errorDark} title="Prejuízos"
              note="Perdas de estoque lançadas à parte" onPress={() => go('/(tabs)/stock-losses')} />
          </>
        )}

        {!!data?.started && (
          <>
            <Text style={styles.question}>3. Como foi o mês?</Text>
            <Shortcut icon="reader-outline" color="#7C3AED" title="Relatório mensal"
              note="Vendas, lucro, dinheiro, fiado, contas a pagar e estoque, com PDF" onPress={() => go('/reports/monthly')} />
            <Shortcut icon="calendar-outline" color="#7C3AED" title="Fechamento do mês"
              note="O dinheiro bate? Compare o que deveria ter com o que tem" onPress={() => go('/finance/closing')} />
          </>
        )}
        {!data?.started && (
          <>
            <Text style={styles.question}>Fiado e relatórios</Text>
            <Shortcut icon="book-outline" color={Colors.light.warningDark} title="Fiado: quem me deve" note="Receber e lançar fiado antigo" onPress={() => go('/finance/receivables')} />
            <Shortcut icon="reader-outline" color="#7C3AED" title="Relatório mensal" note="Vendas, lucro e estoque do mês, com PDF" onPress={() => go('/reports/monthly')} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  question: { fontSize: 18, fontWeight: '800', color: Colors.light.text, marginTop: 8 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.light.text },
  text: { fontSize: 14, lineHeight: 20, color: Colors.light.textSecondary },
  label: { fontSize: 13, color: Colors.light.textSecondary },
  total: { fontSize: 28, fontWeight: '800', color: Colors.light.text },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  lineLabel: { flex: 1, fontSize: 14, color: Colors.light.text },
  lineValue: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  left: { alignSelf: 'flex-start' },
  short: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.light.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.light.border },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  shortTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  shortValue: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  note: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  error: { color: Colors.light.error, fontWeight: '600' },
});
