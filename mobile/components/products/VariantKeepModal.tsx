/**
 * VariantKeepModal: escolhe quais variações do produto vão ser usadas.
 * As desmarcadas são desativadas (some da grade e das rupturas); só vale para variação sem estoque.
 */
import { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Quais variações você vai usar?</Text>
          <Text style={styles.sub}>
            Desmarque as que não vai comprar. Elas saem da grade e deixam de contar como ruptura.
          </Text>

          <View style={styles.bulk}>
            <TouchableOpacity onPress={() => setKeep(new Set(variants.map((v) => v.id)))}>
              <Text style={[styles.bulkText, { color: brandingColors.primary }]}>Marcar todas</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setKeep(new Set())}>
              <Text style={[styles.bulkText, { color: brandingColors.primary }]}>Desmarcar todas</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list}>
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
          </ScrollView>

          <Text style={styles.summary}>
            {keep.size} {keep.size === 1 ? 'variação fica' : 'variações ficam'}
            {removing.length > 0 ? ` · ${removing.length} ${removing.length === 1 ? 'sai' : 'saem'}` : ''}
          </Text>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancel} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirm, { backgroundColor: brandingColors.primary, opacity: canConfirm ? 1 : 0.4 }]}
              disabled={!canConfirm}
              onPress={() => onConfirm(removing.map((v) => v.id))}
            >
              <Text style={styles.confirmText}>{busy ? 'Salvando...' : 'Manter as marcadas'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 16 },
  sheet: { backgroundColor: Colors.light.card, borderRadius: 20, padding: 18, maxHeight: '85%' },
  title: { fontSize: 17, fontWeight: '800', color: Colors.light.text },
  sub: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 4, lineHeight: 17 },
  bulk: { flexDirection: 'row', gap: 18, marginTop: 12 },
  bulkText: { fontSize: 13, fontWeight: '700' },
  list: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowText: { fontSize: 14, color: Colors.light.text, fontWeight: '600' },
  summary: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 8 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancel: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: Colors.light.textSecondary, fontWeight: '700' },
  confirm: { flex: 1.4, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#fff', fontWeight: '700' },
});
