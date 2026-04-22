/**
 * Pagamentos Pendentes — PDV
 * Lista vendas com status PENDING (PIX ou maquininha aguardando confirmação).
 * Permite confirmar manualmente (terminal) ou re-abrir QR Code (PIX).
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import {
  getPendingSales,
  cancelOrder,
  confirmManualPayment,
  generatePixPayment,
} from '@/services/pdvService';
import type { PendingSale } from '@/types/pdv';

const C = Colors.light;

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeLabel(minutes: number): string {
  if (minutes < 1) return 'agora mesmo';
  if (minutes === 1) return 'há 1 min';
  if (minutes < 60) return `há ${minutes} min`;
  const h = Math.floor(minutes / 60);
  return h === 1 ? 'há 1 hora' : `há ${h} horas`;
}

function isPix(sale: PendingSale): boolean {
  return sale.payment_method === 'PIX';
}

// ── Card ─────────────────────────────────────────────────────────────────────

function PendingCard({
  sale,
  onConfirm,
  onCancel,
  onOpenQR,
  confirming,
  cancelling,
}: {
  sale: PendingSale;
  onConfirm: (s: PendingSale) => void;
  onCancel: (s: PendingSale) => void;
  onOpenQR: (s: PendingSale) => void;
  confirming: boolean;
  cancelling: boolean;
}) {
  const pix = isPix(sale);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.methodBadge, pix ? styles.pixBadge : styles.terminalBadge]}>
          <Ionicons
            name={pix ? 'qr-code-outline' : 'card-outline'}
            size={14}
            color={pix ? '#009B02' : '#003DA5'}
          />
          <Text style={[styles.methodText, pix ? styles.pixText : styles.terminalText]}>
            {pix ? 'PIX' : 'Maquininha'}
          </Text>
        </View>
        <Text style={styles.timeText}>{timeLabel(sale.minutes_ago)}</Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.amount}>{formatCurrency(sale.total_amount)}</Text>
        <Text style={styles.saleNumber}>Venda #{sale.sale_number}</Text>
        {sale.customer_name ? (
          <Text style={styles.customer}>{sale.customer_name}</Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {pix ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => { haptics.medium(); onOpenQR(sale); }}
            disabled={confirming || cancelling}
            activeOpacity={0.8}
          >
            <Ionicons name="qr-code-outline" size={15} color="#fff" />
            <Text style={styles.btnPrimaryText}>Ver QR Code</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, confirming && styles.btnDisabled]}
            onPress={() => { haptics.medium(); onConfirm(sale); }}
            disabled={confirming || cancelling}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
            <Text style={styles.btnPrimaryText}>
              {confirming ? 'Confirmando…' : 'Confirmar'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.btn, styles.btnDanger, cancelling && styles.btnDisabled]}
          onPress={() => { haptics.light(); onCancel(sale); }}
          disabled={confirming || cancelling}
          activeOpacity={0.8}
        >
          <Ionicons name="close-circle-outline" size={15} color={C.error} />
          <Text style={styles.btnDangerText}>
            {cancelling ? 'Cancelando…' : 'Cancelar'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Empty ─────────────────────────────────────────────────────────────────────

function EmptyPending() {
  return (
    <View style={styles.empty}>
      <Ionicons name="checkmark-done-circle-outline" size={56} color={C.textSecondary} />
      <Text style={styles.emptyTitle}>Nenhum pagamento pendente</Text>
      <Text style={styles.emptySub}>Todos os pagamentos foram concluídos</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PendingSalesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [cancelTarget, setCancelTarget] = useState<PendingSale | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [openingQRId, setOpeningQRId] = useState<number | null>(null);

  const { data: sales = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['pdv-pending-sales'],
    queryFn: getPendingSales,
    refetchInterval: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (saleId: number) => cancelOrder(saleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-pending-sales'] });
      setCancelTarget(null);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (saleId: number) => confirmManualPayment(saleId),
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['pdv-pending-sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setConfirmingId(null);
    },
    onError: () => {
      haptics.error();
      setConfirmingId(null);
    },
  });

  const handleConfirm = useCallback((sale: PendingSale) => {
    setConfirmingId(sale.id);
    confirmMutation.mutate(sale.id);
  }, [confirmMutation]);

  const handleCancel = useCallback((sale: PendingSale) => {
    setCancelTarget(sale);
  }, []);

  const handleOpenQR = useCallback(async (sale: PendingSale) => {
    setOpeningQRId(sale.id);
    try {
      const pix = await generatePixPayment(sale.id);
      router.push({
        pathname: '/(tabs)/pdv/pix-checkout',
        params: {
          sale_id: String(sale.id),
          amount: String(sale.total_amount),
          sale_number: sale.sale_number,
          payment_id: pix.payment_id,
          qr_code: pix.qr_code,
          qr_code_base64: pix.qr_code_base64,
          expires_at: pix.expires_at ?? '',
        },
      });
    } catch {
      haptics.error();
    } finally {
      setOpeningQRId(null);
    }
  }, [router]);

  return (
    <View style={styles.container}>
      <PageHeader
        title="Pagamentos Pendentes"
        subtitle={sales.length > 0 ? `${sales.length} aguardando` : undefined}
        showBackButton
        rightActions={[
          {
            icon: 'settings-outline',
            onPress: () => router.push('/(tabs)/pdv/terminals' as any),
          },
        ]}
      />

      <FlatList
        data={sales}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, sales.length === 0 && styles.listEmpty]}
        ListEmptyComponent={isLoading ? null : <EmptyPending />}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.primary} />
        }
        renderItem={({ item }) => (
          <PendingCard
            sale={item}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            onOpenQR={handleOpenQR}
            confirming={confirmingId === item.id}
            cancelling={cancelMutation.isPending && cancelTarget?.id === item.id}
          />
        )}
      />

      <ConfirmDialog
        visible={!!cancelTarget}
        title="Cancelar pagamento"
        message={`Deseja cancelar o pagamento da venda #${cancelTarget?.sale_number}? A venda será cancelada e o estoque revertido.`}
        confirmText="Cancelar pagamento"
        cancelText="Manter"
        type="danger"
        icon="close-circle-outline"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
        onCancel={() => setCancelTarget(null)}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  listEmpty: {
    flex: 1,
  },

  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: theme.roundness * 2,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  pixBadge: {
    backgroundColor: '#E0F5E0',
  },
  terminalBadge: {
    backgroundColor: '#E0E9FF',
  },
  methodText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pixText: {
    color: '#009B02',
  },
  terminalText: {
    color: '#003DA5',
  },
  timeText: {
    fontSize: 12,
    color: C.textSecondary,
  },

  cardBody: {
    gap: 2,
  },
  amount: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
  },
  saleNumber: {
    fontSize: 13,
    color: C.textSecondary,
  },
  customer: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 2,
  },

  // Botões
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: theme.roundness,
  },
  btnPrimary: {
    backgroundColor: C.primary,
  },
  btnDanger: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.error,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  btnDangerText: {
    color: C.error,
    fontSize: 13,
    fontWeight: '600',
  },

  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    color: C.textSecondary,
  },
});
