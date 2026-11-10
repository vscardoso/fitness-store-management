/**
 * Cartão do caixa da gaveta dentro do Financeiro: aberto (quanto deve ter na gaveta) ou fechado, com o botão que
 * leva à tela do caixa (abrir, colocar, retirar, fechar). O caixa faz parte do Financeiro, não é um menu à parte.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { Colors } from '@/constants/Colors';
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
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: (s ? Colors.light.success : brand.primary) + '18' }]}>
          <Ionicons name="cash-outline" size={20} color={s ? Colors.light.success : brand.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Caixa da gaveta</Text>
          <Text style={[styles.status, { color: s ? Colors.light.success : Colors.light.textSecondary }]}>
            {s ? `Aberto desde ${formatDateTime(s.opened_at)}` : 'Fechado'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
      </View>
      {s ? (
        <Text style={styles.note}>
          Deve ter <Text style={styles.strong}>{formatCurrency(s.expected_amount)}</Text> na gaveta. Toque para colocar, retirar ou fechar.
        </Text>
      ) : (
        <Text style={styles.note}>
          {data?.last_closed
            ? `Último fechamento: ${formatCurrency(data.last_closed.counted_amount)} contados. Toque para abrir o caixa do turno.`
            : 'Toque para abrir o caixa do turno com o dinheiro que está na gaveta.'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  status: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  strong: { fontWeight: '800', color: Colors.light.text },
});
