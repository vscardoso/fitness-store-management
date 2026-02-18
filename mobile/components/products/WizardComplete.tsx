/**
 * WizardComplete - Tela de Resumo Final do Wizard
 *
 * Mostra:
 * - Produto criado (nome, SKU, preço, categoria, atributos)
 * - Entrada vinculada (código, quantidade)
 * - Opções: Ver Produto | Criar Outro | Ir para Estoque
 */

import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import type { UseProductWizardReturn } from '@/hooks/useProductWizard';

interface WizardCompleteProps {
  wizard: UseProductWizardReturn;
}

export function WizardComplete({ wizard }: WizardCompleteProps) {
  const router = useRouter();
  const { state, resetWizard } = wizard;
  const { createdProduct, linkedEntry } = state;

  const handleViewProduct = () => {
    if (createdProduct) {
      router.replace(`/products/${createdProduct.id}`);
    }
  };

  const handleCreateAnother = () => {
    resetWizard();
  };

  const handleGoToStock = () => {
    router.replace('/(tabs)/entries');
  };

  const handleGoToProducts = () => {
    router.replace('/(tabs)/products');
  };

  // Calcular markup se tiver custo e preço
  const markup = createdProduct?.cost_price && createdProduct?.price
    ? ((createdProduct.price - createdProduct.cost_price) / createdProduct.cost_price * 100)
    : null;

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

      {/* Card do Produto - Resumo Completo */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderIcon}>
              <Ionicons name="cube" size={22} color={Colors.light.primary} />
            </View>
            <Text style={styles.cardTitle}>Resumo do Produto</Text>
          </View>

          {/* Nome do produto */}
          <Text style={styles.productName}>{createdProduct?.name || '-'}</Text>

          {/* SKU e Categoria */}
          <View style={styles.infoGrid}>
            <View style={styles.infoGridItem}>
              <Text style={styles.infoLabel}>SKU</Text>
              <Text style={styles.infoValueMono}>{createdProduct?.sku || '-'}</Text>
            </View>
            {createdProduct?.category && (
              <View style={styles.infoGridItem}>
                <Text style={styles.infoLabel}>Categoria</Text>
                <Text style={styles.infoValue}>{createdProduct.category.name}</Text>
              </View>
            )}
          </View>

          {/* Preços */}
          <View style={styles.priceContainer}>
            <View style={styles.priceItem}>
              <Text style={styles.priceLabel}>Custo</Text>
              <Text style={styles.priceValue}>
                {formatCurrency(createdProduct?.cost_price || 0)}
              </Text>
            </View>
            <View style={styles.priceDivider} />
            <View style={styles.priceItem}>
              <Text style={styles.priceLabel}>Venda</Text>
              <Text style={styles.priceValueHighlight}>
                {formatCurrency(createdProduct?.price || 0)}
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

          {/* Atributos (se houver) */}
          {(createdProduct?.brand || createdProduct?.color || createdProduct?.size) && (
            <View style={styles.attributesContainer}>
              {createdProduct?.brand && (
                <View style={styles.attributeChip}>
                  <Ionicons name="pricetag" size={12} color={Colors.light.textSecondary} />
                  <Text style={styles.attributeText}>{createdProduct.brand}</Text>
                </View>
              )}
              {createdProduct?.color && (
                <View style={styles.attributeChip}>
                  <Ionicons name="color-palette" size={12} color={Colors.light.textSecondary} />
                  <Text style={styles.attributeText}>{createdProduct.color}</Text>
                </View>
              )}
              {createdProduct?.size && (
                <View style={styles.attributeChip}>
                  <Ionicons name="resize" size={12} color={Colors.light.textSecondary} />
                  <Text style={styles.attributeText}>{createdProduct.size}</Text>
                </View>
              )}
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Card da Entrada (se vinculada) */}
      {linkedEntry && (
        <Card style={[styles.card, styles.cardEntry]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Ionicons name="archive" size={24} color={Colors.light.success} />
              <Text style={styles.cardTitle}>Entrada Vinculada</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Codigo:</Text>
              <Text style={styles.infoValueMono}>{linkedEntry.code}</Text>
            </View>

            <View style={styles.infoRowInline}>
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Quantidade:</Text>
                <Text style={styles.infoValue}>{linkedEntry.quantity} un</Text>
              </View>
              {linkedEntry.supplier && (
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Fornecedor:</Text>
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

      {/* Caso não tenha entrada vinculada (pulou) */}
      {!linkedEntry && (
        <Card style={[styles.card, styles.cardWarning]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Ionicons name="alert-circle" size={24} color={Colors.light.warning} />
              <Text style={styles.cardTitle}>Produto sem Estoque</Text>
            </View>
            <Text style={styles.warningText}>
              O produto foi cadastrado na sua loja com estoque zero.
              Ele já aparece na lista de produtos, mas{' '}
              <Text style={styles.warningTextBold}>não pode ser vendido</Text>{' '}
              até você vincular uma entrada de estoque.
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
                  Adicione este produto à entrada com quantidade e custo
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Botões de Ação */}
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
          {createdProduct && (
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
            icon={linkedEntry ? "archive" : "grid"}
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
  },
  productName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: theme.spacing.md,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  infoGridItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.light.text,
    fontWeight: '500',
  },
  infoValueMono: {
    fontSize: 14,
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
    fontSize: 15,
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
  infoRow: {
    marginBottom: theme.spacing.sm,
  },
  infoRowInline: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
  },
  infoCol: {
    flex: 1,
  },
  fifoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  fifoText: {
    fontSize: 13,
    color: Colors.light.success,
    fontWeight: '500',
  },
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
