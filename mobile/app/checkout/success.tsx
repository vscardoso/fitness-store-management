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

import { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getSaleBySaleNumber } from '@/services/saleService';
import { Colors } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { useAuthStore } from '@/store/authStore';
import SaleReceipt from '@/components/receipt/SaleReceipt';
import PageHeader from '@/components/layout/PageHeader';

/**
 * Componente principal da tela de sucesso
 */
export default function CheckoutSuccessScreen() {
  const router = useRouter();
  const { sale_number, change: changeParam } = useLocalSearchParams<{ sale_number: string; change?: string }>();
  const change = changeParam ? parseFloat(changeParam) : 0;
  const { user } = useAuthStore();
  const receiptRef = useRef<View>(null);
  const [errorDialog, setErrorDialog] = useState(false);

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

  // Estado de carregamento
  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Venda Concluída"
          gradientColors={[Colors.light.success, '#4caf50']}
          showBackButton
          onBack={() => router.replace('/(tabs)')}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text variant="bodyLarge" style={styles.loadingText}>
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
          gradientColors={[Colors.light.success, '#4caf50']}
          showBackButton
          onBack={() => router.replace('/(tabs)')}
        />
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={80} color={Colors.light.error} />
          <Text variant="headlineSmall" style={styles.errorTitle}>
            Erro ao carregar detalhes
          </Text>
          <Text variant="bodyMedium" style={styles.errorText}>
            {error instanceof Error ? error.message : 'Não foi possível carregar os detalhes da venda'}
          </Text>
          <View style={styles.errorActions}>
            <Button mode="contained" onPress={() => refetch()} style={styles.retryButton}>
              Tentar Novamente
            </Button>
            <Button mode="outlined" onPress={handleNewSale}>
              Voltar ao PDV
            </Button>
          </View>
        </View>
      </View>
    );
  }

  // Renderização principal
  return (
    <View style={styles.container}>
      <PageHeader
        title="Venda Concluída!"
        subtitle={sale.sale_number}
        gradientColors={[Colors.light.success, '#4caf50']}
        showBackButton
        onBack={() => { haptics.light(); router.replace('/(tabs)'); }}
        rightActions={[{
          icon: 'share-outline',
          onPress: () => { haptics.light(); handleShare(); },
        }]}
      >
        {/* Ícone celebrativo + troco */}
        <View style={styles.successInfo}>
          <Ionicons name="checkmark-circle" size={56} color="#fff" />
          {change > 0 && (
            <View style={styles.changeBadge}>
              <Ionicons name="cash-outline" size={18} color="#fff" />
              <Text style={styles.changeLabel}>Troco: </Text>
              <Text style={styles.changeAmount}>{formatCurrency(change)}</Text>
            </View>
          )}
        </View>
      </PageHeader>

      <ConfirmDialog
        visible={errorDialog}
        type="danger"
        title="Erro ao compartilhar"
        message="Não foi possível compartilhar o comprovante."
        confirmText="OK"
        onConfirm={() => setErrorDialog(false)}
      />

      <ScrollView
        style={styles.scrollContent}
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
        <View style={styles.actionsContainer}>
          <View style={styles.inlineButtonsRow}>
            <Button
              mode="contained"
              icon="cart-plus"
              onPress={handleNewSale}
              style={styles.inlineButton}
              contentStyle={styles.buttonContent}
            >
              Nova Venda
            </Button>

            <Button
              mode="outlined"
              icon="receipt"
              onPress={handleViewDetails}
              style={styles.inlineButton}
              contentStyle={styles.buttonContent}
            >
              Ver Detalhes
            </Button>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Estilos da tela
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  successInfo: {
    alignItems: 'center',
    paddingTop: 8,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 12,
    gap: 6,
  },
  changeLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
  },
  changeAmount: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  
  // Conteúdo
  scrollContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContentContainer: {
    paddingBottom: 24,
    backgroundColor: '#fff',
  },

  // Botões de ação
  actionsContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  inlineButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineButton: {
    flex: 1,
  },
  buttonContent: {
    paddingVertical: 8,
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
