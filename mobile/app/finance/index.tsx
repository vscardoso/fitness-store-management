/**
 * Financeiro: uma tela que diz o que fazer agora.
 *  - Dinheiro agora: total e um quadro por conta (gaveta, bancos, maquininha a receber) e o botão Transferir.
 *  - Precisa de você: só o que existe (compras sem conta, repasse da maquininha, fiado vencido, despesa vencida), uma ação por linha.
 *    Compras sem conta e repasse abrem o cartão completo no mesmo lugar.
 *  - Entradas e saídas, O mês e a Previsão (recolhida) levam às telas de detalhe.
 * No notebook (1024 px ou mais) vira duas colunas: dinheiro e pendências à esquerda, atalhos à direita.
 * Os números vêm do servidor: saldos e previsões em `GET /finance/accounts`, contas a pagar em `/finance/payables`.
 */
import React, { useState } from 'react';
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
import PurchasePaymentResultCard from '@/components/finance/PurchasePaymentResultCard';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle, useIsDesktop } from '@/hooks/useLayout';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/utils/roles';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { getFinanceOverview, listPayables, type FinanceAccount } from '@/services/financeService';
import { getCashCurrent } from '@/services/cashService';
import ScreenLoader from '@/components/ui/ScreenLoader';

type IconName = keyof typeof Ionicons.glyphMap;

/** Atalho com o valor já dito por extenso (a receber, a pagar), em quadro de duas colunas. */
function Tile({ icon, title, value, note, warn, onPress, color }: {
  icon: IconName; title: string; value?: string; note: string; warn?: boolean; onPress: () => void; color: string;
}) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.8} accessibilityRole="button"
      accessibilityLabel={`${title}${value ? `, ${value}` : ''}, ${note}`}>
      <View style={[styles.tileIcon, { backgroundColor: color + '18' }]}><Ionicons name={icon} size={18} color={color} /></View>
      <Text style={styles.tileTitle} numberOfLines={2}>{title}</Text>
      {!!value && <Text style={styles.tileValue}>{value}</Text>}
      <Text style={[styles.tileNote, warn && { color: Colors.light.error, fontWeight: theme.fontWeight.bold }]}>{note}</Text>
    </TouchableOpacity>
  );
}

/** Quadro de uma conta dentro de "Dinheiro agora". */
function AccountTile({ account, hint, onPress }: { account: FinanceAccount; hint: string; onPress: () => void }) {
  const brand = useBrandingColors();
  return (
    <TouchableOpacity style={styles.account} onPress={onPress} activeOpacity={0.8} accessibilityRole="button"
      accessibilityLabel={`${account.name}, ${formatCurrency(account.balance)}, ${hint}`}>
      <Text style={styles.accountName} numberOfLines={1}>{account.name}</Text>
      <Text style={[styles.accountValue, account.balance < 0 && { color: Colors.light.error }]}>{formatCurrency(account.balance)}</Text>
      <Text style={[styles.accountHint, { color: brand.primary }]} numberOfLines={1}>{hint}</Text>
    </TouchableOpacity>
  );
}

/** Linha de "Precisa de você": resumo e uma ação. */
function TodoRow({ title, note, action, onPress, open }: { title: string; note: string; action: string; onPress: () => void; open?: boolean }) {
  return (
    <View style={styles.todo}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.todoTitle}>{title}</Text>
        <Text style={styles.todoNote}>{note}</Text>
      </View>
      <AppButton variant="outlined" size="sm" label={open ? 'Fechar' : action} onPress={onPress} />
    </View>
  );
}

export default function FinanceHomeScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const isDesktop = useIsDesktop();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const { data, isLoading, refetch, isRefetching, error } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const { data: payables } = useQuery({
    queryKey: ['finance-payables', 'open'], queryFn: () => listPayables('open'), enabled: !!data?.started,
  });
  const { data: cash } = useQuery({ queryKey: ['cash', 'current'], queryFn: getCashCurrent, refetchInterval: 30_000, enabled: !!data?.started });
  const [openTodo, setOpenTodo] = useState<'purchases' | 'card' | null>(null);
  const [showForecast, setShowForecast] = useState(false);
  const go = (path: string) => router.push(path as any);

  if (isLoading) {
    return <ScreenLoader />;
  }

  const p = data?.projection;
  const pending = data?.purchases_pending;
  const card = data?.card_schedule ?? null;
  const cardDue = !!card && card.due_now > 0.004;
  const payOverdue = !!payables && payables.overdue_count > 0;
  const fiadoOverdue = !!p && p.fiado_overdue > 0.004;
  const todoCount = (pending && pending.count > 0 ? 1 : 0) + (cardDue ? 1 : 0) + (fiadoOverdue ? 1 : 0) + (payOverdue ? 1 : 0);

  const accountHint = (a: FinanceAccount): string => {
    if (a.kind === 'cash') return cash?.session ? 'caixa aberto' : 'caixa fechado';
    if (a.kind === 'card') {
      const next = card?.items?.[0];
      return next ? `cai ${next.weekday}, ${next.expected_on.slice(8, 10)}/${next.expected_on.slice(5, 7)}` : 'a receber';
    }
    return a.receives_pix ? 'recebe o PIX' : 'banco';
  };

  // Bloco 1: dinheiro agora
  const money = (
    <View style={styles.hero} testID="finance-money-now">
      <Text style={styles.eyebrow}>DINHEIRO AGORA</Text>
      <View style={styles.heroTop}>
        <Text style={[styles.total, (data?.total ?? 0) < 0 && { color: Colors.light.error }]}>{formatCurrency(data?.total ?? 0)}</Text>
        <TouchableOpacity onPress={() => go('/finance/accounts')} accessibilityRole="link" hitSlop={8}>
          <Text style={[styles.link, { color: brand.primary }]}>Contas e saldos ›</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.accountsRow}>
        {data!.accounts.map((a) => (
          <AccountTile key={a.id} account={a} hint={accountHint(a)} onPress={() => go(a.kind === 'cash' ? '/cash' : '/finance/accounts')} />
        ))}
      </View>
      <AppButton variant="primary" size="md" fullWidth icon="swap-horizontal-outline" label="Transferir entre contas" onPress={() => go('/finance/accounts?transfer=1')} />
    </View>
  );

  // Bloco 2: precisa de você
  const todos = (
    <View style={styles.section} testID="finance-todo">
      <Text style={styles.eyebrow}>{todoCount > 0 ? `PRECISA DE VOCÊ · ${todoCount}` : 'PRECISA DE VOCÊ'}</Text>
      {todoCount === 0 && (
        <View style={styles.allGood}>
          <Ionicons name="checkmark-circle" size={22} color={Colors.light.success} />
          <Text style={styles.todoTitle}>Tudo em dia: nenhuma pendência de dinheiro.</Text>
        </View>
      )}
      {!!pending && pending.count > 0 && (
        <>
          <TodoRow title="Compras sem conta" note={`${pending.count} compra(s), ${formatCurrency(pending.total)}, ainda não saíram de nenhuma conta`}
            action="Descontar" open={openTodo === 'purchases'} onPress={() => setOpenTodo(openTodo === 'purchases' ? null : 'purchases')} />
          {openTodo === 'purchases' && <PendingPurchasesCard pending={pending} />}
        </>
      )}
      {cardDue && card && (
        <>
          <TodoRow title="Repasse da maquininha" note={`${formatCurrency(card.due_now)} já pode ir para ${card.bank_name ?? 'o banco'}`}
            action="Fazer repasse" open={openTodo === 'card'} onPress={() => setOpenTodo(openTodo === 'card' ? null : 'card')} />
          {openTodo === 'card' && <CardScheduleCard schedule={card} />}
        </>
      )}
      {fiadoOverdue && p && (
        <TodoRow title="Fiado vencido" note={`${formatCurrency(p.fiado_overdue)} de clientes que já passaram do prazo`} action="Receber" onPress={() => go('/finance/receivables')} />
      )}
      {payOverdue && payables && (
        <TodoRow title="Despesa vencida" note={`${payables.overdue_count} conta(s), ${formatCurrency(payables.overdue_total)}`} action="Pagar" onPress={() => go('/finance/payables')} />
      )}
    </View>
  );

  // Blocos 3 a 5: para onde ir
  const tiles = (
    <>
      <View style={styles.section}>
        <Text style={styles.eyebrow}>ENTRADAS E SAÍDAS</Text>
        <View style={styles.tiles}>
          <Tile icon="book-outline" color={Colors.light.warningDark} title="Fiado" onPress={() => go('/finance/receivables')}
            value={p ? formatCurrency(p.fiado_open) : undefined}
            note={fiadoOverdue ? `a receber · ${formatCurrency(p!.fiado_overdue)} vencido` : 'a receber'} warn={fiadoOverdue} />
          <Tile icon="receipt-outline" color={Colors.light.error} title="Despesas" onPress={() => go('/(tabs)/expenses')}
            value={payables ? formatCurrency(payables.open_total) : undefined}
            note={payOverdue ? `a pagar · ${payables!.overdue_count} vencida(s)` : 'a pagar'} warn={payOverdue} />
          <Tile icon="swap-vertical-outline" color={Colors.light.info} title="Retiradas e empréstimos" note="sócia, empréstimo, fatura do cartão" onPress={() => go('/finance/entries')} />
          <Tile icon="warning-outline" color={Colors.light.errorDark} title="Prejuízos" note="perdas de estoque" onPress={() => go('/(tabs)/stock-losses')} />
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.eyebrow}>O MÊS</Text>
        <View style={styles.tiles}>
          <Tile icon="reader-outline" color={brand.primary} title="Relatório mensal" note="vendas, lucro, dinheiro e estoque, com PDF" onPress={() => go('/reports/monthly')} />
          <Tile icon="calendar-outline" color={brand.primary} title="Fechamento do mês" note="o dinheiro bate? compare o que deveria ter com o que tem" onPress={() => go('/finance/closing')} />
        </View>
      </View>
      {(!!p || (!!card && !cardDue)) && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.forecastHead} onPress={() => setShowForecast((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showForecast }}>
            <Text style={styles.forecastTitle}>Previsão e maquininha</Text>
            <Ionicons name={showForecast ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.light.textSecondary} />
          </TouchableOpacity>
          {showForecast && (
            <>
              {!!card && !cardDue && <CardScheduleCard schedule={card} />}
              {!!p && <FiadoProjectionCard projection={p} />}
            </>
          )}
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <PageHeader title="Financeiro" subtitle="Seu dinheiro e o que precisa de você" showBackButton backFallback="/(tabs)/more" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        {!!error && <Text style={styles.error}>{parseApiError(error)}</Text>}

        {!data?.started ? (
          <>
            <CashStatusCard />
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
            <View style={styles.tiles}>
              <Tile icon="book-outline" color={Colors.light.warningDark} title="Fiado" note="receber e lançar fiado antigo" onPress={() => go('/finance/receivables')} />
              <Tile icon="reader-outline" color={brand.primary} title="Relatório mensal" note="vendas, lucro e estoque do mês, com PDF" onPress={() => go('/reports/monthly')} />
            </View>
          </>
        ) : isDesktop ? (
          <View style={styles.columns}>
            <View style={styles.col}>
              {money}
              <PurchasePaymentResultCard />
              {todos}
            </View>
            <View style={styles.col}>{tiles}</View>
          </View>
        ) : (
          <>
            {money}
            <PurchasePaymentResultCard />
            {todos}
            {tiles}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  columns: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  col: { flex: 1, gap: 16, minWidth: 0 },
  section: { gap: 8 },
  eyebrow: { fontSize: 11, fontWeight: theme.fontWeight.extrabold, letterSpacing: 1, color: Colors.light.textSecondary },
  hero: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  total: { fontSize: 30, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  link: { fontSize: 13, fontWeight: theme.fontWeight.bold },
  accountsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  account: { flexGrow: 1, flexBasis: 100, minWidth: 0, backgroundColor: Colors.light.background, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.light.border, gap: 2 },
  accountName: { fontSize: 12, color: Colors.light.textSecondary },
  accountValue: { fontSize: 16, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  accountHint: { fontSize: 11, fontWeight: theme.fontWeight.bold },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.light.warningLight, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.light.warning },
  todoTitle: { fontSize: 14, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  todoNote: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  allGood: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.light.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.light.border },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: 150, minWidth: 0, backgroundColor: Colors.light.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.light.border, gap: 4 },
  tileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  tileTitle: { fontSize: 14, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  tileValue: { fontSize: 18, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  tileNote: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  forecastHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.light.border, borderRadius: 12, padding: 12 },
  forecastTitle: { fontSize: 14, fontWeight: theme.fontWeight.bold, color: Colors.light.textSecondary },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  title: { fontSize: 16, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  text: { fontSize: 14, lineHeight: 20, color: Colors.light.textSecondary },
  error: { color: Colors.light.error, fontWeight: '600' },
});
