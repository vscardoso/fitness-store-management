/**
 * VariantBuilderInline
 *
 * Componente visual para criar a grade de variantes (cor × tamanho) dentro do wizard.
 *
 * Features:
 *  - Toggle animado para habilitar/desabilitar variantes
 *  - Swatches de cor (círculos coloridos) com checkmark
 *  - Chips de tamanho em scroll horizontal
 *  - Grade interativa (cor × tamanho) com preço por célula
 *  - Tap numa célula → modal para editar preço individual
 *  - Botão "Igualar todos" para propagar o preço base
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated,
  LayoutAnimation,
  UIManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';

// Habilita LayoutAnimation no Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Text, TextInput, Switch, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, theme } from '@/constants/Colors';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';
import {
  DEFAULT_SIZES,
  DEFAULT_COLORS,
  COLOR_GROUPS,
  type SizeOption,
  type ColorOption,
  type ColorGroup,
} from '@/types/productVariant';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface VariantBuilderInlineProps {
  hasVariants: boolean;
  onToggle: (value: boolean) => void;
  selectedSizes: string[];
  onSizesChange: (sizes: string[]) => void;
  selectedColors: string[];
  onColorsChange: (colors: string[]) => void;
  /** Tamanhos específicos por cor — { 'preto': ['M','G'], 'branco': ['PP','P'] } */
  colorSizes: Record<string, string[]>;
  onColorSizesChange: (colorSizes: Record<string, string[]>) => void;
  /** Preço base propagado dos campos de preço do formulário */
  basePrice: number;
  costPrice: number;
  /** Overrides de preço por variante — key: `"${color}-${size}"` */
  variantPrices: Record<string, number>;
  onVariantPriceChange: (key: string, price: number) => void;
  /** Erro de validação (ex: "Selecione pelo menos um tamanho ou cor") */
  validationError?: string;
}

/** Estado local para o modal de edição em lote */
interface BatchEditState {
  color: string;
  /** Mapa size → string do input durante edição */
  prices: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const variantKey = (color: string, size: string) => `${color}-${size}`;

/**
 * Normaliza o placeholder de exibição '—' para '' (string vazia) antes de
 * usar como componente de chave em `variantPrices`.
 * '—' é apenas visual; internamente "sem cor" é sempre ''.
 */
const normalizeColorKey = (color: string): string => color === '—' ? '' : color;

/** Retorna true se o fundo é claro e deve usar ícone escuro (calc. via lumância) */
const needsDarkCheck = (hex?: string): boolean => {
  if (!hex) return false;
  const h = hex.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 0.5;
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function VariantBuilderInline({
  hasVariants,
  onToggle,
  selectedSizes,
  onSizesChange,
  selectedColors,
  onColorsChange,
  colorSizes,
  onColorSizesChange,
  basePrice,
  costPrice,
  variantPrices,
  onVariantPriceChange,
  validationError,
}: VariantBuilderInlineProps) {
  // Modal de edição em lote (por cor)
  const [batchEdit, setBatchEdit] = useState<BatchEditState | null>(null);

  // Animação expand/collapse
  const expandAnim = useRef(new Animated.Value(hasVariants ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: hasVariants ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [hasVariants]);

  // ── Tamanhos ──────────────────────────────────────────────

  const toggleSize = useCallback((size: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    // Toggle global template
    const newSizes = selectedSizes.includes(size)
      ? selectedSizes.filter(s => s !== size)
      : [...selectedSizes, size];
    onSizesChange(newSizes);
    // Sync todos os colorSizes existentes
    if (Object.keys(colorSizes).length > 0) {
      const updated: Record<string, string[]> = {};
      for (const [color, sizes] of Object.entries(colorSizes)) {
        if (selectedSizes.includes(size)) {
          updated[color] = sizes.filter(s => s !== size);
        } else {
          updated[color] = sizes.includes(size) ? sizes : [...sizes, size];
        }
      }
      onColorSizesChange(updated);
    }
  }, [selectedSizes, onSizesChange, colorSizes, onColorSizesChange]);

  const selectAllSizes = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const all = DEFAULT_SIZES.map(s => s.value);
    onSizesChange(all);
    if (Object.keys(colorSizes).length > 0) {
      const updated: Record<string, string[]> = {};
      for (const color of Object.keys(colorSizes)) updated[color] = all;
      onColorSizesChange(updated);
    }
  };

  const clearSizes = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onSizesChange([]);
    if (Object.keys(colorSizes).length > 0) {
      const updated: Record<string, string[]> = {};
      for (const color of Object.keys(colorSizes)) updated[color] = [];
      onColorSizesChange(updated);
    }
  };

  // ── Cores ────────────────────────────────────────────────

  const toggleColor = useCallback((color: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (selectedColors.includes(color)) {
      onColorsChange(selectedColors.filter(c => c !== color));
      // Remove o colorSizes desse cor
      const updated = { ...colorSizes };
      delete updated[color];
      onColorSizesChange(updated);
    } else {
      onColorsChange([...selectedColors, color]);
      // Inicializa com o template global se ainda não existir
      if (!colorSizes[color]) {
        onColorSizesChange({ ...colorSizes, [color]: [...selectedSizes] });
      }
    }
  }, [selectedColors, onColorsChange, colorSizes, onColorSizesChange, selectedSizes]);

  // ── Tamanhos por cor ─────────────────────────────────────

  const toggleColorSize = useCallback((color: string, size: string) => {
    const current = colorSizes[color] ?? selectedSizes;
    const updated = current.includes(size)
      ? current.filter(s => s !== size)
      : [...current, size];
    onColorSizesChange({ ...colorSizes, [color]: updated });
  }, [colorSizes, selectedSizes, onColorSizesChange]);

  // ── Preços ────────────────────────────────────────────────

  const getPriceForVariant = useCallback((color: string, size: string): number => {
    return variantPrices[variantKey(normalizeColorKey(color), size)] ?? basePrice;
  }, [variantPrices, basePrice]);

  const hasCustomPrice = useCallback((color: string, size: string): boolean => {
    return variantKey(normalizeColorKey(color), size) in variantPrices;
  }, [variantPrices]);

  /** Abre o modal de edição em lote para uma cor específica */
  const openBatchEdit = useCallback((color: string) => {
    const sizesForColor = color === '—'
      ? (selectedSizes.length > 0 ? selectedSizes : ['—'])
      : (colorSizes[color] ?? selectedSizes);
    const sizes = sizesForColor.length > 0 ? sizesForColor : ['—'];

    const ck = normalizeColorKey(color);
    const prices: Record<string, string> = {};
    for (const size of sizes) {
      const price = variantPrices[variantKey(ck, size)] ?? basePrice;
      // toFixed(2) garante que "89.9" vira "89.90" → maskCurrencyBR produz "89,90"
      prices[size] = price > 0 ? maskCurrencyBR(price.toFixed(2)) : '';
    }
    setBatchEdit({ color, prices });
  }, [colorSizes, selectedSizes, variantPrices, basePrice]);

  /** Atualiza o campo de preço no estado local do modal com máscara de moeda BRL */
  const updateBatchPrice = useCallback((size: string, value: string) => {
    if (!batchEdit) return;
    // Máscara progressiva: cada dígito digitado representa centavos → "150" = R$ 1,50
    const maskedValue = maskCurrencyBR(value);
    setBatchEdit(prev => prev ? {
      ...prev,
      prices: { ...prev.prices, [size]: maskedValue },
    } : null);
  }, [batchEdit]);

  /** Aplica um valor (já formatado BRL ou número) a todos os tamanhos no modal */
  const applyToAllSizes = useCallback((valueStr: string) => {
    if (!batchEdit) return;
    const masked = maskCurrencyBR(valueStr);
    const newPrices: Record<string, string> = {};
    for (const size of Object.keys(batchEdit.prices)) {
      newPrices[size] = masked;
    }
    setBatchEdit(prev => prev ? { ...prev, prices: newPrices } : null);
  }, [batchEdit]);

  /** Salva todos os preços editados no modal - converte moeda BRL para número */
  const saveBatchEdit = useCallback(() => {
    if (!batchEdit) return;
    const ck = normalizeColorKey(batchEdit.color);
    for (const [size, valueStr] of Object.entries(batchEdit.prices)) {
      // unmaskCurrency converte "1.234,56" → 1234.56; campo vazio usa basePrice
      const price = unmaskCurrency(valueStr) || basePrice;
      onVariantPriceChange(variantKey(ck, size), price);
    }
    Keyboard.dismiss();
    setBatchEdit(null);
  }, [batchEdit, basePrice, onVariantPriceChange]);

  const applyBasePriceToAll = () => {
    const colors = selectedColors.length > 0 ? selectedColors : [''];
    for (const color of colors) {
      const sizesForColor = color === '' ? selectedSizes : (colorSizes[color] ?? selectedSizes);
      const sizesToUse = sizesForColor.length > 0 ? sizesForColor : [''];
      for (const size of sizesToUse) {
        onVariantPriceChange(variantKey(color, size), basePrice);
      }
    }
  };

  // ── Contagens ─────────────────────────────────────────────

  const variantCount = selectedColors.length > 0
    ? selectedColors.reduce((sum, color) => {
        const cs = colorSizes[color] ?? selectedSizes;
        return sum + Math.max(cs.length, 1);
      }, 0)
    : Math.max(selectedSizes.length, 1);

  const displayableVariants = selectedSizes.length > 0 || selectedColors.length > 0;

  /** Cor selecionada no modal de edição em lote */
  const batchEditColorDef = batchEdit
    ? DEFAULT_COLORS.find(c => c.value === batchEdit.color)
    : null;

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* ── Toggle Header ──────────────────────────────── */}
      <Pressable
        style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.85 }]}
        onPress={() => onToggle(!hasVariants)}
      >
        <LinearGradient
          colors={hasVariants
            ? [Colors.light.primary + '20', Colors.light.secondary + '10']
            : [Colors.light.backgroundSecondary, Colors.light.backgroundSecondary]}
          style={styles.toggleGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <View style={styles.toggleLeft}>
            <View style={[styles.toggleIconBox, hasVariants && styles.toggleIconBoxActive]}>
              <Ionicons
                name="layers"
                size={18}
                color={hasVariants ? '#fff' : Colors.light.textSecondary}
              />
            </View>
            <View style={styles.toggleTextBlock}>
              <Text style={[styles.toggleTitle, hasVariants && styles.toggleTitleActive]}>
                Grade de Variantes
              </Text>
              <Text style={styles.toggleSubtitle}>
                {hasVariants
                  ? `${variantCount} variante${variantCount !== 1 ? 's' : ''} configurada${variantCount !== 1 ? 's' : ''}`
                  : 'Tamanhos, cores e preços individuais'}
              </Text>
            </View>
          </View>
          <Switch
            value={hasVariants}
            onValueChange={onToggle}
            color={Colors.light.primary}
          />
        </LinearGradient>
      </Pressable>

      {/* ── Expanded Content ───────────────────────────── */}
      {hasVariants && (
        <View style={styles.expandedContent}>

          {/* ══ TAMANHOS ══════════════════════════════ */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionLabelRow}>
                <View style={styles.sectionAccent} />
                <Text style={styles.sectionLabel}>TAMANHOS</Text>
                {selectedSizes.length > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{selectedSizes.length}</Text>
                  </View>
                )}
              </View>
              <View style={styles.sectionActions}>
                <TouchableOpacity onPress={selectAllSizes} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.sectionActionText}>Todos</Text>
                </TouchableOpacity>
                {selectedSizes.length > 0 && (
                  <TouchableOpacity onPress={clearSizes} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.sectionActionText, styles.sectionActionDanger]}>Limpar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {DEFAULT_SIZES.map((s: SizeOption) => {
                const isSelected = selectedSizes.includes(s.value);
                return (
                  <TouchableOpacity
                    key={s.value}
                    onPress={() => toggleSize(s.value)}
                    activeOpacity={0.7}
                    style={[styles.sizeChip, isSelected && styles.sizeChipSelected]}
                  >
                    {isSelected && (
                      <LinearGradient
                        colors={[Colors.light.primary, Colors.light.secondary ?? Colors.light.primary]}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      />
                    )}
                    <Text style={[styles.sizeChipText, isSelected && styles.sizeChipTextSelected]}>
                      {s.label}
                    </Text>
                    {isSelected && (
                      <View style={styles.sizeChipCheck}>
                        <Ionicons name="checkmark" size={9} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ══ CORES ════════════════════════════════ */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionLabelRow}>
                <View style={[styles.sectionAccent, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.sectionLabel}>CORES</Text>
                {selectedColors.length > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{selectedColors.length}</Text>
                  </View>
                )}
              </View>
              {selectedColors.length > 0 && (
                <TouchableOpacity
                  onPress={() => { onColorsChange([]); onColorSizesChange({}); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.sectionActionText, styles.sectionActionDanger]}>Limpar</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Pills das cores selecionadas */}
            {selectedColors.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectedColorPills}
              >
                {selectedColors.map(colorValue => {
                  const colorDef = DEFAULT_COLORS.find(c => c.value === colorValue);
                  return (
                    <TouchableOpacity
                      key={colorValue}
                      onPress={() => toggleColor(colorValue)}
                      style={styles.selectedColorPill}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.selectedColorPillDot,
                        { backgroundColor: colorDef?.hex || '#9CA3AF' },
                      ]} />
                      <Text style={styles.selectedColorPillText}>{colorValue}</Text>
                      <Ionicons name="close-circle" size={13} color="#9CA3AF" />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Grade agrupada por categoria */}
            <View style={styles.colorPickerGroups}>
              {COLOR_GROUPS.map((group: ColorGroup) => (
                <View key={group.label} style={styles.colorGroupSection}>
                  <View style={styles.colorGroupSectionLabelRow}>
                    <Text style={styles.colorGroupSectionLabel}>{group.label}</Text>
                    <View style={styles.colorGroupSectionLine} />
                  </View>
                  <View style={styles.colorGridRow}>
                    {group.colors.map((c: ColorOption) => {
                      const isSelected = selectedColors.includes(c.value);
                      const useDarkIcon = needsDarkCheck(c.hex);
                      return (
                        <TouchableOpacity
                          key={c.value}
                          onPress={() => toggleColor(c.value)}
                          style={styles.colorSwatchWrapper}
                          activeOpacity={0.75}
                        >
                          <View style={[
                            styles.colorSwatchRing,
                            isSelected && { borderColor: c.hex || Colors.light.primary },
                          ]}>
                            <View style={[
                              styles.colorSwatch,
                              { backgroundColor: c.hex || '#E5E7EB' },
                              !c.hex && styles.colorSwatchFallback,
                            ]}>
                              {isSelected && (
                                <Ionicons
                                  name="checkmark"
                                  size={14}
                                  color={useDarkIcon ? '#111' : '#fff'}
                                />
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* ══ GRADE DE VARIANTES ═══════════════════ */}
          {displayableVariants ? (
            <View style={styles.variantSection}>
              {/* Header da grade */}
              <View style={styles.variantSectionHeader}>
                <View style={styles.variantCountPill}>
                  <Ionicons name="grid-outline" size={13} color={Colors.light.primary} />
                  <Text style={styles.variantCountText}>
                    {variantCount} variante{variantCount !== 1 ? 's' : ''}
                  </Text>
                </View>
                {basePrice > 0 && (
                  <TouchableOpacity onPress={applyBasePriceToAll} style={styles.equalizeBtn}>
                    <Ionicons name="sync-outline" size={12} color={Colors.light.textSecondary} />
                    <Text style={styles.equalizeBtnText}>Redefinir preços</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Cards agrupados por cor */}
              {(selectedColors.length > 0 ? selectedColors : ['—']).map((color, colorIdx) => {
                const colorDef = DEFAULT_COLORS.find(c => c.value === color);
                // Tamanhos específicos desta cor (ou global se não houver override)
                const sizesForColor = color === '—' ? selectedSizes : (colorSizes[color] ?? selectedSizes);
                const sizes = sizesForColor.length > 0 ? sizesForColor : ['—'];

                // Verifica se alguma variante desta cor tem preço customizado
                const hasAnyCustom = sizes.some(s => hasCustomPrice(color, s));

                return (
                  <View key={color} style={[styles.colorGroup, colorIdx > 0 && { marginTop: 10 }]}>
                    {/* Cabeçalho do grupo */}
                    <View style={styles.colorGroupHeader}>
                      <View style={[
                        styles.colorGroupDot,
                        colorDef?.hex
                          ? { backgroundColor: colorDef.hex }
                          : { backgroundColor: Colors.light.textTertiary },
                      ]} />
                      <Text style={styles.colorGroupName}>
                        {color === '—' ? 'Sem cor' : color}
                      </Text>
                      {hasAnyCustom && (
                        <View style={styles.colorGroupCustomBadge}>
                          <Text style={styles.colorGroupCustomBadgeText}>preços customizados</Text>
                        </View>
                      )}
                      <View style={styles.colorGroupLine} />
                      {/* Botão de edição em lote */}
                      <TouchableOpacity
                        onPress={() => openBatchEdit(color)}
                        style={styles.batchEditBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="create-outline" size={14} color={Colors.light.primary} />
                        <Text style={styles.batchEditBtnText}>Editar preços</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Seleção de tamanhos desta cor */}
                    {color !== '—' && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.colorGroupSizesRow}
                      >
                        {DEFAULT_SIZES.map((s: SizeOption) => {
                          const isSel = sizesForColor.includes(s.value);
                          return (
                            <TouchableOpacity
                              key={s.value}
                              onPress={() => toggleColorSize(color, s.value)}
                              activeOpacity={0.7}
                              style={[styles.colorGroupSizeChip, isSel && styles.colorGroupSizeChipSelected]}
                            >
                              {isSel && (
                                <LinearGradient
                                  colors={[Colors.light.primary, Colors.light.secondary ?? Colors.light.primary]}
                                  style={StyleSheet.absoluteFill}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                />
                              )}
                              <Text style={[styles.colorGroupSizeText, isSel && styles.colorGroupSizeTextSelected]}>
                                {s.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}

                    {/* Chips de tamanho com preço */}
                    <View style={styles.variantChipsGrid}>
                      {sizes.map(size => {
                        const isCustom = hasCustomPrice(color, size);
                        const price = getPriceForVariant(color, size);
                        return (
                          <TouchableOpacity
                            key={size}
                            style={[styles.variantCard, isCustom && styles.variantCardCustom]}
                            onPress={() => openBatchEdit(color)}
                            activeOpacity={0.7}
                          >
                            {/* Tamanho */}
                            <View style={[styles.variantCardSizeBadge, isCustom && styles.variantCardSizeBadgeCustom]}>
                              <Text style={[styles.variantCardSizeText, isCustom && styles.variantCardSizeTextCustom]}>
                                {size === '—' ? '—' : size}
                              </Text>
                            </View>
                            {/* Preço */}
                            <Text style={[styles.variantCardPrice, isCustom && styles.variantCardPriceCustom]}>
                              {price > 0 ? `R$\u00a0${price.toFixed(2).replace('.', ',')}` : '—'}
                            </Text>
                            {/* Indicador de preço personalizado */}
                            {isCustom && (
                              <View style={styles.variantCardCustomBadge}>
                                <Ionicons name="star" size={8} color="#F59E0B" />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <View style={styles.tapHintRow}>
                <Ionicons name="hand-left-outline" size={11} color={Colors.light.textTertiary} />
                <Text style={styles.tapHintText}>
                  Toque em um card ou em "Editar preços" para ajustar valores · <Ionicons name="star" size={10} color="#F59E0B" /> preço customizado
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBubble}>
                <Ionicons name="add-circle-outline" size={32} color={Colors.light.primary} />
              </View>
              <Text style={styles.emptyTitle}>Selecione tamanhos e/ou cores</Text>
              <Text style={styles.emptySubtitle}>
                A grade de variantes aparecerá aqui
              </Text>
            </View>
          )}

          {/* Erro de validação */}
          {validationError && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={14} color={Colors.light.error} />
              <Text style={styles.errorText}>{validationError}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Modal de edição de preços em lote (por cor) ────── */}
      <Modal
        visible={!!batchEdit}
        transparent
        animationType="slide"
        onRequestClose={() => setBatchEdit(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setBatchEdit(null)}
          activeOpacity={1}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%' }}
          >
            <TouchableOpacity
              style={styles.modalSheet}
              activeOpacity={1}
              onPress={() => {}}
            >
            <View style={styles.modalHandle} />

            {/* Título */}
            <View style={styles.modalTitleRow}>
              {batchEditColorDef?.hex ? (
                <View style={[styles.modalColorDot, { backgroundColor: batchEditColorDef.hex }]} />
              ) : (
                <View style={[styles.modalColorDot, { backgroundColor: '#9CA3AF' }]} />
              )}
              <View style={styles.modalTitleBlock}>
                <Text style={styles.modalTitle}>
                  {batchEdit?.color === '—' ? 'Sem cor' : batchEdit?.color ?? ''}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Defina o preço de cada tamanho
                </Text>
              </View>
            </View>

            {/* Atalhos globais */}
            {basePrice > 0 && (
              <View style={styles.modalQuickActionsRow}>
                <Text style={styles.modalQuickActionsLabel}>Aplicar a todos:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {[
                    { label: 'Preço base', value: basePrice },
                    { label: '+5%', value: basePrice * 1.05 },
                    { label: '+10%', value: basePrice * 1.1 },
                    { label: '+20%', value: basePrice * 1.2 },
                    { label: '-5%', value: basePrice * 0.95 },
                    { label: '-10%', value: basePrice * 0.9 },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.label}
                      style={styles.globalQuickBtn}
                      onPress={() => applyToAllSizes(item.value.toFixed(2))}
                    >
                      <Text style={styles.globalQuickBtnLabel}>{item.label}</Text>
                      <Text style={styles.globalQuickBtnValue}>
                        R$ {item.value.toFixed(2).replace('.', ',')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Lista de tamanhos com campos de preço */}
            <ScrollView
              style={styles.batchSizeList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {batchEdit && Object.entries(batchEdit.prices).map(([size, priceStr], idx) => {
                // unmaskCurrency lida corretamente com "1.234,56" → 1234.56
                const currentNum = unmaskCurrency(priceStr);
                const margin = costPrice > 0 && currentNum > costPrice
                  ? ((currentNum - costPrice) / costPrice * 100)
                  : null;

                return (
                  <View key={size} style={[styles.batchRow, idx > 0 && styles.batchRowBorder]}>
                    {/* Badge do tamanho */}
                    <View style={styles.batchSizeBadge}>
                      <Text style={styles.batchSizeLabel}>{size === '—' ? '—' : size}</Text>
                    </View>

                    {/* Campo de preço */}
                    <View style={styles.batchInputWrapper}>
                      <Text style={styles.batchInputPrefix}>R$</Text>
                      <TextInput
                        value={priceStr}
                        onChangeText={(v) => updateBatchPrice(size, v)}
                        mode="flat"
                        keyboardType="decimal-pad"
                        style={styles.batchInput}
                        underlineColor="transparent"
                        activeUnderlineColor={Colors.light.primary}
                        dense
                        returnKeyType="next"
                        blurOnSubmit={false}
                      />
                    </View>

                    {/* Margem de lucro */}
                    <View style={styles.batchMarginWrapper}>
                      {margin !== null ? (
                        <View style={[
                          styles.batchMarginBadge,
                          margin >= 30
                            ? styles.batchMarginGood
                            : margin >= 10
                            ? styles.batchMarginOk
                            : styles.batchMarginLow,
                        ]}>
                          <Text style={[
                            styles.batchMarginText,
                            margin >= 30
                              ? styles.batchMarginTextGood
                              : margin >= 10
                              ? styles.batchMarginTextOk
                              : styles.batchMarginTextLow,
                          ]}>
                            {margin.toFixed(0)}%
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.batchMarginBadge}>
                          <Text style={styles.batchMarginText}>—</Text>
                        </View>
                      )}
                    </View>

                    {/* Atalhos rápidos por linha */}
                    {basePrice > 0 && (
                      <TouchableOpacity
                        style={styles.batchResetBtn}
                        onPress={() => updateBatchPrice(size, basePrice.toFixed(2))}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="refresh" size={14} color={Colors.light.textTertiary} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {/* Legenda de margem */}
              {costPrice > 0 && (
                <View style={styles.marginLegend}>
                  <View style={styles.marginLegendItem}>
                    <View style={[styles.marginLegendDot, { backgroundColor: '#10B981' }]} />
                    <Text style={styles.marginLegendText}>≥30% bom</Text>
                  </View>
                  <View style={styles.marginLegendItem}>
                    <View style={[styles.marginLegendDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={styles.marginLegendText}>10–29% ok</Text>
                  </View>
                  <View style={styles.marginLegendItem}>
                    <View style={[styles.marginLegendDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.marginLegendText}>&lt;10% baixo</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Ações do modal */}
            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={() => setBatchEdit(null)} style={styles.modalBtn}>
                Cancelar
              </Button>
              <Button mode="contained" onPress={saveBatchEdit} style={styles.modalBtn} icon="check">
                Salvar preços
              </Button>
            </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {},

  // ── Toggle ──────────────────────────────────────────────
  toggleRow: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  toggleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  toggleTextBlock: {
    flex: 1,
  },
  toggleIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleIconBoxActive: {
    backgroundColor: Colors.light.primary,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
  },
  toggleTitleActive: {
    color: Colors.light.primary,
  },
  toggleSubtitle: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },

  // ── Expanded body ────────────────────────────────────────
  expandedContent: {
    marginTop: 16,
    gap: 20,
  },

  // ── Section ──────────────────────────────────────────────
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: Colors.light.primary,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.light.textSecondary,
    letterSpacing: 1,
  },
  countBadge: {
    backgroundColor: Colors.light.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  sectionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionActionText: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '600',
  },
  sectionActionDanger: {
    color: Colors.light.error,
  },

  // ── Size chips ─────────────────────────────────────────
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  sizeChip: {
    height: 44,
    minWidth: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sizeChipSelected: {
    borderColor: Colors.light.primary,
    shadowColor: Colors.light.primary,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  sizeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  sizeChipTextSelected: {
    color: '#fff',
  },
  sizeChipCheck: {
    position: 'absolute',
    top: 3,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Color swatches ─────────────────────────────────────
  colorSwatchesRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  colorSwatchWrapper: {
    alignItems: 'center',
  },
  colorSwatchRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchFallback: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  colorLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    textAlign: 'center',
    fontWeight: '500',
  },

  // ── Color grid picker ─────────────────────────────────
  colorPickerGroups: {
    gap: 12,
  },
  colorGroupSection: {
    gap: 8,
  },
  colorGroupSectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorGroupSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.light.textTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  colorGroupSectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  colorGridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  selectedColorPills: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  selectedColorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedColorPillDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
  },
  selectedColorPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },

  // ── Variant section (cards agrupados por cor) ───────────
  variantSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  variantSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  variantCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.light.primary + '15',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  variantCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  equalizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  equalizeBtnText: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },

  // ── Per-color group ──────────────────────────────────────
  colorGroup: {},
  colorGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  colorGroupDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  colorGroupName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colorGroupLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },

  // ── Per-color size chips (menores) ────────────────────────
  colorGroupSizesRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 10,
    paddingHorizontal: 1,
  },
  colorGroupSizeChip: {
    height: 30,
    minWidth: 38,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  colorGroupSizeChipSelected: {
    borderColor: Colors.light.primary,
  },
  colorGroupSizeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  colorGroupSizeTextSelected: {
    color: '#fff',
  },

  // ── Variant cards grid ────────────────────────────────
  variantChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  variantCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    minWidth: 72,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  variantCardCustom: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary + '08',
    shadowColor: Colors.light.primary,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  variantCardSizeBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 5,
  },
  variantCardSizeBadgeCustom: {
    backgroundColor: Colors.light.primary + '20',
  },
  variantCardSizeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
  },
  variantCardSizeTextCustom: {
    color: Colors.light.primary,
  },
  variantCardPrice: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  variantCardPriceCustom: {
    color: Colors.light.primary,
    fontWeight: '700',
  },
  variantCardCustomBadge: {
    position: 'absolute',
    top: 3,
    right: 4,
  },
  variantCardCustomBadgeText: {
    fontSize: 9,
    color: '#F59E0B',
  },

  tapHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  tapHintText: {
    fontSize: 10,
    color: Colors.light.textTertiary,
    flex: 1,
    lineHeight: 14,
  },

  // ── Color group badge + edit button ────────────────────
  colorGroupCustomBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  colorGroupCustomBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#D97706',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  batchEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.primary + '12',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  batchEditBtnText: {
    fontSize: 11,
    color: Colors.light.primary,
    fontWeight: '600',
  },

  // ── Empty state ───────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyIconBubble: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.light.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  emptySubtitle: {
    fontSize: 12,
    color: Colors.light.textTertiary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  // ── Validation error ──────────────────────────────────
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.light.error + '12',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 12,
    color: Colors.light.error,
    flex: 1,
  },

  // ── Price edit modal (batch) ──────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    paddingTop: 16,
    gap: 14,
    minHeight: '70%',
    maxHeight: '95%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalColorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  modalTitleBlock: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },

  // Atalhos globais
  modalQuickActionsRow: {
    gap: 8,
  },
  modalQuickActionsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  globalQuickBtn: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  globalQuickBtnLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  globalQuickBtnValue: {
    fontSize: 11,
    color: '#1F2937',
    fontWeight: '700',
  },

  // Lista de tamanhos no modal
  batchSizeList: {
    maxHeight: 320,
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  batchRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  batchSizeBadge: {
    width: 44,
    height: 38,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchSizeLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#374151',
  },
  batchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingLeft: 10,
    overflow: 'hidden',
    height: 46,
  },
  batchInputPrefix: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    marginRight: 4,
  },
  batchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: 'transparent',
    height: 44,
  },
  batchMarginWrapper: {
    width: 44,
    alignItems: 'center',
  },
  batchMarginBadge: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 3,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  batchMarginGood: {
    backgroundColor: '#D1FAE5',
  },
  batchMarginOk: {
    backgroundColor: '#FEF3C7',
  },
  batchMarginLow: {
    backgroundColor: '#FEE2E2',
  },
  batchMarginText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
  },
  batchMarginTextGood: {
    color: '#065F46',
  },
  batchMarginTextOk: {
    color: '#92400E',
  },
  batchMarginTextLow: {
    color: '#991B1B',
  },
  batchResetBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Legenda de margem
  marginLegend: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: 10,
    paddingBottom: 4,
    justifyContent: 'center',
  },
  marginLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  marginLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  marginLegendText: {
    fontSize: 10,
    color: Colors.light.textTertiary,
    fontWeight: '600',
  },

  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
  },
});
