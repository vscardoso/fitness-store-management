/**
 * VariantKeepModal: escolhe quais variações do produto vão ser usadas.
 * As desmarcadas são desativadas (some da grade e das rupturas); só vale para variação sem estoque.
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import BottomSheet from '@/components/ui/BottomSheet';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatVariantLabel } from '@/services/productVariantService';

interface Props {
  visible: boolean;
  variants: any[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (idsToRemove: number[]) => void;
}

export default function VariantKeepModal({ visible, variants, busy, onClose, onConfirm }: Props) {
  const brandingColors = useBrandingColors();
  const [keep, setKeep] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (visible) setKeep(new Set(variants.map((v) => v.id)));
  }, [visible, variants]);

  const toggle = (id: number) =>
    setKeep((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const removing = variants.filter((v) => !keep.has(v.id));
  const canConfirm = keep.size > 0 && removing.length > 0 && !busy;

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onClose}
      title="Quais variações você vai usar?"
      subtitle="Desmarque as que não vai comprar"
      icon="checkbox-outline"
      actions={[
        { label: 'Cancelar', variant: 'secondary', onPress: onClose, disabled: busy },
        {
          label: busy ? 'Salvando...' : 'Manter as marcadas',
          icon: 'checkmark-circle-outline',
          onPress: () => onConfirm(removing.map((v) => v.id)),
          disabled: !canConfirm,
          loading: busy,
        },
      ]}
    >
      <Text style={styles.sub}>As desmarcadas saem da grade e deixam de contar como ruptura.</Text>

      <View style={styles.bulk}>
        <TouchableOpacity onPress={() => setKeep(new Set(variants.map((v) => v.id)))}>
          <Text style={[styles.bulkText, { color: brandingColors.primary }]}>Marcar todas</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setKeep(new Set())}>
          <Text style={[styles.bulkText, { color: brandingColors.primary }]}>Desmarcar todas</Text>
        </TouchableOpacity>
      </View>

      {variants.map((v) => {
        const checked = keep.has(v.id);
        return (
          <TouchableOpacity key={v.id} style={styles.row} onPress={() => toggle(v.id)} activeOpacity={0.7}>
            <Ionicons
              name={checked ? 'checkbox' : 'square-outline'}
              size={24}
              color={checked ? brandingColors.primary : Colors.light.textTertiary}
            />
            <Text style={styles.rowText}>{formatVariantLabel(v)}</Text>
          </TouchableOpacity>
        );
      })}

      <Text style={styles.summary}>
        {keep.size} {keep.size === 1 ? 'variação fica' : 'variações ficam'}
        {removing.length > 0 ? ` · ${removing.length} ${removing.length === 1 ? 'sai' : 'saem'}` : ''}
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 14, color: Colors.light.textSecondary, lineHeight: 20 },
  bulk: { flexDirection: 'row', gap: 18, marginTop: 12, marginBottom: 4 },
  bulkText: { fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowText: { fontSize: 15, color: Colors.light.text, fontWeight: '600' },
  summary: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 8 },
});
