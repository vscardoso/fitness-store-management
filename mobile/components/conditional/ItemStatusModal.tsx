/**
 * ItemStatusModal - Modal para marcar itens como danificados ou perdidos
 * 
 * UX Melhorada:
 * - Design visual claro com ícones e cores distintas
 * - Feedback visual do impacto financeiro
 * - Validação em tempo real
 * - Animações suaves
 */
import React, { useState, useMemo } from 'react';
import { StyleSheet, View, Text, Animated } from 'react-native';
import { TextInput, IconButton, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import CustomModal from '@/components/ui/CustomModal';
import ModalActions from '@/components/ui/ModalActions';
import { Colors } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';

interface ItemStatusModalProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (quantity: number) => void;
  type: 'damaged' | 'lost';
  itemName: string;
  maxQuantity: number;
  unitPrice: number;
  loading?: boolean;
}

export default function ItemStatusModal({
  visible,
  onDismiss,
  onConfirm,
  type,
  itemName,
  maxQuantity,
  unitPrice,
  loading = false,
}: ItemStatusModalProps) {
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const numericQuantity = parseInt(quantity) || 0;
  const isValid = numericQuantity > 0 && numericQuantity <= maxQuantity;
  const totalValue = numericQuantity * unitPrice;

  const config = useMemo(() => {
    if (type === 'damaged') {
      return {
        title: 'Marcar como Danificado',
        subtitle: 'Item com defeito ou avaria',
        icon: 'alert-circle' as const,
        iconColor: Colors.light.warning,
        iconBg: Colors.light.warning + '20',
        confirmColor: Colors.light.warning,
        description: 'O item será marcado como danificado e não retornará ao estoque disponível.',
      };
    }
    return {
      title: 'Marcar como Perdido',
      subtitle: 'Item extraviado ou não devolvido',
      icon: 'close-circle' as const,
      iconColor: Colors.light.error,
      iconBg: Colors.light.error + '20',
      confirmColor: Colors.light.error,
      description: 'O item será marcado como perdido e não retornará ao estoque.',
    };
  }, [type]);

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(numericQuantity);
    setQuantity('');
    setNotes('');
  };

  const handleDismiss = () => {
    setQuantity('');
    setNotes('');
    onDismiss();
  };

  return (
    <CustomModal
      visible={visible}
      onDismiss={handleDismiss}
      title={config.title}
      subtitle={config.subtitle}
    >
      {/* Header Visual */}
      <View style={[styles.headerIcon, { backgroundColor: config.iconBg }]}>
        <Ionicons name={config.icon} size={48} color={config.iconColor} />
      </View>

      {/* Info do Item */}
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>{itemName}</Text>
        <Text style={styles.itemPrice}>{formatCurrency(unitPrice)} cada</Text>
      </View>

      {/* Descrição */}
      <View style={styles.descriptionBox}>
        <Ionicons name="information-circle-outline" size={18} color={Colors.light.textSecondary} />
        <Text style={styles.descriptionText}>{config.description}</Text>
      </View>

      {/* Campo Quantidade */}
      <View style={styles.fieldContainer}>
        <View style={styles.fieldHeader}>
          <Ionicons name="cube-outline" size={18} color={Colors.light.textSecondary} />
          <Text style={styles.fieldLabel}>Quantidade</Text>
          <Text style={styles.fieldMax}>Máx: {maxQuantity}</Text>
        </View>
        
        <View style={styles.quantityRow}>
          <IconButton
            icon="minus"
            size={24}
            mode="contained"
            containerColor={Colors.light.backgroundSecondary}
            iconColor={numericQuantity <= 0 ? '#ccc' : Colors.light.error}
            onPress={() => setQuantity(Math.max(0, numericQuantity - 1).toString())}
            disabled={numericQuantity <= 0}
          />
          
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
            mode="outlined"
            style={styles.quantityInput}
            placeholder="0"
            textAlign="center"
            outlineColor={isValid || !quantity ? Colors.light.border : Colors.light.error}
            activeOutlineColor={config.confirmColor}
          />
          
          <IconButton
            icon="plus"
            size={24}
            mode="contained"
            containerColor={Colors.light.backgroundSecondary}
            iconColor={numericQuantity >= maxQuantity ? '#ccc' : Colors.light.success}
            onPress={() => setQuantity(Math.min(maxQuantity, numericQuantity + 1).toString())}
            disabled={numericQuantity >= maxQuantity}
          />
        </View>

        {/* Erro de validação */}
        {quantity && !isValid && (
          <Text style={styles.errorText}>
            Quantidade deve ser entre 1 e {maxQuantity}
          </Text>
        )}
      </View>

      {/* Impacto Financeiro */}
      {isValid && (
        <View style={[styles.impactCard, { borderLeftColor: config.confirmColor }]}>
          <View style={styles.impactHeader}>
            <Ionicons name="calculator-outline" size={18} color={config.confirmColor} />
            <Text style={styles.impactTitle}>Impacto Financeiro</Text>
          </View>
          <View style={styles.impactRow}>
            <Text style={styles.impactLabel}>
              {numericQuantity} × {formatCurrency(unitPrice)}
            </Text>
            <Text style={[styles.impactValue, { color: config.confirmColor }]}>
              {formatCurrency(totalValue)}
            </Text>
          </View>
          <Text style={styles.impactNote}>
            Este valor não será reembolsado ao cliente
          </Text>
        </View>
      )}

      {/* Observações */}
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
          numberOfLines={2}
          style={styles.notesInput}
          placeholder="Descreva o motivo ou detalhes..."
          outlineColor={Colors.light.border}
          activeOutlineColor={config.confirmColor}
        />
      </View>

      <ModalActions
        onCancel={handleDismiss}
        onConfirm={handleConfirm}
        confirmText="Confirmar"
        cancelText="Cancelar"
        confirmColor={config.confirmColor}
        loading={loading}
        disabled={!isValid}
      />
    </CustomModal>
  );
}

const styles = StyleSheet.create({
  // Header Icon
  headerIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },

  // Item Info
  itemInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },

  // Description Box
  descriptionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  descriptionText: {
    flex: 1,
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
  fieldMax: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '500',
    marginLeft: 'auto',
  },
  fieldOptional: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },

  // Quantity Row
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quantityInput: {
    width: 100,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
  },

  // Error Text
  errorText: {
    fontSize: 12,
    color: Colors.light.error,
    textAlign: 'center',
    marginTop: 8,
  },

  // Impact Card
  impactCard: {
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
  },
  impactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  impactTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
  },
  impactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  impactLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  impactValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  impactNote: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Notes Input
  notesInput: {
    backgroundColor: '#fff',
  },
});