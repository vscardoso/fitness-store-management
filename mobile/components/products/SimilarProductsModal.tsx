/**
 * SimilarProductsModal
 *
 * Modal de interceptação que aparece automaticamente após o scan
 * quando produtos similares são encontrados.
 *
 * UX: força o usuário a revisar os similares antes de criar
 * um produto novo, evitando duplicatas no catálogo.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, theme } from '@/constants/Colors';
import type { DuplicateMatch } from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SimilarProductsModalProps {
  visible: boolean;
  duplicates: DuplicateMatch[];
  scannedName: string;
  onUseProduct: (productId: number, productName: string) => void;
  onCreateNew: () => void;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.90) return Colors.light.error;     // altíssima semelhança → vermelho
  if (score >= 0.75) return Colors.light.warning;   // alta → laranja
  return Colors.light.success;                       // média → verde (pode ser outro produto)
}

function scoreLabel(score: number): string {
  if (score >= 1.0)  return 'IDÊNTICO';
  if (score >= 0.90) return `${Math.round(score * 100)}% similar`;
  if (score >= 0.75) return `${Math.round(score * 100)}% similar`;
  return `${Math.round(score * 100)}% similar`;
}

function isExactBarcode(dup: DuplicateMatch): boolean {
  return dup.similarity_score >= 1.0;
}

// ─── component ─────────────────────────────────────────────────────────────

export default function SimilarProductsModal({
  visible,
  duplicates,
  scannedName,
  onUseProduct,
  onCreateNew,
}: SimilarProductsModalProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const hasExactBarcode = duplicates.some(isExactBarcode);
  const bestMatch = duplicates[0]; // já ordenado por score desc no backend

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 180,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onCreateNew}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onCreateNew}
      />

      {/* Bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        {hasExactBarcode ? (
          <View style={[styles.header, styles.headerDanger]}>
            <View style={styles.headerIconBg}>
              <Ionicons name="alert-circle" size={28} color={Colors.light.error} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.headerTitle, { color: Colors.light.error }]}>
                Produto já cadastrado!
              </Text>
              <Text style={styles.headerSub}>
                Código de barras idêntico encontrado no catálogo
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.header}>
            <LinearGradient
              colors={[Colors.light.warning + '25', Colors.light.warning + '05']}
              style={styles.headerIconBg}
            >
              <Ionicons name="copy-outline" size={26} color={Colors.light.warning} />
            </LinearGradient>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Produtos similares encontrados</Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                "{scannedName}" pode já existir
              </Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: Colors.light.warning + '20' }]}>
              <Text style={[styles.countBadgeText, { color: Colors.light.warning }]}>
                {duplicates.length}
              </Text>
            </View>
          </View>
        )}

        <Text style={styles.hint}>
          Antes de criar, verifique se é um produto existente. Toque em "Usar este" para adicionar estoque.
        </Text>

        {/* Lista de similares */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {duplicates.map((dup) => {
            const color = scoreColor(dup.similarity_score);
            return (
              <View key={dup.product_id} style={styles.dupCard}>
                {/* Score pill */}
                <View style={[styles.scorePill, { backgroundColor: color + '18' }]}>
                  <Ionicons
                    name={dup.similarity_score >= 1.0 ? 'barcode-outline' : 'analytics-outline'}
                    size={13}
                    color={color}
                  />
                  <Text style={[styles.scoreText, { color }]}>
                    {scoreLabel(dup.similarity_score)}
                  </Text>
                </View>

                {/*Product info */}
                <Text style={styles.dupName} numberOfLines={2}>
                  {dup.product_name}
                </Text>

                <View style={styles.dupMeta}>
                  <Text style={styles.dupSku}>{dup.sku}</Text>

                  {/* Estoque */}
                  {dup.current_stock !== undefined && dup.current_stock !== null && (
                    <View style={styles.stockBadge}>
                      <Ionicons name="cube-outline" size={12} color={
                        dup.current_stock > 0 ? Colors.light.success : Colors.light.textTertiary
                      } />
                      <Text style={[styles.stockText, {
                        color: dup.current_stock > 0 ? Colors.light.success : Colors.light.textTertiary,
                      }]}>
                        {dup.current_stock > 0
                          ? `${dup.current_stock} em estoque`
                          : 'Sem estoque'}
                      </Text>
                    </View>
                  )}

                  {/* Custo */}
                  {dup.cost_price != null && dup.cost_price > 0 && (
                    <Text style={styles.dupCost}>
                      Custo: R$ {Number(dup.cost_price).toFixed(2)}
                    </Text>
                  )}
                </View>

                {/* Reason */}
                <Text style={styles.dupReason}>{dup.reason}</Text>

                {/* CTA */}
                <TouchableOpacity
                  style={styles.useBtn}
                  onPress={() => onUseProduct(dup.product_id, dup.product_name)}
                  activeOpacity={0.75}
                >
                  <LinearGradient
                    colors={[color + 'CC', color]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.useBtnGradient}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#fff" />
                    <Text style={styles.useBtnText}>
                      {dup.current_stock === 0 ? 'Repor estoque' : 'Usar este produto'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          {!hasExactBarcode && (
            <Button
              mode="outlined"
              onPress={onCreateNew}
              style={styles.createBtn}
              contentStyle={styles.createBtnContent}
              icon="plus"
            >
              Criar produto novo mesmo assim
            </Button>
          )}
          {hasExactBarcode && (
            <Button
              mode="contained"
              onPress={onCreateNew}
              style={styles.cancelBtn}
              contentStyle={styles.createBtnContent}
              icon="close"
              buttonColor={Colors.light.backgroundSecondary}
              textColor={Colors.light.text}
            >
              Fechar e tentar outra foto
            </Button>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.82,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },

  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  headerDanger: {
    backgroundColor: Colors.light.error + '08',
    borderRadius: 12,
    marginHorizontal: theme.spacing.md,
    marginTop: 4,
    paddingHorizontal: theme.spacing.md,
  },
  headerIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  headerSub: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  countBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },

  hint: {
    fontSize: 12,
    color: Colors.light.textTertiary,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    lineHeight: 17,
  },

  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: 10,
  },

  dupCard: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },

  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  scoreText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  dupName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    lineHeight: 20,
  },

  dupMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  dupSku: {
    fontSize: 12,
    color: Colors.light.textTertiary,
    fontFamily: 'monospace',
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  stockText: {
    fontSize: 12,
    fontWeight: '500',
  },
  dupCost: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },

  dupReason: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
  },

  useBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
  },
  useBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  useBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  createBtn: {
    borderColor: Colors.light.border,
  },
  createBtnContent: {
    paddingVertical: 4,
  },
  cancelBtn: {
    borderRadius: 10,
  },
});
