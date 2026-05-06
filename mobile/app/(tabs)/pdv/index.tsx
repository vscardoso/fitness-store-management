/**
 * Pagamentos Pendentes — PDV
 * Terminal: confirmar + cancelar.
 * PIX provider real: ver QR inline + confirmar.
 * (PIX genérico não gera PENDING desde a refatoração — confirma na hora.)
 */

import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Image,
  ActivityIndicator,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { useBrandingColors } from '@/store/brandingStore';
import {
  getPendingSales,
  cancelOrder,
  confirmManualPayment,
  generatePixPayment,
} from '@/services/pdvService';
import type { PendingSale } from '@/types/pdv';

const C = Colors.light;

interface QRModalState {
  visible: boolean;
  sale: PendingSale | null;
  qr_code: string;
  qr_code_base64: string;
  loading: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeLabel(minutes: number): string {
  if (minutes < 1) return 'agora mesmo';
  if (minutes === 1) return 'há 1 min';
  if (minutes < 60) return `há ${minutes} min`;
  const h = Math.floor(minutes / 60);
  return h === 1 ? 'há 1 hora' : `há ${h} horas`;
}

function isPix(sale: PendingSale): boolean {
  return sale.payment_method?.toUpperCase() === 'PIX';
}

// ── Card ─────────────────────────────────────────────────────────────────────

function PendingCard({
  sale,
  onConfirm,
  onOpenQR,
  onCancel,
  confirming,
  cancelling,
  brandingColors,
}: {
  sale: PendingSale;
  onConfirm: (s: PendingSale) => void;
  onOpenQR: (s: PendingSale) => void;
  onCancel: (s: PendingSale) => void;
  confirming: boolean;
  cancelling: boolean;
  brandingColors: { primary: string; secondary: string; accent: string; gradient: [string, string] };
}) {
  const pix = isPix(sale);
  const isPixApi = sale.flow_type === 'pix_api';
  const methodColor = pix ? C.success : C.info;

  const methodLabel =
    sale.flow_type === 'pix_terminal' ? 'PIX Maquininha'
    : sale.flow_type === 'pix_api'    ? 'PIX'
    : sale.flow_type === 'pix_manual' ? 'PIX Manual'
    : 'Maquininha';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.methodBadge, { backgroundColor: methodColor + '18' }]}>
          <Ionicons
            name={pix ? 'qr-code-outline' : 'card-outline'}
            size={14}
            color={methodColor}
          />
          <Text style={[styles.methodText, { color: methodColor }]}>
            {methodLabel}
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
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, { backgroundColor: brandingColors.primary }, confirming && styles.btnDisabled]}
          onPress={() => { haptics.medium(); onConfirm(sale); }}
          disabled={confirming || cancelling}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
          <Text style={styles.btnPrimaryText}>
            {confirming ? 'Confirmando…' : 'Confirmar Recebimento'}
          </Text>
        </TouchableOpacity>

        {isPixApi && (
          <TouchableOpacity
            style={[styles.btn, styles.btnOutlined, cancelling && styles.btnDisabled]}
            onPress={() => { haptics.light(); onOpenQR(sale); }}
            disabled={confirming || cancelling}
            activeOpacity={0.8}
          >
            <Ionicons name="qr-code-outline" size={15} color={brandingColors.primary} />
            <Text style={[styles.btnOutlinedText, { color: brandingColors.primary }]}>QR</Text>
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

// ── QR Modal ─────────────────────────────────────────────────────────────────

function QRModal({
  state,
  onConfirm,
  onClose,
  confirming,
  brandingColors,
}: {
  state: QRModalState;
  onConfirm: () => void;
  onClose: () => void;
  confirming: boolean;
  brandingColors: { primary: string; gradient: [string, string] };
}) {
  const handleCopy = async () => {
    if (!state.qr_code) return;
    try { await Share.share({ message: state.qr_code }); } catch { /* cancelado */ }
    haptics.light();
  };

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          <Text style={styles.modalTitle}>QR Code PIX</Text>
          {state.sale && (
            <Text style={styles.modalAmount}>{formatCurrency(state.sale.total_amount)}</Text>
          )}
          {state.sale?.sale_number && (
            <Text style={styles.modalSaleNum}>Venda #{state.sale.sale_number}</Text>
          )}

          {state.loading ? (
            <View style={styles.modalQRPlaceholder}>
              <ActivityIndicator size="large" color={C.primary} />
              <Text style={styles.modalLoadingText}>Carregando QR Code...</Text>
            </View>
          ) : state.qr_code_base64 ? (
            <Image
              source={{ uri: `data:image/png;base64,${state.qr_code_base64}` }}
              style={styles.modalQRImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.modalQRPlaceholder}>
              <Ionicons name="qr-code-outline" size={64} color={C.textSecondary} />
              <Text style={styles.modalLoadingText}>QR Code indisponível</Text>
            </View>
          )}

          {!!state.qr_code && !state.loading && (
            <TouchableOpacity style={styles.copyRow} onPress={handleCopy} activeOpacity={0.7}>
              <Ionicons name="copy-outline" size={14} color={C.textSecondary} />
              <Text style={styles.copyText} numberOfLines={1} ellipsizeMode="middle">
                {state.qr_code.substring(0, 40)}…
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: brandingColors.primary }, confirming && styles.btnDisabled]}
              onPress={onConfirm}
              disabled={confirming || state.loading}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.modalBtnPrimaryText}>
                {confirming ? 'Confirmando…' : 'Confirmar Recebimento'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnOutlined]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.modalBtnOutlinedText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PendingSalesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();

  const headerOpacity = useSharedValue(0);
  const headerScale = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(24);

  const [cancelTarget, setCancelTarget] = useState<PendingSale | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [qrModal, setQrModal] = useState<QRModalState>({
    visible: false,
    sale: null,
    qr_code: '',
    qr_code_base64: '',
    loading: false,
  });

  const { data: sales = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['pdv-pending-sales'],
    queryFn: getPendingSales,
    refetchInterval: 30_000,
  });

  useFocusEffect(useCallback(() => {
    refetch();
    headerOpacity.value = 0;
    headerScale.value = 0.94;
    contentOpacity.value = 0;
    contentTranslateY.value = 24;

    headerOpacity.value = withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) });
    headerScale.value = withSpring(1, { damping: 16, stiffness: 200 });
    contentOpacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
    contentTranslateY.value = withSpring(0, { damping: 18, stiffness: 200 });
  }, [refetch, contentOpacity, contentTranslateY, headerOpacity, headerScale]));

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  const cancelMutation = useMutation({
    mutationFn: (saleId: number) => cancelOrder(saleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-pending-sales'] });
      setCancelTarget(null);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (saleId: number) => confirmManualPayment(saleId),
    onSuccess: (data) => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['pdv-pending-sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      setConfirmingId(null);
      setQrModal(m => ({ ...m, visible: false }));
      router.push({
        pathname: '/checkout/success',
        params: { sale_number: data.sale_number ?? '' },
      });
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
    setQrModal({ visible: true, sale, qr_code: '', qr_code_base64: '', loading: true });
    try {
      const pix = await generatePixPayment(sale.id);
      setQrModal(m => ({
        ...m,
        qr_code: pix.qr_code,
        qr_code_base64: pix.qr_code_base64,
        loading: false,
      }));
    } catch {
      haptics.error();
      setQrModal(m => ({ ...m, loading: false }));
    }
  }, []);

  const handleQRConfirm = useCallback(() => {
    if (!qrModal.sale) return;
    setConfirmingId(qrModal.sale.id);
    confirmMutation.mutate(qrModal.sale.id);
  }, [qrModal.sale, confirmMutation]);

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimatedStyle}>
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
      </Animated.View>

      <Animated.View style={[styles.listWrapper, contentAnimatedStyle]}>
        <FlatList
          data={sales}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, sales.length === 0 && styles.listEmpty]}
          ListEmptyComponent={isLoading ? null : <EmptyPending />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={brandingColors.primary} />
          }
          renderItem={({ item }) => (
            <PendingCard
              sale={item}
              onConfirm={handleConfirm}
              onOpenQR={handleOpenQR}
              onCancel={handleCancel}
              confirming={confirmingId === item.id}
              cancelling={cancelMutation.isPending && cancelTarget?.id === item.id}
              brandingColors={brandingColors}
            />
          )}
        />
      </Animated.View>

      <QRModal
        state={qrModal}
        onConfirm={handleQRConfirm}
        onClose={() => setQrModal(m => ({ ...m, visible: false }))}
        confirming={!!(qrModal.sale && confirmingId === qrModal.sale.id)}
        brandingColors={brandingColors}
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
    backgroundColor: C.backgroundSecondary,
  },
  listWrapper: {
    flex: 1,
  },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  listEmpty: {
    flex: 1,
  },

  // ── Card ──
  card: {
    backgroundColor: C.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: C.border,
    ...theme.shadows.sm,
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
  methodText: {
    fontSize: 12,
    fontWeight: '600',
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

  // ── Botões ──
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
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.lg,
  },
  btnPrimary: {
    backgroundColor: C.primary,
  },
  btnDanger: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.error,
  },
  btnOutlined: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flex: 0,
    paddingHorizontal: 14,
  },
  btnOutlinedText: {
    fontSize: 13,
    fontWeight: '600',
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

  // ── Empty ──
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

  // ── QR Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: 40,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: theme.spacing.xs,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: C.text,
  },
  modalAmount: {
    fontSize: 30,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.5,
  },
  modalSaleNum: {
    fontSize: 13,
    color: C.textSecondary,
  },
  modalQRImage: {
    width: 220,
    height: 220,
    marginVertical: theme.spacing.sm,
  },
  modalQRPlaceholder: {
    width: 220,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.backgroundSecondary,
    borderRadius: 12,
    gap: 12,
    marginVertical: theme.spacing.sm,
  },
  modalLoadingText: {
    fontSize: 13,
    color: C.textSecondary,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
  },
  copyText: {
    flex: 1,
    fontSize: 11,
    color: C.textSecondary,
  },
  modalActions: {
    width: '100%',
    gap: 8,
    marginTop: theme.spacing.xs,
  },
  modalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: theme.borderRadius.xl,
  },
  modalBtnPrimary: {
    backgroundColor: C.primary,
  },
  modalBtnPrimaryText: {
    color: '#fff',
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  modalBtnOutlined: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  modalBtnOutlinedText: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: C.textSecondary,
  },
});
