/**
 * Consultar peça: bipe (ou digite) o código e veja na hora o nome, o preço, quantas há em estoque e as outras
 * cores e tamanhos do mesmo produto. Serve a vendedora, o caixa e o gerente: não mostra custo.
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import ScanBar, { type ScanStatus } from '@/components/scan/ScanBar';
import { Money } from '@/components/ui/PriceDisplay';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { Colors, VALUE_COLORS } from '@/constants/Colors';
import useBackToList from '@/hooks/useBackToList';
import { useCart } from '@/hooks/useCart';
import { lookupCode, variantLabel, type LookupResult, type LookupVariant } from '@/services/codeResolver';
import { buildCartProduct } from '@/services/scanToCart';
import { playScan } from '@/utils/scanFeedback';
import { variantCodeText } from '@/utils/shortCode';
import { formatInt } from '@/utils/format';
import { useDesktopContentStyle } from '@/hooks/useLayout';

export default function ConsultScreen() {
  const desktopContent = useDesktopContentStyle();
  const router = useRouter();
  const cart = useCart();
  const { goBack } = useBackToList('/(tabs)');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [added, setAdded] = useState(false);
  const [searching, setSearching] = useState(false);
  const lastSearch = useRef(0);

  const handleCode = async (code: string) => {
    setAdded(false);
    const mine = ++lastSearch.current;
    setSearching(true);
    try {
      const found = await lookupCode(code);
      if (mine !== lastSearch.current) return;   // veio outra busca depois desta
      if (!found) {
        playScan('error');
        setStatus({ kind: 'error', text: 'Código ' + code + ' não encontrado nesta loja.' });
        return;
      }
      setResult(found);
      setSelectedId(found.variant.id);
      playScan(found.variant.current_stock > 0 ? 'ok' : 'warn');
      setStatus(found.match === 'product' && found.siblings.length > 1
        ? { kind: 'ok', text: found.product.name + ': escolha a cor e o tamanho abaixo' }
        : { kind: found.variant.current_stock > 0 ? 'ok' : 'warn', text: found.product.name + ' · ' + variantLabel(found.variant) });
    } catch (e: any) {
      if (mine !== lastSearch.current) return;
      playScan('error');
      setStatus({ kind: 'error', text: e?.message || 'Não foi possível consultar o código. Tente de novo.' });
    } finally {
      if (mine === lastSearch.current) setSearching(false);
    }
  };

  const selected: LookupVariant | null = useMemo(
    () => (result ? result.siblings.find((v) => v.id === selectedId) ?? result.variant : null),
    [result, selectedId],
  );

  const addToSale = () => {
    if (!result || !selected || selected.current_stock <= 0) return;
    const product = buildCartProduct({ ...result, variant: selected });
    const inCart = cart.getItem('v_' + selected.id)?.quantity ?? 0;
    if (inCart + 1 > selected.current_stock) {
      playScan('warn');
      setStatus({ kind: 'warn', text: 'Já estão no carrinho todas as peças em estoque (' + selected.current_stock + ').' });
      return;
    }
    if (inCart > 0) cart.updateQuantity('v_' + selected.id, inCart + 1);
    else cart.addItem(product, 1);
    playScan('ok');
    setAdded(true);
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Consultar peça" subtitle="Bipe a etiqueta para ver preço e estoque" showBackButton onBack={goBack} />
      <ScrollView contentContainerStyle={[styles.content, desktopContent]} keyboardShouldPersistTaps="handled">
        <ScanBar closeOnScan searchAsYouType onCode={handleCode} status={status} placeholder="Bipe ou digite o código (ex.: 26 ou 26-1)" />

        {searching ? (
          <ScreenLoader inline message="Consultando a peça..." style={styles.searching} />
        ) : !result || !selected ? (
          <View style={styles.empty}>
            <Ionicons name="qr-code-outline" size={44} color={Colors.light.textTertiary} />
            <Text style={styles.emptyText}>Nenhuma peça consultada ainda.</Text>
            <Text style={styles.emptyHint}>Toque em "Bipar" para usar a câmera, use o leitor de código ou digite o código da etiqueta (ex.: #101-1).</Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.brand} numberOfLines={1}>{[result.product.brand, result.product.category_name].filter(Boolean).join(' · ')}</Text>
              <Text style={styles.name}>{result.product.name}</Text>
              <Text style={styles.variant}>{variantLabel(selected)}</Text>
              <Text style={styles.code}>{[variantCodeText(selected), selected.sku].filter(Boolean).join(' · ')}</Text>

              <View style={styles.priceRow}>
                <Money value={selected.price} size={34} color={Colors.light.text} />
                <View style={[styles.stockPill, { backgroundColor: selected.current_stock > 0 ? '#DCFCE7' : '#FEE2E2' }]}>
                  <Text style={[styles.stockText, { color: selected.current_stock > 0 ? VALUE_COLORS.positive : VALUE_COLORS.negative }]}>
                    {selected.current_stock > 0 ? formatInt(selected.current_stock) + ' em estoque' : 'Sem estoque'}
                  </Text>
                </View>
              </View>

              <View style={styles.actions}>
                <AppButton
                  variant="primary" size="md" fullWidth icon="cart-outline" label="Adicionar à venda"
                  disabled={selected.current_stock <= 0} onPress={addToSale}
                />
                <View style={styles.actionsRow}>
                  <View style={styles.actionHalf}>
                    <AppButton variant="outlined" size="md" fullWidth icon="cube-outline" label="Ver produto"
                      onPress={() => router.push('/products/' + result.product.id as any)} />
                  </View>
                  <View style={styles.actionHalf}>
                    <AppButton variant="outlined" size="md" fullWidth icon="pricetag-outline" label="Etiqueta"
                      onPress={() => router.push('/products/label/' + result.product.id as any)} />
                  </View>
                </View>
              </View>
              {added && (
                <TouchableOpacity onPress={() => router.push('/(tabs)/sale' as any)} style={styles.added} activeOpacity={0.8}>
                  <Ionicons name="checkmark-circle" size={18} color={VALUE_COLORS.positive} />
                  <Text style={styles.addedText}>Adicionada ao carrinho. Toque para abrir a venda.</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                Outras cores e tamanhos ({formatInt(result.siblings.length)}) · {formatInt(result.product_stock)} peças no total
              </Text>
              {result.siblings.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.sibling, v.id === selected.id && styles.siblingActive]}
                  onPress={() => {
                    setSelectedId(v.id);
                    setAdded(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.sibName} numberOfLines={1}>{variantLabel(v)}</Text>
                    <Text style={styles.sibCode} numberOfLines={1}>{variantCodeText(v) ?? v.sku ?? ''}</Text>
                  </View>
                  <Text style={[styles.sibStock, { color: v.current_stock > 0 ? Colors.light.text : VALUE_COLORS.negative }]}>
                    {v.current_stock > 0 ? formatInt(v.current_stock) + ' un' : 'sem estoque'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
  searching: { paddingVertical: 24 },
  emptyText: { fontSize: 15, fontWeight: '600', color: Colors.light.textSecondary },
  emptyHint: { fontSize: 13, color: Colors.light.textTertiary, textAlign: 'center' },
  card: { backgroundColor: Colors.light.card, borderRadius: 18, padding: 16, gap: 6, borderWidth: 1, borderColor: Colors.light.border },
  brand: { fontSize: 12, color: Colors.light.textSecondary },
  name: { fontSize: 20, fontWeight: '800', color: Colors.light.text },
  variant: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  code: { fontSize: 12, color: Colors.light.textTertiary },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, flexWrap: 'wrap' },
  stockPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  stockText: { fontSize: 13, fontWeight: '800' },
  actions: { gap: 12, marginTop: 12 },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionHalf: { flex: 1, minWidth: 0 },
  added: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#DCFCE7', marginTop: 8 },
  addedText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#166534' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.light.textSecondary, marginBottom: 6 },
  sibling: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12 },
  siblingActive: { backgroundColor: Colors.light.backgroundSecondary },
  sibName: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  sibCode: { fontSize: 11, color: Colors.light.textTertiary },
  sibStock: { fontSize: 13, fontWeight: '700' },
});
