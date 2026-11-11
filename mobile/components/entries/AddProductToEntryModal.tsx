/**
 * AddProductToEntryModal: lança um produto JÁ CADASTRADO numa entrada que já existe.
 *
 * Mesmo padrão dos outros seletores do app (BottomSheet com faixa colorida):
 * 1. Lista de produtos já carregada ao abrir, com busca por nome (filtra na hora);
 * 2. Formulário: quantidade, quanto pagou, preço de tabela (opcional) e fornecedor (padrão: o da entrada).
 * Tudo vai numa chamada só (tudo ou nada).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Platform, StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import BottomSheet from '@/components/ui/BottomSheet';
import AppButton from '@/components/ui/AppButton';
import { uploadVariantImageWithFallback } from '@/services/uploadService';
import { uploadProductMediaWithFallback } from '@/services/productMediaService';
import SupplierPickerSheet from '@/components/suppliers/SupplierPickerSheet';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { ProductPickerList, groupedToProduct } from '@/components/products/ProductPicker';
import { addItemToEntry, addVariantsBatchToEntry, updateEntryItem } from '@/services/stockEntryService';
import EntryVariantGrid from '@/components/entries/EntryVariantGrid';
import { buildCells, existingColors as gridExistingColors, gridSummary, toBatchLines, type GridVariant } from '@/utils/entryGrid';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';
import { findExistingLine, sumBlockReason, summedQuantity } from '@/utils/entryLine';
import { mergeLaunched, type LaunchedLine } from '@/utils/labelFocus';
import type { EntryItemResponse, Product, ProductGrouped, Supplier } from '@/types';

interface Props {
  visible: boolean;
  entryId: number;
  entryCode?: string;
  entrySupplierName?: string;
  /** Linhas que a entrada já tem: serve para perguntar se soma ou cria linha separada quando a variação se repete */
  entryItems?: EntryItemResponse[];
  /** Abre direto na grade de lançamento (cores x tamanhos) deste produto (botão da página do produto) */
  newVariantOf?: ProductGrouped | null;
  /** Chamado depois que as peças entraram, com o que foi lançado (a tela abre as etiquetas só dessas peças) */
  onLaunched?: (lines: LaunchedLine[]) => void;
  onClose: () => void;
}

interface Choice {
  productId: number;
  variantId?: number;
  label: string;
  cost: number;
  price: number;
}

export default function AddProductToEntryModal({ visible, entryId, entryCode, entrySupplierName, entryItems, newVariantOf, onLaunched, onClose }: Props) {
  const brand = useBrandingColors();
  const qc = useQueryClient();
  const [step, setStep] = useState<'list' | 'form' | 'supplier' | 'duplicate' | 'grade'>('list');
  const [gridProduct, setGridProduct] = useState<ProductGrouped | null>(null);   // produto da grade (várias cores e tamanhos de uma vez)
  const [gColors, setGColors] = useState<string[]>([]);
  const [gSizes, setGSizes] = useState<string[]>([]);
  const [gQty, setGQty] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<Choice | null>(null);
  const [qty, setQty] = useState('1');
  const [cost, setCost] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [error, setError] = useState('');
  const [group, setGroup] = useState<ProductGrouped | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [supplierBack, setSupplierBack] = useState<'form' | 'grade'>('form');   // de onde veio a escolha do fornecedor

  // Abre a grade de um produto: produto de uma cor só já vem com a cor marcada (o caso comum é chegar outro tamanho da mesma peça)
  const openGrid = (g: ProductGrouped) => {
    const cores = gridExistingColors((g.variants ?? []) as unknown as GridVariant[]);
    setGridProduct(g);
    setGColors(cores.length === 1 ? cores : []);
    setGSizes([]);
    setGQty({});
    const c = Number(g.variants?.[0]?.cost_price ?? 0);
    setCost(c > 0 ? maskCurrencyBR(String(Math.round(c * 100))) : '');
    setListPrice('');
    setError('');
    setStep('grade');
  };

  useEffect(() => {
    if (!visible) return;
    setStep('list');
    setGridProduct(null);
    setGColors([]);
    setGSizes([]);
    setGQty({});
    setChoice(null);
    setQty('1');
    setCost('');
    setListPrice('');
    setSupplier(null);
    setError('');
    setGroup(null);
    setPhoto(null);
    if (newVariantOf) openGrid(newVariantOf);
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

  // Foto da peça: tira na hora (celular) ou escolhe da galeria; só é enviada depois que a peça entra na entrada
  const getPhoto = async (fromCamera: boolean) => {
    try {
      const useCamera = fromCamera && Platform.OS !== 'web';
      const perm = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        setError(useCamera ? 'Para tirar a foto, permita o uso da câmera nas configurações do aparelho.' : 'Para escolher a foto, permita o acesso às fotos nas configurações do aparelho.');
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.85 };
      const r = useCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (!r.canceled && r.assets[0]) {
        setPhoto(r.assets[0].uri);
        setError('');
      }
    } catch {
      setError('Não foi possível abrir a foto. Tente de novo.');
    }
  };

  const sendPhoto = async (variantId?: number | null, productId?: number | null) => {
    if (!photo) return;
    try {
      if (variantId) await uploadVariantImageWithFallback(variantId, photo);
      else if (productId) await uploadProductMediaWithFallback(productId, photo);
    } catch {
      Alert.alert('Peça lançada, mas a foto não foi enviada', 'Envie a foto de novo pela tela Fotos do produto.');
    }
  };

  // Foto que a peça já tem (da variação; produto sem variação usa a do produto): aparece para a pessoa ver e poder trocar
  const currentPhoto = useMemo(() => {
    if (!choice) return null;
    const vs = group?.variants ?? [];
    if (choice.variantId) return ((vs.find((v) => v.id === choice.variantId) as any)?.image_url as string | null) || null;
    return vs.length === 0 ? group?.image_url || null : null;
  }, [choice, group]);

  const photoBlock = (
    <View style={styles.photoBox}>
      {photo || (step === 'form' && currentPhoto) ? <Image source={{ uri: (photo || currentPhoto) as string }} style={styles.photoThumb} /> : (
        <View style={[styles.photoThumb, styles.photoEmpty]}>
          <Ionicons name="camera-outline" size={22} color={Colors.light.textTertiary} />
        </View>
      )}
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <Text style={styles.rowTitle}>{step === 'form' && currentPhoto && !photo ? 'Foto atual da peça' : photo ? 'Foto nova (vai trocar a atual)' : 'Foto da peça (opcional)'}</Text>
        <View style={styles.photoActions}>
          {Platform.OS !== 'web' && <AppButton label={photo ? 'Tirar outra' : currentPhoto && step === 'form' ? 'Tirar nova' : 'Tirar foto'} icon="camera-outline" variant="outlined" size="sm" onPress={() => getPhoto(true)} />}
          <AppButton label={photo ? 'Trocar' : currentPhoto && step === 'form' ? 'Escolher nova' : 'Galeria'} icon="images-outline" variant="outlined" size="sm" onPress={() => getPhoto(false)} />
          {!!photo && <AppButton label="Desfazer" variant="text" size="sm" onPress={() => setPhoto(null)} />}
        </View>
      </View>
    </View>
  );

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
    onSuccess: async () => {
      await sendPhoto(choice?.variantId, choice?.productId);
      afterLaunch(choice?.variantId ? [{ variantId: choice.variantId, quantity: parseInt(qty, 10) || 0 }] : []);
    },
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível lançar. Tente de novo.'),
  });

  // Fecha a janela e, quando se sabe quais peças entraram, deixa a tela da entrada abrir as etiquetas só delas
  const afterLaunch = (launched: LaunchedLine[] = []) => {
    ['stock-entry', 'lot-analytics', 'lot-costs'].forEach((k) => qc.invalidateQueries({ queryKey: [k, entryId] }));
    ['stock-entries', 'products', 'grouped-products', 'suppliers', 'entry-add-products'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
    onClose();
    const lines = mergeLaunched(launched);
    if (lines.length > 0) onLaunched?.(lines);
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
    onSuccess: () => afterLaunch(existingLine ? [{ variantId: existingLine.variant_id as number, quantity: parseInt(qty, 10) || 0 }] : []),
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível somar. Tente de novo.'),
  });

  const gridCells = useMemo(
    () => (gridProduct ? buildCells((gridProduct.variants ?? []) as unknown as GridVariant[], gColors, gSizes, gQty) : []),
    [gridProduct, gColors, gSizes, gQty],
  );
  const gridSum = useMemo(() => gridSummary(gridCells), [gridCells]);

  const addBatch = useMutation({
    mutationFn: () =>
      addVariantsBatchToEntry(entryId, {
        product_id: gridProduct!.id,
        items: toBatchLines(gridCells, unmaskCurrency(cost), unmaskCurrency(listPrice)),
        supplier_id: supplier?.id ?? undefined,
      }),
    onSuccess: (res) => afterLaunch(res.items.map((i) => ({ variantId: i.variant_id, quantity: i.quantity_received }))),
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível lançar. Nada foi gravado. Tente de novo.'),
  });

  const submitGrid = () => {
    if (!gridProduct) return;
    if (gridSum.pieces === 0) return setError('Digite a quantidade de ao menos uma combinação de cor e tamanho.');
    if (unmaskCurrency(cost) <= 0) return setError('Informe quanto você pagou em cada peça.');
    if (unmaskCurrency(listPrice) > 0 && unmaskCurrency(listPrice) < unmaskCurrency(cost)) return setError('O preço de tabela não pode ser menor que o preço pago.');
    setError('');
    addBatch.mutate();
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
        title={step === 'grade' && gridProduct ? gridProduct.name : (step === 'form' || step === 'duplicate') && choice ? choice.label : 'Produto já cadastrado'}
        subtitle={step === 'form' ? (entryCode ? `Entrada ${entryCode}` : undefined) : entryCode ? `Lançar na entrada ${entryCode}` : undefined}
        icon="cube-outline"
        tall={step === 'list'}
        dismissOnBackdrop={!add.isPending && !addBatch.isPending}
        actions={
          step === 'form'
            ? [
                { label: 'Voltar', onPress: () => setStep('list'), variant: 'secondary', disabled: add.isPending },
                { label: 'Lançar na entrada', onPress: submit, variant: 'primary', loading: add.isPending, disabled: add.isPending },
              ]
            : step === 'grade'
              ? [
                  { label: 'Voltar', onPress: () => setStep('list'), variant: 'secondary', disabled: addBatch.isPending },
                  { label: gridSum.pieces > 0 ? `Lançar ${gridSum.pieces} peça${gridSum.pieces !== 1 ? 's' : ''}` : 'Lançar na entrada', onPress: submitGrid, variant: 'primary', loading: addBatch.isPending, disabled: addBatch.isPending },
                ]
              : step === 'duplicate'
              ? [{ label: 'Voltar', onPress: () => setStep('form'), variant: 'secondary', disabled: add.isPending || sumLine.isPending }]
              : undefined
        }
      >
        {step === 'list' ? (
          <ProductPickerList
            onPick={(g, v) => { setGroup(g); setPhoto(null); pick(groupedToProduct(g), v); }}
            onNewVariant={(g) => { setPhoto(null); openGrid(g); }}
            markedVariantIds={(entryItems ?? []).filter((i) => i.is_active !== false && i.variant_id).map((i) => i.variant_id as number)}
          />
        ) : step === 'grade' && gridProduct ? (
          <EntryVariantGrid
            product={gridProduct}
            colors={gColors}
            sizes={gSizes}
            qty={gQty}
            onColors={setGColors}
            onSizes={setGSizes}
            onQty={setGQty}
            cost={cost}
            onCost={setCost}
            listPrice={listPrice}
            onListPrice={setListPrice}
            supplierName={supplier?.name ?? entrySupplierName ?? 'o da entrada'}
            onPickSupplier={() => { setSupplierBack('grade'); setStep('supplier'); }}
            error={error}
          />
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
              onPress={() => { setSupplierBack('form'); setStep('supplier'); }}
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
            {photoBlock}
            {!!group && (
              <TouchableOpacity
                style={[styles.row, { marginTop: theme.spacing.sm }]}
                onPress={() => { setPhoto(null); openGrid(group); }}
                activeOpacity={0.75}
                accessibilityLabel="Lançar outra cor ou tamanho deste produto"
              >
                <View style={[styles.rowIcon, { backgroundColor: brand.primary + '20' }]}>
                  <Ionicons name="color-palette-outline" size={18} color={brand.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Lançar várias cores e tamanhos</Text>
                  <Text style={styles.rowMeta}>Escolha as cores e os tamanhos e digite a quantidade de cada um, de uma vez.</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.light.textSecondary} />
              </TouchableOpacity>
            )}
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        )}
        {step === 'list' && !!error && <Text style={styles.error}>{error}</Text>}
      </BottomSheet>

      {/* Seletor de fornecedor: abre no lugar da folha (duas janelas ao mesmo tempo não funcionam bem no iPhone) */}
      <SupplierPickerSheet
        visible={visible && step === 'supplier'}
        onClose={() => setStep(supplierBack)}
        onSelect={(s: Supplier | null) => {
          setSupplier(s);
          setStep(supplierBack);
        }}
        productId={supplierBack === 'grade' ? gridProduct?.id : choice?.productId}
        productName={supplierBack === 'grade' ? gridProduct?.name : choice?.label}
        selectedSupplierId={supplier?.id ?? null}
        allowNone={entrySupplierName !== 'Vários fornecedores'}
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
  photoBox: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginTop: theme.spacing.md },
  photoThumb: { width: 64, height: 80, borderRadius: theme.borderRadius.md },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.backgroundSecondary },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  note: { fontSize: 13, color: Colors.light.textSecondary, marginTop: theme.spacing.sm },
  error: { color: Colors.light.error, marginTop: theme.spacing.md, fontSize: 13 },
});
