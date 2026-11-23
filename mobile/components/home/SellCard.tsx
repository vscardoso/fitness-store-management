/**
 * Início: a ação principal da tela. "Nova venda" é o que mais se faz no balcão, então é o único cartão grande;
 * o resultado do dia vem dentro dele (quem só vende não precisa de outro bloco para saber como o dia está).
 * Sem venda hoje, o texto vira convite em vez de um zero solto.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, theme } from '@/constants/Colors';
import { formatCurrency, formatPercent, formatSignedPercent } from '@/utils/format';
import { todayLine, todaySub } from '@/utils/homeLogic';

interface Props {
  /** Cores da loja (gradiente do cartão). */
  gradient: [string, string];
  /** Só gerente e admin recebem o resumo do dia; para os outros o cartão só abre o ponto de venda. */
  showToday: boolean;
  totalToday: number;
  countToday: number;
  /** Lucro e margem do dia (só quando há venda). */
  profitToday?: number;
  marginToday?: number;
  /** Vendido e devolvido hoje (antes de descontar), para o dia com devolução não parecer uma venda negativa. */
  grossToday?: number;
  refundsToday?: number;
  /** Variação contra ontem, em %. */
  trendPercent?: number;
  onPress: () => void;
}

export default function SellCard({ gradient, showToday, totalToday, countToday, profitToday = 0, marginToday = 0, grossToday, refundsToday = 0, trendPercent = 0, onPress }: Props) {
  const sub = todaySub(
    { net: totalToday, refunds: refundsToday, profit: profitToday, margin: marginToday, count: countToday, trend: trendPercent },
    formatCurrency, (v) => formatPercent(v, 1), formatSignedPercent,
  );
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} accessibilityRole="button" accessibilityLabel="Nova venda" testID="home-sell-card">
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="cart" size={26} color={Colors.light.white} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>Nova venda</Text>
          <Text style={styles.line} numberOfLines={2} testID="home-today-line">
            {showToday ? todayLine(totalToday, countToday, formatCurrency, grossToday, refundsToday) : 'Abrir o ponto de venda'}
          </Text>
          {showToday && !!sub && (
            <Text style={styles.sub} numberOfLines={2} testID="home-today-profit">{sub}</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={24} color={Colors.light.white} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: theme.borderRadius.xl, paddingVertical: 18, paddingHorizontal: 18 },
  icon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: Colors.light.white, fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold },
  line: { color: Colors.light.white, fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.semibold },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: theme.fontSize.sm },
});
