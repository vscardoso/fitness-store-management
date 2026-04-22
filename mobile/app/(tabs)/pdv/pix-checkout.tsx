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
  Alert,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { generatePixPayment, subscribePixStatus } from '@/services/pdvService';
import type { PixPaymentData } from '@/types/pdv';

const C = Colors.light;

export default function PixCheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sale_id, amount, sale_number, payment_id, qr_code, qr_code_base64, expires_at } =
    useLocalSearchParams<{
      sale_id: string;
      amount: string;
      sale_number: string;
      payment_id?: string;
      qr_code?: string;
      qr_code_base64?: string;
      expires_at?: string;
    }>();

  const [pixData, setPixData] = useState<PixPaymentData | null>(null);
  const [generating, setGenerating] = useState(true);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const confirmedRef = useRef(false);

  const saleId = parseInt(sale_id ?? '0', 10);
  const totalAmount = parseFloat(amount ?? '0');

  const applyPixData = (data: PixPaymentData) => {
    setPixData(data);
    if (data.expires_at) {
      const expiresAt = new Date(data.expires_at).getTime();
      setTimeLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    } else {
      setTimeLeft(30 * 60);
    }
  };

  const doGenerate = () => {
    if (!saleId) return;
    setGenerating(true);
    setGenerateError(null);
    generatePixPayment(saleId)
      .then(applyPixData)
      .catch((err) => {
        const msg = err?.response?.data?.detail || err?.message || 'Erro ao gerar PIX.';
        setGenerateError(msg);
      })
      .finally(() => setGenerating(false));
  };

  // Usa dados pré-carregados pelo pixStart (sem nova chamada de rede) ou busca agora
  useEffect(() => {
    if (payment_id && qr_code !== undefined && qr_code_base64 !== undefined) {
      applyPixData({
        sale_id: saleId,
        payment_id,
        qr_code: qr_code ?? '',
        qr_code_base64: qr_code_base64 ?? '',
        expires_at: expires_at || null,
        status: 'pending',
        message: '',
      });
      setGenerating(false);
    } else {
      doGenerate();
    }
  }, [saleId]);

  // Countdown regressivo
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => (t !== null && t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft !== null]);

  // SSE: recebe confirmação instantânea do servidor (sem polling)
  useEffect(() => {
    if (!pixData?.payment_id || confirmedRef.current) return;

    const handleConfirmed = () => {
      if (confirmedRef.current) return;
      confirmedRef.current = true;
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
      router.replace({
        pathname: '/checkout/success',
        params: { sale_number: sale_number ?? '' },
      });
    };

    const handleExpiredOrCancelled = () => {
      setTimeLeft(0);
    };

    const controller = subscribePixStatus(
      pixData.payment_id,
      handleConfirmed,
      handleExpiredOrCancelled,
    );

    return () => controller.abort();
  }, [pixData?.payment_id]);

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
    Alert.alert(
      'Sair do pagamento PIX',
      'O QR Code ficará ativo por alguns minutos. A venda permanecerá pendente até o pagamento ser confirmado.',
      [
        { text: 'Ficar aqui', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => router.back() },
      ],
    );
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
          {sale_number && (
            <Text style={styles.saleNumber}>Venda #{sale_number}</Text>
          )}
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
        <AppButton
          label="Cancelar"
          onPress={handleCancel}
          variant="secondary"
          fullWidth
        />
      </View>
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
});
