/**
 * Lista dos preços de um produto com variações, agrupados por preço (do menor para o maior):
 * "R$ 189,90 · P Preto, M Preto" ... Aberta pelo atalho "Ver N preços" do PriceRange.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet from '@/components/ui/BottomSheet';
import { Money } from '@/components/ui/PriceDisplay';
import { Colors } from '@/constants/Colors';
import { formatVariantLabel } from '@/services/productVariantService';

interface VariantLike {
  id: number;
  price: number | string;
  size?: string | null;
  color?: string | null;
  current_stock?: number | null;
}

export function distinctPrices(variants: { price: number | string }[]): number[] {
  return Array.from(new Set(variants.map((v) => Math.round(Number(v.price) * 100)))).map((c) => c / 100).sort((a, b) => a - b);
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
  productName: string;
  variants: VariantLike[];
  color?: string;
}

export default function VariantPricesSheet({ visible, onDismiss, productName, variants, color }: Props) {
  const groups = useMemo(() => {
    const byPrice = new Map<number, VariantLike[]>();
    for (const v of variants) {
      const cents = Math.round(Number(v.price) * 100);
      byPrice.set(cents, [...(byPrice.get(cents) ?? []), v]);
    }
    return Array.from(byPrice.entries()).sort((a, b) => a[0] - b[0]).map(([c, vs]) => ({ price: c / 100, variants: vs }));
  }, [variants]);

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Preços por variação"
      subtitle={productName}
      icon="pricetags-outline"
      actions={[{ label: 'Fechar', onPress: onDismiss, variant: 'secondary' }]}
    >
      <View style={styles.list} testID="variant-prices-sheet">
        {groups.map((g) => (
          <View key={g.price} style={styles.row}>
            <View style={styles.priceCol}>
              <Money value={g.price} size={17} minSize={12} color={color} />
            </View>
            <View style={styles.chips}>
              {g.variants.map((v) => (
                <View key={v.id} style={styles.chip}>
                  <Text style={styles.chipText} numberOfLines={1}>
                    {formatVariantLabel(v) || 'Padrão'}
                    {typeof v.current_stock === 'number' ? <Text style={styles.chipStock}>  {v.current_stock} un</Text> : null}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 12, backgroundColor: Colors.light.backgroundSecondary },
  priceCol: { width: 104, paddingTop: 2 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: Colors.light.card, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '100%' },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.light.text },
  chipStock: { fontSize: 11, fontWeight: '500', color: Colors.light.textTertiary },
});
