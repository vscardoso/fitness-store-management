/**
 * Linha do caixa da gaveta dentro do Financeiro: aberto (quanto deve ter na gaveta) ou fechado, com o toque que
 * leva à tela do caixa (abrir, colocar, retirar, fechar). O caixa faz parte do Financeiro, não é um menu à parte.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import Badge from '@/components/ui/Badge';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getCashCurrent } from '@/services/cashService';
import { formatCurrency, formatDateTime } from '@/utils/format';

export default function CashStatusCard() {
  const router = useRouter();
  const brand = useBrandingColors();
  const { data } = useQuery({ queryKey: ['cash', 'current'], queryFn: getCashCurrent, refetchInterval: 30_000 });
  const s = data?.session ?? null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push('/cash' as any)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={s ? 'Caixa aberto: ver, colocar, retirar ou fechar' : 'Caixa fechado: abrir o caixa'}
    >
      <View style={[styles.icon, { backgroundColor: (s ? Colors.light.success : brand.primary) + '18' }]}>
        <Ionicons name="cash-outline" size={20} color={s ? Colors.light.success : brand.primary} />
      </View>
      <View style={styles.texts}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Caixa da gaveta</Text>
          <Badge label={s ? 'Aberto' : 'Fechado'} variant={s ? 'success' : 'neutral'} size="sm" />
        </View>
        <Text style={styles.note} numberOfLines={2}>
          {s
            ? `Deve ter ${formatCurrency(s.expected_amount)} na gaveta · aberto desde ${formatDateTime(s.opened_at)}`
            : data?.last_closed
              ? `Último fechamento: ${formatCurrency(data.last_closed.counted_amount)} contados. Toque para abrir o caixa do turno.`
              : 'Toque para abrir o caixa do turno.'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.light.card, borderRadius: 16,
    padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border,
  },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  note: { fontSize: theme.fontSize.sm, lineHeight: 17, color: Colors.light.textSecondary },
});
