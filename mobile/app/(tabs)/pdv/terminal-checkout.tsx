/**
 * Terminal Checkout — PDV
 * Tela de checkout via maquininha genérica (Cielo, Stone, Rede, etc.).
 * Providers cloud (Cielo, Stone): auto-confirma via SSE quando webhook chega.
 * Providers manuais: operador confirma manualmente.
 */

import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { confirmManualPayment, cancelOrder } from '@/services/pdvService';
import { getAccessToken } from '@/services/storage';
import { API_CONFIG } from '@/constants/Config';
import { useCart } from '@/hooks/useCart';

const C = Colors.light;

export default function TerminalCheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cart = useCart();

  const { sale_id, amount, sale_number, terminal_name, payment_type, installments } =
    useLocalSearchParams<{
      sale_id: string;
      amount: string;
      sale_number: string;
      terminal_name: string;
      payment_type: string;
      installments: string;
    }>();

  const saleId = parseInt(sale_id ?? '0', 10);
  const totalAmount = parseFloat(amount ?? '0');
  const numInstallments = parseInt(installments ?? '1', 10);
  const isCredit = payment_type === 'credit_card';

  // Detecta se o provider usa integração cloud (cobrança enviada automaticamente ao terminal)
  const providerFromName = terminal_name?.match(/\((\w+)\)$/)?.[1]?.toLowerCase() ?? '';
  const isCloudProvider = ['cielo', 'stone'].includes(providerFromName);

  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [autoConfirmed, setAutoConfirmed] = useState(false);
  const confirmedRef = useRef(false);

  // SSE: escuta eventos do backend para auto-confirmar quando provider cloud aprovar
  useEffect(() => {
    if (!isCloudProvider || confirmedRef.current) return;

    let abortController: AbortController | null = new AbortController();

    (async () => {
      try {
        const token = await getAccessToken();
        const url = `${API_CONFIG.BASE_URL}/pdv/orders/${saleId}/events`;
        const response = await fetch(url, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: abortController?.signal,
        });

        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.paid === true && !confirmedRef.current) {
                confirmedRef.current = true;
                setAutoConfirmed(true);
                haptics.success();
                queryClient.invalidateQueries({ queryKey: ['sales'] });
                queryClient.invalidateQueries({ queryKey: ['pdv-pending-sales'] });
                queryClient.invalidateQueries({ queryKey: ['products'] });
                queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
                queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
                queryClient.invalidateQueries({ queryKey: ['products-inventory'] });
                queryClient.invalidateQueries({ queryKey: ['low-stock'] });
                cart.clear();
                router.replace({
                  pathname: '/checkout/success',
                  params: { sale_number: sale_number ?? '' },
                });
              }
            } catch { /* linha malformada */ }
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('[Terminal SSE] erro:', err?.message);
        }
      }
    })();

    return () => {
      abortController?.abort();
      abortController = null;
    };
  }, [isCloudProvider, saleId]);

  // ── Confirmação do pagamento ──────────────────────────────────────────────

  const handleConfirm = async () => {
    haptics.medium();
    setConfirming(true);
    try {
      await confirmManualPayment(saleId);

      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-pending-sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
      queryClient.invalidateQueries({ queryKey: ['products-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });

      cart.clear();

      router.replace({
        pathname: '/checkout/success',
        params: { sale_number: sale_number ?? '' },
      });
    } catch (err: any) {
      haptics.error();
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        'Erro ao confirmar pagamento. Tente novamente.';
      Alert.alert('Erro ao confirmar', msg);
    } finally {
      setConfirming(false);
    }
  };

  // ── Cancelamento da venda ─────────────────────────────────────────────────

  const handleCancelConfirmed = async () => {
    setShowCancelDialog(false);
    setCancelling(true);
    haptics.medium();
    try {
      await cancelOrder(saleId);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      cart.clear();
      router.replace('/(tabs)/sales');
    } catch (err: any) {
      haptics.error();
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        'Erro ao cancelar venda. Tente novamente.';
      Alert.alert('Erro ao cancelar', msg);
    } finally {
      setCancelling(false);
    }
  };

  // ── Badge de tipo de pagamento ────────────────────────────────────────────

  const paymentBadge = () => {
    if (isCredit) {
      const installmentValue = totalAmount / numInstallments;
      const label =
        numInstallments > 1
          ? `Crédito ${numInstallments}x de ${formatCurrency(installmentValue)}`
          : 'Crédito à vista';
      return (
        <View style={[styles.badge, styles.badgeCredit]}>
          <Text style={[styles.badgeText, styles.badgeCreditText]}>{label}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, styles.badgeDebit]}>
        <Text style={[styles.badgeText, styles.badgeDebitText]}>Débito à vista</Text>
      </View>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <PageHeader
        title="Aguardando Pagamento"
        subtitle={terminal_name ?? 'Terminal'}
        showBackButton
        onBack={() => setShowCancelDialog(true)}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Card principal */}
        <View style={styles.card}>
          {/* Ícone da maquininha */}
          <View style={styles.iconWrap}>
            <Ionicons name="card-outline" size={64} color={C.primary} />
          </View>

          {/* Valor em destaque */}
          <Text style={styles.amount}>{formatCurrency(totalAmount)}</Text>

          {/* Badge de tipo */}
          {paymentBadge()}

          {/* Etapas do pagamento */}
          {isCloudProvider ? (
            <View style={styles.stepsContainer}>
              <View style={styles.stepRow}>
                <View style={[styles.stepDot, styles.stepDotDone]}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
                <Text style={[styles.stepLabel, styles.stepLabelDone]}>Cobrança enviada ao terminal</Text>
              </View>
              <View style={styles.stepConnector} />
              <View style={styles.stepRow}>
                <View style={[styles.stepDot, styles.stepDotActive]}>
                  <ActivityIndicator size="small" color={C.primary} style={{ transform: [{ scale: 0.55 }] }} />
                </View>
                <Text style={[styles.stepLabel, styles.stepLabelActive]}>Aguardando pagamento do cliente...</Text>
              </View>
              <View style={styles.stepConnector} />
              <View style={styles.stepRow}>
                <View style={styles.stepDot}>
                  <Text style={styles.stepNum}>3</Text>
                </View>
                <Text style={styles.stepLabel}>Confirmação automática</Text>
              </View>
            </View>
          ) : (
            <View style={styles.stepsContainer}>
              <View style={styles.stepRow}>
                <View style={[styles.stepDot, styles.stepDotNum]}>
                  <Text style={styles.stepNum}>1</Text>
                </View>
                <Text style={styles.stepLabel}>Cobre o valor na maquininha</Text>
              </View>
              <View style={styles.stepConnector} />
              <View style={styles.stepRow}>
                <View style={[styles.stepDot, styles.stepDotNum]}>
                  <Text style={styles.stepNum}>2</Text>
                </View>
                <Text style={styles.stepLabel}>Aguarde a aprovação no terminal</Text>
              </View>
              <View style={styles.stepConnector} />
              <View style={styles.stepRow}>
                <View style={[styles.stepDot, styles.stepDotActive]}>
                  <Text style={[styles.stepNum, { color: C.primary }]}>3</Text>
                </View>
                <Text style={[styles.stepLabel, styles.stepLabelActive]}>Confirme abaixo quando aprovado</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer sticky */}
      <View style={styles.footer}>
        {isCloudProvider ? (
          <AppButton
            variant="outlined"
            size="md"
            fullWidth
            label="Confirmar manualmente"
            icon="checkmark-circle-outline"
            onPress={handleConfirm}
            loading={confirming}
            disabled={confirming || cancelling || autoConfirmed}
          />
        ) : (
          <AppButton
            variant="primary"
            size="lg"
            fullWidth
            label="Confirmar Pagamento"
            icon="checkmark-circle-outline"
            onPress={handleConfirm}
            loading={confirming}
            disabled={confirming || cancelling}
          />
        )}
        <AppButton
          variant="danger-outline"
          size="md"
          fullWidth
          label="Cancelar Venda"
          onPress={() => setShowCancelDialog(true)}
          loading={cancelling}
          disabled={confirming || cancelling}
        />
      </View>

      {/* Diálogo de cancelamento */}
      <ConfirmDialog
        visible={showCancelDialog}
        title="Cancelar Venda"
        message={`Tem certeza que deseja cancelar a venda #${sale_number ?? ''}? Essa ação não pode ser desfeita.`}
        confirmText="Cancelar Venda"
        cancelText="Voltar"
        type="danger"
        icon="trash-outline"
        loading={cancelling}
        onConfirm={handleCancelConfirmed}
        onCancel={() => setShowCancelDialog(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.backgroundSecondary,
  },

  scrollContent: {
    flexGrow: 1,
    padding: theme.spacing.md,
    justifyContent: 'center',
  },

  // ── Card ────────────────────────────────────────────────────────────────

  card: {
    backgroundColor: C.background,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.md,
    ...theme.shadows.sm,
  },

  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },

  amount: {
    fontSize: 36,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },

  // ── Badges ───────────────────────────────────────────────────────────────

  badge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
  },

  badgeText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },

  badgeCredit: {
    backgroundColor: C.primaryLight,
  },

  badgeCreditText: {
    color: C.primary,
  },

  badgeDebit: {
    backgroundColor: C.successLight,
  },

  badgeDebitText: {
    color: C.success,
  },

  // ── Instrução ────────────────────────────────────────────────────────────

  cloudWaitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },

  instruction: {
    flex: 1,
    fontSize: theme.fontSize.base,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Etapas ───────────────────────────────────────────────────────────────

  stepsContainer: {
    alignSelf: 'stretch',
    paddingHorizontal: theme.spacing.sm,
    gap: 0,
  },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },

  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: C.border,
  },

  stepDotDone: {
    backgroundColor: C.success,
    borderColor: C.success,
  },

  stepDotActive: {
    backgroundColor: `${C.primary}15`,
    borderColor: C.primary,
  },

  stepDotNum: {
    backgroundColor: C.backgroundSecondary,
    borderColor: C.border,
  },

  stepNum: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textSecondary,
  },

  stepLabel: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: C.textSecondary,
    lineHeight: 20,
  },

  stepLabelDone: {
    color: C.success,
    fontWeight: '600',
  },

  stepLabelActive: {
    color: C.primary,
    fontWeight: '600',
  },

  stepConnector: {
    width: 1.5,
    height: 12,
    backgroundColor: C.border,
    marginLeft: 11,
    marginVertical: 2,
  },

  // ── Footer ───────────────────────────────────────────────────────────────

  footer: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: C.background,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
});
