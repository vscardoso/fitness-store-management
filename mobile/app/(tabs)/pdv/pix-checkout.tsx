/**
 * Tela PIX QR Code — PDV
 * Exibe QR Code gerado via Mercado Pago e aguarda confirmação do pagamento.
 * Polling a cada 3s; redireciona para sucesso quando aprovado.
 */

import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
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
import { subscribePixStatus } from '@/services/pdvService';
import { createSale } from '@/services/saleService';
import { useCart } from '@/hooks/useCart';
import type { PixPaymentData } from '@/types/pdv';

const C = Colors.light;

export default function PixCheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cart = useCart();
  const { amount, payment_id, qr_code, qr_code_base64, expires_at, is_generic } =
    useLocalSearchParams<{
      amount: string;
      payment_id?: string;
      qr_code?: string;
      qr_code_base64?: string;
      expires_at?: string;
      is_generic?: string;
    }>();

  const isGeneric = is_generic === 'true';

  const [pixData, setPixData] = useState<PixPaymentData | null>(null);
  const [generating, setGenerating] = useState(true);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [confirmingManual, setConfirmingManual] = useState(false);
  const confirmedRef = useRef(false);

  type DialogState = {
    visible: boolean;
    type: 'danger' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  };
  const DIALOG_HIDDEN: DialogState = { visible: false, type: 'info', title: '', message: '' };
  const [dialog, setDialog] = useState<DialogState>(DIALOG_HIDDEN);

  const totalAmount = parseFloat(amount ?? '0');

  const applyPixData = (data: PixPaymentData) => {
    setPixData(data);
    // PIX genérico não tem expiração automática — lojista confirma manualmente
    if (data.is_generic || isGeneric) {
      setTimeLeft(null);
      return;
    }
    if (data.expires_at) {
      const expiresAt = new Date(data.expires_at).getTime();
      setTimeLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    } else {
      setTimeLeft(30 * 60);
    }
  };

  const doGenerate = () => {
    // fallback: sem dados pré-carregados e sem sale_id — mostra erro
    setGenerating(false);
    setGenerateError('QR Code não disponível. Volte e tente novamente.');
  };

  // Usa dados pré-carregados (qr_code passado via params do generate-qr)
  useEffect(() => {
    if (qr_code) {
      applyPixData({
        sale_id: 0,
        payment_id: payment_id || 'generic',
        qr_code: qr_code ?? '',
        qr_code_base64: qr_code_base64 ?? '',
        expires_at: expires_at || null,
        status: 'pending',
        message: '',
        is_generic: isGeneric,
      });
      setGenerating(false);
    } else {
      doGenerate();
    }
  }, []);

  // Countdown regressivo
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => (t !== null && t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft !== null]);

  // SSE: recebe confirmação instantânea do servidor (sem polling)
  // Só para providers reais (Cielo PIX, Mercado Pago) — não para PIX genérico
  useEffect(() => {
    const realPaymentId = pixData?.payment_id && pixData.payment_id !== 'generic'
      ? pixData.payment_id
      : null;
    if (!realPaymentId || confirmedRef.current || isGeneric) return;

    const handleConfirmed = () => {
      if (confirmedRef.current) return;
      confirmedRef.current = true;
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-pending-sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
      queryClient.invalidateQueries({ queryKey: ['products-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      router.replace({ pathname: '/checkout/success' });
    };

    const handleExpiredOrCancelled = () => {
      setTimeLeft(0);
    };

    const controller = subscribePixStatus(
      realPaymentId,
      handleConfirmed,
      handleExpiredOrCancelled,
    );

    return () => controller.abort();
  }, [pixData?.payment_id, isGeneric]);

  const handleCopy = async () => {
    if (!pixData?.qr_code) return;
    try {
      await Share.share({ message: pixData.qr_code });
    } catch {
      // usuário cancelou o share sheet — não é erro
    }
    setCopied(true);
    haptics.light();
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCancel = () => {
    setDialog({
      visible: true,
      type: 'danger',
      title: 'Sair do pagamento PIX',
      message: 'Se sair agora, nenhuma venda será registrada. O QR Code será descartado.',
      confirmText: 'Sair',
      cancelText: 'Ficar aqui',
      onConfirm: () => { setDialog(DIALOG_HIDDEN); router.back(); },
      onCancel: () => setDialog(DIALOG_HIDDEN),
    });
  };

  const handleManualConfirm = () => {
    setDialog({
      visible: true,
      type: 'info',
      title: 'Confirmar recebimento',
      message: 'Confirme apenas após verificar o pagamento PIX no seu banco.',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        setDialog(DIALOG_HIDDEN);
        setConfirmingManual(true);
        try {
          // Cria venda COMPLETED agora, após confirmação do recebimento
          const saleData = {
            payment_method: 'pix',
            items: cart.items.map(i => ({
              product_id: i.product_id,
              ...(i.variant_id ? { variant_id: i.variant_id } : {}),
              quantity: i.quantity,
              unit_price: i.unit_price,
              discount_amount: i.discount ?? 0,
            })),
            payments: cart.payments.map(p => ({
              payment_method: p.method,
              amount: p.amount,
              installments: p.installments ?? 1,
            })),
            ...(cart.customer_id ? { customer_id: cart.customer_id } : {}),
            discount_amount: cart.discount ?? 0,
            tax_amount: 0,
            notes: cart.notes,
          };
          const sale = await createSale(saleData as any);
          confirmedRef.current = true;
          haptics.success();
          cart.clear();
          queryClient.invalidateQueries({ queryKey: ['sales'] });
          queryClient.invalidateQueries({ queryKey: ['pdv-pending-sales'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
          queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
          queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
          queryClient.invalidateQueries({ queryKey: ['products-inventory'] });
          queryClient.invalidateQueries({ queryKey: ['low-stock'] });
          router.replace({
            pathname: '/checkout/success',
            params: { sale_number: sale.sale_number },
          });
        } catch (e: any) {
          setDialog({ visible: true, type: 'danger', title: 'Erro', message: e?.response?.data?.detail || 'Erro ao registrar venda. Tente novamente.', confirmText: 'OK', onConfirm: () => setDialog(DIALOG_HIDDEN) });
        } finally {
          setConfirmingManual(false);
        }
      },
      onCancel: () => setDialog(DIALOG_HIDDEN),
    });
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isExpired = timeLeft === 0;

  return (
    <View style={styles.container}>
      <PageHeader title="Pagamento PIX" onBack={handleCancel} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Valor */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Total a pagar</Text>
          <Text style={styles.amountValue}>{formatCurrency(totalAmount)}</Text>
        </View>

        {/* Gerando QR Code */}
        {generating && (
          <View style={styles.centerSection}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={styles.waitText}>Gerando QR Code PIX...</Text>
          </View>
        )}

        {/* Erro na geração */}
        {generateError && !generating && (
          <View style={styles.errorSection}>
            <Ionicons name="alert-circle-outline" size={48} color={C.error} />
            <Text style={styles.errorText}>{generateError}</Text>
            <AppButton label="Tentar novamente" onPress={doGenerate} variant="secondary" fullWidth />
          </View>
        )}

        {/* Indicador de etapas */}
        {!generating && !generateError && (
          <View style={styles.stepsCard}>
            <View style={styles.stepRow}>
              <View style={[styles.stepDot, styles.stepDotDone]}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
              <Text style={[styles.stepText, styles.stepTextDone]}>QR Code gerado</Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.stepRow}>
              {isGeneric ? (
                <View style={styles.stepDot}><Text style={styles.stepNum}>2</Text></View>
              ) : (
                <View style={[styles.stepDot, styles.stepDotActive]}>
                  <ActivityIndicator size="small" color={C.primary} style={{ transform: [{ scale: 0.55 }] }} />
                </View>
              )}
              <Text style={[styles.stepText, !isGeneric && styles.stepTextActive]}>
                {isGeneric ? 'Cliente realiza o pagamento' : 'Aguardando pagamento...'}
              </Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.stepRow}>
              {isGeneric ? (
                <View style={[styles.stepDot, styles.stepDotActive]}>
                  <Text style={[styles.stepNum, { color: C.primary }]}>3</Text>
                </View>
              ) : (
                <View style={styles.stepDot}><Text style={styles.stepNum}>3</Text></View>
              )}
              <Text style={[styles.stepText, isGeneric && styles.stepTextActive]}>
                {isGeneric ? 'Confirme o recebimento abaixo' : 'Confirmação automática'}
              </Text>
            </View>
          </View>
        )}

        {/* QR Code e código copia-e-cola */}
        {pixData && !generating && (
          <>
            <View style={styles.qrSection}>
              {pixData.qr_code_base64 ? (
                <Image
                  source={{ uri: `data:image/png;base64,${pixData.qr_code_base64}` }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <Ionicons name="qr-code-outline" size={80} color={C.textSecondary} />
                  <Text style={styles.waitText}>QR Code indisponível</Text>
                </View>
              )}

              {isExpired ? (
                <View style={styles.expiredBadge}>
                  <Ionicons name="time-outline" size={14} color="#fff" />
                  <Text style={styles.expiredText}>QR Code expirado — gere novamente</Text>
                </View>
              ) : isGeneric ? (
                <View style={styles.waitingRow}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={C.success} />
                  <Text style={[styles.waitingText, { color: C.success }]}>
                    Confirme após o recebimento
                  </Text>
                </View>
              ) : (
                <View style={styles.waitingRow}>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={styles.waitingText}>Aguardando pagamento...</Text>
                  {timeLeft !== null && (
                    <Text style={styles.countdown}>{formatCountdown(timeLeft)}</Text>
                  )}
                </View>
              )}
            </View>

            {/* Copia e cola */}
            {!!pixData.qr_code && (
              <View style={styles.copySection}>
                <Text style={styles.copyLabel}>Código PIX (copia e cola)</Text>
                <View style={styles.copyRow}>
                  <Text style={styles.copyCode} numberOfLines={2} ellipsizeMode="middle">
                    {pixData.qr_code}
                  </Text>
                  <TouchableOpacity onPress={handleCopy} style={styles.copyButton} activeOpacity={0.7}>
                    <Ionicons
                      name={copied ? 'checkmark-outline' : 'copy-outline'}
                      size={20}
                      color={copied ? C.success : C.primary}
                    />
                  </TouchableOpacity>
                </View>
                {copied && <Text style={styles.copiedFeedback}>Código copiado!</Text>}
              </View>
            )}

            {/* Instruções */}
            <View style={styles.instructionSection}>
              <Text style={styles.instructionTitle}>Como pagar com PIX:</Text>
              <Text style={styles.instructionText}>
                {'1. Abra o app do seu banco\n'}
                {'2. Acesse a área PIX\n'}
                {'3. Escaneie o QR Code ou cole o código\n'}
                {`4. Confirme o pagamento de ${formatCurrency(totalAmount)}`}
              </Text>
            </View>

            {/* Recarregar se expirado */}
            {isExpired && (
              <AppButton label="Gerar novo QR Code" onPress={doGenerate} fullWidth />
            )}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {isGeneric && (
          <AppButton
            label={confirmingManual ? 'Confirmando...' : 'Confirmar recebimento PIX'}
            onPress={handleManualConfirm}
            variant="primary"
            fullWidth
            loading={confirmingManual}
            icon="checkmark-circle-outline"
            style={{ marginBottom: 8 }}
          />
        )}
        <AppButton
          label="Cancelar"
          onPress={handleCancel}
          variant="secondary"
          fullWidth
        />
      </View>

      <ConfirmDialog
        visible={dialog.visible}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        onConfirm={dialog.onConfirm ?? (() => setDialog(DIALOG_HIDDEN))}
        onCancel={dialog.onCancel ?? (() => setDialog(DIALOG_HIDDEN))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  amountCard: {
    backgroundColor: C.card,
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    alignItems: 'center',
    gap: 4,
    ...theme.shadows.sm,
  },
  amountLabel: {
    fontSize: 14,
    color: C.textSecondary,
  },
  amountValue: {
    fontSize: 32,
    fontWeight: '700',
    color: C.text,
  },
  saleNumber: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 2,
  },
  centerSection: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 16,
  },
  waitText: {
    fontSize: 15,
    color: C.textSecondary,
  },
  errorSection: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 16,
  },
  errorText: {
    fontSize: 14,
    color: C.error,
    textAlign: 'center',
  },
  qrSection: {
    backgroundColor: C.card,
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    alignItems: 'center',
    gap: 16,
    ...theme.shadows.sm,
  },
  qrImage: {
    width: 240,
    height: 240,
  },
  qrPlaceholder: {
    width: 240,
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.backgroundSecondary,
    borderRadius: 12,
    gap: 8,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waitingText: {
    fontSize: 14,
    color: C.textSecondary,
  },
  countdown: {
    fontSize: 14,
    fontWeight: '600',
    color: C.primary,
  },
  expiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.textSecondary,
  },
  expiredText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  copySection: {
    backgroundColor: C.card,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    gap: 8,
    ...theme.shadows.sm,
  },
  copyLabel: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: '500',
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.backgroundSecondary,
    borderRadius: 8,
    padding: 10,
  },
  copyCode: {
    flex: 1,
    fontSize: 12,
    color: C.text,
  },
  copyButton: {
    padding: 4,
  },
  copiedFeedback: {
    fontSize: 12,
    color: C.success,
    fontWeight: '500',
  },
  instructionSection: {
    backgroundColor: C.card,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    gap: 8,
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  instructionText: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 22,
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: C.background,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },

  // ── Etapas ──────────────────────────────────────────────────────────────

  stepsCard: {
    backgroundColor: C.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    gap: 0,
    ...theme.shadows.sm,
  },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },

  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
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

  stepNum: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textSecondary,
  },

  stepText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: C.textSecondary,
    lineHeight: 20,
  },

  stepTextDone: {
    color: C.success,
    fontWeight: '600',
  },

  stepTextActive: {
    color: C.primary,
    fontWeight: '600',
  },

  stepLine: {
    width: 1.5,
    height: 10,
    backgroundColor: C.border,
    marginLeft: 10,
    marginVertical: 2,
  },
});
