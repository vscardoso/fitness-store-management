/**
 * Tela de Scanner de Produtos com IA
 * Usa Claude Vision para analisar imagens e extrair dados do produto
 */

import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Text, Button, Card, Chip, ProgressBar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, theme } from '@/constants/Colors';
import { useAIScanner } from '@/hooks/useAIScanner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { DuplicateMatch } from '@/types';

const { width } = Dimensions.get('window');

export default function ScanProductScreen() {
  const router = useRouter();
  const {
    hasPermission,
    requestPermission,
    takePhoto,
    pickFromGallery,
    capturedImage,
    isAnalyzing,
    scanResult,
    error,
    processingTime,
    confirmAndCreate,
    isCreating,
    editManually,
    addToDuplicate,
    retake,
    reset,
  } = useAIScanner();

  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);

  // Solicitar permissões ao montar
  useEffect(() => {
    requestPermission();
  }, []);

  // Mostrar dialog de erro
  useEffect(() => {
    if (error) {
      setShowErrorDialog(true);
    }
  }, [error]);

  // Renderiza estado inicial - escolha de captura
  const renderInitialState = () => (
    <View style={styles.initialContainer}>
      {/* Ilustração/Ícone */}
      <View style={styles.illustrationContainer}>
        <LinearGradient
          colors={[Colors.light.primary + '20', Colors.light.secondary + '20']}
          style={styles.illustrationGradient}
        >
          <Ionicons name="scan" size={80} color={Colors.light.primary} />
        </LinearGradient>
      </View>

      <Text style={styles.initialTitle}>Scanner Inteligente</Text>
      <Text style={styles.initialSubtitle}>
        Tire uma foto do produto ou escolha da galeria.{'\n'}
        A IA irá identificar automaticamente os dados.
      </Text>

      {/* Botões de captura */}
      <View style={styles.captureButtons}>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={takePhoto}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.captureButtonGradient}
          >
            <Ionicons name="camera" size={32} color="#fff" />
            <Text style={styles.captureButtonText}>Tirar Foto</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.captureButtonOutline}
          onPress={pickFromGallery}
          activeOpacity={0.8}
        >
          <Ionicons name="images" size={32} color={Colors.light.primary} />
          <Text style={styles.captureButtonOutlineText}>Galeria</Text>
        </TouchableOpacity>
      </View>

      {/* Dicas */}
      <View style={styles.tipsContainer}>
        <Text style={styles.tipsTitle}>Dicas para melhor resultado:</Text>
        <View style={styles.tipItem}>
          <Ionicons name="sunny-outline" size={16} color={Colors.light.textSecondary} />
          <Text style={styles.tipText}>Boa iluminação</Text>
        </View>
        <View style={styles.tipItem}>
          <Ionicons name="expand-outline" size={16} color={Colors.light.textSecondary} />
          <Text style={styles.tipText}>Produto centralizado</Text>
        </View>
        <View style={styles.tipItem}>
          <Ionicons name="barcode-outline" size={16} color={Colors.light.textSecondary} />
          <Text style={styles.tipText}>Código de barras visível (se houver)</Text>
        </View>
      </View>
    </View>
  );

  // Renderiza estado de análise
  const renderAnalyzingState = () => (
    <View style={styles.analyzingContainer}>
      {/* Preview da imagem */}
      {capturedImage && (
        <View style={styles.imagePreviewContainer}>
          <Image
            source={{ uri: capturedImage }}
            style={styles.imagePreview}
            resizeMode="cover"
          />
          <View style={styles.imageOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        </View>
      )}

      <View style={styles.analyzingContent}>
        <Text style={styles.analyzingTitle}>Analisando imagem...</Text>
        <Text style={styles.analyzingSubtitle}>
          A IA está identificando o produto
        </Text>
        <ProgressBar
          indeterminate
          color={Colors.light.primary}
          style={styles.progressBar}
        />

        <View style={styles.analyzingSteps}>
          <View style={styles.stepItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.light.success} />
            <Text style={styles.stepText}>Imagem capturada</Text>
          </View>
          <View style={styles.stepItem}>
            <ActivityIndicator size={16} color={Colors.light.primary} />
            <Text style={styles.stepText}>Processando com IA...</Text>
          </View>
          <View style={styles.stepItemPending}>
            <Ionicons name="ellipse-outline" size={20} color={Colors.light.textTertiary} />
            <Text style={styles.stepTextPending}>Extraindo dados</Text>
          </View>
        </View>
      </View>
    </View>
  );

  // Renderiza resultado da análise
  const renderResultState = () => {
    if (!scanResult) return null;

    const confidenceColor =
      scanResult.confidence >= 0.8 ? Colors.light.success :
      scanResult.confidence >= 0.6 ? Colors.light.warning :
      Colors.light.error;

    const qualityColor =
      scanResult.image_quality === 'excellent' ? Colors.light.success :
      scanResult.image_quality === 'good' ? Colors.light.warning :
      Colors.light.error;

    return (
      <ScrollView
        style={styles.resultContainer}
        contentContainerStyle={styles.resultContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Preview da imagem */}
        {capturedImage && (
          <View style={styles.resultImageContainer}>
            <Image
              source={{ uri: capturedImage }}
              style={styles.resultImage}
              resizeMode="cover"
            />
            <TouchableOpacity style={styles.retakeButton} onPress={retake}>
              <Ionicons name="camera-reverse" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Badges de confiança e qualidade */}
        <View style={styles.badgesContainer}>
          <View style={[styles.badge, { backgroundColor: confidenceColor + '20' }]}>
            <Ionicons name="analytics" size={16} color={confidenceColor} />
            <Text style={[styles.badgeText, { color: confidenceColor }]}>
              {Math.round(scanResult.confidence * 100)}% confiança
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: qualityColor + '20' }]}>
            <Ionicons name="image" size={16} color={qualityColor} />
            <Text style={[styles.badgeText, { color: qualityColor }]}>
              Qualidade {scanResult.image_quality}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: Colors.light.primary + '20' }]}>
            <Ionicons name="time" size={16} color={Colors.light.primary} />
            <Text style={[styles.badgeText, { color: Colors.light.primary }]}>
              {(processingTime / 1000).toFixed(1)}s
            </Text>
          </View>
        </View>

        {/* Feedback de imagem */}
        {scanResult.image_feedback && (
          <View style={styles.feedbackCard}>
            <Ionicons name="information-circle" size={20} color={Colors.light.warning} />
            <Text style={styles.feedbackText}>{scanResult.image_feedback}</Text>
          </View>
        )}

        {/* Warnings */}
        {scanResult.warnings.length > 0 && (
          <View style={styles.warningsCard}>
            {scanResult.warnings.map((warning, index) => (
              <View key={index} style={styles.warningItem}>
                <Ionicons name="alert-circle" size={16} color={Colors.light.warning} />
                <Text style={styles.warningText}>{warning}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Dados do produto */}
        <Card style={styles.dataCard}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="cube" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Dados Identificados</Text>
            </View>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Nome</Text>
              <Text style={styles.dataValue}>{scanResult.name}</Text>
            </View>

            {scanResult.brand && (
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Marca</Text>
                <Text style={styles.dataValue}>{scanResult.brand}</Text>
              </View>
            )}

            {scanResult.description && (
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Descrição</Text>
                <Text style={styles.dataValue}>{scanResult.description}</Text>
              </View>
            )}

            <View style={styles.dataRowInline}>
              {scanResult.color && (
                <View style={styles.dataChip}>
                  <Ionicons name="color-palette" size={14} color={Colors.light.textSecondary} />
                  <Text style={styles.dataChipText}>{scanResult.color}</Text>
                </View>
              )}
              {scanResult.size && (
                <View style={styles.dataChip}>
                  <Ionicons name="resize" size={14} color={Colors.light.textSecondary} />
                  <Text style={styles.dataChipText}>{scanResult.size}</Text>
                </View>
              )}
              {scanResult.gender && (
                <View style={styles.dataChip}>
                  <Ionicons name="person" size={14} color={Colors.light.textSecondary} />
                  <Text style={styles.dataChipText}>{scanResult.gender}</Text>
                </View>
              )}
            </View>

            {scanResult.material && (
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Material</Text>
                <Text style={styles.dataValue}>{scanResult.material}</Text>
              </View>
            )}

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Categoria</Text>
              <Chip
                mode="flat"
                style={styles.categoryChip}
                textStyle={styles.categoryChipText}
              >
                {scanResult.suggested_category}
              </Chip>
            </View>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>SKU Sugerido</Text>
              <Text style={styles.dataValueMono}>{scanResult.suggested_sku}</Text>
            </View>

            {scanResult.detected_barcode && (
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Código de Barras</Text>
                <Text style={styles.dataValueMono}>{scanResult.detected_barcode}</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Preços sugeridos */}
        {(scanResult.suggested_cost_price || scanResult.suggested_sale_price) && (
          <Card style={styles.dataCard}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderIcon}>
                  <Ionicons name="cash" size={20} color={Colors.light.primary} />
                </View>
                <Text style={styles.cardTitle}>Preços Sugeridos</Text>
              </View>

              <View style={styles.priceRow}>
                {scanResult.suggested_cost_price && (
                  <View style={styles.priceItem}>
                    <Text style={styles.priceLabel}>Custo</Text>
                    <Text style={styles.priceValue}>
                      R$ {Number(scanResult.suggested_cost_price).toFixed(2)}
                    </Text>
                  </View>
                )}
                {scanResult.suggested_sale_price && (
                  <View style={styles.priceItem}>
                    <Text style={styles.priceLabel}>Venda</Text>
                    <Text style={styles.priceValueHighlight}>
                      R$ {Number(scanResult.suggested_sale_price).toFixed(2)}
                    </Text>
                  </View>
                )}
                {scanResult.markup_percentage && (
                  <View style={styles.priceItem}>
                    <Text style={styles.priceLabel}>Markup</Text>
                    <Text style={styles.priceValueMarkup}>
                      {Number(scanResult.markup_percentage).toFixed(0)}%
                    </Text>
                  </View>
                )}
              </View>

              {scanResult.price_reasoning && (
                <Text style={styles.priceReasoning}>
                  {scanResult.price_reasoning}
                </Text>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Duplicados encontrados */}
        {scanResult.possible_duplicates.length > 0 && (
          <Card style={[styles.dataCard, styles.duplicatesCard]}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: Colors.light.warning + '20' }]}>
                  <Ionicons name="copy" size={20} color={Colors.light.warning} />
                </View>
                <Text style={styles.cardTitle}>Produtos Similares</Text>
              </View>

              <Text style={styles.duplicatesSubtitle}>
                Encontramos {scanResult.possible_duplicates.length} produto(s) similar(es) no seu catálogo
              </Text>

              {scanResult.possible_duplicates.slice(0, 3).map((dup, index) => (
                <TouchableOpacity
                  key={dup.product_id}
                  style={styles.duplicateItem}
                  onPress={() => addToDuplicate(dup.product_id)}
                >
                  <View style={styles.duplicateInfo}>
                    <Text style={styles.duplicateName}>{dup.product_name}</Text>
                    <Text style={styles.duplicateSku}>SKU: {dup.sku}</Text>
                    <Text style={styles.duplicateReason}>{dup.reason}</Text>
                  </View>
                  <View style={styles.duplicateScore}>
                    <Text style={styles.duplicateScoreValue}>
                      {Math.round(dup.similarity_score * 100)}%
                    </Text>
                    <Text style={styles.duplicateScoreLabel}>similar</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.light.textTertiary} />
                </TouchableOpacity>
              ))}
            </Card.Content>
          </Card>
        )}

        {/* Tipo de produto */}
        <View style={styles.typeTagsContainer}>
          {scanResult.is_clothing && (
            <Chip icon="tshirt-crew" style={styles.typeTag}>Roupa</Chip>
          )}
          {scanResult.is_footwear && (
            <Chip icon="shoe-sneaker" style={styles.typeTag}>Calçado</Chip>
          )}
          {scanResult.is_supplement && (
            <Chip icon="pill" style={styles.typeTag}>Suplemento</Chip>
          )}
          {scanResult.is_equipment && (
            <Chip icon="dumbbell" style={styles.typeTag}>Equipamento</Chip>
          )}
          {scanResult.is_accessory && (
            <Chip icon="watch" style={styles.typeTag}>Acessório</Chip>
          )}
        </View>

        {/* Botões de ação */}
        <View style={styles.actionButtons}>
          <Button
            mode="contained"
            onPress={confirmAndCreate}
            loading={isCreating}
            disabled={isCreating}
            style={styles.primaryButton}
            labelStyle={styles.primaryButtonLabel}
            icon="check"
          >
            Criar Produto
          </Button>

          <View style={styles.secondaryButtons}>
            <Button
              mode="outlined"
              onPress={editManually}
              style={styles.secondaryButton}
              icon="pencil"
            >
              Editar
            </Button>

            <Button
              mode="outlined"
              onPress={reset}
              style={styles.secondaryButton}
              icon="refresh"
            >
              Nova Foto
            </Button>
          </View>
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />

      {/* Header */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerTop}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>

              <Text style={styles.headerTitle}>Scanner IA</Text>

              <View style={styles.headerPlaceholder} />
            </View>

            <View style={styles.headerInfo}>
              <Text style={styles.headerSubtitle}>
                {isAnalyzing
                  ? 'Processando imagem...'
                  : scanResult
                  ? 'Análise concluída'
                  : 'Capture uma imagem do produto'}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Conteúdo */}
      <View style={styles.content}>
        {!capturedImage && !isAnalyzing && !scanResult && renderInitialState()}
        {isAnalyzing && renderAnalyzingState()}
        {scanResult && !isAnalyzing && renderResultState()}
      </View>

      {/* Dialog de Erro */}
      <ConfirmDialog
        visible={showErrorDialog}
        title="Erro na Análise"
        message={error || 'Ocorreu um erro ao analisar a imagem'}
        confirmText="Tentar Novamente"
        cancelText="Voltar"
        onConfirm={() => {
          setShowErrorDialog(false);
          reset();
        }}
        onCancel={() => {
          setShowErrorDialog(false);
          router.back();
        }}
        type="danger"
        icon="alert-circle"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },

  // Header
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.md,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    marginTop: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.xl,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerPlaceholder: {
    width: 40,
  },
  headerInfo: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.95,
    textAlign: 'center',
  },

  content: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // Initial State
  initialContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  illustrationContainer: {
    marginBottom: theme.spacing.xl,
  },
  illustrationGradient: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: theme.spacing.sm,
  },
  initialSubtitle: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
  },
  captureButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  captureButton: {
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
  },
  captureButtonGradient: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
    gap: 8,
  },
  captureButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  captureButtonOutline: {
    borderWidth: 2,
    borderColor: Colors.light.primary,
    borderRadius: 16,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
    gap: 8,
  },
  captureButtonOutlineText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  tipsContainer: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    padding: theme.spacing.md,
    width: '100%',
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: theme.spacing.sm,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  tipText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },

  // Analyzing State
  analyzingContainer: {
    flex: 1,
  },
  imagePreviewContainer: {
    height: 250,
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzingContent: {
    flex: 1,
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  analyzingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: theme.spacing.sm,
  },
  analyzingSubtitle: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  progressBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    marginBottom: theme.spacing.xl,
  },
  analyzingSteps: {
    width: '100%',
    gap: theme.spacing.md,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepItemPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    opacity: 0.5,
  },
  stepText: {
    fontSize: 15,
    color: Colors.light.text,
  },
  stepTextPending: {
    fontSize: 15,
    color: Colors.light.textTertiary,
  },

  // Result State
  resultContainer: {
    flex: 1,
  },
  resultContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  resultImageContainer: {
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    position: 'relative',
  },
  resultImage: {
    width: '100%',
    height: '100%',
  },
  retakeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Badges
  badgesContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing.md,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Feedback
  feedbackCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.light.warning + '15',
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  feedbackText: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
    lineHeight: 20,
  },

  // Warnings
  warningsCard: {
    backgroundColor: Colors.light.warning + '10',
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: 8,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.text,
  },

  // Data Card
  dataCard: {
    marginBottom: theme.spacing.md,
    borderRadius: 16,
    elevation: 2,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  duplicatesCard: {
    borderColor: Colors.light.warning + '50',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.light.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  dataRow: {
    marginBottom: theme.spacing.sm,
  },
  dataLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  dataValue: {
    fontSize: 15,
    color: Colors.light.text,
    fontWeight: '500',
  },
  dataValueMono: {
    fontSize: 15,
    color: Colors.light.text,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  dataRowInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  dataChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dataChipText: {
    fontSize: 13,
    color: Colors.light.text,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.light.primary + '15',
  },
  categoryChipText: {
    color: Colors.light.primary,
    fontWeight: '600',
  },

  // Pricing
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.md,
  },
  priceItem: {
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
  },
  priceValueHighlight: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.success,
  },
  priceValueMarkup: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  priceReasoning: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Duplicates
  duplicatesSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.md,
  },
  duplicateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.sm,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    marginBottom: 8,
  },
  duplicateInfo: {
    flex: 1,
  },
  duplicateName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  duplicateSku: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: 'monospace',
  },
  duplicateReason: {
    fontSize: 11,
    color: Colors.light.textTertiary,
    marginTop: 2,
  },
  duplicateScore: {
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  duplicateScoreValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.warning,
  },
  duplicateScoreLabel: {
    fontSize: 10,
    color: Colors.light.textTertiary,
  },

  // Type Tags
  typeTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: theme.spacing.lg,
  },
  typeTag: {
    backgroundColor: Colors.light.backgroundSecondary,
  },

  // Action Buttons
  actionButtons: {
    marginTop: theme.spacing.md,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 6,
    marginBottom: theme.spacing.md,
    backgroundColor: Colors.light.primary,
  },
  primaryButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
  },
});
