/** Devolve ao fornecedor peças deste item da entrada (ex.: compra em condicional que não vendeu). */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import BottomSheet from '@/components/ui/BottomSheet';
import { Colors, theme } from '@/constants/Colors';
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
  const qc = useQueryClient();
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('Compra em condicional: devolver ao fornecedor');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setQty('1');
      setReason('Compra em condicional: devolver ao fornecedor');
      setError('');
    }
  }, [visible]);

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
    <BottomSheet
      visible={visible}
      onDismiss={onClose}
      title="Devolver ao fornecedor"
      subtitle={productLabel}
      icon="return-down-back-outline"
      dismissOnBackdrop={!send.isPending}
      actions={[
        { label: 'Cancelar', onPress: onClose, variant: 'secondary', disabled: send.isPending },
        { label: 'Enviar', onPress: submit, variant: 'primary', loading: send.isPending, disabled: send.isPending },
      ]}
    >
      <Text style={styles.note}>
        As peças saem do estoque até o fornecedor responder. Se ele recusar, elas voltam. Acompanhe em Fornecedores, aba Devoluções.
      </Text>
      <TextInput
        mode="outlined"
        label={`Quantas peças (até ${remaining})`}
        value={qty}
        onChangeText={(t) => setQty(t.replace(/[^0-9]/g, ''))}
        keyboardType="numeric"
        style={styles.input}
      />
      <TextInput mode="outlined" label="Motivo" value={reason} onChangeText={setReason} style={styles.input} />
      {!!error && <Text style={styles.error}>{error}</Text>}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  input: { marginTop: theme.spacing.md, backgroundColor: Colors.light.card },
  error: { color: Colors.light.error, marginTop: theme.spacing.md, fontSize: 13 },
});
