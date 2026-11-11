/**
 * Brinde dentro da venda (só administrador e gerente; vendedor e caixa não veem nada disto).
 *
 * A peça escolhida sai do estoque pelo CUSTO (o servidor desconta pelo FIFO), aparece a R$ 0,00 no comprovante da cliente e
 * o custo vai para o controle de Brindes (linha "Brindes" do Resultado do Mês), nunca para o custo das peças vendidas.
 * Não mexe no total, no desconto nem nos pagamentos da venda. Peça sem estoque não entra.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/ui/AppButton';
import BottomSheet from '@/components/ui/BottomSheet';
import { ProductPickerList } from '@/components/products/ProductPicker';
import { Colors, theme } from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { useBrandingColors } from '@/store/brandingStore';
import { useCartStore } from '@/store/cartStore';
import { isManagerRole } from '@/utils/roles';
import type { ProductGrouped, ProductVariant } from '@/types';

export default function CartGifts({ dense }: { dense?: boolean }) {
  const { user } = useAuth();
  const brand = useBrandingColors();
  const gifts = useCartStore((s) => s.gifts);
  const addGift = useCartStore((s) => s.addGift);
  const setGiftQuantity = useCartStore((s) => s.setGiftQuantity);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  if (!isManagerRole(user?.role)) return null;

  const pick = (g: ProductGrouped, v?: ProductVariant) => {
    if (!v) { setError('Esta peça ainda não tem cor e tamanho cadastrados.'); setOpen(false); return; }
    const stock = Number(v.current_stock ?? 0);
    const already = gifts.find((x) => x.variant_id === v.id)?.quantity ?? 0;
    if (stock <= 0 || already + 1 > stock) {
      setError(`Sem estoque de ${g.name} para dar de brinde (tem ${stock}).`);
      setOpen(false);
      return;
    }
    setError('');
    addGift({
      variant_id: v.id, product_id: g.id, name: g.name,
      label: [v.color, v.size].filter(Boolean).join(' · ') || undefined, code: v.display_code || undefined, stock,
    });
    setOpen(false);
  };

  const plus = (variantId: number, quantity: number, stock?: number) => {
    if (stock != null && quantity + 1 > stock) { setError(`Só tem ${stock} em estoque desta peça.`); return; }
    setError('');
    setGiftQuantity(variantId, quantity + 1);
  };

  return (
    <View style={styles.wrap}>
      {gifts.map((g) => (
        <View key={g.variant_id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, dense && styles.nameDense]} numberOfLines={2}>Brinde · {g.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[g.label, g.code].filter(Boolean).join(' · ') || 'Sem cor e tamanho'} · R$ 0,00 para a cliente
            </Text>
          </View>
          <View style={styles.qtyBox}>
            <TouchableOpacity onPress={() => setGiftQuantity(g.variant_id, g.quantity - 1)} hitSlop={8}
              accessibilityLabel={g.quantity <= 1 ? 'Tirar o brinde' : 'Tirar uma do brinde'}>
              <Ionicons name={g.quantity <= 1 ? 'trash-outline' : 'remove-circle-outline'} size={24}
                color={g.quantity <= 1 ? Colors.light.error : brand.primary} />
            </TouchableOpacity>
            <Text style={styles.qty}>{g.quantity}</Text>
            <TouchableOpacity onPress={() => plus(g.variant_id, g.quantity, g.stock)} hitSlop={8} accessibilityLabel="Colocar mais uma no brinde">
              <Ionicons name="add-circle-outline" size={24} color={brand.primary} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <AppButton variant="text" size="sm" icon="gift-outline" label={gifts.length ? 'Dar outro brinde' : 'Dar brinde nesta venda'}
        onPress={() => { setError(''); setOpen(true); }} style={styles.link} />
      <BottomSheet visible={open} onDismiss={() => setOpen(false)} title="Escolher a peça do brinde" icon="gift-outline" tall>
        <ProductPickerList onPick={pick} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  name: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  nameDense: { fontSize: theme.fontSize.sm },
  meta: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  qty: { minWidth: 20, textAlign: 'center', fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  error: { fontSize: theme.fontSize.sm, color: Colors.light.error },
  link: { alignSelf: 'flex-start' },
});
