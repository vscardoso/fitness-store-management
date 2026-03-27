/**
 * WizardComplete - Tela de Resumo Final do Wizard
 *
 * Suporta dois modos:
 * - Produto simples: mostra SKU, preços, atributos
 * - Produto com variantes: mostra grade de variações com SKU e preço de cada uma
 */

import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import type { UseProductWizardReturn } from '@/hooks/useProductWizard';
import type { ProductVariant } from '@/types/productVariant';

interface WizardCompleteProps {
  wizard: UseProductWizardReturn;
}

const MAX_VARIANTS_VISIBLE = 6;

export function WizardComplete({ wizard }: WizardCompleteProps) {
  const router = useRouter();
  const { state, resetWizard } = wizard;
  const { createdProduct, linkedEntry } = state;

  // Detectar variantes
  const variants = (createdProduct as any)?.variants as ProductVariant[] | undefined;
  const activeVariants = variants?.filter(v => v.is_active) ?? [];
  const isVariantProduct = activeVariants.length > 1;

  // Preços
  const priceRange: [number, number] | null = isVariantProduct
    ? (() => {
        const prices = activeVariants.map(v => Number(v.price)).filter(p => p > 0);
        if (prices.length === 0) return null;
        return [Math.min(...prices), Math.max(...prices)];
      })()
    : null;

  const singlePrice = !isVariantProduct
    ? Number((createdProduct as any)?.price ?? 0)
    : null;
  const singleCost = !isVariantProduct
    ? Number((createdProduct as any)?.cost_price ?? 0)
    : null;
  const markup = singlePrice && singleCost && singleCost > 0
    ? ((singlePrice - singleCost) / singleCost * 100)
    : null;

  // Cores e tamanhos únicos para exibição resumida nas variantes
  const uniqueColors = isVariantProduct
    ? [...new Set(activeVariants.map(v => v.color).filter(Boolean))] as string[]
    : [];
  const uniqueSizes = isVariantProduct
    ? [...new Set(activeVariants.map(v => v.size).filter(Boolean))] as string[]
    : [];

  const visibleVariants = activeVariants.slice(0, MAX_VARIANTS_VISIBLE);
  const hiddenCount = activeVariants.length - visibleVariants.length;

  // Produto virtual (sentinel id=-1) ainda não tem página própria no banco
  const canViewProduct = !!createdProduct && createdProduct.id > 0;

  const handleViewProduct = () => {
    if (canViewProduct) {
      router.replace(`/products/${createdProduct!.id}`);
    }
  };

  const handleCreateAnother = () => {
    resetWizard();
  };

  const handleGoToStock = () => {
    router.replace('/(tabs)/inventory');
  };

  const handleGoToProducts = () => {
    router.replace('/(tabs)/products');
  };

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      {/* Ícone de Sucesso */}
      <View style={styles.successIcon}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark-done" size={56} color={Colors.light.success} />
        </View>
      </View>

      {/* Título */}
      <Text style={styles.title}>Cadastro Concluído!</Text>
      <Text style={styles.subtitle}>
        {linkedEntry
          ? 'Produto criado e vinculado ao estoque'
          : 'Produto adicionado ao catálogo'
        }
      </Text>

      {/* ───── Card do Produto ───── */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderIcon}>
              <Ionicons name="cube" size={22} color={Colors.light.primary} />
            </View>
            <Text style={styles.cardTitle}>Resumo do Produto</Text>
            {isVariantProduct && (
              <View style={styles.variantBadge}>
                <Ionicons name="layers" size={12} color={Colors.light.primary} />
                <Text style={styles.variantBadgeText}>{activeVariants.length} variações</Text>
              </View>
            )}
          </View>

          {/* Nome */}
          <Text style={styles.productName}>{createdProduct?.name || '-'}</Text>

          {/* Categoria + Brand (linha) */}
          <View style={styles.metaRow}>
            {(createdProduct as any)?.category && (
              <View style={styles.metaChip}>
                <Ionicons name="grid" size={12} color={Colors.light.textSecondary} />
                <Text style={styles.metaChipText}>{(createdProduct as any).category.name}</Text>
              </View>
            )}
            {(createdProduct as any)?.brand && (
              <View style={styles.metaChip}>
                <Ionicons name="pricetag" size={12} color={Colors.light.textSecondary} />
                <Text style={styles.metaChipText}>{(createdProduct as any).brand}</Text>
              </View>
            )}
          </View>

          {/* ── Produto SIMPLES ── */}
          {!isVariantProduct && (
            <>
              {/* SKU */}
              <View style={styles.skuRow}>
                <Text style={styles.infoLabel}>SKU</Text>
                <Text style={styles.infoValueMono}>
                  {(createdProduct as any)?.sku || '-'}
                </Text>
              </View>

              {/* Preços */}
              <View style={styles.priceContainer}>
                <View style={styles.priceItem}>
                  <Text style={styles.priceLabel}>Custo</Text>
                  <Text style={styles.priceValue}>
                    {formatCurrency(singleCost ?? 0)}
                  </Text>
                </View>
                <View style={styles.priceDivider} />
                <View style={styles.priceItem}>
                  <Text style={styles.priceLabel}>Venda</Text>
                  <Text style={styles.priceValueHighlight}>
                    {formatCurrency(singlePrice ?? 0)}
                  </Text>
                </View>
                {markup !== null && markup > 0 && (
                  <>
                    <View style={styles.priceDivider} />
                    <View style={styles.priceItem}>
                      <Text style={styles.priceLabel}>Markup</Text>
                      <Text style={styles.markupValue}>+{markup.toFixed(0)}%</Text>
                    </View>
                  </>
                )}
              </View>

              {/* Cor / Tamanho do produto simples */}
              {((createdProduct as any)?.color || (createdProduct as any)?.size) && (
                <View style={styles.attributesContainer}>
                  {(createdProduct as any)?.color && (
                    <View style={styles.attributeChip}>
                      <Ionicons name="color-palette" size={12} color={Colors.light.textSecondary} />
                      <Text style={styles.attributeText}>{(createdProduct as any).color}</Text>
                    </View>
                  )}
                  {(createdProduct as any)?.size && (
                    <View style={styles.attributeChip}>
                      <Ionicons name="resize" size={12} color={Colors.light.textSecondary} />
                      <Text style={styles.attributeText}>{(createdProduct as any).size}</Text>
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {/* ── Produto com VARIANTES ── */}
          {isVariantProduct && (
            <>
              {/* Range de preços */}
              <View style={styles.priceContainer}>
                <View style={[styles.priceItem, { flex: 2 }]}>
                  <Text style={styles.priceLabel}>Faixa de Preço</Text>
                  <Text style={styles.priceValueHighlight}>
                    {priceRange
                      ? priceRange[0] === priceRange[1]
                        ? formatCurrency(priceRange[0])
                        : `${formatCurrency(priceRange[0])} – ${formatCurrency(priceRange[1])}`
                      : '-'}
                  </Text>
                </View>
                <View style={styles.priceDivider} />
                <View style={styles.priceItem}>
                  <Text style={styles.priceLabel}>Variações</Text>
                  <Text style={styles.priceValueHighlight}>{activeVariants.length}</Text>
                </View>
              </View>

              {/* Chips de cores disponíveis */}
              {uniqueColors.length > 0 && (
                <View style={styles.variantTagsSection}>
                  <Text style={styles.variantTagsLabel}>CORES</Text>
                  <View style={styles.variantTagsRow}>
                    {uniqueColors.map(c => (
                      <View key={c} style={styles.colorChip}>
                        <Text style={styles.colorChipText}>{c}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Chips de tamanhos disponíveis */}
              {uniqueSizes.length > 0 && (
                <View style={styles.variantTagsSection}>
                  <Text style={styles.variantTagsLabel}>TAMANHOS</Text>
                  <View style={styles.variantTagsRow}>
                    {uniqueSizes.map(s => (
                      <View key={s} style={styles.sizeChip}>
                        <Text style={styles.sizeChipText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Lista de variantes */}
              <View style={styles.variantListContainer}>
                <Text style={styles.variantListTitle}>Variações criadas</Text>
                {visibleVariants.map((v, idx) => {
                  const label = [v.color, v.size].filter(Boolean).join(' / ') || v.sku;
                  const varCost = v.cost_price != null ? Number(v.cost_price) : null;
                  const varMarkup = varCost && varCost > 0
                    ? ((Number(v.price) - varCost) / varCost * 100)
                    : null;

                  return (
                    <View
                      key={v.id ?? idx}
                      style={[
                        styles.variantRow,
                        idx < visibleVariants.length - 1 && styles.variantRowBorder,
                      ]}
                    >
                      {/* Label da variante */}
                      <View style={styles.variantRowLeft}>
                        <Text style={styles.variantLabel}>{label}</Text>
                        <Text style={styles.variantSku}>{v.sku}</Text>
                      </View>
                      {/* Preço + markup */}
                      <View style={styles.variantRowRight}>
                        <Text style={styles.variantPrice}>
                          {formatCurrency(Number(v.price))}
                        </Text>
                        {varMarkup !== null && varMarkup > 0 && (
                          <Text style={styles.variantMarkup}>+{varMarkup.toFixed(0)}%</Text>
                        )}
                      </View>
                    </View>
                  );
                })}

                {hiddenCount > 0 && (
                  <View style={styles.hiddenVariantsRow}>
                    <Ionicons name="ellipsis-horizontal" size={14} color={Colors.light.textSecondary} />
                    <Text style={styles.hiddenVariantsText}>
                      e mais {hiddenCount} variação{hiddenCount > 1 ? 'ões' : ''}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </Card.Content>
      </Card>

      {/* ───── Card da Entrada vinculada ───── */}
      {linkedEntry && (
        <Card style={[styles.card, styles.cardEntry]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Ionicons name="archive" size={24} color={Colors.light.success} />
              <Text style={styles.cardTitle}>Entrada Vinculada</Text>
            </View>

            <View style={styles.entryInfoGrid}>
              <View style={styles.entryInfoItem}>
                <Text style={styles.infoLabel}>Código</Text>
                <Text style={styles.infoValueMono}>{linkedEntry.code}</Text>
              </View>
              <View style={styles.entryInfoItem}>
                <Text style={styles.infoLabel}>
                  {isVariantProduct ? 'Total' : 'Quantidade'}
                </Text>
                <Text style={styles.infoValue}>{linkedEntry.quantity} un</Text>
              </View>
              {linkedEntry.supplier && (
                <View style={[styles.entryInfoItem, { flex: 2 }]}>
                  <Text style={styles.infoLabel}>Fornecedor</Text>
                  <Text style={styles.infoValue}>{linkedEntry.supplier}</Text>
                </View>
              )}
            </View>

            <View style={styles.fifoTag}>
              <Ionicons name="shield-checkmark" size={16} color={Colors.light.success} />
              <Text style={styles.fifoText}>Rastreabilidade FIFO ativa</Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* ───── Sem entrada vinculada ───── */}
      {!linkedEntry && (
        <Card style={[styles.card, styles.cardWarning]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Ionicons name="alert-circle" size={24} color={Colors.light.warning} />
              <Text style={styles.cardTitle}>
                {isVariantProduct ? 'Variações sem Estoque' : 'Produto sem Estoque'}
              </Text>
            </View>
            <Text style={styles.warningText}>
              {isVariantProduct
                ? `As ${activeVariants.length} variações foram cadastradas com estoque zero.`
                : 'O produto foi cadastrado com estoque zero.'
              }
              {' '}
              <Text style={styles.warningTextBold}>Não é possível vender</Text> até vincular uma entrada.
            </Text>
            <View style={styles.warningSteps}>
              <View style={styles.warningStep}>
                <Ionicons name="arrow-forward-circle" size={16} color={Colors.light.warning} />
                <Text style={styles.warningStepText}>
                  Vá em <Text style={styles.warningTextBold}>Estoque → Nova Entrada</Text>
                </Text>
              </View>
              <View style={styles.warningStep}>
                <Ionicons name="arrow-forward-circle" size={16} color={Colors.light.warning} />
                <Text style={styles.warningStepText}>
                  {isVariantProduct
                    ? 'Adicione cada variação com quantidade e custo'
                    : 'Adicione este produto à entrada com quantidade e custo'}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* ───── Botões de ação ───── */}
      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={handleCreateAnother}
          style={styles.primaryButton}
          icon="plus"
        >
          Criar Outro Produto
        </Button>

        <View style={styles.secondaryActions}>
          {canViewProduct && (
            <Button
              mode="outlined"
              onPress={handleViewProduct}
              style={styles.secondaryButton}
              icon="eye"
            >
              Ver Produto
            </Button>
          )}

          <Button
            mode="outlined"
            onPress={linkedEntry ? handleGoToStock : handleGoToProducts}
            style={styles.secondaryButton}
            icon={linkedEntry ? 'archive' : 'grid'}
          >
            {linkedEntry ? 'Ir para Estoque' : 'Ver Produtos'}
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  container: {
    padding: theme.spacing.lg,
    paddingBottom: 40,
  },
  successIcon: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.light.success + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  card: {
    marginBottom: theme.spacing.md,
    borderRadius: 16,
    elevation: 2,
    backgroundColor: '#fff',
  },
  cardEntry: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.success,
  },
  cardWarning: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.warning,
    backgroundColor: Colors.light.warning + '08',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  cardHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.light.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  variantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  variantBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  productName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: theme.spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  metaChipText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  skuRow: {
    marginBottom: theme.spacing.md,
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.light.text,
    fontWeight: '500',
  },
  infoValueMono: {
    fontSize: 13,
    color: Colors.light.text,
    fontWeight: '600',
    fontFamily: 'monospace',
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  priceItem: {
    flex: 1,
    alignItems: 'center',
  },
  priceDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.light.border,
  },
  priceLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  priceValueHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  markupValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.success,
  },
  attributesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attributeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  attributeText: {
    fontSize: 12,
    color: Colors.light.text,
    fontWeight: '500',
  },
  // ── Variantes ──
  variantTagsSection: {
    marginBottom: theme.spacing.sm,
  },
  variantTagsLabel: {
    fontSize: 10,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    fontWeight: '600',
  },
  variantTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  colorChip: {
    backgroundColor: Colors.light.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  colorChipText: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '600',
  },
  sizeChip: {
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    minWidth: 36,
    alignItems: 'center',
  },
  sizeChipText: {
    fontSize: 12,
    color: Colors.light.text,
    fontWeight: '600',
  },
  variantListContainer: {
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  variantListTitle: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  variantRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  variantRowLeft: {
    flex: 1,
  },
  variantLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  variantSku: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontFamily: 'monospace',
  },
  variantRowRight: {
    alignItems: 'flex-end',
  },
  variantPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  variantMarkup: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.success,
  },
  hiddenVariantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  hiddenVariantsText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
  },
  // ── Entrada ──
  entryInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  entryInfoItem: {
    flex: 1,
    minWidth: 80,
  },
  fifoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  fifoText: {
    fontSize: 13,
    color: Colors.light.success,
    fontWeight: '500',
  },
  // ── Aviso sem entrada ──
  warningText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  warningTextBold: {
    fontWeight: '700',
    color: Colors.light.warning,
  },
  warningSteps: {
    gap: 8,
  },
  warningStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  warningStepText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  // ── Ações ──
  actions: {
    paddingTop: theme.spacing.lg,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: theme.spacing.md,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
  },
});

export default WizardComplete;
