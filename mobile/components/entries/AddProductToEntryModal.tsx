/**
 * AddProductToEntryModal: lança um produto JÁ CADASTRADO numa entrada que já existe.
 *
 * Mesmo padrão dos outros seletores do app (BottomSheet com faixa colorida):
 * 1. Lista de produtos já carregada ao abrir, com busca por nome (filtra na hora);
 * 2. Formulário: quantidade, quanto pagou, preço de tabela (opcional) e fornecedor (padrão: o da entrada).
 * Tudo vai numa chamada só (tudo ou nada).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import BottomSheet from '@/components/ui/BottomSheet';
import SupplierPickerSheet from '@/components/suppliers/SupplierPickerSheet';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getProducts, searchProducts } from '@/services/productService';
import { addItemToEntry } from '@/services/stockEntryService';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';
import type { Product, Supplier } from '@/types';

interface Props {
  visible: boolean;
  entryId: number;
  entryCode?: string;
  entrySupplierName?: string;
  onClose: () => void;
}

interface Choice {
  productId: number;
  variantId?: number;
  label: string;
  cost: number;
  price: number;
}

const PAGE = 200;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export default function AddProductToEntryModal({ visible, entryId, entryCode, entrySupplierName, onClose }: Props) {
  const brand = useBrandingColors();
  const qc = useQueryClient();
  const [step, setStep] = useState<'list' | 'form' | 'supplier'>('list');
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<Choice | null>(null);
  const [qty, setQty] = useState('1');
  const [cost, setCost] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [error, setError] = useState('');

  // Lista já carregada ao abrir (sem precisar digitar nada)
  const { data: loaded = [], isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['entry-add-products'],
    queryFn: () => getProducts({ limit: PAGE } as any),
    enabled: visible,
    staleTime: 60 * 1000,
  });
  // Loja com muitos produtos: a busca por nome também consulta o servidor
  const needsServerSearch = visible && loaded.length >= PAGE && query.trim().length >= 2;
  const { data: found = [] } = useQuery({
    queryKey: ['entry-add-products-search', query.trim()],
    queryFn: () => searchProducts(query.trim()),
    enabled: needsServerSearch,
  });

  useEffect(() => {
    if (!visible) return;
    setStep('list');
    setQuery('');
    setChoice(null);
    setQty('1');
    setCost('');
    setListPrice('');
    setSupplier(null);
    setError('');
  }, [visible]);

  const products = useMemo(() => {
    const q = norm(query);
    const base: Product[] = needsServerSearch ? found : loaded;
    return base
      .filter((p: any) => !p.is_catalog)
      .filter((p) => !q || norm(p.name).includes(q));
  }, [loaded, found, query, needsServerSearch]);

  const pick = (p: Product, v?: any) => {
    const label = [p.name, v ? [v.color, v.size].filter(Boolean).join(' / ') : ''].filter(Boolean).join(' - ');
    const c = Number(v?.cost_price ?? (p as any).cost_price ?? 0);
    setChoice({ productId: p.id, variantId: v?.id, label, cost: c, price: Number(v?.price ?? (p as any).price ?? 0) });
    setCost(c > 0 ? maskCurrencyBR(String(Math.round(c * 100))) : '');
    setError('');
    setStep('form');
  };

  const add = useMutation({
    mutationFn: () =>
      addItemToEntry(entryId, {
        product_id: choice!.productId,
        variant_id: choice!.variantId,
        quantity_received: parseInt(qty, 10),
        unit_cost: unmaskCurrency(cost),
        selling_price: choice!.price || undefined,
        supplier_id: supplier?.id ?? undefined,
        list_unit_cost: unmaskCurrency(listPrice) > 0 ? unmaskCurrency(listPrice) : undefined,
      }),
    onSuccess: () => {
      ['stock-entry', 'lot-analytics', 'lot-costs'].forEach((k) => qc.invalidateQueries({ queryKey: [k, entryId] }));
      ['stock-entries', 'products', 'grouped-products', 'suppliers', 'entry-add-products'].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
      onClose();
    },
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível lançar. Tente de novo.'),
  });

  const submit = () => {
    const n = parseInt(qty, 10);
    if (!choice) return setError('Escolha o produto.');
    if (!n || n < 1) return setError('Informe a quantidade.');
    const paid = unmaskCurrency(cost);
    if (paid <= 0) return setError('Informe quanto você pagou em cada peça.');
    const list = unmaskCurrency(listPrice);
    if (list > 0 && list < paid) return setError('O preço de tabela não pode ser menor que o preço pago.');
    setError('');
    add.mutate();
  };

  const list = unmaskCurrency(listPrice);
  const paid = unmaskCurrency(cost);

  return (
    <>
      <BottomSheet
        visible={visible && step !== 'supplier'}
        onDismiss={onClose}
        title={step === 'form' && choice ? choice.label : 'Adicionar produto'}
        subtitle={step === 'form' ? (entryCode ? `Entrada ${entryCode}` : undefined) : entryCode ? `Lançar na entrada ${entryCode}` : undefined}
        icon="cube-outline"
        dismissOnBackdrop={!add.isPending}
        actions={
          step === 'form'
            ? [
                { label: 'Voltar', onPress: () => setStep('list'), variant: 'secondary', disabled: add.isPending },
                { label: 'Lançar na entrada', onPress: submit, variant: 'primary', loading: add.isPending, disabled: add.isPending },
              ]
            : undefined
        }
      >
        {step === 'list' ? (
          <>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={16} color={Colors.light.textTertiary} />
              <RNTextInput
                style={styles.searchInput}
                placeholder="Buscar produto pelo nome"
                placeholderTextColor={Colors.light.textTertiary}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={Colors.light.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            {isLoading ? (
              <ActivityIndicator size="small" color={brand.primary} style={{ marginVertical: 24 }} />
            ) : loadError ? (
              <View style={styles.emptyState}>
                <Ionicons name="wifi-outline" size={40} color={Colors.light.textTertiary} />
                <Text style={styles.emptyTitle}>Não foi possível carregar os produtos</Text>
                <TouchableOpacity onPress={() => refetch()} activeOpacity={0.75}>
                  <Text style={[styles.retryText, { color: brand.primary }]}>Tentar novamente</Text>
                </TouchableOpacity>
              </View>
            ) : products.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={40} color={Colors.light.textTertiary} />
                <Text style={styles.emptyTitle}>{query ? `Nenhum resultado para "${query}"` : 'Nenhum produto cadastrado'}</Text>
              </View>
            ) : (
              <View>
                {!query && <Text style={styles.sectionLabel}>PRODUTOS CADASTRADOS</Text>}
                {products.map((p) => {
                  const variants = (p.variants || []).filter((v: any) => v.is_active !== false);
                  return (
                    <View key={p.id} style={{ marginBottom: theme.spacing.sm }}>
                      <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                      {variants.length === 0 ? (
                        <TouchableOpacity style={styles.row} onPress={() => pick(p)} activeOpacity={0.75}>
                          <View style={[styles.rowIcon, { backgroundColor: brand.primary + '20' }]}>
                            <Ionicons name="shirt-outline" size={18} color={brand.primary} />
                          </View>
                          <Text style={styles.rowTitle}>Usar este produto</Text>
                        </TouchableOpacity>
                      ) : (
                        variants.map((v: any) => (
                          <TouchableOpacity key={v.id} style={styles.row} onPress={() => pick(p, v)} activeOpacity={0.75}>
                            <View style={[styles.rowIcon, { backgroundColor: brand.primary + '20' }]}>
                              <Ionicons name="shirt-outline" size={18} color={brand.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.rowTitle} numberOfLines={1}>
                                {[v.color, v.size].filter(Boolean).join(' / ') || 'Única'}
                              </Text>
                              <Text style={styles.rowMeta}>{v.current_stock ?? 0} em estoque</Text>
                            </View>
                            <Text style={[styles.rowPrice, { color: brand.primary }]}>{formatCurrency(Number(v.price))}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : (
          <View>
            <TextInput
              mode="outlined"
              label="Quantas peças"
              value={qty}
              onChangeText={(t) => setQty(t.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Quanto você pagou em cada peça"
              value={cost}
              onChangeText={(t) => setCost(maskCurrencyBR(t))}
              keyboardType="numeric"
              left={<TextInput.Affix text="R$" />}
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Preço cheio do fornecedor (opcional)"
              value={listPrice}
              onChangeText={(t) => setListPrice(maskCurrencyBR(t))}
              keyboardType="numeric"
              left={<TextInput.Affix text="R$" />}
              style={styles.input}
            />
            <Text style={styles.note}>
              Só preencha se o fornecedor deu desconto: é o preço dele antes do desconto. Não é o seu preço de venda.
            </Text>
            {list > paid && paid > 0 && (
              <Text style={styles.note}>O fornecedor deu {formatCurrency(list - paid)} de desconto por peça. Você paga {formatCurrency(paid)} em cada.</Text>
            )}
            <TouchableOpacity
              style={[styles.row, { marginTop: theme.spacing.md }]}
              onPress={() => setStep('supplier')}
              activeOpacity={0.75}
            >
              <View style={[styles.rowIcon, { backgroundColor: brand.primary + '20' }]}>
                <Ionicons name="business" size={18} color={brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowMeta}>Fornecedor</Text>
                <Text style={styles.rowTitle} numberOfLines={1}>{supplier?.name ?? entrySupplierName ?? 'o da entrada'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.light.textSecondary} />
            </TouchableOpacity>
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        )}
        {step === 'list' && !!error && <Text style={styles.error}>{error}</Text>}
      </BottomSheet>

      {/* Seletor de fornecedor: abre no lugar da folha (duas janelas ao mesmo tempo não funcionam bem no iPhone) */}
      <SupplierPickerSheet
        visible={visible && step === 'supplier'}
        onClose={() => setStep('form')}
        onSelect={(s: Supplier | null) => {
          setSupplier(s);
          setStep('form');
        }}
        productId={choice?.productId}
        productName={choice?.label}
        selectedSupplierId={supplier?.id ?? null}
        noneLabel={`Usar o fornecedor da entrada${entrySupplierName ? ` (${entrySupplierName})` : ''}`}
      />
    </>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    height: 44,
    marginBottom: theme.spacing.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.light.text },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Colors.light.textTertiary,
    marginBottom: theme.spacing.sm,
  },
  productName: { fontSize: 13, fontWeight: '700', color: Colors.light.textSecondary, marginBottom: 4, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.card,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  rowMeta: { fontSize: 12, color: Colors.light.textSecondary },
  rowPrice: { fontSize: 14, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyTitle: { fontSize: 14, color: Colors.light.textSecondary, textAlign: 'center' },
  retryText: { fontSize: 14, fontWeight: '700' },
  input: { marginTop: theme.spacing.sm, backgroundColor: Colors.light.card },
  note: { fontSize: 13, color: Colors.light.textSecondary, marginTop: theme.spacing.sm },
  error: { color: Colors.light.error, marginTop: theme.spacing.md, fontSize: 13 },
});
