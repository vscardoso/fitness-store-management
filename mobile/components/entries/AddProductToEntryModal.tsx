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
import { addItemToEntry, updateEntryItem } from '@/services/stockEntryService';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';
import type { EntryItemResponse, Product, Supplier } from '@/types';

interface Props {
  visible: boolean;
  entryId: number;
  entryCode?: string;
  entrySupplierName?: string;
  /** Linhas que a entrada já tem: serve para perguntar se soma ou cria linha separada quando a variação se repete */
  entryItems?: EntryItemResponse[];
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

export default function AddProductToEntryModal({ visible, entryId, entryCode, entrySupplierName, entryItems, onClose }: Props) {
  const brand = useBrandingColors();
  const qc = useQueryClient();
  const [step, setStep] = useState<'list' | 'form' | 'supplier' | 'duplicate'>('list');
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
    // Todos os produtos ativos da loja, publicados no site ou não (`is_catalog` é só "aparece no site")
    return base.filter((p) => !q || norm(p.name).includes(q));
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
    onSuccess: () => afterLaunch(),
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível lançar. Tente de novo.'),
  });

  const afterLaunch = () => {
    ['stock-entry', 'lot-analytics', 'lot-costs'].forEach((k) => qc.invalidateQueries({ queryKey: [k, entryId] }));
    ['stock-entries', 'products', 'grouped-products', 'suppliers', 'entry-add-products'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
    onClose();
  };

  // A variação já está na entrada: quem lança decide se soma na linha que existe ou cria outra linha
  const existingLine = useMemo(() => {
    if (!choice) return undefined;
    return (entryItems ?? []).find(
      (i) => i.is_active !== false && i.product_id === choice.productId && (i.variant_id ?? null) === (choice.variantId ?? null),
    );
  }, [entryItems, choice]);

  const sumBlockReason = useMemo(() => {
    if (!existingLine) return '';
    const n = parseInt(qty, 10) || 0;
    if (n < 1) return '';
    if ((existingLine.quantity_sold ?? 0) > 0) return 'Esta linha já vendeu peças: o histórico de custo não pode ser mexido.';
    if (Math.round(unmaskCurrency(cost) * 100) !== Math.round(Number(existingLine.unit_cost) * 100))
      return `Somar só vale com o mesmo custo (a linha atual está a ${formatCurrency(Number(existingLine.unit_cost))}).`;
    const lineSupplier = existingLine.supplier_name ?? entrySupplierName ?? null;
    const newSupplier = supplier?.name ?? entrySupplierName ?? null;
    if (lineSupplier !== newSupplier) return 'O fornecedor é diferente do da linha atual.';
    const lineList = Number((existingLine as any).list_unit_cost ?? 0);
    if (Math.round(unmaskCurrency(listPrice) * 100) !== Math.round(lineList * 100)) return 'O preço cheio do fornecedor é diferente do da linha atual.';
    return '';
  }, [existingLine, qty, cost, supplier, listPrice, entrySupplierName]);

  const sumLine = useMutation({
    mutationFn: () => updateEntryItem(existingLine!.id, { quantity_received: Number(existingLine!.quantity_received) + (parseInt(qty, 10) || 0) }),
    onSuccess: () => afterLaunch(),
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível somar. Tente de novo.'),
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
    if (existingLine) { setStep('duplicate'); return; }
    add.mutate();
  };

  const list = unmaskCurrency(listPrice);
  const paid = unmaskCurrency(cost);

  return (
    <>
      <BottomSheet
        visible={visible && step !== 'supplier'}
        onDismiss={onClose}
        title={(step === 'form' || step === 'duplicate') && choice ? choice.label : 'Adicionar produto'}
        subtitle={step === 'form' ? (entryCode ? `Entrada ${entryCode}` : undefined) : entryCode ? `Lançar na entrada ${entryCode}` : undefined}
        icon="cube-outline"
        dismissOnBackdrop={!add.isPending}
        actions={
          step === 'form'
            ? [
                { label: 'Voltar', onPress: () => setStep('list'), variant: 'secondary', disabled: add.isPending },
                { label: 'Lançar na entrada', onPress: submit, variant: 'primary', loading: add.isPending, disabled: add.isPending },
              ]
            : step === 'duplicate'
              ? [{ label: 'Voltar', onPress: () => setStep('form'), variant: 'secondary', disabled: add.isPending || sumLine.isPending }]
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
        ) : step === 'duplicate' && existingLine ? (
          <View>
            <Text style={styles.note}>
              Esta peça já está nesta entrada: {existingLine.quantity_received} a {formatCurrency(Number(existingLine.unit_cost))}. Você quer lançar mais {parseInt(qty, 10) || 0}. O que fazer?
            </Text>
            <TouchableOpacity
              style={[styles.row, { marginTop: theme.spacing.md, opacity: sumBlockReason ? 0.5 : 1 }]}
              onPress={() => { setError(''); sumLine.mutate(); }}
              disabled={!!sumBlockReason || sumLine.isPending || add.isPending}
              activeOpacity={0.75}
              accessibilityLabel="Somar na linha que já existe"
            >
              <View style={[styles.rowIcon, { backgroundColor: brand.primary + '20' }]}>
                <Ionicons name="add-circle-outline" size={18} color={brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Somar na linha que já existe</Text>
                <Text style={styles.rowMeta}>
                  {sumBlockReason || `Fica ${Number(existingLine.quantity_received) + (parseInt(qty, 10) || 0)} peças a ${formatCurrency(Number(existingLine.unit_cost))}`}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.row, { marginTop: theme.spacing.sm }]}
              onPress={() => { setError(''); add.mutate(); }}
              disabled={sumLine.isPending || add.isPending}
              activeOpacity={0.75}
              accessibilityLabel="Criar uma linha separada"
            >
              <View style={[styles.rowIcon, { backgroundColor: brand.primary + '20' }]}>
                <Ionicons name="reorder-two-outline" size={18} color={brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Criar uma linha separada</Text>
                <Text style={styles.rowMeta}>Guarda este lançamento com o custo, o fornecedor e o preço cheio dele.</Text>
              </View>
            </TouchableOpacity>
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
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
