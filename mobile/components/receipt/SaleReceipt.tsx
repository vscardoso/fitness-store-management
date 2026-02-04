import React, { forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Card } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { Colors } from '@/constants/Colors';
import type { SaleWithDetails, PaymentMethod } from '@/types';

interface SaleReceiptProps {
  sale: SaleWithDetails;
  storeName?: string;
}

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

export const SaleReceipt = forwardRef<View, SaleReceiptProps>(({ sale, storeName }, ref) => {
  return (
    <View ref={ref} collapsable={false} style={styles.receiptContainer}>
      <Card style={styles.detailsCard}>
        <View style={styles.cardContent}>
          {/* Nome da Loja */}
          {storeName && (
            <View style={styles.storeNameContainer}>
              <Ionicons name="storefront" size={20} color={Colors.light.primary} />
              <Text variant="titleMedium" style={styles.storeName}>
                {storeName}
              </Text>
            </View>
          )}
          
          {/* Número da venda */}
          <View style={styles.saleNumberContainer}>
            <Text variant="labelMedium" style={styles.label}>
              Número da Venda
            </Text>
            <Text variant="headlineMedium" style={styles.saleNumber}>
              {sale.sale_number}
            </Text>
          </View>

          {/* Data e Hora */}
          <View style={styles.detailRow}>
            <Text variant="labelMedium" style={styles.label}>
              Data e Hora
            </Text>
            <Text variant="bodyLarge" style={styles.detailValue}>
              {formatDateTime(sale.created_at)}
            </Text>
          </View>

          {/* Cliente (se houver) */}
          {sale.customer_name && (
            <View style={styles.detailRow}>
              <Text variant="labelMedium" style={styles.label}>
                Cliente
              </Text>
              <Text variant="bodyLarge" style={styles.detailValue}>
                {sale.customer_name}
              </Text>
            </View>
          )}

          {/* Método de pagamento */}
          <View style={styles.detailRow}>
            <Text variant="labelMedium" style={styles.label}>
              Forma de Pagamento
            </Text>
            <Text variant="bodyLarge" style={styles.detailValue}>
              {sale.payments && sale.payments.length > 0 && sale.payments[0].method
                ? getPaymentMethodLabel(sale.payments[0].method)
                : sale.payment_method
                ? getPaymentMethodLabel(sale.payment_method)
                : 'Não especificado'}
            </Text>
          </View>

          {/* Itens da venda */}
          <View style={styles.itemsSection}>
            <Text variant="labelMedium" style={styles.sectionTitle}>
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
                  {item.product?.name || item.product?.description || 'Produto'}
                </Text>
                <Text variant="bodyMedium" style={styles.itemPrice}>
                  {formatCurrency(item.subtotal)}
                </Text>
              </View>
            ))}
          </View>

          {/* Resumo financeiro */}
          <View style={styles.financialSummary}>
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>Subtotal</Text>
              <Text variant="bodyMedium" style={styles.summaryValue}>
                {formatCurrency(sale.subtotal)}
              </Text>
            </View>
            {sale.discount_amount > 0 && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium" style={styles.discountLabel}>Desconto</Text>
                <Text variant="bodyMedium" style={styles.discountValue}>
                  -{formatCurrency(sale.discount_amount)}
                </Text>
              </View>
            )}
          </View>

          {/* Total da venda */}
          <View style={styles.totalContainer}>
            <Text variant="titleMedium" style={styles.totalLabel}>
              Total da Venda
            </Text>
            <Text variant="headlineLarge" style={styles.totalValue}>
              {formatCurrency(sale.total_amount)}
            </Text>
          </View>
        </View>
      </Card>
    </View>
  );
});

SaleReceipt.displayName = 'SaleReceipt';

const styles = StyleSheet.create({
  receiptContainer: {
    backgroundColor: '#fff',
    padding: 16,
  },
  detailsCard: {
    marginBottom: 16,
    elevation: 2,
  },
  cardContent: {
    padding: 16,
  },
  storeNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  storeName: {
    fontWeight: '600',
    color: Colors.light.primary,
  },
  saleNumberContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  saleNumber: {
    fontWeight: 'bold',
    color: Colors.light.primary,
    marginTop: 4,
    letterSpacing: 1,
  },
  label: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  detailValue: {
    fontWeight: '500',
  },
  itemsSection: {
    marginTop: 20,
  },
  sectionTitle: {
    color: Colors.light.textSecondary,
    marginBottom: 8,
    fontSize: 13,
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
  financialSummary: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontWeight: '500',
  },
  discountLabel: {
    color: '#F57C00',
  },
  discountValue: {
    fontWeight: '600',
    color: '#F57C00',
  },
  totalContainer: {
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  totalLabel: {
    color: Colors.light.textSecondary,
    fontWeight: '500',
    marginBottom: 4,
  },
  totalValue: {
    fontWeight: 'bold',
    color: Colors.light.success,
    marginTop: 4,
  },
});

export default SaleReceipt;
