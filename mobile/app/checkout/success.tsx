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

import { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, Card, Divider, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getSaleBySaleNumber } from '@/services/saleService';
import { Colors } from '@/constants/Colors';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { PaymentMethod } from '@/types';

/**
 * Componente principal da tela de sucesso
 */
export default function CheckoutSuccessScreen() {
  const router = useRouter();
  const { sale_number } = useLocalSearchParams<{ sale_number: string }>();

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
   * Compartilha resumo da venda
   */
  const handleShare = useCallback(async () => {
    if (!sale) return;

    haptics.selection();

    const itemsList = sale.items
      .map(item => `• ${item.quantity}x ${item.product?.name || 'Produto'} - ${formatCurrency(item.subtotal)}`)
      .join('\n');

    const message = `
🧾 *Venda ${sale.sale_number}*

📅 Data: ${formatDateTime(sale.created_at)}
💰 Total: ${formatCurrency(sale.total)}
💳 Pagamento: ${getPaymentMethodLabel(sale.payments[0]?.method)}
${sale.customer_name ? `👤 Cliente: ${sale.customer_name}` : ''}

📦 Itens (${sale.items.length}):
${itemsList}

✅ Obrigado pela preferência!
    `.trim();

    try {
      await Share.share({
        message,
        title: `Venda ${sale.sale_number}`,
      });
    } catch (error) {
      console.error('Erro ao compartilhar:', error);
    }
  }, [sale]);

  /**
   * Copia número da venda para clipboard
   */
  const copySaleNumber = useCallback((saleNumber: string) => {
    haptics.success();
    Alert.alert('Copiado!', `Número da venda: ${saleNumber}`);
    // TODO: Implementar clipboard com expo-clipboard se necessário
  }, []);

  /**
   * Obtém label do método de pagamento
   */
  const getPaymentMethodLabel = (method: PaymentMethod | string): string => {
    const labels: Record<string, string> = {
      PIX: 'PIX',
      pix: 'PIX',
      CASH: 'Dinheiro',
      cash: 'Dinheiro',
      CREDIT_CARD: 'Cartão de Crédito',
      credit_card: 'Cartão de Crédito',
      DEBIT_CARD: 'Cartão de Débito',
      debit_card: 'Cartão de Débito',
      BANK_TRANSFER: 'Transferência Bancária',
      bank_transfer: 'Transferência Bancária',
      INSTALLMENTS: 'Parcelado',
      installments: 'Parcelado',
      LOYALTY_POINTS: 'Pontos de Fidelidade',
      loyalty_points: 'Pontos de Fidelidade',
    };
    return labels[method] || method;
  };

  // Estado de carregamento
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text variant="bodyLarge" style={styles.loadingText}>
            Carregando detalhes da venda...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Estado de erro
  if (error || !sale) {
    return (
      <SafeAreaView style={styles.safeArea}>
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
      </SafeAreaView>
    );
  }

  // Renderização principal
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header com ícone de sucesso */}
        <View style={styles.successIconContainer}>
          <Ionicons
            name="checkmark-circle"
            size={100}
            color={Colors.light.success}
          />
        </View>

        <Text variant="headlineLarge" style={styles.successTitle}>
          Venda Realizada!
        </Text>
        <Text variant="bodyMedium" style={styles.successSubtitle}>
          A venda foi registrada no sistema com sucesso
        </Text>

        {/* Card com detalhes da venda */}
        <Card style={styles.detailsCard}>
          <Card.Content>
            {/* Número da venda */}
            <View style={styles.saleNumberContainer}>
              <Text variant="labelMedium" style={styles.label}>
                Número da Venda
              </Text>
              <Text variant="headlineMedium" style={styles.saleNumber}>
                {sale.sale_number}
              </Text>
              <Button
                mode="text"
                icon="content-copy"
                onPress={() => copySaleNumber(sale.sale_number)}
                compact
              >
                Copiar
              </Button>
            </View>

            <Divider style={styles.divider} />

            {/* Data e Hora */}
            <View style={styles.detailRow}>
              <Text variant="labelMedium" style={styles.label}>
                Data e Hora
              </Text>
              <Text variant="bodyLarge">
                {formatDateTime(sale.created_at)}
              </Text>
            </View>

            <Divider style={styles.divider} />

            {/* Total da venda */}
            <View style={styles.totalContainer}>
              <Text variant="labelLarge" style={styles.label}>
                Total da Venda
              </Text>
              <Text variant="displaySmall" style={styles.totalValue}>
                {formatCurrency(sale.total)}
              </Text>
            </View>

            <Divider style={styles.divider} />

            {/* Método de pagamento */}
            <View style={styles.detailRow}>
              <Text variant="labelMedium" style={styles.label}>
                Forma de Pagamento
              </Text>
              <Text variant="bodyLarge">
                {sale.payments && sale.payments.length > 0
                  ? getPaymentMethodLabel(sale.payments[0].method)
                  : 'Não especificado'}
              </Text>
            </View>

            {/* Cliente (se houver) */}
            {sale.customer_name && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text variant="labelMedium" style={styles.label}>
                    Cliente
                  </Text>
                  <Text variant="bodyLarge">{sale.customer_name}</Text>
                </View>
              </>
            )}

            {/* Desconto (se houver) */}
            {sale.discount > 0 && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text variant="labelMedium" style={styles.label}>
                    Desconto
                  </Text>
                  <Text variant="bodyLarge" style={styles.discountValue}>
                    {formatCurrency(sale.discount)}
                  </Text>
                </View>
              </>
            )}

            {/* Itens da venda */}
            <Divider style={styles.divider} />
            <Text variant="labelMedium" style={styles.itemsTitle}>
              Itens da Venda ({sale.items.length})
            </Text>
            {sale.items.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <Text variant="bodyMedium" style={styles.itemQuantity}>
                  {item.quantity}x
                </Text>
                <Text
                  variant="bodyMedium"
                  style={styles.itemName}
                  numberOfLines={1}
                >
                  {item.product?.name || 'Produto'}
                </Text>
                <Text variant="bodyMedium" style={styles.itemPrice}>
                  {formatCurrency(item.subtotal)}
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>

        {/* Botões de ação */}
        <View style={styles.actionsContainer}>
          <Button
            mode="contained"
            icon="cart-plus"
            onPress={handleNewSale}
            style={styles.primaryButton}
            contentStyle={styles.buttonContent}
          >
            Nova Venda
          </Button>

          <Button
            mode="outlined"
            icon="receipt"
            onPress={handleViewDetails}
            style={styles.secondaryButton}
            contentStyle={styles.buttonContent}
          >
            Ver Detalhes
          </Button>

          <Button
            mode="text"
            icon="share-variant"
            onPress={handleShare}
          >
            Compartilhar
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Estilos da tela
 */
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },

  // Header de sucesso
  successIconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    textAlign: 'center',
    fontWeight: 'bold',
    color: Colors.light.success,
    marginBottom: 8,
  },
  successSubtitle: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    marginBottom: 32,
  },

  // Card de detalhes
  detailsCard: {
    marginBottom: 24,
    elevation: 4,
  },
  saleNumberContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  saleNumber: {
    fontWeight: 'bold',
    color: Colors.light.primary,
    marginVertical: 8,
    letterSpacing: 1,
  },
  label: {
    color: Colors.light.textSecondary,
  },
  divider: {
    marginVertical: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  totalValue: {
    fontWeight: 'bold',
    color: Colors.light.success,
    marginTop: 8,
  },
  discountValue: {
    color: Colors.light.error,
  },

  // Lista de itens
  itemsTitle: {
    marginBottom: 12,
    marginTop: 8,
    color: Colors.light.textSecondary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  itemQuantity: {
    width: 40,
    fontWeight: '600',
  },
  itemName: {
    flex: 1,
    marginHorizontal: 8,
  },
  itemPrice: {
    fontWeight: '600',
  },

  // Botões de ação
  actionsContainer: {
    gap: 12,
  },
  primaryButton: {
    paddingVertical: 8,
  },
  secondaryButton: {
    paddingVertical: 8,
  },
  buttonContent: {
    paddingVertical: 6,
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
