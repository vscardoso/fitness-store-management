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
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Colors, theme } from '@/constants/Colors';
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

// ─── Componente ───────────────────────────────────────────────────────────────

export default function VariantPhotosScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const queryClient = useQueryClient();

  // Foto local por variante (uri temporária antes de confirmar)
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [localPhotos, setLocalPhotos] = useState<Record<number, string>>({});

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ['product-variants', productId],
    queryFn: () => getProductVariants(productId),
    enabled: !!productId,
  });

  const activeVariants = variants.filter((v) => v.is_active);
  const totalWithPhoto = activeVariants.filter(
    (v) => localPhotos[v.id] || v.image_url
  ).length;
  const groups = groupByColor(activeVariants);

  const pickAndUpload = useCallback(
    async (variant: ProductVariant) => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Permita o acesso à galeria para adicionar fotos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.light.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <LinearGradient
        colors={[Colors.light.primary, Colors.light.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Fotos das Variações</Text>
          <Text style={styles.headerSubtitle}>
            {totalWithPhoto}/{activeVariants.length} com foto
          </Text>
        </View>
        {/* Barra de progresso */}
        <View style={styles.progressBarWrap}>
          <View
            style={[
              styles.progressBar,
              {
                width: activeVariants.length > 0
                  ? `${(totalWithPhoto / activeVariants.length) * 100}%`
                  : '0%',
              } as any,
            ]}
          />
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Banner informativo ─────────────────────────────────────── */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={18} color={Colors.light.info} />
          <Text style={styles.infoText}>
            Cada variação pode ter sua própria foto. Você pode adicionar agora ou depois.
          </Text>
        </View>

        {/* ── Grupos por cor ─────────────────────────────────────────── */}
        {[...groups.entries()].map(([colorName, colorVariants]) => {
          const hex = colorHex(colorName !== 'Sem cor' ? colorName : null);
          return (
            <View key={colorName} style={styles.colorGroup}>
              {/* Header da cor */}
              <View style={styles.colorGroupHeader}>
                {colorName !== 'Sem cor' && (
                  <View style={[styles.colorDot, { backgroundColor: hex }]} />
                )}
                <Text style={styles.colorGroupName}>{colorName}</Text>
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
                      style={styles.variantCard}
                      onPress={() => pickAndUpload(variant)}
                      activeOpacity={0.85}
                      disabled={isUploading}
                    >
                      {/* Foto ou placeholder */}
                      {photo ? (
                        <View style={styles.photoWrap}>
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
                        <View style={[styles.photoWrap, styles.photoPlaceholder]}>
                          {isUploading ? (
                            <ActivityIndicator color={Colors.light.primary} />
                          ) : (
                            <>
                              <Ionicons
                                name="camera-outline"
                                size={28}
                                color={Colors.light.primary}
                              />
                              <Text style={styles.placeholderText}>Adicionar</Text>
                            </>
                          )}
                        </View>
                      )}

                      {/* Label da variação */}
                      <View style={styles.variantLabel}>
                        {variant.size ? (
                          <View style={styles.sizePill}>
                            <Text style={styles.sizePillText}>{variant.size}</Text>
                          </View>
                        ) : (
                          <Text style={styles.variantSku} numberOfLines={1}>
                            {variant.sku}
                          </Text>
                        )}
                        {photo && !isUploading && (
                          <Ionicons
                            name="checkmark-circle"
                            size={14}
                            color={Colors.light.success}
                          />
                        )}
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
          </View>
        )}

        {/* Botão de conclusão */}
        <Button
          mode="contained"
          onPress={() => router.back()}
          icon="check"
          style={styles.doneBtn}
          contentStyle={styles.doneBtnContent}
        >
          {totalWithPhoto === activeVariants.length
            ? 'Concluído'
            : `Concluir (${activeVariants.length - totalWithPhoto} sem foto)`}
        </Button>
      </ScrollView>
    </View>
  );
}

const CARD_SIZE = 150;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    paddingTop: 50,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: theme.spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: theme.fontSize.xxl, fontWeight: '700', color: '#fff' },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
  progressBarWrap: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#fff',
    borderRadius: 2,
  },

  // Scroll
  scroll: { flex: 1 },
  content: { padding: theme.spacing.md, paddingBottom: 80, gap: theme.spacing.md },

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
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
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
    gap: theme.spacing.sm,
  },
  variantCard: {
    width: CARD_SIZE,
    gap: theme.spacing.xs,
  },

  // Foto
  photoWrap: {
    width: CARD_SIZE,
    height: CARD_SIZE,
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
    borderColor: Colors.light.primary,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  placeholderText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.primary,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sizePill: {
    backgroundColor: Colors.light.primary + '15',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sizePillText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  variantSku: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    flex: 1,
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

  // Done button
  doneBtn: { borderRadius: 12, marginTop: theme.spacing.sm },
  doneBtnContent: { paddingVertical: theme.spacing.sm },
});
