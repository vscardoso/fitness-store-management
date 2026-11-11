/**
 * Folha da peça: a MESMA para produto já cadastrado e para produto novo (sem assistente de passos).
 * - já cadastrado: abre direto na grade; cor, tamanho, custo e preço vêm do cadastro (a pessoa só digita as quantidades);
 * - novo: nome e categoria no topo (categoria sugerida pelo nome), cores, grade, custo e preço de venda.
 * Nada vai ao servidor aqui: "Adicionar à compra" só põe a peça no rascunho. O erro aparece embaixo do próprio campo.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';

import BottomSheet from '@/components/ui/BottomSheet';
import QuantityGrid from '@/components/receber/QuantityGrid';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { moneyInput, parseMoneyBr, toMoneyField } from '@/utils/cashMoney';
import { formatCurrency } from '@/utils/format';
import {
  COLORS, cleanSize, defaultSizesFor, gridOfProduct, sortSizes, linesToQuantities, norm, quantitiesToLines, quantitiesTotal, sheetProblem, suggestCategory,
  type Quantities, type ReceiveItem, type SupplierRef, type VariantInfo,
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
  onSave: (item: ReceiveItem) => void;
  onDelete?: (key: string) => void;
  onDismiss: () => void;
}

const newKey = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function PieceSheet({ model, categories, supplier, onPickSupplier, onSave, onDelete, onDismiss }: Props) {
  const brand = useBrandingColors();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [suggestedId, setSuggestedId] = useState<number | null>(null);
  const [catTouched, setCatTouched] = useState(false);
  const [colors, setColors] = useState<string[]>([]);
  const [q, setQ] = useState<Quantities>({});
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [custom, setCustom] = useState('');
  const [oneSize, setOneSize] = useState(false);
  const [extraSizes, setExtraSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState('');

  useEffect(() => {
    if (!model) return;
    const it = model.item;
    setName(it?.newProduct?.name ?? model.name ?? '');
    const cat = categories.find((c) => c.id === it?.newProduct?.categoryId)
      ?? (model.kind === 'new' ? suggestCategory(model.name, categories) : null);
    setCategoryId(cat?.id ?? null);
    setSuggestedId(model.kind === 'new' && !it ? (cat?.id ?? null) : null);
    setCatTouched(!!it);
    const known = model.variants.length ? gridOfProduct(model.variants, model.categoryName).colors : [];
    const inItem = it ? Object.keys(linesToQuantities(it.lines)) : [];
    setColors([...new Set([...known, ...inItem])]);
    setQ(it ? linesToQuantities(it.lines) : {});
    setCost(toMoneyField(it?.unitCost ?? model.lastCost ?? 0));
    setPrice(toMoneyField(it?.newProduct?.basePrice ?? it?.price ?? model.basePrice ?? 0));
    setCustom('');
    setOneSize(!!it && model.kind === 'new' && it.lines.length > 0 && it.lines.every((l) => !l.size));
    setExtraSizes(it ? [...new Set(it.lines.map((l) => l.size ?? '').filter((s) => s !== ''))] : []);
    setCustomSize('');
    // só reinicia ao abrir outra peça
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const isNew = model?.kind === 'new';
  const category = categories.find((c) => c.id === categoryId);
  const sizes = useMemo(() => {
    if (isNew && oneSize) return [''];
    const base = isNew ? defaultSizesFor(category?.name) : gridOfProduct(model?.variants ?? [], model?.categoryName).sizes;
    return sortSizes([...base, ...extraSizes]);
  }, [isNew, oneSize, category?.name, model, extraSizes]);
  const lines = useMemo(() => quantitiesToLines(q, model?.variants ?? []), [q, model]);
  const costNum = parseMoneyBr(cost) ?? 0;
  const priceNum = parseMoneyBr(price) ?? 0;
  const needsPrice = isNew || lines.some((l) => !l.variantId);
  const pieces = quantitiesTotal(q);

  const colorList = useMemo(() => [...new Set([...(isNew ? [''] : []), ...COLORS, ...colors])], [colors, isNew]);
  const visibleColors = colors.filter((c) => colorList.includes(c));

  const problemBase = model
    ? sheetProblem({ mode: model.kind, name, categoryId, q, cost: costNum, price: isNew ? priceNum : 1, supplier })
    : '';
  const loneBlank = lines.length > 1 && lines.some((l) => !l.variantId && !l.color && !l.size);
  const problem = problemBase
    || (loneBlank ? 'Peça sem cor e de tamanho único não combina com outras: escolha a cor de cada uma' : '')
    || (!isNew && needsPrice && !(priceNum > 0) ? 'Falta o preço das variações novas' : '');
  const costError = pieces > 0 && !(costNum > 0) ? 'Falta o custo por peça' : '';
  const priceError = pieces > 0 && needsPrice && !(priceNum > 0) ? (isNew ? 'Falta o preço de venda' : 'Falta o preço das variações novas') : '';

  const toggleColor = (c: string) => {
    setColors((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
    setQ((cur) => { if (!(c in cur)) return cur; const { [c]: _gone, ...rest } = cur; return rest; });
  };
  const addCustom = () => {
    const c = custom.trim().replace(/\s+/g, ' ');
    if (!c) return;
    const label = c[0].toUpperCase() + c.slice(1);
    setColors((cur) => (cur.some((x) => norm(x) === norm(label)) ? cur : [...cur, label]));
    setCustom('');
  };

  const addSize = () => {
    const s = cleanSize(customSize);
    if (!s) return;
    setExtraSizes((cur) => (cur.includes(s) ? cur : [...cur, s]));
    setCustomSize('');
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
    });
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

          <View>
            <Text style={styles.label}>Cores que chegaram</Text>
            <View style={styles.chips}>
              {colorList.map((c) => (
                <TouchableOpacity key={c} style={[styles.chip, colors.includes(c) && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
                  onPress={() => toggleColor(c)} accessibilityRole="checkbox" accessibilityState={{ checked: colors.includes(c) }}>
                  <Text style={[styles.chipText, colors.includes(c) && { color: brand.primary }]}>{c || 'Sem cor'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.rowBetween, { marginTop: 8, gap: 8 }]}>
              <RNTextInput style={styles.customInput} value={custom} onChangeText={setCustom} placeholder="Outra cor (ex.: Verde militar)"
                placeholderTextColor={Colors.light.textTertiary} onSubmitEditing={addCustom} accessibilityLabel="Outra cor" />
              <TouchableOpacity style={styles.chip} onPress={addCustom} accessibilityRole="button" accessibilityLabel="Adicionar cor">
                <Text style={styles.chipText}>Adicionar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {isNew && (
            <TouchableOpacity style={[styles.chip, { alignSelf: 'flex-start' }, oneSize && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
              onPress={() => { setOneSize((v) => !v); setQ({}); }} accessibilityRole="checkbox" accessibilityState={{ checked: oneSize }}
              accessibilityLabel="Peça de tamanho único">
              <Text style={[styles.chipText, oneSize && { color: brand.primary }]}>Tamanho único</Text>
            </TouchableOpacity>
          )}

          <View>
            <Text style={styles.label}>Quantas peças de cada tamanho</Text>
            <QuantityGrid colors={visibleColors} sizes={sizes} q={q} onChange={setQ} />
            {!(isNew && oneSize) && (
              <View style={[styles.rowBetween, { marginTop: 8, gap: 8 }]}>
                <RNTextInput style={styles.customInput} value={customSize} onChangeText={setCustomSize} placeholder="Outro tamanho (ex.: XG, 44)"
                  placeholderTextColor={Colors.light.textTertiary} onSubmitEditing={addSize} autoCapitalize="characters" accessibilityLabel="Outro tamanho" />
                <TouchableOpacity style={styles.chip} onPress={addSize} accessibilityRole="button" accessibilityLabel="Adicionar tamanho">
                  <Text style={styles.chipText}>Adicionar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

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
  customInput: { flex: 1, minHeight: 44, borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, color: Colors.light.text, backgroundColor: Colors.light.surfaceSoft },
  pair: { flexDirection: 'row', gap: 10 },
  error: { fontSize: 12, fontWeight: theme.fontWeight.bold, color: Colors.light.error, marginTop: 4 },
  hint: { fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary, textAlign: 'center' },
});
