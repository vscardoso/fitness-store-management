/**
 * Ficha da cliente: quanto ela deve no fiado (some quando não deve nada). Abre a tela Fiado filtrada nela.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency } from '@/utils/format';
import { getReceivableSummary } from '@/services/receivableService';

export default function CustomerFiadoCard({ customerId }: { customerId: number }) {
  const router = useRouter();
  const brand = useBrandingColors();
  const { data } = useQuery({
    queryKey: ['receivables', 'summary', customerId],
    queryFn: () => getReceivableSummary(customerId),
    enabled: customerId > 0,
  });
  if (!data || data.open_total <= 0) return null;
  const overdue = data.overdue_total > 0;
  return (
    <TouchableOpacity style={[styles.card, overdue && styles.overdue]} accessibilityRole="button"
      onPress={() => router.push(`/finance/receivables?customer=${customerId}` as any)}>
      <Ionicons name="book-outline" size={22} color={overdue ? Colors.light.error : brand.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Deve {formatCurrency(data.open_total)} no fiado</Text>
        <Text style={[styles.sub, overdue && { color: Colors.light.error, fontWeight: '700' }]}>
          {overdue ? `${formatCurrency(data.overdue_total)} vencido · ` : ''}{data.installments} parcela(s) · Ver fiado e receber
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card,
  },
  overdue: { borderColor: Colors.light.error + '66' },
  title: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  sub: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
});
