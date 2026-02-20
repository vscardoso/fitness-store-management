/**
 * MarkAsSentModal - Modal para marcar envio como enviado
 * Coleta informações de transportadora e rastreio
 * 
 * UX Melhorada:
 * - Header visual com ícone
 * - Campos organizados com ícones
 * - Dicas contextuais
 * - Validação visual
 */
import React, { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { TextInput, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
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
      subtitle="O prazo de devolução será iniciado"
    >
      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <View style={styles.infoBannerIcon}>
          <Ionicons name="information-circle" size={24} color={Colors.light.primary} />
        </View>
        <View style={styles.infoBannerContent}>
          <Text style={styles.infoBannerTitle}>O que acontece agora?</Text>
          <Text style={styles.infoBannerText}>
            Ao marcar como enviado, o cliente terá o prazo configurado para devolver os produtos não adquiridos.
          </Text>
        </View>
      </View>

      {/* Campo Transportadora */}
      <View style={styles.fieldContainer}>
        <View style={styles.fieldHeader}>
          <Ionicons name="bus-outline" size={18} color={Colors.light.textSecondary} />
          <Text style={styles.fieldLabel}>Transportadora</Text>
          <Text style={styles.fieldOptional}>(opcional)</Text>
        </View>
        <TextInput
          value={carrier}
          onChangeText={setCarrier}
          mode="outlined"
          style={styles.input}
          placeholder="Ex: Correios, Jadlog, Transportadora X..."
          outlineColor={Colors.light.border}
          activeOutlineColor={Colors.light.primary}
          left={<TextInput.Icon icon="truck" />}
        />
      </View>

      {/* Campo Código de Rastreio */}
      <View style={styles.fieldContainer}>
        <View style={styles.fieldHeader}>
          <Ionicons name="barcode-outline" size={18} color={Colors.light.textSecondary} />
          <Text style={styles.fieldLabel}>Código de Rastreio</Text>
          <Text style={styles.fieldOptional}>(opcional)</Text>
        </View>
        <TextInput
          value={trackingCode}
          onChangeText={setTrackingCode}
          mode="outlined"
          style={styles.input}
          placeholder="Ex: BR123456789BR"
          outlineColor={Colors.light.border}
          activeOutlineColor={Colors.light.primary}
          autoCapitalize="characters"
          left={<TextInput.Icon icon="barcode" />}
        />
        <Text style={styles.fieldHint}>
          O cliente poderá acompanhar a entrega com este código
        </Text>
      </View>

      {/* Campo Observações */}
      <View style={styles.fieldContainer}>
        <View style={styles.fieldHeader}>
          <Ionicons name="document-text-outline" size={18} color={Colors.light.textSecondary} />
          <Text style={styles.fieldLabel}>Observações</Text>
          <Text style={styles.fieldOptional}>(opcional)</Text>
        </View>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          mode="outlined"
          multiline
          numberOfLines={3}
          style={styles.input}
          placeholder="Informações adicionais sobre o envio..."
          outlineColor={Colors.light.border}
          activeOutlineColor={Colors.light.primary}
        />
      </View>

      <ModalActions
        onCancel={handleCancel}
        onConfirm={handleConfirm}
        confirmText="Confirmar Envio"
        cancelText="Cancelar"
        confirmColor={Colors.light.primary}
        loading={loading}
      />
    </CustomModal>
  );
}

const styles = StyleSheet.create({
  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: Colors.light.primary + '12',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  infoBannerIcon: {
    marginTop: 2,
  },
  infoBannerContent: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 4,
  },
  infoBannerText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },

  // Field Container
  fieldContainer: {
    marginBottom: 16,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  fieldOptional: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: '400',
  },
  fieldHint: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 4,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#fff',
  },
});