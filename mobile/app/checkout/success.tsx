/**
 * Tela "Venda concluída" (depois de finalizar a venda).
 *
 * Para quem está no balcão, nesta ordem: 1) quanto foi e como foi pago (resumo), 2) mandar o comprovante para a cliente,
 * 3) começar a próxima venda (botões fixos embaixo, sempre à vista). Os itens ficam recolhidos dentro do resumo.
 * O troco, quando há, aparece no alto: é a única coisa que não pode passar despercebida.
 */

import { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Animated, Easing, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { getSaleBySaleNumber } from '@/services/saleService';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useSaleReceipt } from '@/hooks/useSaleReceipt';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import SaleDoneSummary from '@/components/receipt/SaleDoneSummary';
import ReceiptActions from '@/components/receipt/ReceiptActions';
import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import ScreenLoader from '@/components/ui/ScreenLoader';

export default function CheckoutSuccessScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const { sale_number, change: changeParam } = useLocalSearchParams<{ sale_number: string; change?: string }>();
  const change = changeParam ? parseFloat(changeParam) : 0;
  const hasAnimated = useRef(false);
  const contentTranslateY = useRef(new Animated.Value(20)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  // Buscar detalhes da venda
  const { data: sale, isLoading, error, refetch } = useQuery({
    queryKey: ['sale', sale_number],
    queryFn: () => getSaleBySaleNumber(sale_number!),
    enabled: !!sale_number,
    retry: 2,
    staleTime: 0, // Sempre buscar dados frescos
  });
  // brindes dados na venda (o comprovante do servidor já os traz; a mesma consulta alimenta os botões de envio)
  const { data: receipt } = useSaleReceipt(sale?.id, change > 0 ? change : undefined);

  const handleNewSale = useCallback(() => {
    haptics.medium();
    router.replace('/(tabs)/sale');
  }, [router]);

  const handleGoHome = useCallback(() => {
    haptics.light();
    router.replace('/(tabs)');
  }, [router]);

  const handleViewDetails = useCallback(() => {
    if (!sale) return;
    haptics.light();
    router.push(`/sales/${sale.id}`);
  }, [router, sale]);

  // Um único movimento de entrada: o conteúdo sobe e aparece
  useEffect(() => {
    if (!sale || hasAnimated.current) return;
    hasAnimated.current = true;
    haptics.success();
    Animated.parallel([
      Animated.spring(contentTranslateY, { toValue: 0, damping: 18, stiffness: 170, mass: 0.9, useNativeDriver: true }),
      Animated.timing(contentOpacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [sale, contentOpacity, contentTranslateY]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Venda concluída" gradientColors={brandingColors.gradient} showBackButton onBack={handleGoHome} />
        <ScreenLoader message="Carregando detalhes da venda..." />
      </View>
    );
  }

  if (error || !sale) {
    return (
      <View style={styles.container}>
        <PageHeader title="Venda concluída" gradientColors={brandingColors.gradient} showBackButton onBack={handleGoHome} />
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={80} color={Colors.light.error} />
          <Text style={styles.errorTitle}>Erro ao carregar detalhes</Text>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Não foi possível carregar os detalhes da venda'}
          </Text>
          <View style={styles.errorActions}>
            <AppButton variant="primary" size="lg" fullWidth icon="refresh-outline" label="Tentar Novamente" onPress={() => refetch()} />
            <AppButton variant="secondary" size="lg" fullWidth icon="storefront-outline" label="Voltar ao PDV" onPress={handleNewSale} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader title="Venda concluída" gradientColors={brandingColors.gradient} showBackButton onBack={handleGoHome}>
        {change > 0 && (
          <View style={styles.changeBadge} accessibilityLiveRegion="polite">
            <Ionicons name="cash-outline" size={18} color={Colors.light.white} />
            <Text style={styles.changeLabel}>Troco</Text>
            <Text style={styles.changeAmount}>{formatCurrency(change)}</Text>
          </View>
        )}
      </PageHeader>

      <Animated.View style={[styles.flex, { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }]}>
        <ScrollView contentContainerStyle={[desktop, styles.content]} showsVerticalScrollIndicator={false}>
          <SaleDoneSummary sale={sale} gifts={receipt?.receipt.gifts} />
          <ReceiptActions saleId={sale.id} saleNumber={sale.sale_number} change={change > 0 ? change : undefined} />
        </ScrollView>
      </Animated.View>

      <View style={styles.bar}>
        <View style={styles.barRow}>
          <View style={styles.flex}>
            <AppButton variant="primary" size="lg" fullWidth icon="cart-outline" label="Nova venda" onPress={handleNewSale} />
          </View>
          <View style={styles.flex}>
            <AppButton variant="secondary" size="lg" fullWidth icon="receipt-outline" label="Ver detalhes" onPress={handleViewDetails} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  flex: { flex: 1 },
  content: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: 120, width: '100%', maxWidth: 640, alignSelf: 'center' },
  changeBadge: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  changeLabel: { color: 'rgba(255,255,255,0.85)', fontSize: theme.fontSize.md },
  changeAmount: { color: Colors.light.white, fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: theme.spacing.md, paddingBottom: 20,
    backgroundColor: Colors.light.background, borderTopWidth: 1, borderTopColor: Colors.light.border,
  },
  barRow: { flexDirection: 'row', gap: theme.spacing.sm + 4, width: '100%', maxWidth: 640, alignSelf: 'center' },

  // Estados de erro
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg },
  errorTitle: { textAlign: 'center', marginVertical: theme.spacing.md, color: Colors.light.error, fontWeight: theme.fontWeight.bold },
  errorText: { textAlign: 'center', marginBottom: theme.spacing.lg, color: Colors.light.textSecondary },
  errorActions: { gap: theme.spacing.sm + 4, width: '100%', maxWidth: 300 },
});
