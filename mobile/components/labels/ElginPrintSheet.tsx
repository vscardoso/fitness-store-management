/**
 * Bottom sheet para impressão na Elgin L42 Pro.
 * Seleciona variantes, define quantidades e envia job para o backend.
 *
 * Layout da etiqueta impressa (verso, 55×65mm):
 *   - QR Code centralizado (dados da peça)
 *   - Nome do produto
 *   - Cor | Tamanho
 *   - SKU
 *   - Preço (opcional)
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';

import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import {
  listPrinters,
  printLabelsBatch,
  statusLabel,
} from '@/services/printService';
import type { LabelPrinter, PrintVariantItem } from '@/types/printer';
import type { ProductVariant } from '@/types/productVariant';

interface Props {
  visible: boolean;
  onClose: () => void;
  productId: number;
  productName: string;
  variants: ProductVariant[];
}

function QuantityControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.qtyRow}>
      <TouchableOpacity
        style={styles.qtyBtn}
        onPress={() => onChange(Math.max(0, value - 1))}
        activeOpacity={0.7}
      >
        <Text style={styles.qtyBtnText}>-</Text>
      </TouchableOpacity>
      <Text style={styles.qtyValue}>{value}</Text>
      <TouchableOpacity
        style={styles.qtyBtn}
        onPress={() => onChange(Math.min(99, value + 1))}
        activeOpacity={0.7}
      >
        <Text style={styles.qtyBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function LabelPreview({ productName, sku }: { productName: string; sku: string }) {
  const qrData = JSON.stringify({ sku, type: 'product' });
  const MM_TO_PX = 2.2;
  const w = Math.round(55 * MM_TO_PX);
  const h = Math.round(65 * MM_TO_PX);
  const qrSize = Math.round(35 * MM_TO_PX);

  return (
    <View style={[styles.preview, { width: w, height: h }]}>
      {/* Indicação da frente pré-impressa */}
      <View style={styles.previewFront}>
        <Text style={styles.previewFrontText}>FRENTE</Text>
        <Text style={styles.previewFrontSub}>pré-impresso</Text>
      </View>
      {/* Verso impresso pela Elgin */}
      <View style={styles.previewDivider} />
      <View style={styles.previewBack}>
        <View style={styles.previewQr}>
          <QRCode value={qrData} size={qrSize} />
        </View>
        <Text style={styles.previewName} numberOfLines={1}>
          {productName}
        </Text>
        <Text style={styles.previewSku} numberOfLines={1}>
          {sku}
        </Text>
      </View>
    </View>
  );
}

export default function ElginPrintSheet({
  visible,
  onClose,
  productId,
  productName,
  variants,
}: Props) {
  const qc = useQueryClient();
  const brandingColors = useBrandingColors();

  const [items, setItems] = useState<Map<number, number>>(new Map());
  const [showPrice, setShowPrice] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [selectedPrinter, setSelectedPrinter] = useState<LabelPrinter | null>(null);

  const { data: printersData } = useQuery({
    queryKey: ['label-printers'],
    queryFn: listPrinters,
    enabled: visible,
  });

  useEffect(() => {
    if (printersData) {
      const def = printersData.items.find((p) => p.is_default) ?? printersData.items[0];
      setSelectedPrinter(def ?? null);
    }
  }, [printersData]);

  const totalLabels = Array.from(items.values()).reduce((s, v) => s + v, 0);

  const mutation = useMutation({
    mutationFn: printLabelsBatch,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['print-jobs'] });
      const errors = result.items.filter((j) => j.status === 'error');
      if (errors.length === 0) {
        Alert.alert('Enviado para impressão', `${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''} enviada${totalLabels !== 1 ? 's' : ''} para a ${selectedPrinter?.name ?? 'impressora'}.`);
        onClose();
      } else {
        Alert.alert(
          'Alguns erros',
          errors.map((e) => e.error_message).join('\n')
        );
      }
    },
    onError: (e: any) =>
      Alert.alert('Erro', e.response?.data?.detail ?? e.message),
  });

  const handlePrint = () => {
    if (!selectedPrinter) {
      Alert.alert('Impressora', 'Nenhuma impressora configurada. Vá em Configurações → Impressoras.');
      return;
    }
    if (totalLabels === 0) {
      Alert.alert('Atenção', 'Defina a quantidade de pelo menos uma variante.');
      return;
    }

    const batchItems = variants
      .filter((v) => (items.get(v.id) ?? 0) > 0)
      .map((v) => ({
        variant_id: v.id,
        quantity: items.get(v.id) ?? 0,
        show_price: showPrice,
        show_sku: showSku,
      }));

    mutation.mutate({
      printer_id: selectedPrinter.id,
      product_id: productId,
      items: batchItems,
    });
  };

  const setQty = (variantId: number, qty: number) => {
    setItems((prev) => {
      const next = new Map(prev);
      next.set(variantId, qty);
      return next;
    });
  };

  const firstVariant = variants[0];
  const previewSku = firstVariant?.sku ?? 'SKU';

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          <Text style={styles.title}>Imprimir Etiquetas</Text>
          <Text style={styles.subtitle}>Elgin L42 Pro — etiqueta 55×65mm</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {/* Preview da etiqueta */}
            <View style={styles.previewSection}>
              <LabelPreview productName={productName} sku={previewSku} />
              <View style={styles.previewLegend}>
                <Text style={styles.legendTitle}>Verso (impresso pela Elgin)</Text>
                <Text style={styles.legendSub}>QR Code com dados da peça + informações</Text>
                <Text style={styles.legendSub}>Frente pré-impressa com a marca da empresa</Text>
              </View>
            </View>

            {/* Impressora selecionada */}
            <Text style={styles.sectionLabel}>IMPRESSORA</Text>
            {selectedPrinter ? (
              <View style={styles.printerInfo}>
                <Text style={styles.printerName}>{selectedPrinter.name}</Text>
                <Text style={styles.printerMeta}>
                  {selectedPrinter.connection_type === 'ethernet'
                    ? `${selectedPrinter.ip_address}:${selectedPrinter.port}`
                    : selectedPrinter.connection_type.toUpperCase()}
                  {' · '}
                  {selectedPrinter.label_width_mm}×{selectedPrinter.label_height_mm}mm
                </Text>
              </View>
            ) : (
              <View style={[styles.printerInfo, { backgroundColor: '#EF444412' }]}>
                <Text style={[styles.printerName, { color: '#EF4444' }]}>
                  Nenhuma impressora configurada
                </Text>
                <Text style={styles.printerMeta}>Vá em Configurações → Impressoras</Text>
              </View>
            )}

            {/* Variantes + quantidades */}
            <Text style={styles.sectionLabel}>
              VARIANTES ({totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''})
            </Text>
            {variants.map((v) => (
              <View key={v.id} style={styles.variantRow}>
                <View style={styles.variantInfo}>
                  <Text style={styles.variantLabel}>
                    {[v.color, v.size].filter(Boolean).join(' | ') || 'Único'}
                  </Text>
                  <Text style={styles.variantSku}>{v.sku}</Text>
                </View>
                <QuantityControl
                  value={items.get(v.id) ?? 0}
                  onChange={(q) => setQty(v.id, q)}
                />
              </View>
            ))}

            {/* Opções da etiqueta */}
            <Text style={styles.sectionLabel}>OPÇÕES DO VERSO</Text>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>Mostrar preço</Text>
              <Switch
                value={showPrice}
                onValueChange={setShowPrice}
                trackColor={{ true: brandingColors.primary }}
              />
            </View>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>Mostrar SKU</Text>
              <Switch
                value={showSku}
                onValueChange={setShowSku}
                trackColor={{ true: brandingColors.primary }}
              />
            </View>

            <View style={{ height: theme.spacing.xxl }} />
          </ScrollView>

          {/* Botão imprimir */}
          <TouchableOpacity
            style={styles.printBtn}
            onPress={handlePrint}
            activeOpacity={0.85}
            disabled={mutation.isPending}
          >
            <LinearGradient
              colors={brandingColors.gradient as [string, string]}
              style={styles.printBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {mutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.printBtnText}>
                  Imprimir {totalLabels > 0 ? `${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''}` : ''}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: theme.borderRadius.xxl,
    borderTopRightRadius: theme.borderRadius.xxl,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    maxHeight: '90%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.border,
    alignSelf: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    color: Colors.light.text,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.md,
  },
  previewSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  preview: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.light.card,
  },
  previewFront: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFrontText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.light.textTertiary,
  },
  previewFrontSub: {
    fontSize: 7,
    color: Colors.light.textTertiary,
  },
  previewDivider: { height: 1, backgroundColor: Colors.light.border },
  previewBack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    gap: 2,
  },
  previewQr: {},
  previewName: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.light.text,
    textAlign: 'center',
  },
  previewSku: {
    fontSize: 6,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  previewLegend: { flex: 1 },
  legendTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 4,
  },
  legendSub: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  sectionLabel: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    color: Colors.light.textTertiary,
    letterSpacing: 0.5,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  printerInfo: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
  },
  printerName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  printerMeta: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  variantInfo: { flex: 1 },
  variantLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  variantSku: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: Colors.light.text,
  },
  qtyValue: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
    minWidth: 28,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  optionLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
  },
  printBtn: {
    borderRadius: theme.borderRadius.xxl,
    overflow: 'hidden',
    marginTop: theme.spacing.sm,
  },
  printBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: theme.borderRadius.xxl,
  },
  printBtnText: { color: '#fff', fontWeight: '700', fontSize: theme.fontSize.base },
});
