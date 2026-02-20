/**
 * Componente para seleção de variante na tela de venda
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Chip, Button, Card } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { formatVariantLabel } from '@/services/productVariantService';
import type { ProductVariant, VariantGrid } from '@/types/productVariant';

interface VariantPickerProps {
  visible: boolean;
  variants: ProductVariant[];
  grid?: VariantGrid;
  onSelect: (variant: ProductVariant) => void;
  onClose: () => void;
  title?: string;
}

export function VariantPicker({
  visible,
  variants,
  grid,
  onSelect,
  onClose,
  title = 'Selecionar Variação',
}: VariantPickerProps) {
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  
  // Reset ao abrir
  useEffect(() => {
    if (visible) {
      setSelectedColor(null);
      setSelectedSize(null);
    }
  }, [visible]);
  
  // Cores e tamanhos disponíveis
  const colors = grid?.available_colors || [...new Set(variants.map(v => v.color).filter(Boolean))];
  const sizes = grid?.available_sizes || [...new Set(variants.map(v => v.size).filter(Boolean))];
  
  // Variantes filtradas
  const filteredVariants = variants.filter(v => {
    if (selectedColor && v.color !== selectedColor) return false;
    if (selectedSize && v.size !== selectedSize) return false;
    return true;
  });
  
  // Variante selecionada (quando ambos cor e tamanho estão selecionados)
  const selectedVariant = filteredVariants.length === 1 ? filteredVariants[0] : null;
  
  // Estoque da variante selecionada
  const stock = selectedVariant?.current_stock ?? 0;
  const hasStock = stock > 0;
  
  const handleConfirm = () => {
    if (selectedVariant && hasStock) {
      onSelect(selectedVariant);
      onClose();
    }
  };
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.light.text} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Seleção de Cor */}
            {colors.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Cor</Text>
                <View style={styles.optionsRow}>
                  {colors.map(color => {
                    const isSelected = selectedColor === color;
                    const hasVariantsWithColor = variants.some(
                      v => v.color === color && (!selectedSize || v.size === selectedSize)
                    );
                    
                    return (
                      <Chip
                        key={color}
                        selected={isSelected}
                        onPress={() => setSelectedColor(isSelected ? null : color)}
                        style={[
                          styles.optionChip,
                          isSelected && styles.optionChipSelected,
                          !hasVariantsWithColor && styles.optionChipDisabled,
                        ]}
                        textStyle={[
                          styles.optionChipText,
                          isSelected && styles.optionChipTextSelected,
                        ]}
                        disabled={!hasVariantsWithColor}
                      >
                        {color}
                      </Chip>
                    );
                  })}
                </View>
              </View>
            )}
            
            {/* Seleção de Tamanho */}
            {sizes.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Tamanho</Text>
                <View style={styles.optionsRow}>
                  {sizes.map(size => {
                    const isSelected = selectedSize === size;
                    const hasVariantsWithSize = variants.some(
                      v => v.size === size && (!selectedColor || v.color === selectedColor)
                    );
                    
                    return (
                      <Chip
                        key={size}
                        selected={isSelected}
                        onPress={() => setSelectedSize(isSelected ? null : size)}
                        style={[
                          styles.optionChip,
                          isSelected && styles.optionChipSelected,
                          !hasVariantsWithSize && styles.optionChipDisabled,
                        ]}
                        textStyle={[
                          styles.optionChipText,
                          isSelected && styles.optionChipTextSelected,
                        ]}
                        disabled={!hasVariantsWithSize}
                      >
                        {size}
                      </Chip>
                    );
                  })}
                </View>
              </View>
            )}
            
            {/* Info da variante selecionada */}
            {selectedVariant && (
              <Card style={[styles.selectedCard, !hasStock && styles.selectedCardNoStock]}>
                <View style={styles.selectedInfo}>
                  <View style={styles.selectedHeader}>
                    <Text style={styles.selectedLabel}>Selecionado:</Text>
                    <Text style={styles.selectedVariant}>
                      {formatVariantLabel(selectedVariant)}
                    </Text>
                  </View>
                  
                  <View style={styles.selectedDetails}>
                    <View style={styles.selectedDetail}>
                      <Text style={styles.selectedDetailLabel}>SKU:</Text>
                      <Text style={styles.selectedDetailValue}>{selectedVariant.sku}</Text>
                    </View>
                    
                    <View style={styles.selectedDetail}>
                      <Text style={styles.selectedDetailLabel}>Preço:</Text>
                      <Text style={styles.selectedDetailValue}>
                        R$ {Number(selectedVariant.price).toFixed(2)}
                      </Text>
                    </View>
                    
                    <View style={styles.selectedDetail}>
                      <Text style={styles.selectedDetailLabel}>Estoque:</Text>
                      <Text style={[
                        styles.selectedDetailValue,
                        !hasStock && styles.noStockText,
                      ]}>
                        {stock} unidades
                      </Text>
                    </View>
                  </View>
                  
                  {!hasStock && (
                    <View style={styles.noStockWarning}>
                      <Ionicons name="alert-circle" size={16} color={Colors.light.error} />
                      <Text style={styles.noStockWarningText}>
                        Produto sem estoque
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            )}
          </ScrollView>
          
          {/* Footer */}
          <View style={styles.footer}>
            <Button
              mode="outlined"
              onPress={onClose}
              style={styles.footerButton}
            >
              Cancelar
            </Button>
            <Button
              mode="contained"
              onPress={handleConfirm}
              style={styles.footerButton}
              disabled={!selectedVariant || !hasStock}
            >
              Confirmar
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface VariantBadgeProps {
  variant: ProductVariant | null;
  onPress?: () => void;
  compact?: boolean;
}

export function VariantBadge({ variant, onPress, compact = false }: VariantBadgeProps) {
  if (!variant) {
    return null;
  }
  
  const label = formatVariantLabel(variant);
  
  if (compact) {
    return (
      <TouchableOpacity onPress={onPress} disabled={!onPress}>
        <Text style={styles.compactBadge}>{label}</Text>
      </TouchableOpacity>
    );
  }
  
  return (
    <TouchableOpacity
      style={styles.badge}
      onPress={onPress}
      disabled={!onPress}
    >
      <Ionicons name="layers-outline" size={14} color={Colors.light.primary} />
      <Text style={styles.badgeText}>{label}</Text>
      {onPress && (
        <Ionicons name="chevron-down" size={14} color={Colors.light.primary} />
      )}
    </TouchableOpacity>
  );
}

const { height } = Dimensions.get('window');

const styles = StyleSheet.create({
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.7,
  },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
  },
  
  closeButton: {
    padding: 4,
  },
  
  body: {
    padding: theme.spacing.md,
    maxHeight: height * 0.5,
  },
  
  // Sections
  section: {
    marginBottom: theme.spacing.lg,
  },
  
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  
  optionChip: {
    backgroundColor: Colors.light.backgroundSecondary,
    minWidth: 50,
  },
  
  optionChipSelected: {
    backgroundColor: Colors.light.primary,
  },
  
  optionChipDisabled: {
    opacity: 0.4,
  },
  
  optionChipText: {
    color: Colors.light.text,
  },
  
  optionChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  
  // Selected Card
  selectedCard: {
    marginTop: theme.spacing.md,
    backgroundColor: Colors.light.primary + '10',
    borderWidth: 1,
    borderColor: Colors.light.primary + '30',
  },
  
  selectedCardNoStock: {
    backgroundColor: Colors.light.error + '10',
    borderColor: Colors.light.error + '30',
  },
  
  selectedInfo: {
    padding: theme.spacing.md,
  },
  
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  
  selectedLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginRight: 8,
  },
  
  selectedVariant: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  
  selectedDetails: {
    gap: 4,
  },
  
  selectedDetail: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  selectedDetailLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    width: 60,
  },
  
  selectedDetailValue: {
    fontSize: 13,
    color: Colors.light.text,
    fontWeight: '500',
  },
  
  noStockText: {
    color: Colors.light.error,
  },
  
  noStockWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.error + '30',
  },
  
  noStockWarningText: {
    fontSize: 13,
    color: Colors.light.error,
    fontWeight: '500',
  },
  
  // Footer
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  
  footerButton: {
    flex: 1,
  },
  
  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  
  badgeText: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  
  compactBadge: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
});

export default VariantPicker;