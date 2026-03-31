/**
 * Tela de Sucesso de Checkout
 * Exibida após finalização bem-sucedida de uma venda
 *
 * Features:
 * - Animação de sucesso celebrativa
 * - Detalhes completos da venda
 * - Ações: Nova venda, Ver detalhes, Compartilhar
 * - Estados de loading e erro
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Animated, Easing, Text, ActivityIndicator } from 'react-native';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getSaleBySaleNumber } from '@/services/saleService';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { useAuthStore } from '@/store/authStore';
import SaleReceipt from '@/components/receipt/SaleReceipt';
import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';

/**
 * Componente principal da tela de sucesso
 */
export default function CheckoutSuccessScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const { sale_number, change: changeParam } = useLocalSearchParams<{ sale_number: string; change?: string }>();
  const change = changeParam ? parseFloat(changeParam) : 0;
  const { user } = useAuthStore();
  const receiptRef = useRef<View>(null);
  const [errorDialog, setErrorDialog] = useState(false);
  const hasAnimated = useRef(false);
  const headerScale = useRef(new Animated.Value(0.96)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0.88)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(28)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const actionsTranslateY = useRef(new Animated.Value(20)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;

  // Buscar detalhes da venda
  const { data: sale, isLoading, error, refetch } = useQuery({
    queryKey: ['sale', sale_number],
    queryFn: () => getSaleBySaleNumber(sale_number!),
    enabled: !!sale_number,
    retry: 2,
    staleTime: 0, // Sempre buscar dados frescos
  });

  /**
   * Navega para nova venda (limpa o fluxo)
   */
  const handleNewSale = useCallback(() => {
    haptics.medium();
    router.replace('/(tabs)/sale');
  }, [router]);

  /**
   * Navega para detalhes da venda
   */
  const handleViewDetails = useCallback(() => {
    if (!sale) return;
    haptics.light();
    router.push(`/sales/${sale.id}`);
  }, [router, sale]);

  /**
   * Compartilha recibo como imagem
   */
  const handleShare = useCallback(async () => {
    if (!sale || !receiptRef.current) return;

    haptics.selection();

    try {
      // Capturar a view do recibo como imagem
      const uri = await captureRef(receiptRef, {
        format: 'png',
        quality: 1,
      });

      // Verificar se o compartilhamento está disponível
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Erro', 'Compartilhamento não disponível neste dispositivo');
        return;
      }

      // Compartilhar a imagem
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Recibo - Venda ${sale.sale_number}`,
      });
    } catch (error) {
      console.error('Erro ao compartilhar:', error);
      setErrorDialog(true);
    }
  }, [sale]);

  useEffect(() => {
    if (!sale || hasAnimated.current) {
      return;
    }

    hasAnimated.current = true;
    haptics.success();

    Animated.parallel([
      Animated.spring(headerScale, {
        toValue: 1,
        damping: 16,
        stiffness: 180,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(120),
        Animated.parallel([
          Animated.spring(badgeScale, {
            toValue: 1,
            damping: 12,
            stiffness: 220,
            mass: 0.8,
            useNativeDriver: true,
          }),
          Animated.timing(badgeOpacity, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(180),
        Animated.parallel([
          Animated.spring(contentTranslateY, {
            toValue: 0,
            damping: 18,
            stiffness: 170,
            mass: 0.9,
            useNativeDriver: true,
          }),
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(280),
        Animated.parallel([
          Animated.spring(actionsTranslateY, {
            toValue: 0,
            damping: 18,
            stiffness: 180,
            mass: 0.85,
            useNativeDriver: true,
          }),
          Animated.timing(actionsOpacity, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [
    actionsOpacity,
    actionsTranslateY,
    badgeOpacity,
    badgeScale,
    contentOpacity,
    contentTranslateY,
    headerOpacity,
    headerScale,
    sale,
  ]);

  // Estado de carregamento
  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Venda Concluída"
          gradientColors={brandingColors.gradient}
          showBackButton
          onBack={() => router.replace('/(tabs)')}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>
            Carregando detalhes da venda...
          </Text>
        </View>
      </View>
    );
  }

  // Estado de erro
  if (error || !sale) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Venda Concluída"
          gradientColors={brandingColors.gradient}
          showBackButton
          onBack={() => router.replace('/(tabs)')}
        />
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={80} color={Colors.light.error} />
          <Text style={styles.errorTitle}>
            Erro ao carregar detalhes
          </Text>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Não foi possível carregar os detalhes da venda'}
          </Text>
          <View style={styles.errorActions}>
            <AppButton
              variant="primary"
              size="lg"
              fullWidth
              icon="refresh-outline"
              label="Tentar Novamente"
              onPress={() => refetch()}
              style={styles.retryButton}
            />
            <AppButton
              variant="secondary"
              size="lg"
              fullWidth
              icon="storefront-outline"
              label="Voltar ao PDV"
              onPress={handleNewSale}
            />
          </View>
        </View>
      </View>
    );
  }

  // Renderização principal
  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          opacity: headerOpacity,
          transform: [{ scale: headerScale }],
        }}
      >
        <PageHeader
          title="Venda Concluída!"
          subtitle={sale.sale_number}
          gradientColors={brandingColors.gradient}
          showBackButton
          onBack={() => { haptics.light(); router.replace('/(tabs)'); }}
          rightActions={[{
            icon: 'share-outline',
            onPress: () => { haptics.light(); handleShare(); },
          }]}
        >
          {/* Meta da venda concluída */}
          <Animated.View
            style={[
              styles.successInfo,
              {
                opacity: badgeOpacity,
                transform: [{ scale: badgeScale }],
              },
            ]}
          >
            <View style={styles.saleNumberPill}>
              <Ionicons name="receipt-outline" size={16} color="#fff" />
              <Text style={styles.saleNumberPillText}>Venda registrada com sucesso</Text>
            </View>
            {change > 0 && (
              <View style={styles.changeBadge}>
                <Ionicons name="cash-outline" size={18} color="#fff" />
                <Text style={styles.changeLabel}>Troco: </Text>
                <Text style={styles.changeAmount}>{formatCurrency(change)}</Text>
              </View>
            )}
          </Animated.View>
        </PageHeader>
      </Animated.View>

      <ConfirmDialog
        visible={errorDialog}
        type="danger"
        title="Erro ao compartilhar"
        message="Não foi possível compartilhar o comprovante."
        confirmText="OK"
        onConfirm={() => setErrorDialog(false)}
      />

      <Animated.ScrollView
        style={[
          styles.scrollContent,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentTranslateY }],
          },
        ]}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
      >
        <SaleReceipt
          ref={receiptRef}
          sale={sale}
          storeName={user?.store_name}
          change={change > 0 ? change : undefined}
        />

        {/* Botões de ação */}
        <Animated.View
          style={[
            styles.actionsContainer,
            {
              opacity: actionsOpacity,
              transform: [{ translateY: actionsTranslateY }],
            },
          ]}
        >
          <View style={styles.inlineButtonsRow}>
            <AppButton
              variant="primary"
              size="lg"
              fullWidth
              icon="cart-outline"
              label="Nova Venda"
              onPress={handleNewSale}
              style={styles.actionButton}
            />

            <AppButton
              variant="secondary"
              size="lg"
              fullWidth
              icon="receipt-outline"
              label="Ver Detalhes"
              onPress={handleViewDetails}
              style={styles.actionButton}
            />
          </View>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

/**
 * Estilos da tela
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  successInfo: {
    alignItems: 'center',
    paddingTop: 8,
    gap: 12,
  },
  saleNumberPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  saleNumberPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  changeLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
  },
  changeAmount: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  
  // Conteúdo
  scrollContent: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContentContainer: {
    paddingBottom: 24,
    backgroundColor: Colors.light.background,
  },

  // Botões de ação
  actionsContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  inlineButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },

  // Estados de loading/erro
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    color: Colors.light.textSecondary,
  },
  errorTitle: {
    textAlign: 'center',
    marginVertical: 16,
    color: Colors.light.error,
    fontWeight: 'bold',
  },
  errorText: {
    textAlign: 'center',
    marginBottom: 24,
    color: Colors.light.textSecondary,
  },
  errorActions: {
    gap: 12,
    width: '100%',
    maxWidth: 300,
  },
  retryButton: {
    marginBottom: 8,
  },
});
