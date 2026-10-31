/** Escolher as etiquetas de uma conversa (marca e desmarca; salva tudo de uma vez). */
import { useEffect, useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import BottomSheet from '@/components/ui/BottomSheet';
import LabelChip from './LabelChip';
import { useChatColors } from '@/hooks/useThemeColors';
import type { WaLabel } from '@/services/whatsappService';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  all: WaLabel[];
  selectedIds: number[];
  saving?: boolean;
  error?: string | null;
  onSave: (ids: number[]) => void;
}

export default function LabelPicker({ visible, onDismiss, all, selectedIds, saving, error, onSave }: Props) {
  const c = useChatColors();
  const [ids, setIds] = useState<number[]>(selectedIds);
  useEffect(() => { if (visible) setIds(selectedIds); }, [visible, selectedIds]);
  const toggle = (id: number) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Etiquetas da conversa"
      subtitle="Só aparecem para a equipe, a cliente não vê"
      icon="pricetags-outline"
      actions={[{ label: 'Salvar', onPress: () => onSave(ids), loading: saving, disabled: saving }]}
    >
      <View style={styles.body}>
        {all.length === 0 ? (
          <Text style={{ color: c.textMuted, fontSize: 14 }}>
            Ainda não há etiquetas. Quem administra a loja cria em Mais, WhatsApp, Etiquetas.
          </Text>
        ) : (
          <View style={styles.wrap}>
            {all.map((l) => <LabelChip key={l.id} name={l.name} colorKey={l.color_key} selected={ids.includes(l.id)} onPress={() => toggle(l.id)} />)}
          </View>
        )}
        {!!error && <Text style={{ color: c.danger, fontSize: 13 }}>{error}</Text>}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10, paddingVertical: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
