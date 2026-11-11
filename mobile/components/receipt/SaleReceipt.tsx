import React, { forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Card } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { itemsDiscountOf } from '@/utils/itemDiscount';
import PaymentLines from '@/components/receipt/PaymentLines';
import { useSaleReceipt } from '@/hooks/useSaleReceipt';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { SaleWithDetails } from '@/types';

interface SaleReceiptProps {
  sale: SaleWithDetails;
  storeName?: string;
  /** Valor do troco em dinheiro (pagamento em cash com overpayment) */
  change?: number;
}

export const SaleReceipt = forwardRef<View, SaleReceiptProps>(({ sale, storeName, change }, ref) => {
  const brandingColors = useBrandingColors();
  const { data: receipt } = useSaleReceipt(sale.id, change);
  const gifts = receipt?.receipt.gifts ?? [];
  return (
    <View ref={ref} collapsable={false} style={styles.receiptContainer}>
      <Card style={styles.detailsCard}>
        <View style={styles.cardContent}>
          {/* Nome da Loja */}
          {storeName && (
            <View style={styles.storeNameContainer}>
              <Ionicons name="storefront" size={20} color={brandingColors.primary} />
              <Text variant="titleMedium" style={[styles.storeName, { color: brandingColors.primary }]}>
                {storeName}
              </Text>
            </View>
          )}
          
          {/* Número da venda */}
          <View style={styles.saleNumberContainer}>
            <Text variant="labelMedium" style={styles.label}>
              Número da Venda
            </Text>
            <Text variant="headlineMedium" style={[styles.saleNumber, { color: brandingColors.primary }]}>
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

          {/* Método(s) de pagamento: nome e parcelas à esquerda, valor à direita (cada um no seu lugar) */}
          <View style={styles.paymentsBlock}>
            <Text variant="labelMedium" style={styles.label}>
              {(sale.payments?.length ?? 0) > 1 ? 'Pagamentos' : 'Forma de Pagamento'}
            </Text>
            <PaymentLines payments={sale.payments ?? []} fallbackMethod={sale.payment_method} fallbackAmount={Number(sale.total_amount)} />
          </View>

          {/* Itens da venda */}
          <View style={styles.itemsSection}>
            <Text variant="labelMedium" style={styles.sectionTitle}>
              Itens da Venda ({sale.items.length})
            </Text>
            {sale.items.map((item, index) => {
              const variantLabel = (item as any).variant_label;
              const name = item.product?.name || item.product?.description || 'Produto';
              const itemSubtotal = Number(item.subtotal);
              const discountShare = Number(sale.discount_amount) > 0 && Number(sale.subtotal) > 0
                ? Number(sale.discount_amount) * (itemSubtotal / Number(sale.subtotal))
                : 0;
              const effectiveSubtotal = itemSubtotal - discountShare;
              const lineDiscount = Number((item as any).discount_amount ?? 0);
              const grossLine = Number(item.unit_price) * item.quantity;
              return (
                <View key={index} style={styles.itemRow}>
                  <Text variant="bodyMedium" style={styles.itemQuantity}>
                    {item.quantity}x
                  </Text>
                  <View style={styles.itemNameContainer}>
                    <Text variant="bodyMedium" style={styles.itemName} numberOfLines={1}>
                      {name}
                    </Text>
                    {variantLabel && (
                      <Text variant="bodySmall" style={styles.itemVariant}>
                        {variantLabel}
                      </Text>
                    )}
                    {(discountShare > 0 || lineDiscount > 0) && (
                      <Text variant="bodySmall" style={styles.itemDiscountNote}>
                        {lineDiscount > 0 ? `(desconto de ${formatCurrency(lineDiscount)})` : '(desc. aplicado)'}
                      </Text>
                    )}
                  </View>
                  <View style={styles.itemPriceContainer}>
                    {(discountShare > 0 || lineDiscount > 0) && (
                      <Text variant="bodySmall" style={styles.itemPriceStrike}>
                        {formatCurrency(grossLine)}
                      </Text>
                    )}
                    <Text variant="bodyMedium" style={styles.itemPrice}>
                      {formatCurrency(effectiveSubtotal)}
                    </Text>
                  </View>
                </View>
              );
            })}
            {gifts.map((g, i) => (
              <View key={`g${i}`} style={styles.itemRow}>
                <Text variant="bodyMedium" style={styles.itemQuantity}>{g.quantity}x</Text>
                <View style={styles.itemNameContainer}>
                  <Text variant="bodyMedium" style={styles.itemName} numberOfLines={2}>{g.name}</Text>
                  {!!g.variant && <Text variant="bodySmall" style={styles.itemVariant}>{g.variant}</Text>}
                </View>
                <Text variant="bodyMedium" style={styles.itemPrice}>brinde</Text>
              </View>
            ))}
          </View>

          {/* Resumo financeiro */}
          <View style={styles.financialSummary}>
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>{itemsDiscountOf(sale.items as any) > 0 ? 'Valor das peças' : 'Subtotal'}</Text>
              <Text variant="bodyMedium" style={styles.summaryValue}>
                {formatCurrency(Number(sale.subtotal) + itemsDiscountOf(sale.items as any))}
              </Text>
            </View>
            {itemsDiscountOf(sale.items as any) > 0 && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium" style={styles.discountLabel}>Descontos nas peças</Text>
                <Text variant="bodyMedium" style={styles.discountValue}>
                  -{formatCurrency(itemsDiscountOf(sale.items as any))}
                </Text>
              </View>
            )}
            {sale.discount_amount > 0 && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium" style={styles.discountLabel}>{itemsDiscountOf(sale.items as any) > 0 ? 'Desconto geral' : 'Desconto'}</Text>
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

          {/* Troco */}
          {change !== undefined && change > 0 && (
            <View style={styles.changeContainer}>
              <Ionicons name="cash-outline" size={20} color={Colors.light.success} />
              <Text variant="titleMedium" style={styles.changeLabel}>Troco</Text>
              <Text variant="titleLarge" style={styles.changeValue}>
                {formatCurrency(change)}
              </Text>
            </View>
          )}
        </View>
      </Card>
    </View>
  );
});

SaleReceipt.displayName = 'SaleReceipt';

const styles = StyleSheet.create({
  receiptContainer: {
    backgroundColor: Colors.light.white,
    padding: 16,
  },
  detailsCard: {
    marginBottom: 16,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
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
  },
  saleNumberContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  saleNumber: {
    fontWeight: 'bold',
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
  paymentsBlock: {
    marginTop: 12,
    gap: 6,
  },
  installmentLabel: {
    color: Colors.light.textSecondary,
    marginTop: 1,
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
  itemNameContainer: {
    flex: 1,
    marginHorizontal: 8,
  },
  itemName: {
    fontWeight: '500',
  },
  itemVariant: {
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  itemDiscountNote: {
    color: Colors.light.warning,
    marginTop: 1,
  },
  itemPriceContainer: {
    alignItems: 'flex-end',
  },
  itemPriceStrike: {
    color: Colors.light.textSecondary,
    textDecorationLine: 'line-through',
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
    color: Colors.light.warning,
  },
  discountValue: {
    fontWeight: '600',
    color: Colors.light.warning,
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
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: Colors.light.success + '15',
    borderRadius: 10,
    gap: 8,
  },
  changeLabel: {
    flex: 1,
    color: Colors.light.success,
    fontWeight: '600',
  },
  changeValue: {
    fontWeight: 'bold',
    color: Colors.light.success,
  },
});

export default SaleReceipt;
