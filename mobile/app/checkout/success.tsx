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
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getSaleBySaleNumber } from '@/services/saleService';
import { Colors } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { useAuthStore } from '@/store/authStore';
import SaleReceipt from '@/components/receipt/SaleReceipt';

/**
 * Componente principal da tela de sucesso
 */
export default function CheckoutSuccessScreen() {
  const router = useRouter();
  const { sale_number } = useLocalSearchParams<{ sale_number: string }>();
  const { user } = useAuthStore();
  const receiptRef = useRef<View>(null);

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
      Alert.alert('Erro', 'Não foi possível compartilhar o recibo');
    }
  }, [sale]);

  // Estado de carregamento
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
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
      <SafeAreaView style={styles.container}>
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.success} />

      {/* Header com gradiente de sucesso */}
      <LinearGradient
        colors={[Colors.light.success, '#4caf50']}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={() => {
                haptics.light();
                router.replace('/(tabs)');
              }}
              style={styles.backButton}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>

            <View style={styles.headerPlaceholder} />

            <TouchableOpacity
              onPress={() => {
                haptics.light();
                handleShare();
              }}
              style={styles.actionButton}
            >
              <Ionicons name="share-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Ícone e texto de sucesso */}
          <View style={styles.successInfo}>
            <Ionicons name="checkmark-circle" size={64} color="#fff" />
            <Text style={styles.successTitle}>Venda Concluída!</Text>
            <Text style={styles.successSubtitle}>
              {sale.sale_number}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
      >
        <SaleReceipt 
          ref={receiptRef}
          sale={sale}
          storeName={user?.store_name}
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
    </SafeAreaView>
  );
}

/**
 * Estilos da tela
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.success,
  },
  
  // Header com gradiente
  headerGradient: {
    paddingTop: 0,
    paddingBottom: 20,
  },
  headerContent: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  backButton: {
    padding: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerPlaceholder: {
    flex: 1,
  },
  actionButton: {
    padding: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successInfo: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.95)',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.5,
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
