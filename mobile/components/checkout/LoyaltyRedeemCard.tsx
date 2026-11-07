/**
 * Pagar parte da compra com pontos (cashback) no checkout: mostra o saldo da cliente e quanto ela pode usar.
 * O valor escolhido vira desconto no total; o servidor tira os pontos (primeiro os que vencem antes) ao fechar a venda.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';

import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency } from '@/utils/format';
import { getCustomerLoyalty, getLoyaltySettings } from '@/services/loyaltyService';

interface Props {
  customerId: number;
  customerName?: string;
  /** Quanto ainda há para pagar na compra, antes dos pontos (R$) */
  payable: number;
  /** Quanto está sendo pago com pontos agora (R$) */
  value: number;
  onChange: (amount: number) => void;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export default function LoyaltyRedeemCard({ customerId, customerName, payable, value, onChange }: Props) {
  const brand = useBrandingColors();
  const [typed, setTyped] = useState('');
  const settings = useQuery({ queryKey: ['loyalty-settings'], queryFn: getLoyaltySettings, staleTime: 60_000 });
  const loyalty = useQuery({ queryKey: ['customer-loyalty', customerId], queryFn: () => getCustomerLoyalty(customerId), staleTime: 10_000 });

  const s = settings.data;
  const l = loyalty.data;
  const max = s && l ? cents(Math.min(l.value, payable)) : 0;

  // se o total mudou e o valor passou do que dá para usar, ajusta
  useEffect(() => {
    if (value > 0 && value > max + 0.004) onChange(max);
  }, [max, value, onChange]);

  if (!s?.enabled || !l || l.balance <= 0 || s.point_value <= 0) return null;
  const pointsOf = (amount: number) => (s.point_value > 0 ? amount / s.point_value : 0);
  const belowMin = s.min_redeem > 0 && l.balance < s.min_redeem;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="star" size={18} color={Colors.light.warning} />
        <Text style={styles.title}>Pontos de {customerName || 'a cliente'}</Text>
      </View>
      <Text style={styles.note}>
        {l.balance.toFixed(0)} pontos valem {formatCurrency(l.value)} de desconto.
        {l.expiring_soon > 0 ? ` ${l.expiring_soon.toFixed(0)} vencem em 30 dias.` : ''}
      </Text>

      {belowMin ? (
        <Text style={styles.warn}>A loja só aceita usar a partir de {s.min_redeem.toFixed(0)} pontos.</Text>
      ) : value > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={[styles.using, { color: brand.primary }]}>
            Usando {formatCurrency(value)} em pontos ({pointsOf(value).toFixed(0)} pontos)
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              mode="outlined" dense label="Outro valor (R$)" value={typed} keyboardType="decimal-pad" style={{ flex: 1 }}
              onChangeText={(t) => {
                setTyped(t.replace(/[^0-9,.]/g, ''));
                const n = parseFloat(t.replace(',', '.'));
                if (Number.isFinite(n) && n >= 0) onChange(cents(Math.min(n, max)));
              }}
            />
            <Button mode="outlined" onPress={() => { setTyped(''); onChange(0); }}>Remover</Button>
          </View>
          {s.min_redeem > 0 && pointsOf(value) < s.min_redeem && (
            <Text style={styles.warn}>Pontos abaixo do mínimo da loja ({s.min_redeem.toFixed(0)}): a venda será recusada.</Text>
          )}
        </View>
      ) : (
        <Button mode="contained" buttonColor={brand.primary} onPress={() => onChange(max)} disabled={max <= 0}>
          Usar {formatCurrency(max)} em pontos
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  note: { fontSize: 13, color: Colors.light.textSecondary },
  using: { fontSize: 14, fontWeight: '700' },
  warn: { fontSize: 13, color: Colors.light.warning, fontWeight: '600' },
});
