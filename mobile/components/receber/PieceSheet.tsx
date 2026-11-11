/**
 * Folha da peça: a MESMA para produto já cadastrado e para produto novo (sem assistente de passos).
 * - já cadastrado: cores e tamanhos do produto, a pessoa só digita as quantidades; custo e preço vêm do cadastro;
 * - novo: nome e categoria no topo (categoria sugerida pelo nome), grade de variações, custo e preço de venda.
 *
 * A grade (tamanhos, paleta de cores, um bloco por cor, quantidade por tamanho, "todos os tamanhos desta cor") é o MESMO
 * `VariantBuilderInline` do cadastro de produto, em modo "receber" (sem preço por variação, com grade fechada por cor).
 * Tamanho ou cor com 0 peça NÃO entra na compra: sai sozinho, e a folha avisa o que saiu e por quê (o sistema não aceita estoque zerado).
 * Nada vai ao servidor aqui: "Adicionar à compra" só põe a peça no rascunho. O erro aparece embaixo do próprio campo.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { TextInput } from 'react-native-paper';

import AppButton from '@/components/ui/AppButton';
import BottomSheet from '@/components/ui/BottomSheet';
import VariantBuilderInline from '@/components/products/VariantBuilderInline';
import { Colors, theme } from '@/constants/Colors';
import { DEFAULT_SIZES, type SizeOption } from '@/types/productVariant';
import { useBrandingColors } from '@/store/brandingStore';
import { moneyInput, parseMoneyBr, toMoneyField } from '@/utils/cashMoney';
import { formatCurrency } from '@/utils/format';
import {
  NO_SIZE, cleanSize, defaultSizesFor, gridOfProduct, linesToQuantities, quantitiesToFlat, quantitiesToLines, quantitiesTotal, sheetProblem,
  sortSizes, suggestCategory, visibleCells, visibleQuantities, zeroLeftovers, zeroNotice,
  type ReceiveItem, type SupplierRef, type VariantInfo,
} from '@/utils/receivePurchase';

export interface PieceModel {
  kind: 'existing' | 'new';
  productId?: number;
  name: string;
  variants: VariantInfo[];
  categoryName?: string;
  lastCost?: number;
  basePrice?: number;
  /** editando uma peça que já está na compra */
  item?: ReceiveItem;
}

interface Props {
  model: PieceModel | null;
  categories: { id: number; name: string }[];
  supplier: SupplierRef;
  onPickSupplier: () => void;
  /** `notice`: o que saiu da peça por estar com 0 peça (a tela mostra o aviso depois de fechar a folha). */
  onSave: (item: ReceiveItem, notice?: string) => void;
  onDelete?: (key: string) => void;
  onDismiss: () => void;
  /** Põe a MESMA peça na compra com outro fornecedor (só ao editar uma peça cadastrada que já está na compra). */
  onAddOtherSupplier?: () => void;
  /** Esta peça (produto cadastrado) já está na compra com ESTE fornecedor, em outra linha? (a mesma peça de fornecedores diferentes é permitida) */
  conflict?: (supplier: SupplierRef, productId: number | undefined, itemKey: string | undefined) => boolean;
}

const newKey = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DEFAULT_SIZE_VALUES = DEFAULT_SIZES.map((s) => s.value);

export default function PieceSheet({ model, categories, supplier, onPickSupplier, onSave, onDelete, onDismiss, onAddOtherSupplier, conflict }: Props) {
  const brand = useBrandingColors();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [suggestedId, setSuggestedId] = useState<number | null>(null);
  const [catTouched, setCatTouched] = useState(false);
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  // grade (formato do construtor de variações do cadastro)
  const [hasVariants, setHasVariants] = useState(true);
  const [sizesSel, setSizesSel] = useState<string[]>([]);
  const [colorsSel, setColorsSel] = useState<string[]>([]);
  const [colorSizes, setColorSizes] = useState<Record<string, string[]>>({});
  const [vq, setVq] = useState<Record<string, number>>({});
  const [extraSizes, setExtraSizes] = useState<string[]>([]);
  const [single, setSingle] = useState(0);

  useEffect(() => {
    if (!model) return;
    const it = model.item;
    const isNewModel = model.kind === 'new';
    setName(it?.newProduct?.name ?? model.name ?? '');
    const cat = categories.find((c) => c.id === it?.newProduct?.categoryId)
      ?? (isNewModel ? suggestCategory(model.name, categories) : null);
    setCategoryId(cat?.id ?? null);
    setSuggestedId(isNewModel && !it ? (cat?.id ?? null) : null);
    setCatTouched(!!it);
    setCost(toMoneyField(it?.unitCost ?? model.lastCost ?? 0));
    setPrice(toMoneyField(it?.newProduct?.basePrice ?? it?.price ?? model.basePrice ?? 0));

    const known = model.variants.length ? gridOfProduct(model.variants, model.categoryName) : { colors: [] as string[], sizes: [] as string[] };
    const knownSizes = known.sizes.filter((s) => s !== '');
    const q = it ? linesToQuantities(it.lines) : {};
    const lineColors = Object.keys(q).filter((c) => c !== '');
    const lineSizes = [...new Set(Object.values(q).flatMap((row) => Object.keys(row)).filter((s) => s !== ''))];
    const soloPiece = isNewModel && !!it && it.lines.length > 0 && it.lines.every((l) => !l.color && !l.size);

    setHasVariants(!soloPiece);
    setSingle(soloPiece ? (q['']?.[''] ?? 0) : 0);
    const sizesBase = it ? sortSizes(lineSizes.length ? lineSizes : knownSizes) : (isNewModel ? defaultSizesFor(cat?.name) : knownSizes);
    setSizesSel(sizesBase);
    setColorsSel(lineColors);
    const cs: Record<string, string[]> = {};
    lineColors.forEach((c) => {
      const own = Object.keys(q[c]).map((s) => s || NO_SIZE);
      cs[c] = sortSizes(own.filter((s) => s !== NO_SIZE)).concat(own.includes(NO_SIZE) ? [NO_SIZE] : []);
    });
    setColorSizes(cs);
    setVq(it ? quantitiesToFlat(q) : {});
    setExtraSizes([...new Set([...knownSizes, ...lineSizes, ...sizesBase])].filter((s) => !DEFAULT_SIZE_VALUES.includes(s)));
    // só reinicia ao abrir outra peça
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const isNew = model?.kind === 'new';
  const category = categories.find((c) => c.id === categoryId);

  // tamanhos oferecidos nos chips: os do cadastro de produto mais os do próprio produto e os digitados
  const sizeOptions = useMemo<SizeOption[]>(() => {
    const extras = [...new Set([...extraSizes, ...sizesSel.filter((s) => !DEFAULT_SIZE_VALUES.includes(s))])];
    return [...DEFAULT_SIZES, ...sortSizes(extras).map((v) => ({ label: v, value: v }))];
  }, [extraSizes, sizesSel]);

  const cells = useMemo(() => visibleCells(colorsSel, colorSizes, sizesSel), [colorsSel, colorSizes, sizesSel]);
  const q = useMemo(() => (hasVariants ? visibleQuantities(cells, vq) : { '': { '': single } }), [hasVariants, cells, vq, single]);
  const lines = useMemo(() => quantitiesToLines(q, model?.variants ?? []), [q, model]);
  const pieces = quantitiesTotal(q);
  const leftover = useMemo(() => (pieces > 0 ? zeroLeftovers(q) : { colors: [], sizes: [] }), [q, pieces]);
  const notice = zeroNotice(leftover);

  const costNum = parseMoneyBr(cost) ?? 0;
  const priceNum = parseMoneyBr(price) ?? 0;
  const needsPrice = isNew || lines.some((l) => !l.variantId);

  const dupe = !!model && !isNew && !!conflict?.(supplier, model.productId, model.item?.key);
  const problemBase = model
    ? sheetProblem({ mode: model.kind, name, categoryId, q, cost: costNum, price: isNew ? priceNum : 1, supplier })
    : '';
  const loneBlank = lines.length > 1 && lines.some((l) => !l.variantId && !l.color && !l.size);
  const problem = (dupe ? 'Esta peça já está na compra com este fornecedor: abra a que já está na lista para mudar as quantidades, ou troque o fornecedor' : '')
    || problemBase
    || (loneBlank ? 'Peça sem cor e de tamanho único não combina com outras: escolha a cor de cada uma' : '')
    || (!isNew && needsPrice && !(priceNum > 0) ? 'Falta o preço das variações novas' : '');
  const costError = pieces > 0 && !(costNum > 0) ? 'Falta o custo por peça' : '';
  const priceError = pieces > 0 && needsPrice && !(priceNum > 0) ? (isNew ? 'Falta o preço de venda' : 'Falta o preço das variações novas') : '';

  const knownColors = useMemo(
    () => (model && !isNew ? [...new Set(model.variants.map((v) => v.color ?? '').filter((c) => c !== ''))] : []),
    [model, isNew],
  );
  const toggleKnownColor = (c: string) => {
    if (colorsSel.includes(c)) {
      setColorsSel((cur) => cur.filter((x) => x !== c));
      setColorSizes((cur) => { const { [c]: _gone, ...rest } = cur; return rest; });
    } else {
      setColorsSel((cur) => [...cur, c]);
      setColorSizes((cur) => (cur[c] ? cur : { ...cur, [c]: [...sizesSel] }));
    }
  };

  const addCustomSize = (raw: string) => {
    const v = cleanSize(raw);
    if (!v) return;
    setExtraSizes((cur) => (cur.includes(v) || DEFAULT_SIZE_VALUES.includes(v) ? cur : [...cur, v]));
    setSizesSel((cur) => (cur.includes(v) ? cur : [...cur, v]));
    setColorSizes((cur) => {
      const next: Record<string, string[]> = {};
      Object.entries(cur).forEach(([c, szs]) => { next[c] = szs.includes(v) ? szs : [...szs, v]; });
      return next;
    });
  };

  const save = () => {
    if (!model || problem) return;
    onSave({
      key: model.item?.key ?? newKey(),
      productId: model.productId,
      newProduct: isNew ? { name: name.trim().replace(/\s+/g, ' '), categoryId: categoryId!, categoryName: category?.name, basePrice: priceNum } : undefined,
      name: isNew ? name.trim().replace(/\s+/g, ' ') : model.name,
      supplier,
      unitCost: costNum,
      price: needsPrice ? priceNum : undefined,
      lines,
      variants: model.variants,
      categoryName: category?.name ?? model.categoryName,
      addedBy: model.item?.addedBy ?? 'Você',
    }, notice || undefined);
  };

  const hint = !problem ? `Entram ${pieces} peça${pieces === 1 ? '' : 's'} · ${formatCurrency(pieces * costNum)} de mercadoria` : problem;

  return (
    <BottomSheet
      visible={!!model}
      onDismiss={onDismiss}
      title={isNew ? 'Peça nova' : (model?.name ?? '')}
      subtitle={isNew
        ? 'Será cadastrada junto com esta compra'
        : `Já cadastrada${model?.lastCost ? ` · último custo ${formatCurrency(model.lastCost)}` : ''}${model?.basePrice ? ` · preço ${formatCurrency(model.basePrice)}` : ''}`}
      icon={isNew ? 'sparkles-outline' : 'shirt-outline'}
      tall
      actions={[
        { label: model?.item ? 'Salvar alterações' : 'Adicionar à compra', variant: 'primary', disabled: !!problem, onPress: save },
        ...(model?.item && !isNew && onAddOtherSupplier ? [{ label: 'Mesma peça de outro fornecedor', variant: 'secondary' as const, onPress: onAddOtherSupplier }] : []),
        ...(model?.item && onDelete ? [{ label: 'Tirar da compra', variant: 'danger' as const, onPress: () => onDelete(model.item!.key) }] : []),
      ]}
    >
      {!!model && (
        <View style={{ gap: 14 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.muted} numberOfLines={1}>Veio de <Text style={styles.strong}>{supplier.name}</Text></Text>
            <TouchableOpacity style={styles.chip} onPress={onPickSupplier} accessibilityRole="button" accessibilityLabel="Trocar fornecedor desta peça">
              <Text style={styles.chipText}>Trocar</Text>
            </TouchableOpacity>
          </View>

          {isNew && (
            <>
              <TextInput mode="outlined" label="Nome" value={name} activeOutlineColor={brand.primary} autoCapitalize="sentences"
                onChangeText={(t) => {
                  setName(t);
                  if (!catTouched) {
                    const s = suggestCategory(t, categories);
                    setCategoryId(s?.id ?? null);
                    setSuggestedId(s?.id ?? null);
                  }
                }} />
              <View>
                <Text style={styles.label}>Categoria</Text>
                <View style={styles.chips}>
                  {categories.map((c) => (
                    <TouchableOpacity key={c.id} style={[styles.chip, c.id === categoryId && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
                      onPress={() => { setCategoryId(c.id); setCatTouched(true); }} accessibilityRole="radio" accessibilityState={{ selected: c.id === categoryId }}>
                      <Text style={[styles.chipText, c.id === categoryId && { color: brand.primary }]}>
                        {c.name}{c.id === suggestedId && !catTouched ? '  · sugerida' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

          {knownColors.length > 0 && (
            <View>
              <Text style={styles.label}>Cores que este produto já tem</Text>
              <View style={styles.chips}>
                {knownColors.map((c) => (
                  <TouchableOpacity key={c} style={[styles.chip, colorsSel.includes(c) && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
                    onPress={() => toggleKnownColor(c)} accessibilityRole="checkbox" accessibilityState={{ checked: colorsSel.includes(c) }}>
                    <Text style={[styles.chipText, colorsSel.includes(c) && { color: brand.primary }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Grade de variações: o mesmo construtor do cadastro de produto */}
          <VariantBuilderInline
            mode="receber"
            hideToggle={!isNew}
            hasVariants={hasVariants}
            onToggle={(v) => { setHasVariants(v); if (!v) setVq({}); }}
            selectedSizes={sizesSel}
            onSizesChange={setSizesSel}
            selectedColors={colorsSel}
            onColorsChange={setColorsSel}
            colorSizes={colorSizes}
            onColorSizesChange={setColorSizes}
            basePrice={0}
            costPrice={0}
            variantPrices={{}}
            onVariantPriceChange={() => {}}
            variantQuantities={vq}
            onVariantQuantitiesChange={(patch) => setVq((cur) => ({ ...cur, ...patch }))}
            sizeOptions={sizeOptions}
            onCustomSize={addCustomSize}
          />

          {isNew && !hasVariants && (
            <View style={styles.singleBox}>
              <Text style={styles.label}>Quantas peças chegaram</Text>
              <View style={styles.singleRow}>
                <AppButton variant="outlined" icon="remove" iconOnly onPress={() => setSingle((n) => Math.max(0, n - 1))} />
                <RNTextInput style={styles.singleInput} keyboardType="number-pad" value={single > 0 ? String(single) : ''} placeholder="0"
                  placeholderTextColor={Colors.light.textTertiary} maxLength={4}
                  onChangeText={(t) => setSingle(Math.min(9999, parseInt(t.replace(/[^0-9]/g, ''), 10) || 0))} accessibilityLabel="Quantidade de peças" />
                <AppButton variant="outlined" icon="add" iconOnly onPress={() => setSingle((n) => Math.min(9999, n + 1))} />
              </View>
            </View>
          )}

          {!!notice && (
            <View style={styles.notice} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color={Colors.light.warningDarker} />
              <Text style={styles.noticeText}>{notice.replace('Retirei', 'Vou retirar')}</Text>
            </View>
          )}

          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <TextInput mode="outlined" label="Custo por peça" value={cost} keyboardType="decimal-pad" left={<TextInput.Affix text="R$" />}
                error={!!costError} activeOutlineColor={brand.primary} onChangeText={(t) => setCost(moneyInput(t))} />
              {!!costError && <Text style={styles.error}>{costError}</Text>}
            </View>
            {needsPrice && (
              <View style={{ flex: 1 }}>
                <TextInput mode="outlined" label={isNew ? 'Preço de venda' : 'Preço das variações novas'} value={price} keyboardType="decimal-pad"
                  left={<TextInput.Affix text="R$" />} error={!!priceError} activeOutlineColor={brand.primary} onChangeText={(t) => setPrice(moneyInput(t))} />
                {!!priceError && <Text style={styles.error}>{priceError}</Text>}
              </View>
            )}
          </View>
          {isNew && costNum > 0 && !(priceNum > 0) && (
            <TouchableOpacity style={styles.chip} onPress={() => setPrice(toMoneyField(Math.round(costNum * 2.5 * 10) / 10))} accessibilityRole="button">
              <Text style={styles.chipText}>Sugestão: {formatCurrency(Math.round(costNum * 2.5 * 10) / 10)} (custo × 2,5). Tocar para usar</Text>
            </TouchableOpacity>
          )}
          {isNew && costNum > 0 && priceNum > 0 && (
            <Text style={styles.muted}>Você vende por {(priceNum / costNum).toFixed(1).replace('.', ',')} vezes o custo · lucro de {formatCurrency(priceNum - costNum)} por peça</Text>
          )}
          <Text style={[styles.hint, !!problem && { color: Colors.light.error }]}>{hint}</Text>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary, marginBottom: 6 },
  muted: { fontSize: 13, color: Colors.light.textSecondary, flexShrink: 1 },
  strong: { fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 999, backgroundColor: Colors.light.card },
  chipText: { fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  pair: { flexDirection: 'row', gap: 10 },
  error: { fontSize: 12, fontWeight: theme.fontWeight.bold, color: Colors.light.error, marginTop: 4 },
  hint: { fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary, textAlign: 'center' },
  singleBox: { gap: 6 },
  singleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  singleInput: { width: 90, height: 48, textAlign: 'center', fontSize: 18, fontWeight: theme.fontWeight.bold, borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 12, color: Colors.light.text, backgroundColor: Colors.light.surfaceSoft },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: Colors.light.warningLight, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.light.warningDark },
  noticeText: { flex: 1, fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.warningDarker },
});
