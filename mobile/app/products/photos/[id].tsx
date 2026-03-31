/**
 * Tela de Gerenciamento de Fotos de Variações
 *
 * Permite ao usuário adicionar/trocar a foto de cada variação
 * de um produto (cor × tamanho). Fotos podem ser adicionadas
 * agora ou mais tarde.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  ActivityIndicator,
  Alert,
  Text,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getProductById } from '@/services/productService';
import { getProductVariants } from '@/services/productVariantService';
import { uploadVariantImageWithFallback } from '@/services/uploadService';
import type { ProductVariant } from '@/types/productVariant';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
  preto: '#1a1a1a', negro: '#1a1a1a', black: '#1a1a1a',
  branco: '#f5f5f5', white: '#f5f5f5',
  cinza: '#9ca3af', gray: '#9ca3af', grey: '#9ca3af',
  vermelho: '#ef4444', red: '#ef4444',
  azul: '#3b82f6', blue: '#3b82f6',
  verde: '#22c55e', green: '#22c55e',
  amarelo: '#eab308', yellow: '#eab308',
  laranja: '#f97316', orange: '#f97316',
  rosa: '#ec4899', pink: '#ec4899',
  roxo: '#a855f7', purple: '#a855f7',
  marrom: '#92400e', brown: '#92400e',
  bege: '#d4b896', beige: '#d4b896',
};

function colorHex(name?: string | null): string {
  if (!name) return Colors.light.primary;
  const key = name.toLowerCase().trim();
  return COLOR_HEX[key] ?? Colors.light.primary;
}

function groupByColor(variants: ProductVariant[]): Map<string, ProductVariant[]> {
  const map = new Map<string, ProductVariant[]>();
  for (const v of variants) {
    const key = v.color ?? 'Sem cor';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(v);
  }
  return map;
}

const SIZE_ORDER = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'U'];

function normalizeSize(size?: string | null): string {
  return (size ?? '').toUpperCase().trim().replace(/\s+/g, '');
}

function sizeRank(size?: string | null): number {
  const normalized = normalizeSize(size);
  if (!normalized) return 999;

  const byPreset = SIZE_ORDER.indexOf(normalized);
  if (byPreset >= 0) return byPreset;

  const numeric = Number(normalized.replace(',', '.'));
  if (!Number.isNaN(numeric)) return 100 + numeric;

  return 500;
}

function compareVariants(a: ProductVariant, b: ProductVariant): number {
  const rankDiff = sizeRank(a.size) - sizeRank(b.size);
  if (rankDiff !== 0) return rankDiff;

  const sizeDiff = normalizeSize(a.size).localeCompare(normalizeSize(b.size), 'pt-BR');
  if (sizeDiff !== 0) return sizeDiff;

  const skuA = (a.sku ?? '').toUpperCase();
  const skuB = (b.sku ?? '').toUpperCase();
  return skuA.localeCompare(skuB, 'pt-BR');
}

function compareColors(a: string, b: string): number {
  const aNoColor = a.toLowerCase() === 'sem cor';
  const bNoColor = b.toLowerCase() === 'sem cor';

  if (aNoColor && !bNoColor) return 1;
  if (!aNoColor && bNoColor) return -1;

  return a.localeCompare(b, 'pt-BR');
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function VariantPhotosScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();

  // Foto local por variante (uri temporária antes de confirmar)
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [localPhotos, setLocalPhotos] = useState<Record<number, string>>({});
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  // ── Animação de entrada ──
  const headerOpacity = useSharedValue(0);
  const headerScale = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY = useSharedValue(24);

  useFocusEffect(
    useCallback(() => {
      headerOpacity.value = 0;
      headerScale.value = 0.94;
      contentOpacity.value = 0;
      contentTransY.value = 24;

      headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
      headerScale.value = withSpring(1, { damping: 18, stiffness: 200 });
      
      contentOpacity.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) });
      contentTransY.value = withSpring(0, { damping: 20, stiffness: 180 });
    }, [])
  );

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ['product-variants', productId],
    queryFn: () => getProductVariants(productId),
    enabled: !!productId,
  });

  const { data: product, isLoading: isLoadingProduct } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProductById(productId),
    enabled: !!productId,
  });

  const activeVariants = variants.filter((v) => v.is_active);
  const totalWithPhoto = activeVariants.filter(
    (v) => localPhotos[v.id] || v.image_url
  ).length;
  const groups = groupByColor(activeVariants);
  const sortedGroups = [...groups.entries()]
    .sort(([colorA], [colorB]) => compareColors(colorA, colorB))
    .map(([color, items]) => [color, [...items].sort(compareVariants)] as const);

  const CARD_GAP = theme.spacing.sm;
  const availableWidth = width - (theme.spacing.md * 2) - (theme.spacing.md * 2) - CARD_GAP;
  const cardSize = Math.max(128, Math.min(176, Math.floor(availableWidth / 2)));
  const pendingCount = Math.max(0, activeVariants.length - totalWithPhoto);

  const pickAndUpload = useCallback(
    async (variant: ProductVariant) => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Permita o acesso à galeria para adicionar fotos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets[0]) return;

      const uri = result.assets[0].uri;
      setLocalPhotos((prev) => ({ ...prev, [variant.id]: uri }));
      setUploading((prev) => ({ ...prev, [variant.id]: true }));

      try {
        await uploadVariantImageWithFallback(variant.id, uri);
        queryClient.invalidateQueries({ queryKey: ['product-variants', productId] });
      } catch (err: any) {
        Alert.alert('Erro no upload', err?.response?.data?.detail ?? 'Não foi possível salvar a foto.');
        setLocalPhotos((prev) => {
          const next = { ...prev };
          delete next[variant.id];
          return next;
        });
      } finally {
        setUploading((prev) => ({ ...prev, [variant.id]: false }));
      }
    },
    [productId, queryClient]
  );

  const photoForVariant = (v: ProductVariant) => localPhotos[v.id] ?? v.image_url ?? null;

  if (isLoading || isLoadingProduct) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={brandingColors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ── Header animado ────────────────────────────────────────── */}
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Fotos das Variações"
          subtitle={product?.name || 'Produto'}
          showBackButton
          onBack={() => router.back()}
        />
        {/* Barra de progresso */}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarWrap}>
            <View
              style={[
                styles.progressBar,
                {
                  width: activeVariants.length > 0
                    ? `${(totalWithPhoto / activeVariants.length) * 100}%`
                    : '0%',
                  backgroundColor: brandingColors.primary,
                } as any,
              ]}
            />
          </View>
        </View>
      </Animated.View>

      {/* ── Conteúdo animado ──────────────────────────────────────── */}
      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.productContextCard}>
          <View style={styles.productContextTop}>
            <View style={[styles.productIconWrap, { backgroundColor: brandingColors.primary + '15' }]}>
              <Ionicons name="shirt-outline" size={18} color={brandingColors.primary} />
            </View>
            <View style={styles.productContextTextWrap}>
              <Text style={styles.productContextLabel}>PRODUTO</Text>
              <Text style={styles.productContextName} numberOfLines={2}>
                {product?.name || 'Produto sem nome'}
              </Text>
              <Text style={styles.productContextMeta} numberOfLines={1}>
                {product?.sku ? `SKU: ${product.sku}` : 'SKU não informado'}
                {product?.brand ? ` • ${product.brand}` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.productStatsRow}>
            <View style={styles.productStatChip}>
              <Text style={styles.productStatValue}>{activeVariants.length}</Text>
              <Text style={styles.productStatLabel}>variações</Text>
            </View>
            <View style={styles.productStatChip}>
              <Text style={[styles.productStatValue, { color: brandingColors.primary }]}>{totalWithPhoto}</Text>
              <Text style={styles.productStatLabel}>com foto</Text>
            </View>
            <View style={styles.productStatChip}>
              <Text style={styles.productStatValue}>{activeVariants.length - totalWithPhoto}</Text>
              <Text style={styles.productStatLabel}>pendentes</Text>
            </View>
          </View>
        </View>

        {/* ── Banner informativo ─────────────────────────────────────── */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={18} color={Colors.light.info} />
          <Text style={styles.infoText}>
            Toque em cada card para adicionar ou trocar a foto da variação.
          </Text>
        </View>

        {/* ── Grupos por cor ─────────────────────────────────────────── */}
        {sortedGroups.map(([colorName, colorVariants]) => {
          const hex = colorHex(colorName !== 'Sem cor' ? colorName : null);
          return (
            <View key={colorName} style={styles.colorGroup}>
              {/* Header da cor */}
              <View style={styles.colorGroupHeader}>
                {colorName !== 'Sem cor' && (
                  <View style={[styles.colorDot, { backgroundColor: hex }]} />
                )}
                <Text style={styles.colorGroupName} numberOfLines={1}>
                  {colorName === 'Sem cor' ? 'Sem cor definida' : `Cor: ${colorName}`}
                </Text>
                <Text style={styles.colorGroupCount}>
                  {colorVariants.filter((v) => photoForVariant(v)).length}/
                  {colorVariants.length}
                </Text>
              </View>

              {/* Grid de variações desta cor */}
              <View style={styles.variantGrid}>
                {colorVariants.map((variant) => {
                  const photo = photoForVariant(variant);
                  const isUploading = uploading[variant.id];

                  return (
                    <TouchableOpacity
                      key={variant.id}
                      style={[styles.variantCard, { width: cardSize }]}
                      onPress={() => pickAndUpload(variant)}
                      activeOpacity={0.75}
                      disabled={isUploading}
                      accessibilityLabel={`Selecionar foto da variação ${variant.size || variant.sku}`}
                    >
                      {/* Foto ou placeholder */}
                      {photo ? (
                        <View style={[styles.photoWrap, { width: cardSize, height: cardSize }]}>
                          <Image source={{ uri: photo }} style={styles.photo} />
                          {isUploading && (
                            <View style={styles.uploadingOverlay}>
                              <ActivityIndicator color="#fff" size="small" />
                            </View>
                          )}
                          {/* Badge de trocar */}
                          {!isUploading && (
                            <View style={styles.changeBadge}>
                              <Ionicons name="camera" size={12} color="#fff" />
                            </View>
                          )}
                        </View>
                      ) : (
                        <View style={[styles.photoWrap, styles.photoPlaceholder, { borderColor: brandingColors.primary, width: cardSize, height: cardSize }]}>
                          {isUploading ? (
                            <ActivityIndicator color={brandingColors.primary} />
                          ) : (
                            <>
                              <Ionicons
                                name="camera-outline"
                                size={28}
                                color={brandingColors.primary}
                              />
                              <Text style={[styles.placeholderText, { color: brandingColors.primary }]}>Adicionar</Text>
                            </>
                          )}
                        </View>
                      )}

                      {/* Label da variação */}
                      <View style={styles.variantLabel}>
                        <View style={styles.variantTopRow}>
                          {variant.size ? (
                            <View style={[styles.sizePill, { backgroundColor: brandingColors.primary + '15' }]}>
                              <Text style={[styles.sizePillText, { color: brandingColors.primary }]}>{variant.size}</Text>
                            </View>
                          ) : (
                            <Text style={styles.variantSizeFallback}>Sem tamanho</Text>
                          )}
                          {photo && !isUploading && (
                            <Ionicons
                              name="checkmark-circle"
                              size={14}
                              color={Colors.light.success}
                            />
                          )}
                        </View>
                        <Text style={styles.variantSku} numberOfLines={1}>
                          {variant.sku ? `SKU: ${variant.sku}` : 'SKU não informado'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}

        {activeVariants.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="layers-outline" size={56} color={Colors.light.textTertiary} />
            <Text style={styles.emptyTitle}>Nenhuma variação ativa</Text>
            <Text style={styles.emptySubtitle}>Adicione variações ao produto primeiro</Text>
          </View>
        )}

        {/* Botão de conclusão */}
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => setShowSuccessDialog(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={brandingColors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.doneBtnGradient}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
            <Text style={styles.doneBtnText}>
              {totalWithPhoto === activeVariants.length
                ? 'Concluído'
                : `Concluir (${pendingCount} sem foto)`}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>

    <ConfirmDialog
      visible={showSuccessDialog}
      title="Sucesso!"
      message={
        pendingCount === 0
          ? 'Fotos das variações finalizadas com sucesso.'
          : `Processo finalizado. ${pendingCount} variação(ões) ainda está(ão) sem foto e você pode completar depois.`
      }
      confirmText="OK"
      onConfirm={() => {
        setShowSuccessDialog(false);
        router.back();
      }}
      onCancel={() => {
        setShowSuccessDialog(false);
        router.back();
      }}
      type="success"
      icon="checkmark-circle"
    />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Barra de progresso
  progressBarContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  progressBarWrap: {
    height: 4,
    backgroundColor: Colors.light.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },

  // Scroll
  scroll: { flex: 1 },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },

  // Contexto do produto
  productContextCard: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadows.sm,
  },
  productContextTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  productIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  productContextTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  productContextLabel: {
    fontSize: theme.fontSize.xs,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: Colors.light.textTertiary,
    fontWeight: '700',
  },
  productContextName: {
    marginTop: 2,
    fontSize: theme.fontSize.lg,
    color: Colors.light.text,
    fontWeight: '800',
  },
  productContextMeta: {
    marginTop: 2,
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  productStatsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  productStatChip: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingVertical: theme.spacing.xs,
    alignItems: 'center',
  },
  productStatValue: {
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    fontWeight: '800',
  },
  productStatLabel: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },

  // Info banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.light.info + '15',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.light.info,
  },
  infoText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    lineHeight: 20,
  },

  // Grupo por cor
  colorGroup: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
    gap: theme.spacing.md,
  },
  colorGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  colorGroupName: {
    flex: 1,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
    textTransform: 'capitalize',
  },
  colorGroupCount: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },

  // Grid de variações
  variantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  variantCard: { gap: theme.spacing.xs },

  // Foto
  photoWrap: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.light.backgroundSecondary,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  placeholderText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Label da variação
  variantLabel: {
    gap: 4,
    paddingHorizontal: 2,
  },
  variantTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 18,
  },
  sizePill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sizePillText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  variantSku: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },
  variantSizeFallback: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textTertiary,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  emptySubtitle: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textTertiary,
    textAlign: 'center',
  },

  // Done button
  doneBtn: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginTop: theme.spacing.sm,
  },
  doneBtnGradient: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  doneBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: theme.fontSize.base,
  },
});
