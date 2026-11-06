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
import { ProductPickerList, groupedToProduct } from '@/components/products/ProductPicker';
import { addItemToEntry, addVariantToEntry, updateEntryItem } from '@/services/stockEntryService';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';
import { findExistingLine, sumBlockReason, summedQuantity } from '@/utils/entryLine';
import type { EntryItemResponse, Product, ProductGrouped, Supplier } from '@/types';

interface Props {
  visible: boolean;
  entryId: number;
  entryCode?: string;
  entrySupplierName?: string;
  /** Linhas que a entrada já tem: serve para perguntar se soma ou cria linha separada quando a variação se repete */
  entryItems?: EntryItemResponse[];
  /** Abre direto em "nova cor ou tamanho" deste produto (botão da página do produto) */
  newVariantOf?: ProductGrouped | null;
  onClose: () => void;
}

interface Choice {
  productId: number;
  variantId?: number;
  label: string;
  cost: number;
  price: number;
}

export default function AddProductToEntryModal({ visible, entryId, entryCode, entrySupplierName, entryItems, newVariantOf, onClose }: Props) {
  const brand = useBrandingColors();
  const qc = useQueryClient();
  const [step, setStep] = useState<'list' | 'form' | 'supplier' | 'duplicate' | 'newVariant'>('list');
  const [newVar, setNewVar] = useState<{ product: ProductGrouped; color: string; size: string } | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [qty, setQty] = useState('1');
  const [cost, setCost] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setStep('list');
    setNewVar(null);
    setChoice(null);
    setQty('1');
    setCost('');
    setListPrice('');
    setSupplier(null);
    setError('');
    if (newVariantOf) {
      // produto de uma cor só: a cor já vem preenchida (o caso comum é lançar outro tamanho da mesma peça)
      const cores = [...new Set((newVariantOf.variants ?? []).map((v) => (v.color || '').trim()).filter(Boolean))];
      setNewVar({ product: newVariantOf, color: cores.length === 1 ? cores[0] : '', size: '' });
      const c = Number(newVariantOf.variants?.[0]?.cost_price ?? 0);
      setCost(c > 0 ? maskCurrencyBR(String(Math.round(c * 100))) : '');
      setStep('newVariant');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
  const existingLine = useMemo(
    () => (choice ? findExistingLine(entryItems, choice.productId, choice.variantId) : undefined),
    [entryItems, choice],
  );

  const sumBlockText = useMemo(
    () =>
      sumBlockReason(
        existingLine,
        {
          qty: parseInt(qty, 10) || 0,
          cost: unmaskCurrency(cost),
          listPrice: unmaskCurrency(listPrice),
          supplierName: supplier?.name ?? null,
          entrySupplierName: entrySupplierName ?? null,
        },
        formatCurrency,
      ),
    [existingLine, qty, cost, supplier, listPrice, entrySupplierName],
  );

  const sumLine = useMutation({
    mutationFn: () => updateEntryItem(existingLine!.id, { quantity_received: summedQuantity(existingLine!, parseInt(qty, 10) || 0) }),
    onSuccess: () => afterLaunch(),
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível somar. Tente de novo.'),
  });

  const addNewVariant = useMutation({
    mutationFn: () =>
      addVariantToEntry(entryId, {
        product_id: newVar!.product.id,
        color: newVar!.color.trim() || undefined,
        size: newVar!.size.trim() || undefined,
        quantity: parseInt(qty, 10),
        cost_price: unmaskCurrency(cost),
        price: Number(newVar!.product.variants?.[0]?.price ?? newVar!.product.min_price ?? 0) || undefined,
      }),
    onSuccess: () => afterLaunch(),
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível lançar. Tente de novo.'),
  });

  // cores e tamanhos que o produto já tem: viram botões para tocar (lista intuitiva, sem digitar)
  const existingColors = useMemo(
    () => [...new Set((newVar?.product.variants ?? []).map((v) => (v.color || '').trim()).filter(Boolean))],
    [newVar?.product],
  );
  const existingSizes = useMemo(() => {
    const own = (newVar?.product.variants ?? []).map((v) => (v.size || '').trim().toUpperCase()).filter(Boolean);
    const numeric = own.some((s) => /^\d+$/.test(s));
    const base = numeric ? ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42'] : ['PP', 'P', 'M', 'G', 'GG', 'XG'];
    const ordem = ['ÚNICO', 'PP', 'P', 'P/M', 'M', 'M/G', 'G', 'G/GG', 'GG', 'XG', 'XGG'];
    const rank = (s: string) => (/^\d+$/.test(s) ? Number(s) : 1000 + (ordem.indexOf(s) >= 0 ? ordem.indexOf(s) : 99));
    return [...new Set([...own, ...base])].sort((a, b) => rank(a) - rank(b));
  }, [newVar?.product]);

  const submitNewVariant = () => {
    if (!newVar) return;
    if (!newVar.color.trim() && !newVar.size.trim()) return setError('Informe a cor ou o tamanho.');
    // produto que tem cor: a peça nova precisa de cor (senão vira uma linha "Único" separada na grade)
    if (existingColors.length && !newVar.color.trim()) return setError('Escolha a cor da peça.');
    if ((newVar.product.variants ?? []).some((v) => (v.size || '').trim()) && !newVar.size.trim()) return setError('Escolha o tamanho da peça.');
    const n = parseInt(qty, 10);
    if (!n || n < 1) return setError('Informe a quantidade.');
    if (unmaskCurrency(cost) <= 0) return setError('Informe quanto você pagou em cada peça.');
    const exists = (newVar.product.variants ?? []).some(
      (v) => (v.color || '').trim().toLowerCase() === newVar.color.trim().toLowerCase() && (v.size || '').trim().toLowerCase() === newVar.size.trim().toLowerCase(),
    );
    if (exists) return setError('Esta cor e tamanho já existem: volte e escolha a peça na lista.');
    setError('');
    addNewVariant.mutate();
  };

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
        title={step === 'newVariant' && newVar ? newVar.product.name : (step === 'form' || step === 'duplicate') && choice ? choice.label : 'Produto já cadastrado'}
        subtitle={step === 'form' ? (entryCode ? `Entrada ${entryCode}` : undefined) : entryCode ? `Lançar na entrada ${entryCode}` : undefined}
        icon="cube-outline"
        dismissOnBackdrop={!add.isPending && !addNewVariant.isPending}
        actions={
          step === 'form'
            ? [
                { label: 'Voltar', onPress: () => setStep('list'), variant: 'secondary', disabled: add.isPending },
                { label: 'Lançar na entrada', onPress: submit, variant: 'primary', loading: add.isPending, disabled: add.isPending },
              ]
            : step === 'newVariant'
              ? [
                  { label: 'Voltar', onPress: () => setStep('list'), variant: 'secondary', disabled: addNewVariant.isPending },
                  { label: 'Lançar na entrada', onPress: submitNewVariant, variant: 'primary', loading: addNewVariant.isPending, disabled: addNewVariant.isPending },
                ]
              : step === 'duplicate'
              ? [{ label: 'Voltar', onPress: () => setStep('form'), variant: 'secondary', disabled: add.isPending || sumLine.isPending }]
              : undefined
        }
      >
        {step === 'list' ? (
          <ProductPickerList
            onPick={(g, v) => pick(groupedToProduct(g), v)}
            onNewVariant={(g) => {
              setNewVar({ product: g, color: '', size: '' });
              setQty('1');
              const c = Number(g.variants?.[0]?.cost_price ?? 0);
              setCost(c > 0 ? maskCurrencyBR(String(Math.round(c * 100))) : '');
              setError('');
              setStep('newVariant');
            }}
            markedVariantIds={(entryItems ?? []).filter((i) => i.is_active !== false && i.variant_id).map((i) => i.variant_id as number)}
          />
        ) : step === 'newVariant' && newVar ? (
          <View>
            <Text style={styles.note}>
              Nova cor ou tamanho de {newVar.product.name}: é o mesmo produto, a peça ganha o próximo código dele.
            </Text>
            {existingColors.length > 0 && (
              <View style={styles.chipRow}>
                {existingColors.map((c) => {
                  const on = newVar.color.trim().toLowerCase() === c.toLowerCase();
                  return (
                    <TouchableOpacity key={c} onPress={() => setNewVar({ ...newVar, color: c })}
                      style={[styles.chip, on && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}>
                      <Text style={[styles.chipText, on && { color: brand.primary, fontWeight: '700' }]}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <TextInput mode="outlined" label={existingColors.length ? 'Cor (toque acima ou digite outra)' : 'Cor'} value={newVar.color}
              onChangeText={(t) => setNewVar({ ...newVar, color: t })} style={styles.input} />
            <View style={styles.chipRow}>
              {existingSizes.map((s) => {
                const on = newVar.size.trim().toUpperCase() === s;
                return (
                  <TouchableOpacity key={s} onPress={() => setNewVar({ ...newVar, size: s })}
                    style={[styles.chip, on && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}>
                    <Text style={[styles.chipText, on && { color: brand.primary, fontWeight: '700' }]}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput mode="outlined" label="Tamanho (toque acima ou digite outro)" value={newVar.size}
              onChangeText={(t) => setNewVar({ ...newVar, size: t })} autoCapitalize="characters" style={styles.input} />
            {(!!newVar.color.trim() || !!newVar.size.trim()) && (
              <Text style={styles.note}>Vai entrar: {[newVar.color.trim(), newVar.size.trim().toUpperCase()].filter(Boolean).join(' · ')}</Text>
            )}
            <TextInput mode="outlined" label="Quantas peças" value={qty} onChangeText={(t) => setQty(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" style={styles.input} />
            <TextInput
              mode="outlined" label="Quanto você pagou em cada peça" value={cost}
              onChangeText={(t) => setCost(maskCurrencyBR(t))} keyboardType="numeric" left={<TextInput.Affix text="R$" />} style={styles.input}
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        ) : step === 'duplicate' && existingLine ? (
          <View>
            <Text style={styles.note}>
              Esta peça já está nesta entrada: {existingLine.quantity_received} a {formatCurrency(Number(existingLine.unit_cost))}. Você quer lançar mais {parseInt(qty, 10) || 0}. O que fazer?
            </Text>
            <TouchableOpacity
              style={[styles.row, { marginTop: theme.spacing.md, opacity: sumBlockText ? 0.5 : 1 }]}
              onPress={() => { setError(''); sumLine.mutate(); }}
              disabled={!!sumBlockText || sumLine.isPending || add.isPending}
              activeOpacity={0.75}
              accessibilityLabel="Somar na linha que já existe"
            >
              <View style={[styles.rowIcon, { backgroundColor: brand.primary + '20' }]}>
                <Ionicons name="add-circle-outline" size={18} color={brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Somar na linha que já existe</Text>
                <Text style={styles.rowMeta}>
                  {sumBlockText || `Fica ${summedQuantity(existingLine, parseInt(qty, 10) || 0)} peças a ${formatCurrency(Number(existingLine.unit_cost))}`}
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card },
  chipText: { fontSize: 13, color: Colors.light.text },
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
