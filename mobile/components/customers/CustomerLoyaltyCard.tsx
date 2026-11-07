/**
 * Fidelidade na ficha da cliente: saldo de pontos, quanto vale em reais, o que vence em breve e o extrato.
 * O administrador pode ajustar os pontos (brinde ou correção), com motivo, e fica registrado.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useAuthStore } from '@/store/authStore';
import { parseApiError } from '@/utils/apiError';
import { formatCurrency, formatDate } from '@/utils/format';
import { adjustCustomerLoyalty, getCustomerLoyalty } from '@/services/loyaltyService';

const pts = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(n % 1 === 0 ? 0 : 2).replace('.', ',')}`;

export default function CustomerLoyaltyCard({ customerId }: { customerId: number }) {
  const brand = useBrandingColors();
  const qc = useQueryClient();
  const isAdmin = String(useAuthStore((s) => s.user?.role) ?? '').toLowerCase() === 'admin';
  const [adjusting, setAdjusting] = useState(false);
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const { data } = useQuery({ queryKey: ['customer-loyalty', customerId], queryFn: () => getCustomerLoyalty(customerId) });
  const adjust = useMutation({
    mutationFn: () => adjustCustomerLoyalty(customerId, parseFloat(points.replace(',', '.')), note.trim()),
    onSuccess: () => {
      setAdjusting(false); setPoints(''); setNote(''); setError('');
      qc.invalidateQueries({ queryKey: ['customer-loyalty', customerId] });
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
    },
    onError: (e) => setError(parseApiError(e) || 'Não foi possível ajustar.'),
  });

  // loja sem programa e cliente sem histórico: nada para mostrar
  if (!data || (!data.enabled && data.entries.length === 0)) return null;
  const n = parseFloat(points.replace(',', '.'));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="star" size={18} color={Colors.light.warning} />
        <Text style={styles.title}>Fidelidade</Text>
        {!data.enabled && <Text style={styles.off}>programa desligado</Text>}
      </View>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text style={styles.label}>Saldo de pontos</Text>
          <Text style={[styles.value, { color: brand.primary }]}>{data.balance.toFixed(0)}</Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.label}>Vale em desconto</Text>
          <Text style={styles.value}>{formatCurrency(data.value)}</Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.label}>Vencem em 30 dias</Text>
          <Text style={[styles.value, data.expiring_soon > 0 && { color: Colors.light.warning }]}>{data.expiring_soon.toFixed(0)}</Text>
        </View>
      </View>
      {!!data.next_expiry && <Text style={styles.note}>Próximo vencimento: {formatDate(data.next_expiry)}</Text>}

      {data.entries.slice(0, 8).map((e) => (
        <View key={e.id} style={styles.entry}>
          <View style={{ flex: 1 }}>
            <Text style={styles.entryLabel}>{e.label}{e.note ? ` · ${e.note}` : ''}</Text>
            <Text style={styles.entryDate}>{e.created_at ? formatDate(e.created_at) : ''}{e.expires_at ? ` · vence ${formatDate(e.expires_at)}` : ''}</Text>
          </View>
          <Text style={[styles.entryPts, { color: e.points >= 0 ? Colors.light.success : Colors.light.error }]}>{pts(e.points)}</Text>
        </View>
      ))}

      {isAdmin && !adjusting && (
        <Button mode="outlined" onPress={() => setAdjusting(true)} style={{ marginTop: 10 }}>Ajustar pontos</Button>
      )}
      {isAdmin && adjusting && (
        <View style={{ marginTop: 10, gap: 8 }}>
          <TextInput mode="outlined" label="Pontos (negativo tira)" value={points} onChangeText={(t) => setPoints(t.replace(/[^0-9,.\-]/g, ''))} keyboardType="numeric" />
          <TextInput mode="outlined" label="Motivo (aparece no extrato)" value={note} onChangeText={setNote} />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button mode="outlined" onPress={() => { setAdjusting(false); setError(''); }} style={{ flex: 1 }}>Cancelar</Button>
            <Button
              mode="contained" buttonColor={brand.primary} style={{ flex: 1 }} loading={adjust.isPending}
              disabled={adjust.isPending || !Number.isFinite(n) || n === 0 || note.trim().length < 3}
              onPress={() => adjust.mutate()}
            >
              Ajustar
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text, flex: 1 },
  off: { fontSize: 12, color: Colors.light.textSecondary },
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1 },
  label: { fontSize: 12, color: Colors.light.textSecondary },
  value: { fontSize: 20, fontWeight: '800', color: Colors.light.text },
  note: { fontSize: 12, color: Colors.light.textSecondary },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 },
  entryLabel: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  entryDate: { fontSize: 11, color: Colors.light.textSecondary },
  entryPts: { fontSize: 14, fontWeight: '800' },
  error: { color: Colors.light.error, fontSize: 13 },
});
