/**
 * Lista de reposição por fornecedor para a próxima viagem.
 * Cada grupo tem texto pronto para WhatsApp (sem preço) e botão de compartilhar.
 */
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Share, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import PageHeader from '@/components/layout/PageHeader';
import SuppliersTabs from '@/components/suppliers/SuppliersTabs';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useRestockList } from '@/hooks/useSupplierInsights';
import { formatCurrency } from '@/utils/format';
import type { RestockGroup, RestockItem } from '@/services/supplierInsightsService';

const COVERS = [
  { days: 15, label: '15 dias' },
  { days: 30, label: '30 dias' },
  { days: 60, label: '60 dias' },
  { days: 90, label: '90 dias' },
];

const itemLabel = (i: RestockItem) =>
  [i.product_name, [i.size, i.color].filter(Boolean).join(' / ')].filter(Boolean).join(' - ');

function digits(phone: string | null) {
  const d = (phone || '').replace(/\D/g, '');
  if (!d) return '';
  return d.length <= 11 ? `55${d}` : d;
}

async function sendToSupplier(group: RestockGroup) {
  const text = group.whatsapp_text || '';
  const phone = digits(group.phone);
  if (phone && Platform.OS === 'web') {
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    return;
  }
  if (phone) {
    try {
      await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`);
      return;
    } catch {
      // cai no compartilhar
    }
  }
  if (Platform.OS === 'web') {
    try {
      await navigator.clipboard.writeText(text);
      window.alert('Lista copiada. Cole na conversa com o fornecedor.');
    } catch {
      window.prompt('Copie a lista:', text);
    }
    return;
  }
  await Share.share({ message: text });
}

export default function SupplierRestockScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const [cover, setCover] = useState(30);
  const { data, isLoading, isRefetching, refetch, error } = useRestockList(cover);
  const groups = data?.groups ?? [];

  return (
    <View style={styles.container}>
      <PageHeader
        title="Reposição"
        subtitle="O que comprar na próxima viagem"
        showBackButton
        onBack={() => router.replace('/suppliers' as any)}
      />
      <SuppliersTabs active="restock" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[brandingColors.primary]} />}
      >
        <Text style={styles.label}>Cobrir quantos dias de venda?</Text>
        <View style={styles.periods}>
          {COVERS.map((c) => {
            const active = c.days === cover;
            return (
              <TouchableOpacity
                key={c.days}
                onPress={() => setCover(c.days)}
                activeOpacity={0.8}
                style={[styles.period, active && { backgroundColor: brandingColors.primary + '20', borderColor: brandingColors.primary }]}
              >
                <Text style={[styles.periodText, active && { color: brandingColors.primary }]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {data && groups.length > 0 && (
          <View style={styles.summary}>
            <Text style={styles.summaryMain}>
              {data.total_items} {data.total_items === 1 ? 'item' : 'itens'} · {data.total_qty} un
            </Text>
            <Text style={styles.summarySub}>Custo estimado {formatCurrency(data.estimated_total)}</Text>
          </View>
        )}
        {data?.rule ? <Text style={styles.rule}>{data.rule}</Text> : null}

        {isLoading ? (
          <Text style={styles.hint}>Calculando...</Text>
        ) : error ? (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.light.error} />
            <Text style={styles.emptyTitle}>Erro ao carregar a reposição</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={[styles.link, { color: brandingColors.primary }]}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={56} color={Colors.light.success} />
            <Text style={styles.emptyTitle}>Estoque em dia</Text>
            <Text style={styles.hint}>Nenhum item vendendo com estoque baixo no momento.</Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.supplier_id ?? 'sem'} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{g.supplier_name}</Text>
                  <Text style={styles.meta}>
                    {g.items.length} {g.items.length === 1 ? 'item' : 'itens'} · {g.total_qty} un · ~{formatCurrency(g.estimated_total)}
                  </Text>
                </View>
                {g.whatsapp_text ? (
                  <TouchableOpacity
                    style={[styles.send, { backgroundColor: brandingColors.primary }]}
                    activeOpacity={0.8}
                    onPress={() => sendToSupplier(g)}
                  >
                    <Ionicons name={g.phone ? 'logo-whatsapp' : 'share-outline'} size={16} color="#fff" />
                    <Text style={styles.sendText}>{g.phone ? 'WhatsApp' : 'Compartilhar'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {g.items.map((i) => (
                <View key={`${i.product_id}-${i.variant_id}`} style={styles.row}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.item} numberOfLines={2}>{itemLabel(i)}</Text>
                    <Text style={styles.meta}>
                      estoque {i.stock} · vende {i.sold_per_30_days.toFixed(1)}/mês
                    </Text>
                  </View>
                  <View style={styles.qtyBox}>
                    <Text style={styles.qty}>{i.suggested_qty}</Text>
                    <Text style={styles.qtyLabel}>comprar</Text>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xxl, gap: theme.spacing.sm },
  label: { fontSize: 12, color: Colors.light.textSecondary, fontWeight: '600', marginTop: 4 },
  periods: { flexDirection: 'row', gap: 8 },
  period: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  periodText: { fontSize: 12, fontWeight: '600', color: Colors.light.textSecondary },
  summary: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
  },
  summaryMain: { fontSize: 18, fontWeight: '800', color: Colors.light.text },
  summarySub: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 2 },
  rule: { fontSize: 11, color: Colors.light.textTertiary, textAlign: 'center' },
  hint: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, textAlign: 'center' },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 10,
    ...theme.shadows.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  meta: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 2 },
  send: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 18 },
  sendText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  item: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  qtyBox: { alignItems: 'center', minWidth: 56, backgroundColor: Colors.light.backgroundSecondary, borderRadius: 10, paddingVertical: 6 },
  qty: { fontSize: 18, fontWeight: '800', color: Colors.light.text },
  qtyLabel: { fontSize: 10, color: Colors.light.textSecondary },
  empty: { alignItems: 'center', paddingVertical: theme.spacing.xl, gap: theme.spacing.sm },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.light.text, textAlign: 'center' },
  link: { fontSize: theme.fontSize.sm, fontWeight: '600' },
});
