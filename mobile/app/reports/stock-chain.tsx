/**
 * Estoque atual em PDF: cada lote com peças restantes, na cadeia entrada > fornecedor > produto
 * (cor, tamanho, código, recebido, restante e custo). Pode filtrar um fornecedor. PDF gerado no servidor.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getSuppliers } from '@/services/supplierService';
import PdfActions from '@/components/ui/PdfActions';
import { getStockChainPdf } from '@/services/reportService';
import { parseApiError } from '@/utils/apiError';
import { useDesktopContentStyle } from '@/hooks/useLayout';

export default function StockChainReportScreen() {
  const brandingColors = useBrandingColors();
  const desktopContent = useDesktopContentStyle();
  const [supplierId, setSupplierId] = useState<number | null>(null);

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: getSuppliers });


  const chip = (id: number | null, label: string) => {
    const active = supplierId === id;
    return (
      <TouchableOpacity
        key={id ?? 'todos'}
        onPress={() => setSupplierId(id)}
        style={[styles.chip, active && { borderColor: brandingColors.primary, backgroundColor: brandingColors.primary + '14' }]}
        activeOpacity={0.75}
      >
        <Text style={[styles.chipText, active && { color: brandingColors.primary }]} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Estoque atual em PDF" subtitle="Entrada, fornecedor e produto" showBackButton />
      <ScrollView contentContainerStyle={[styles.content, desktopContent]}>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="document-text-outline" size={22} color={brandingColors.primary} />
            <Text style={styles.title}>O que sai no PDF</Text>
          </View>
          <Text style={styles.text}>
            Todas as peças que ainda estão no estoque, separadas por entrada (da mais antiga para a mais nova).
            Em cada entrada: fornecedor, produto, cor e tamanho, código da etiqueta, quantas vieram, quantas restam e o custo.
          </Text>
          <Text style={styles.text}>No topo vão os totais: peças, custo em estoque e valor de venda.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Fornecedor</Text>
          <View style={styles.chips}>
            {chip(null, 'Todos')}
            {suppliers.map((s) => chip(s.id, s.name))}
          </View>
        </View>

        <PdfActions getPdf={() => getStockChainPdf(supplierId)} cacheKey={String(supplierId)} shareLabel="Gerar PDF" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  text: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 240,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
  error: { color: Colors.light.error, fontSize: 13 },
});
