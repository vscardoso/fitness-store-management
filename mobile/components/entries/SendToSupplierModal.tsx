/** Devolve ao fornecedor peças deste item da entrada (ex.: compra em condicional que não vendeu). */
import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { createSupplierReturn } from '@/services/supplierReturnService';
import { parseApiError } from '@/utils/apiError';

interface Props {
  visible: boolean;
  entryItemId: number | null;
  productLabel: string;
  remaining: number;
  onClose: () => void;
}

export default function SendToSupplierModal({ visible, entryItemId, productLabel, remaining, onClose }: Props) {
  const brand = useBrandingColors();
  const qc = useQueryClient();
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('Compra em condicional: devolver ao fornecedor');
  const [error, setError] = useState('');

  const send = useMutation({
    mutationFn: () => createSupplierReturn({ entry_item_id: entryItemId!, quantity: parseInt(qty, 10), reason: reason.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-returns'] });
      qc.invalidateQueries({ queryKey: ['stock-entry'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setError('');
      onClose();
    },
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível enviar.'),
  });

  const submit = () => {
    const n = parseInt(qty, 10);
    if (!n || n < 1 || n > remaining) return setError(`Informe de 1 a ${remaining} peça(s).`);
    if (reason.trim().length < 3) return setError('Diga o motivo.');
    setError('');
    send.mutate();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Devolver ao fornecedor</Text>
          <Text style={styles.note}>
            {productLabel}. As peças saem do estoque até o fornecedor responder. Se ele recusar, elas voltam. Acompanhe em Fornecedores,
            aba Devoluções.
          </Text>
          <TextInput mode="outlined" label={`Quantas peças (até ${remaining})`} value={qty} onChangeText={(t) => setQty(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" style={styles.input} />
          <TextInput mode="outlined" label="Motivo" value={reason} onChangeText={setReason} style={styles.input} />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancel} onPress={onClose}>
              <Text style={{ color: Colors.light.text, fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.save, { backgroundColor: brand.primary }, send.isPending && { opacity: 0.6 }]}
              onPress={submit}
              disabled={send.isPending}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{send.isPending ? 'Enviando...' : 'Enviar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 18 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 6 },
  input: { marginTop: 12, backgroundColor: Colors.light.card },
  error: { color: Colors.light.error, marginTop: 10, fontSize: 13 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancel: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border },
  save: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
});
