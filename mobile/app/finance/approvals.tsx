/**
 * Pedidos de aprovação: quem quer mexer no saldo de um BANCO depois de lançado (corrigir saldo, apagar ou corrigir transferência,
 * lançamento, conta paga ou despesa) faz um pedido com motivo, e a mudança só vale quando TODOS os administradores aprovam.
 * Aqui o administrador vê cada pedido, quem já votou, e aprova ou recusa (recusar exige o motivo). Dados: `GET /finance/approvals`.
 */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';
import Badge from '@/components/ui/Badge';
import BottomSheet from '@/components/ui/BottomSheet';
import EmptyState from '@/components/ui/EmptyState';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { formatDateTime } from '@/utils/format';
import { parseApiError, showApiError } from '@/utils/apiError';
import {
  approveApproval, cancelApproval, getApprovals, rejectApproval, setApprovers, type FinanceApproval,
} from '@/services/bankApproval';

const STATUS: Record<FinanceApproval['status'], { label: string; variant: 'warning' | 'success' | 'error' | 'info' }> = {
  pending: { label: 'Esperando aprovação', variant: 'warning' },
  approved: { label: 'Aprovado e aplicado', variant: 'success' },
  rejected: { label: 'Recusado', variant: 'error' },
  expired: { label: 'Venceu', variant: 'info' },
  canceled: { label: 'Cancelado', variant: 'info' },
  failed: { label: 'Aprovado, mas não aplicou', variant: 'error' },
};

function daysLeft(iso: string): string {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return d <= 0 ? 'vence hoje' : `vence em ${d} dia${d === 1 ? '' : 's'}`;
}

function ApprovalCard({ ap, onApprove, onReject, onCancel, busy }: {
  ap: FinanceApproval; onApprove: () => void; onReject: () => void; onCancel: () => void; busy: boolean;
}) {
  const st = STATUS[ap.status];
  return (
    <AppCard style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{ap.title}</Text>
        <Badge label={st.label} variant={st.variant} size="sm" />
      </View>
      <Text style={styles.summary}>{ap.summary}</Text>
      <Text style={styles.reason}>{`Motivo de ${ap.requested_by ?? 'quem pediu'}: ${ap.reason}`}</Text>
      <Text style={styles.meta}>{`Pedido em ${ap.created_at ? formatDateTime(ap.created_at) : ''}${ap.status === 'pending' ? ` · ${daysLeft(ap.expires_at)}` : ''}`}</Text>

      <View style={styles.votes}>
        {ap.votes.map((v) => (
          <View key={`${v.user_id}-${v.at}`} style={styles.vote}>
            <Ionicons name={v.vote === 'approve' ? 'checkmark-circle' : 'close-circle'} size={18}
              color={v.vote === 'approve' ? Colors.light.success : Colors.light.error} />
            <Text style={styles.voteText}>
              {`${v.name ?? 'Administrador'} ${v.vote === 'approve' ? 'aprovou' : 'recusou'}${v.vote === 'reject' && v.comment ? `: ${v.comment}` : ''}`}
            </Text>
          </View>
        ))}
        {ap.waiting_for.map((w) => (
          <View key={`w-${w.user_id}`} style={styles.vote}>
            <Ionicons name="time-outline" size={18} color={Colors.light.textSecondary} />
            <Text style={styles.voteText}>{`${w.name} ainda não votou`}</Text>
          </View>
        ))}
      </View>
      {!!ap.result_message && ap.status !== 'pending' && <Text style={styles.result}>{ap.result_message}</Text>}

      {ap.status === 'pending' && (ap.can_vote || ap.can_cancel) && (
        <View style={styles.actions}>
          {ap.can_vote && <AppButton variant="primary" size="sm" icon="checkmark" label="Aprovar" loading={busy} onPress={onApprove} />}
          {ap.can_vote && <AppButton variant="danger-outline" size="sm" icon="close" label="Recusar" disabled={busy} onPress={onReject} />}
          {ap.can_cancel && !ap.can_vote && <AppButton variant="outlined" size="sm" label="Cancelar o pedido" disabled={busy} onPress={onCancel} />}
        </View>
      )}
    </AppCard>
  );
}

export default function ApprovalsScreen() {
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isRefetching, error } = useQuery({
    queryKey: ['finance-approvals'], queryFn: getApprovals, refetchInterval: 20_000,
  });
  const [rejecting, setRejecting] = useState<{ ap: FinanceApproval; comment: string } | null>(null);
  const [rejectError, setRejectError] = useState('');

  const refresh = () => queryClient.invalidateQueries();
  const approve = useMutation({
    mutationFn: (id: number) => approveApproval(id),
    onSuccess: refresh,
    onError: (e) => showApiError(e, 'Não foi possível aprovar'),
  });
  const reject = useMutation({
    mutationFn: () => rejectApproval(rejecting!.ap.id, rejecting!.comment.trim()),
    onSuccess: async () => { setRejecting(null); await refresh(); },
    onError: (e) => setRejectError(parseApiError(e) || 'Não foi possível recusar.'),
  });
  const changeApprovers = useMutation({
    mutationFn: (ids: number[]) => setApprovers(ids),
    onSuccess: refresh,
    onError: (e) => showApiError(e, 'Não foi possível mudar quem aprova'),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => cancelApproval(id),
    onSuccess: refresh,
    onError: (e) => showApiError(e, 'Não foi possível cancelar'),
  });

  if (isLoading) return <ScreenLoader message="Carregando os pedidos..." />;
  const items = data?.items ?? [];
  const waiting = items.filter((i) => i.status === 'pending');
  const done = items.filter((i) => i.status !== 'pending').slice(0, 20);

  return (
    <View style={styles.container}>
      <PageHeader title="Pedidos de aprovação" subtitle="Mexer no saldo do banco" showBackButton backFallback="/finance" />
      <ScrollView contentContainerStyle={[styles.content, desktop]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}>
        <Text style={styles.intro}>
          O saldo de um banco não muda sozinho. Quem pede uma correção escreve o motivo, e a mudança só vale depois que todos os administradores aprovarem. Qualquer um pode recusar.
        </Text>
        {(data?.approvers ?? []).length > 0 && (
          <AppCard style={styles.card}>
            <Text style={styles.title}>Quem aprova</Text>
            <Text style={styles.reason}>
              Os administradores marcados como “aprova” precisam votar. Quem só acompanha vê tudo, mas não vota.
            </Text>
            {(data?.approvers ?? []).map((a) => {
              const approvers = (data?.approvers ?? []).filter((x) => x.approver).map((x) => x.user_id);
              const next = a.approver ? approvers.filter((id) => id !== a.user_id) : [...approvers, a.user_id];
              return (
                <View key={a.user_id} style={styles.head}>
                  <Text style={styles.summary}>{`${a.name}: ${a.approver ? 'aprova' : 'só acompanha'}`}</Text>
                  <AppButton variant="outlined" size="sm" label={a.approver ? 'Só acompanhar' : 'Passar a aprovar'}
                    disabled={changeApprovers.isPending || (a.approver && approvers.length <= 1)} onPress={() => changeApprovers.mutate(next)} />
                </View>
              );
            })}
          </AppCard>
        )}
        {!!error && !data && <EmptyState type="error" title="Não foi possível abrir os pedidos" description={parseApiError(error)} actionLabel="Tentar de novo" onAction={() => refetch()} />}
        {!error && items.length === 0 && (
          <EmptyState icon="shield-checkmark-outline" title="Nenhum pedido"
            description="Quando alguém pedir para mexer no saldo de um banco, o pedido aparece aqui." />
        )}
        {waiting.length > 0 && <Text style={styles.section}>{`ESPERANDO · ${waiting.length}`}</Text>}
        {waiting.map((ap) => (
          <ApprovalCard key={ap.id} ap={ap} busy={approve.isPending || cancel.isPending}
            onApprove={() => approve.mutate(ap.id)} onReject={() => { setRejectError(''); setRejecting({ ap, comment: '' }); }}
            onCancel={() => cancel.mutate(ap.id)} />
        ))}
        {done.length > 0 && <Text style={styles.section}>DECIDIDOS</Text>}
        {done.map((ap) => (
          <ApprovalCard key={ap.id} ap={ap} busy={false} onApprove={() => {}} onReject={() => {}} onCancel={() => {}} />
        ))}
      </ScrollView>

      <BottomSheet
        visible={!!rejecting}
        onDismiss={() => setRejecting(null)}
        title="Recusar o pedido"
        subtitle={rejecting?.ap.title}
        icon="close-circle-outline"
        actions={[{
          label: 'Recusar o pedido', variant: 'danger', loading: reject.isPending,
          disabled: !rejecting || rejecting.comment.trim().length < 5, onPress: () => { setRejectError(''); reject.mutate(); },
        }]}
      >
        {!!rejecting && (
          <View style={{ gap: 10 }}>
            {!!rejectError && <Text style={styles.error}>{rejectError}</Text>}
            <Text style={styles.summary}>{rejecting.ap.summary}</Text>
            <TextInput mode="outlined" label="Por que está recusando? (mínimo 5 letras)" value={rejecting.comment} multiline numberOfLines={3}
              onChangeText={(t) => setRejecting({ ...rejecting, comment: t })} activeOutlineColor={brand.primary} />
            <Text style={styles.meta}>Recusar cancela o pedido para todos e o saldo não muda.</Text>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  intro: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  section: { fontSize: 12, fontWeight: theme.fontWeight.extrabold, color: Colors.light.textSecondary, letterSpacing: 0.8, marginTop: 4 },
  card: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  summary: { fontSize: 14, lineHeight: 20, color: Colors.light.text },
  reason: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  meta: { fontSize: 12, color: Colors.light.textSecondary },
  votes: { gap: 4, marginTop: 2 },
  vote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voteText: { flex: 1, fontSize: 13, color: Colors.light.text },
  result: { fontSize: 12, lineHeight: 18, color: Colors.light.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  error: { fontSize: 13, color: Colors.light.error },
});
