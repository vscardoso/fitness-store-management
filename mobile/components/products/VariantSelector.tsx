/**
 * Componente para seleção de variantes (tamanho/cor)
 */

import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
} from 'react-native';
import { Chip, TextInput, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import {
  DEFAULT_SIZES,
  DEFAULT_COLORS,
  type SizeOption,
  type ColorOption,
} from '@/types/productVariant';

interface VariantSelectorProps {
  // Seleção atual
  selectedSizes: string[];
  selectedColors: string[];
  
  // Callbacks
  onSizesChange: (sizes: string[]) => void;
  onColorsChange: (colors: string[]) => void;
  
  // Opções customizadas
  sizeOptions?: SizeOption[];
  colorOptions?: ColorOption[];
  
  // Permissões
  allowCustomSize?: boolean;
  allowCustomColor?: boolean;
  
  // Estado
  disabled?: boolean;
}

export function VariantSelector({
  selectedSizes,
  selectedColors,
  onSizesChange,
  onColorsChange,
  sizeOptions = DEFAULT_SIZES,
  colorOptions = DEFAULT_COLORS,
  allowCustomSize = true,
  allowCustomColor = true,
  disabled = false,
}: VariantSelectorProps) {
  const toggleSize = (size: string) => {
    if (disabled) return;
    
    if (selectedSizes.includes(size)) {
      onSizesChange(selectedSizes.filter(s => s !== size));
    } else {
      onSizesChange([...selectedSizes, size]);
    }
  };
  
  const toggleColor = (color: string) => {
    if (disabled) return;
    
    if (selectedColors.includes(color)) {
      onColorsChange(selectedColors.filter(c => c !== color));
    } else {
      onColorsChange([...selectedColors, color]);
    }
  };
  
  const selectAllSizes = () => {
    if (disabled) return;
    onSizesChange(sizeOptions.map(s => s.value));
  };
  
  const clearSizes = () => {
    if (disabled) return;
    onSizesChange([]);
  };
  
  const selectAllColors = () => {
    if (disabled) return;
    onColorsChange(colorOptions.map(c => c.value));
  };
  
  const clearColors = () => {
    if (disabled) return;
    onColorsChange([]);
  };
  
  const variantCount = useMemo(() => {
    const sizes = selectedSizes.length || 1;
    const colors = selectedColors.length || 1;
    return sizes * colors;
  }, [selectedSizes, selectedColors]);
  
  return (
    <View style={styles.container}>
      {/* Tamanhos */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tamanhos</Text>
          <View style={styles.sectionActions}>
            <TouchableOpacity onPress={selectAllSizes} disabled={disabled}>
              <Text style={[styles.actionText, disabled && styles.actionDisabled]}>
                Todos
              </Text>
            </TouchableOpacity>
            <Text style={styles.actionSeparator}>|</Text>
            <TouchableOpacity onPress={clearSizes} disabled={disabled}>
              <Text style={[styles.actionText, disabled && styles.actionDisabled]}>
                Limpar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.chipsContainer}>
          {sizeOptions.map((size) => (
            <Chip
              key={size.value}
              selected={selectedSizes.includes(size.value)}
              onPress={() => toggleSize(size.value)}
              style={[
                styles.chip,
                selectedSizes.includes(size.value) && styles.chipSelected,
              ]}
              textStyle={[
                styles.chipText,
                selectedSizes.includes(size.value) && styles.chipTextSelected,
              ]}
              disabled={disabled}
            >
              {size.label}
            </Chip>
          ))}
        </View>
      </View>
      
      <Divider style={styles.divider} />
      
      {/* Cores */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Cores</Text>
          <View style={styles.sectionActions}>
            <TouchableOpacity onPress={selectAllColors} disabled={disabled}>
              <Text style={[styles.actionText, disabled && styles.actionDisabled]}>
                Todas
              </Text>
            </TouchableOpacity>
            <Text style={styles.actionSeparator}>|</Text>
            <TouchableOpacity onPress={clearColors} disabled={disabled}>
              <Text style={[styles.actionText, disabled && styles.actionDisabled]}>
                Limpar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.chipsContainer}>
          {colorOptions.map((color) => (
            <Chip
              key={color.value}
              selected={selectedColors.includes(color.value)}
              onPress={() => toggleColor(color.value)}
              style={[
                styles.chip,
                selectedColors.includes(color.value) && styles.chipSelected,
              ]}
              textStyle={[
                styles.chipText,
                selectedColors.includes(color.value) && styles.chipTextSelected,
              ]}
              disabled={disabled}
            >
              {color.hex && (
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: color.hex },
                    color.value === 'Branco' && styles.colorDotWhite,
                  ]}
                />
              )}
              {' '}{color.label}
            </Chip>
          ))}
        </View>
      </View>
      
      {/* Contador de variantes */}
      <View style={styles.counter}>
        <Ionicons name="layers-outline" size={18} color={Colors.light.primary} />
        <Text style={styles.counterText}>
          {variantCount} {variantCount === 1 ? 'variação' : 'variações'} selecionada{variantCount !== 1 ? 's' : ''}
        </Text>
      </View>
    </View>
  );
}

interface VariantPriceEditorProps {
  variants: Array<{
    size: string;
    color: string;
    price: number;
  }>;
  basePrice: number;
  onPriceChange: (index: number, price: number) => void;
  disabled?: boolean;
}

export function VariantPriceEditor({
  variants,
  basePrice,
  onPriceChange,
  disabled = false,
}: VariantPriceEditorProps) {
  if (variants.length <= 1) {
    return null;
  }
  
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Ajustar Preços por Variação</Text>
      <Text style={styles.sectionSubtitle}>
        Preço base: R$ {basePrice.toFixed(2)}
      </Text>
      
      <View style={styles.priceGrid}>
        {variants.map((variant, index) => (
          <View key={`${variant.size}-${variant.color}`} style={styles.priceRow}>
            <Text style={styles.priceLabel}>
              {variant.color} · {variant.size}
            </Text>
            <TextInput
              value={variant.price.toString()}
              onChangeText={(text) => {
                const price = parseFloat(text) || 0;
                onPriceChange(index, price);
              }}
              keyboardType="decimal-pad"
              style={styles.priceInput}
              disabled={disabled}
              left={<TextInput.Affix text="R$" />}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: theme.spacing.md,
  },
  
  section: {
    marginBottom: theme.spacing.md,
  },
  
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  actionText: {
    fontSize: 14,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  
  actionDisabled: {
    color: Colors.light.textTertiary,
  },
  
  actionSeparator: {
    marginHorizontal: 8,
    color: Colors.light.textTertiary,
  },
  
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  
  chip: {
    backgroundColor: Colors.light.backgroundSecondary,
  },
  
  chipSelected: {
    backgroundColor: Colors.light.primary,
  },
  
  chipText: {
    color: Colors.light.text,
  },
  
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 4,
  },
  
  colorDotWhite: {
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  
  divider: {
    marginVertical: theme.spacing.sm,
  },
  
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.sm,
    backgroundColor: Colors.light.primary + '10',
    borderRadius: 8,
    marginTop: theme.spacing.sm,
  },
  
  counterText: {
    fontSize: 14,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  
  // Price Editor
  priceGrid: {
    marginTop: theme.spacing.sm,
  },
  
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  
  priceLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
  },
  
  priceInput: {
    width: 130,
    height: 40,
    backgroundColor: Colors.light.backgroundSecondary,
  },
});

export default VariantSelector;