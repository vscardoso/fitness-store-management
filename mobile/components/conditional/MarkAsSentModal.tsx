/**
 * MarkAsSentModal - Modal for marking shipment as sent
 * Collects carrier and tracking information
 */
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { TextInput } from 'react-native-paper';
import CustomModal from '@/components/ui/CustomModal';
import ModalActions from '@/components/ui/ModalActions';
import { Colors } from '@/constants/Colors';

interface MarkAsSentModalProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (data: { carrier?: string; tracking_code?: string; sent_notes?: string }) => void;
  loading?: boolean;
}

export default function MarkAsSentModal({
  visible,
  onDismiss,
  onConfirm,
  loading = false,
}: MarkAsSentModalProps) {
  const [carrier, setCarrier] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    onConfirm({
      carrier: carrier.trim() || undefined,
      tracking_code: trackingCode.trim() || undefined,
      sent_notes: notes.trim() || undefined,
    });

    // Reset form
    setCarrier('');
    setTrackingCode('');
    setNotes('');
  };

  const handleCancel = () => {
    setCarrier('');
    setTrackingCode('');
    setNotes('');
    onDismiss();
  };

  return (
    <CustomModal
      visible={visible}
      onDismiss={handleCancel}
      title="Marcar como Enviado"
      subtitle="Informe os dados do envio (opcional)"
    >
      <TextInput
        label="Transportadora"
        value={carrier}
        onChangeText={setCarrier}
        mode="outlined"
        style={styles.input}
        placeholder="Ex: Correios, Jadlog..."
      />

      <TextInput
        label="Código de Rastreio"
        value={trackingCode}
        onChangeText={setTrackingCode}
        mode="outlined"
        style={styles.input}
        placeholder="Ex: BR123456789BR"
      />

      <TextInput
        label="Observações"
        value={notes}
        onChangeText={setNotes}
        mode="outlined"
        multiline
        numberOfLines={3}
        style={styles.input}
        placeholder="Informações adicionais..."
      />

      <ModalActions
        onCancel={handleCancel}
        onConfirm={handleConfirm}
        confirmText="Marcar como Enviado"
        cancelText="Cancelar"
        confirmColor={Colors.light.primary}
        loading={loading}
      />
    </CustomModal>
  );
}

const styles = StyleSheet.create({
  input: {
    marginBottom: 16,
  },
});
