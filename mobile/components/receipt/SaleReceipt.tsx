import React, { forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Card, Divider } from 'react-native-paper';
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
        <Card.Content>
          {/* Nome da Loja */}
          {storeName && (
            <>
              <View style={styles.storeNameContainer}>
                <Ionicons name="storefront" size={24} color={Colors.light.primary} />
                <Text variant="titleMedium" style={styles.storeName}>
                  {storeName}
                </Text>
              </View>
              <Divider style={styles.divider} />
            </>
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
              {formatCurrency(sale.total_amount)}
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
                {item.product?.name || item.product?.description || 'Produto'}
              </Text>
              <Text variant="bodyMedium" style={styles.itemPrice}>
                {formatCurrency(item.subtotal)}
              </Text>
            </View>
          ))}

          <Divider style={styles.divider} />

          {/* Método de pagamento */}
          <View style={styles.detailRow}>
            <Text variant="labelMedium" style={styles.label}>
              Forma de Pagamento
            </Text>
            <Text variant="bodyLarge">
              {sale.payments && sale.payments.length > 0 && sale.payments[0].method
                ? getPaymentMethodLabel(sale.payments[0].method)
                : sale.payment_method
                ? getPaymentMethodLabel(sale.payment_method)
                : 'Não especificado'}
            </Text>
          </View>
        </Card.Content>
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
    marginBottom: 24,
    elevation: 4,
  },
  storeNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  storeName: {
    fontWeight: 'bold',
    color: Colors.light.primary,
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
});

export default SaleReceipt;
