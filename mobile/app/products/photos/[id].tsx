/**
 * Tela de Gerenciamento de Fotos de Variações
 *
 * Permite ao usuário adicionar/trocar a foto de cada variação
 * de um produto (cor × tamanho). Fotos podem ser adicionadas
 * agora ou mais tarde.
 */
import React, { useState, useCallback, useMemo } from 'react';
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
import useBackToList from '@/hooks/useBackToList';
import { getProductById } from '@/services/productService';
import { getProductVariants } from '@/services/productVariantService';
import { getImageUrl } from '@/constants/Config';
import {
  getProductMedia,
  uploadProductMediaWithFallback,
  setProductMediaAsCover,
  deleteProductMedia,
} from '@/services/productMediaService';
import type { ProductVariant } from '@/types/productVariant';
import type { ProductMedia } from '@/types/productMedia';

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
  const { goBack } = useBackToList('/(tabs)/products');
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();

  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [localPhotos, setLocalPhotos] = useState<Record<number, string>>({});
  const [deletedMediaIds, setDeletedMediaIds] = useState<Set<number>>(new Set());
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [settingCover, setSettingCover] = useState<number | null>(null);
  const [deletingMedia, setDeletingMedia] = useState<number | null>(null);

  // ── Dialogs ──
  const [permissionDialog, setPermissionDialog] = useState(false);
  const [uploadErrorDialog, setUploadErrorDialog] = useState({ visible: false, message: '' });
  const [coverErrorDialog, setCoverErrorDialog] = useState(false);
  const [deleteErrorDialog, setDeleteErrorDialog] = useState(false);
  const [setCoverConfirmDialog, setSetCoverConfirmDialog] = useState<{ visible: boolean; variant: ProductVariant | null }>({ visible: false, variant: null });
  const [photoActionMenuDialog, setPhotoActionMenuDialog] = useState<{ visible: boolean; variant: ProductVariant | null; isVariantCover: boolean }>({ visible: false, variant: null, isVariantCover: false });
  const [deletePhotoConfirmDialog, setDeletePhotoConfirmDialog] = useState<{ visible: boolean; variant: ProductVariant | null }>({ visible: false, variant: null });

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

  const { data: allMedia = [] } = useQuery({
    queryKey: ['product-media', productId],
    queryFn: () => getProductMedia(productId),
    enabled: !!productId,
  });

  // Mapa variantId → mídia capa (is_cover=true ou primeira), excluindo itens deletados localmente
  const variantCoverMap = useMemo(() => {
    const map = new Map<number, ProductMedia>();
    for (const m of allMedia) {
      if (m.variant_id == null) continue;
      if (deletedMediaIds.has(m.id)) continue;
      const current = map.get(m.variant_id);
      if (!current || m.is_cover) map.set(m.variant_id, m);
    }
    return map;
  }, [allMedia, deletedMediaIds]);

  // Mídia de nível produto (sem variação)
  const productCoverMedia = useMemo(
    () => allMedia.find((m) => m.variant_id == null && m.is_cover) ?? allMedia.find((m) => m.variant_id == null) ?? null,
    [allMedia],
  );

  const activeVariants = variants.filter((v) => v.is_active);
  const hasVariants = activeVariants.length > 0;
  const totalWithPhoto = activeVariants.filter(
    (v) => localPhotos[v.id] || variantCoverMap.has(v.id)
  ).length;
  const groups = groupByColor(activeVariants);
  const sortedGroups = [...groups.entries()]
    .sort(([colorA], [colorB]) => compareColors(colorA, colorB))
    .map(([color, items]) => [color, [...items].sort(compareVariants)] as const);

  const CARD_GAP = theme.spacing.sm;
  const availableWidth = width - (theme.spacing.md * 2) - (theme.spacing.md * 2) - CARD_GAP;
  const cardSize = Math.max(128, Math.min(176, Math.floor(availableWidth / 2)));
  const pendingCount = Math.max(0, activeVariants.length - totalWithPhoto);

  const productImageUrl = getImageUrl(productCoverMedia?.url ?? product?.image_url) ?? null;

  const [uploadingProduct, setUploadingProduct] = useState(false);

  const pickAndUploadProduct = useCallback(async () => {
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
    setUploadingProduct(true);
    try {
      await uploadProductMediaWithFallback(productId, result.assets[0].uri);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['product-media', productId] }),
        queryClient.refetchQueries({ queryKey: ['product', productId] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
    } catch (err: any) {
      Alert.alert('Erro no upload', err?.response?.data?.detail ?? 'Não foi possível salvar a foto.');
    } finally {
      setUploadingProduct(false);
    }
  }, [productId, queryClient]);

  const deleteProductLevelPhoto = useCallback(async () => {
    if (!productCoverMedia) return;
    setDeletingMedia(-1);
    try {
      await deleteProductMedia(productId, productCoverMedia.id);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['product-media', productId] }),
        queryClient.refetchQueries({ queryKey: ['product', productId] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
    } catch {
      Alert.alert('Erro', 'Não foi possível excluir a foto.');
    } finally {
      setDeletingMedia(null);
    }
  }, [productId, productCoverMedia, queryClient]);

  const pickAndUpload = useCallback(
    async (variant: ProductVariant) => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDialog(true);
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
        await uploadProductMediaWithFallback(productId, uri, variant.id);
        setLocalPhotos((prev) => { const n = { ...prev }; delete n[variant.id]; return n; });
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['product-media', productId] }),
          queryClient.refetchQueries({ queryKey: ['product-variants', productId] }),
          queryClient.refetchQueries({ queryKey: ['product', productId] }),
          queryClient.invalidateQueries({ queryKey: ['products'] }),
        ]);
      } catch (err: any) {
        setUploadErrorDialog({ visible: true, message: err?.response?.data?.detail ?? 'Não foi possível salvar a foto.' });
        setLocalPhotos((prev) => { const n = { ...prev }; delete n[variant.id]; return n; });
      } finally {
        setUploading((prev) => ({ ...prev, [variant.id]: false }));
      }
    },
    [productId, queryClient]
  );

  const photoForVariant = (v: ProductVariant) => {
    if (localPhotos[v.id]) return localPhotos[v.id];
    const m = variantCoverMap.get(v.id);
    return m ? getImageUrl(m.url) : null;
  };

  const isCover = (v: ProductVariant) => {
    const m = variantCoverMap.get(v.id);
    return !!m && m.is_cover;
  };

  const handleSetAsCover = useCallback(async (variant: ProductVariant) => {
    const media = variantCoverMap.get(variant.id);
    if (!media) return;
    setSettingCover(variant.id);

    // Atualização otimista: marca a nova capa imediatamente no cache
    const previous = queryClient.getQueryData<ProductMedia[]>(['product-media', productId]);
    queryClient.setQueryData<ProductMedia[]>(['product-media', productId], (old) =>
      (old ?? []).map((m) => ({
        ...m,
        is_cover: m.variant_id === media.variant_id ? m.id === media.id : m.is_cover,
      }))
    );

    try {
      await setProductMediaAsCover(productId, media.id);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['product-media', productId] }),
        queryClient.refetchQueries({ queryKey: ['product-variants', productId] }),
        queryClient.refetchQueries({ queryKey: ['product', productId] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
    } catch {
      // Rollback em caso de erro
      queryClient.setQueryData(['product-media', productId], previous);
      setCoverErrorDialog(true);
    } finally {
      setSettingCover(null);
    }
  }, [productId, variantCoverMap, queryClient]);

  const handleDeletePhoto = useCallback(async (variant: ProductVariant) => {
    const media = variantCoverMap.get(variant.id);
    if (!media) return;

    // Remove imediatamente da UI via estado local (garantido)
    setDeletedMediaIds((prev) => new Set([...prev, media.id]));
    setDeletingMedia(variant.id);

    try {
      await deleteProductMedia(productId, media.id);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['product-media', productId] }),
        queryClient.refetchQueries({ queryKey: ['product-variants', productId] }),
        queryClient.refetchQueries({ queryKey: ['product', productId] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
      // Limpa o ID local após o servidor confirmar (allMedia já foi atualizado)
      setDeletedMediaIds((prev) => { const s = new Set(prev); s.delete(media.id); return s; });
    } catch {
      // Rollback: restaura a foto na UI
      setDeletedMediaIds((prev) => { const s = new Set(prev); s.delete(media.id); return s; });
      setDeleteErrorDialog(true);
    } finally {
      setDeletingMedia(null);
    }
  }, [productId, variantCoverMap, queryClient]);

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
          title={hasVariants ? 'Fotos das Variações' : 'Foto do Produto'}
          subtitle={product?.name || 'Produto'}
          showBackButton
          onBack={goBack}
        />
        {/* Barra de progresso — só com variações */}
        {hasVariants && (
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarWrap}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${(totalWithPhoto / activeVariants.length) * 100}%`,
                    backgroundColor: brandingColors.primary,
                  } as any,
                ]}
              />
            </View>
          </View>
        )}
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

          {hasVariants ? (
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
          ) : (
            <View style={styles.productStatsRow}>
              <View style={styles.productStatChip}>
                <Text style={[styles.productStatValue, { color: productImageUrl ? brandingColors.primary : Colors.light.textSecondary }]}>
                  {productImageUrl ? '1' : '0'}
                </Text>
                <Text style={styles.productStatLabel}>foto</Text>
              </View>
              <View style={styles.productStatChip}>
                <Text style={styles.productStatValue}>—</Text>
                <Text style={styles.productStatLabel}>variações</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={18} color={Colors.light.info} />
          <Text style={styles.infoText}>
            {hasVariants
              ? 'Toque para adicionar foto • Segure para definir como capa do produto.'
              : 'Toque para adicionar foto • Segure para excluir.'}
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
                  const isVariantCover = isCover(variant);
                  const isSettingThisCover = settingCover === variant.id;
                  const isDeletingThis = deletingMedia === variant.id;

                  return (
                    <TouchableOpacity
                      key={variant.id}
                      style={[styles.variantCard, { width: cardSize }]}
                      onPress={() => pickAndUpload(variant)}
                      onLongPress={() => {
                        if (!photo) return;
                        if (!isVariantCover) {
                          setPhotoActionMenuDialog({ visible: true, variant, isVariantCover });
                        } else {
                          setDeletePhotoConfirmDialog({ visible: true, variant });
                        }
                      }}
                      activeOpacity={0.75}
                      disabled={isUploading || isSettingThisCover || isDeletingThis}
                      accessibilityLabel={`Selecionar foto da variação ${variant.size || variant.sku}`}
                    >
                      {/* Foto ou placeholder */}
                      {photo ? (
                        <View style={[styles.photoWrap, { width: cardSize, height: cardSize }]}>
                          <Image source={{ uri: photo }} style={styles.photo} />
                          {(isUploading || isSettingThisCover || isDeletingThis) && (
                            <View style={styles.uploadingOverlay}>
                              <ActivityIndicator color="#fff" size="small" />
                            </View>
                          )}
                          {/* Badge CAPA */}
                          {!isUploading && !isSettingThisCover && isVariantCover && (
                            <View style={[styles.coverBadge, { backgroundColor: brandingColors.primary }]}>
                              <Ionicons name="star" size={8} color="#fff" />
                              <Text style={styles.coverBadgeText}>CAPA</Text>
                            </View>
                          )}
                          {/* Badge câmera */}
                          {!isUploading && !isSettingThisCover && !isDeletingThis && !isVariantCover && (
                            <View style={styles.changeBadge}>
                              <Ionicons name="camera" size={12} color="#fff" />
                            </View>
                          )}
                        </View>
                      ) : (
                        <View style={[styles.photoWrap, styles.photoPlaceholder, { borderColor: Colors.light.border, width: cardSize, height: cardSize }]}>
                          {isUploading ? (
                            <ActivityIndicator color={brandingColors.primary} />
                          ) : (
                            <>
                              <Ionicons
                                name="camera-outline"
                                size={28}
                                color={Colors.light.textTertiary}
                              />
                              <Text style={styles.placeholderText}>Adicionar</Text>
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

        {/* ── Produto sem variações: gerenciador de foto de produto ── */}
        {!hasVariants && (
          <View style={styles.colorGroup}>
            <View style={styles.colorGroupHeader}>
              <Ionicons name="image-outline" size={16} color={brandingColors.primary} />
              <Text style={styles.colorGroupName}>Foto do produto</Text>
            </View>
            <TouchableOpacity
              style={[styles.variantCard, { width: cardSize, alignSelf: 'center' }]}
              onPress={pickAndUploadProduct}
              onLongPress={() => {
                if (!productImageUrl) return;
                Alert.alert('Foto do produto', '', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Excluir foto', style: 'destructive', onPress: deleteProductLevelPhoto },
                ]);
              }}
              disabled={uploadingProduct || deletingMedia === -1}
              activeOpacity={0.75}
            >
              {productImageUrl ? (
                <View style={[styles.photoWrap, { width: cardSize, height: cardSize }]}>
                  <Image source={{ uri: productImageUrl }} style={styles.photo} />
                  {(uploadingProduct || deletingMedia === -1) && (
                    <View style={styles.uploadingOverlay}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  )}
                  {!uploadingProduct && deletingMedia !== -1 && (
                    <View style={styles.changeBadge}>
                      <Ionicons name="camera" size={12} color="#fff" />
                    </View>
                  )}
                </View>
              ) : (
                <View style={[styles.photoWrap, styles.photoPlaceholder, { borderColor: Colors.light.border, width: cardSize, height: cardSize }]}>
                  {uploadingProduct ? (
                    <ActivityIndicator color={brandingColors.primary} />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={28} color={Colors.light.textTertiary} />
                      <Text style={styles.placeholderText}>Adicionar</Text>
                    </>
                  )}
                </View>
              )}
              <View style={styles.variantLabel}>
                <Text style={[styles.variantSku, { textAlign: 'center' }]}>
                  {productImageUrl ? 'Toque para trocar • Segure para excluir' : 'Toque para adicionar'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Botão de conclusão */}
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={goBack}
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
              {!hasVariants
                ? (productImageUrl ? 'Concluído' : 'Concluir sem foto')
                : totalWithPhoto === activeVariants.length
                  ? 'Concluído'
                  : `Concluir (${pendingCount} sem foto)`}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>

    {/* Permissão de galeria */}
    <ConfirmDialog
      visible={permissionDialog}
      title="Permissão necessária"
      message="Permita o acesso à galeria para adicionar fotos às variações."
      confirmText="Entendi"
      onConfirm={() => setPermissionDialog(false)}
      onCancel={() => setPermissionDialog(false)}
      type="info"
      icon="images-outline"
    />

    {/* Erro de upload */}
    <ConfirmDialog
      visible={uploadErrorDialog.visible}
      title="Erro no upload"
      message={uploadErrorDialog.message}
      confirmText="OK"
      onConfirm={() => setUploadErrorDialog({ visible: false, message: '' })}
      onCancel={() => setUploadErrorDialog({ visible: false, message: '' })}
      type="danger"
      icon="cloud-upload-outline"
    />

    {/* Erro ao definir capa */}
    <ConfirmDialog
      visible={coverErrorDialog}
      title="Erro"
      message="Não foi possível definir esta variação como capa do produto."
      confirmText="OK"
      onConfirm={() => setCoverErrorDialog(false)}
      onCancel={() => setCoverErrorDialog(false)}
      type="danger"
      icon="star-outline"
    />

    {/* Erro ao excluir foto */}
    <ConfirmDialog
      visible={deleteErrorDialog}
      title="Erro"
      message="Não foi possível excluir a foto desta variação."
      confirmText="OK"
      onConfirm={() => setDeleteErrorDialog(false)}
      onCancel={() => setDeleteErrorDialog(false)}
      type="danger"
      icon="trash-outline"
    />


    {/* Menu de ações da foto (long press) */}
    <ConfirmDialog
      visible={photoActionMenuDialog.visible}
      title={product?.name ?? 'Foto da variação'}
      message="O que deseja fazer com esta foto?"
      confirmText="Definir como capa"
      cancelText="Excluir foto"
      onConfirm={() => {
        const v = photoActionMenuDialog.variant;
        setPhotoActionMenuDialog({ visible: false, variant: null, isVariantCover: false });
        if (v) handleSetAsCover(v);
      }}
      onCancel={() => {
        const v = photoActionMenuDialog.variant;
        setPhotoActionMenuDialog({ visible: false, variant: null, isVariantCover: false });
        if (v) setDeletePhotoConfirmDialog({ visible: true, variant: v });
      }}
      type="info"
      icon="images"
    />

    {/* Confirmação de exclusão de foto */}
    <ConfirmDialog
      visible={deletePhotoConfirmDialog.visible}
      title="Excluir foto?"
      message="A foto desta variação será removida permanentemente."
      confirmText="Excluir"
      cancelText="Cancelar"
      onConfirm={() => {
        const v = deletePhotoConfirmDialog.variant;
        setDeletePhotoConfirmDialog({ visible: false, variant: null });
        if (v) handleDeletePhoto(v);
      }}
      onCancel={() => setDeletePhotoConfirmDialog({ visible: false, variant: null })}
      type="danger"
      icon="trash-outline"
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

  coverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    borderRadius: 4,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  coverBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
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

  // Banner "aplicar foto do produto"
  inheritBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.sm + 2,
    ...theme.shadows.sm,
  },
  inheritBannerThumb: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.backgroundSecondary,
    flexShrink: 0,
  },
  inheritBannerText: {
    flex: 1,
    minWidth: 0,
  },
  inheritBannerTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  inheritBannerSub: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  inheritBannerBtn: {
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.lg,
    flexShrink: 0,
  },
  inheritBannerBtnText: {
    color: '#fff',
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  inheritedBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  inheritedBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  useProductPhotoBtn: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  useProductPhotoBtnText: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
});
