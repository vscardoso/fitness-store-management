/**
 * Receber compra: UMA tela para lançar a mercadoria que chegou (produto novo ou já cadastrado, de vários fornecedores, com a
 * grade de cores e tamanhos). Substitui, para quem testa, os caminhos de "Novo produto", "Nova entrada" e "Produto já cadastrado".
 *
 *   home    fornecedor, busca "qual peça chegou?", lista da compra
 *   review  total por fornecedor (desconto de cada um), frete, etiquetas
 *   done    compra lançada, etiquetas na fila
 *
 * O rascunho fica no aparelho. Nada vai ao servidor até "Lançar no estoque": um só envio, tudo ou nada (utils/receivePurchase).
 * Atrás da chave `receberCompra` (constants/features.ts): só existe no ambiente de teste.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import FeatureGate from '@/components/FeatureGate';
import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import PieceSheet, { type PieceModel } from '@/components/receber/PieceSheet';
import SupplierSheet from '@/components/receber/SupplierSheet';
import { Colors, theme } from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { getCategories } from '@/services/categoryService';
import { getGroupedProducts } from '@/services/productService';
import { receivePurchase, type ReceivePurchaseResult } from '@/services/purchaseService';
import { getSuppliers } from '@/services/supplierService';
import { useBrandingColors } from '@/store/brandingStore';
import { parseApiError } from '@/utils/apiError';
import { moneyInput, parseMoneyBr, toMoneyField } from '@/utils/cashMoney';
import { dateToIso, todayBr } from '@/utils/dateBr';
import { formatCurrency } from '@/utils/format';
import { clearReceiveDraft, loadReceiveDraft, saveReceiveDraft } from '@/utils/receiveDraftStore';
import {
  buildPayload, discountTotal, emptyDraft, extraPerPiece, groupsBySupplier, itemPieces, matchesName, norm, removeItem, similarByTypo,
  supplierKey, totals, upsertItem, type ReceiveDraft, type ReceiveItem, type SupplierRef,
} from '@/utils/receivePurchase';
import type { ProductGrouped } from '@/types';

type Step = 'home' | 'review' | 'done';
type Picker = { target: 'purchase' | 'piece'; after?: (s: SupplierRef) => void } | null;

const SKIP = { headers: { 'X-Skip-Loading': 'true' } };

export default function ReceberCompraRoute() {
  return (
    <FeatureGate feature="receberCompra">
      <ReceberCompra />
    </FeatureGate>
  );
}

function ReceberCompra() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const [draft, setDraft] = useState<ReceiveDraft | null>(null);
  const [step, setStep] = useState<Step>('home');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [model, setModel] = useState<PieceModel | null>(null);
  const [pieceSupplier, setPieceSupplier] = useState<SupplierRef | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [localSuppliers, setLocalSuppliers] = useState<SupplierRef[]>([]);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [zeroNote, setZeroNote] = useState('');   // o que saiu da última peça por estar com 0 peça (o sistema não aceita estoque zerado)
  const [result, setResult] = useState<ReceivePurchaseResult | null>(null);
  const [labelNote, setLabelNote] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [freightText, setFreightText] = useState('');
  const [discountText, setDiscountText] = useState<Record<string, string>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── rascunho: volta o que ficou no aparelho; salva a cada mudança
  useEffect(() => {
    let alive = true;
    loadReceiveDraft(tenantId).then((saved) => {
      if (!alive) return;
      const d = saved ?? emptyDraft({ name: '' }, dateToIso(new Date()));
      setDraft(d);
      setFreightText(d.freight > 0 ? toMoneyField(d.freight) : '');
      setDiscountText(Object.fromEntries(Object.entries(d.discounts).map(([k, v]) => [k, toMoneyField(v)])));
    });
    return () => { alive = false; };
  }, [tenantId]);

  useEffect(() => {
    if (draft && step !== 'done' && (draft.items.length > 0 || draft.supplier.name)) saveReceiveDraft(tenantId, draft);
  }, [draft, step, tenantId]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // ── dados do servidor
  const { data: serverSuppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: getSuppliers });
  const { data: categoriesRaw = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const categories = useMemo(() => categoriesRaw.filter((c) => c.is_active !== false), [categoriesRaw]);
  const { data: found = [], isFetching } = useQuery({
    queryKey: ['receber-busca', debounced],
    queryFn: () => getGroupedProducts({ search: debounced, limit: 30 }, SKIP),
    enabled: debounced.length >= 2,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
  const shortQuery = debounced.slice(0, 4);
  const { data: near = [] } = useQuery({
    queryKey: ['receber-busca-parecida', shortQuery],
    queryFn: () => getGroupedProducts({ search: shortQuery, limit: 30 }, SKIP),
    enabled: debounced.length >= 4 && found.length === 0 && !isFetching,
    staleTime: 30_000,
  });

  const suppliers: SupplierRef[] = useMemo(() => {
    const out: SupplierRef[] = serverSuppliers.filter((s) => s.is_active !== false).map((s) => ({ id: s.id, name: s.name, phone: s.phone ?? undefined, doc: s.cnpj ?? undefined }));
    for (const l of localSuppliers) if (!out.some((s) => supplierKey(s) === supplierKey(l) || norm(s.name) === norm(l.name))) out.push(l);
    return out;
  }, [serverSuppliers, localSuppliers]);

  const catName = (id?: number | null) => categories.find((c) => c.id === id)?.name;

  // ── avisos com "Desfazer"
  const showToast = (msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 5500 : 3200);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ── fornecedor
  const pickSupplier = (s: SupplierRef) => {
    const p = picker;
    setPicker(null);
    if (!s.id && !localSuppliers.some((l) => supplierKey(l) === supplierKey(s))) setLocalSuppliers((cur) => [...cur, s]);
    if (!p) return;
    if (p.target === 'purchase') setDraft((d) => (d ? { ...d, supplier: s } : d));
    else setPieceSupplier(s);
    p.after?.(s);
  };
  const ensureSupplier = (then: (s: SupplierRef) => void) => {
    if (draft?.supplier.name) return then(draft.supplier);
    setPicker({ target: 'purchase', after: then });
  };

  // ── abrir a folha da peça
  const openEdit = (item: ReceiveItem) => {
    setPieceSupplier(item.supplier);
    setModel(item.productId
      ? { kind: 'existing', productId: item.productId, name: item.name, variants: item.variants ?? [], categoryName: item.categoryName, lastCost: item.unitCost, basePrice: item.price, item }
      : { kind: 'new', name: item.name, variants: [], item });
  };
  const existingModel = (g: ProductGrouped): PieceModel => {
    const first = g.variants?.[0];
    return {
      kind: 'existing', productId: g.id, name: g.name,
      variants: (g.variants ?? []).map((v) => ({ id: v.id, color: v.color, size: v.size, price: v.price, cost_price: v.cost_price })),
      categoryName: catName(g.category_id), lastCost: Number(first?.cost_price ?? 0) || undefined, basePrice: Number(first?.price ?? g.min_price ?? 0) || undefined,
    };
  };
  // A MESMA peça pode ter vindo de fornecedores diferentes na mesma compra (cada um com o seu custo): uma linha por produto e fornecedor.
  const openExisting = (g: ProductGrouped) => {
    ensureSupplier((s) => {
      const already = draft?.items.find((i) => i.productId === g.id && supplierKey(i.supplier) === supplierKey(s));
      if (already) return openEdit(already);
      setPieceSupplier(s);
      setModel(existingModel(g));
    });
  };
  const addOtherSupplier = () => {
    const cur = model?.item;
    if (!cur || !cur.productId) return;
    const base: PieceModel = { kind: 'existing', productId: cur.productId, name: cur.name, variants: cur.variants ?? [], categoryName: cur.categoryName, lastCost: cur.unitCost, basePrice: cur.price };
    setModel(null);
    setPicker({
      target: 'piece',
      after: (s) => {
        const same = draft?.items.find((i) => i.productId === cur.productId && supplierKey(i.supplier) === supplierKey(s));
        if (same) return openEdit(same);
        setPieceSupplier(s);
        setModel(base);
      },
    });
  };
  const productConflict = (sup: SupplierRef, productId: number | undefined, key: string | undefined) =>
    !!productId && !!draft?.items.some((i) => i.productId === productId && i.key !== key && supplierKey(i.supplier) === supplierKey(sup));
  const openNew = (name: string) => {
    const already = draft?.items.find((i) => !i.productId && norm(i.name) === norm(name));
    if (already) return openEdit(already);
    ensureSupplier((s) => {
      setPieceSupplier(s);
      setModel({ kind: 'new', name, variants: [] });
    });
  };

  const saveItem = (item: ReceiveItem, notice?: string) => {
    if (!draft) return;
    const before = draft;
    setDraft(upsertItem(draft, item));
    setModel(null);
    setQuery('');
    setZeroNote(notice ?? '');
    showToast(`${item.name} · ${itemPieces(item)} peças na compra`, () => { setDraft(before); setZeroNote(''); });
  };
  const deleteItem = (key: string) => {
    if (!draft) return;
    const before = draft;
    const gone = draft.items.find((i) => i.key === key);
    setDraft(removeItem(draft, key));
    setModel(null);
    showToast(`${gone?.name ?? 'Peça'} saiu da compra`, () => setDraft(before));
  };

  // ── concluir
  const submit = useMutation({
    mutationFn: () => receivePurchase(buildPayload(draft!)),
    onSuccess: async (res) => {
      setSubmitError('');
      await clearReceiveDraft(tenantId);
      queryClient.invalidateQueries();
      // o servidor já pôs uma etiqueta por peça na fila, na mesma transação da compra
      setLabelNote(res.replay ? '' : `${res.labels_queued ?? res.total_pieces} etiquetas já estão na fila de impressão.`);
      setResult(res);
      setStep('done');
    },
    onError: (e) => setSubmitError(parseApiError(e) || 'Não consegui lançar a compra. Nada foi gravado. Tente de novo.'),
  });

  const restart = () => {
    setResult(null);
    setLabelNote('');
    setSubmitError('');
    setQuery('');
    setFreightText('');
    setDiscountText({});
    setDraft(emptyDraft(draft?.supplier ?? { name: '' }, dateToIso(new Date())));
    setStep('home');
  };

  if (!draft) {
    return <View style={styles.container}><PageHeader title="Receber compra" showBackButton backFallback="/(tabs)/more" /></View>;
  }

  const t = totals(draft);
  const hits = debounced.length >= 2 ? found : [];
  const typo = !hits.length ? similarByTypo(debounced, near) : [];
  const showResults = debounced.length >= 2;

  // ════════════════════════════ tela final ════════════════════════════
  if (step === 'done' && result) {
    return (
      <View style={styles.container}>
        <PageHeader title="Compra lançada" subtitle={result.entry_code} showBackButton backFallback="/(tabs)/more" />
        <ScrollView contentContainerStyle={[styles.content, desktop]}>
          <View style={styles.centerBox}>
            <View style={[styles.okIcon, { backgroundColor: Colors.light.successLight }]}>
              <Ionicons name="checkmark" size={34} color={Colors.light.success} />
            </View>
            <Text style={styles.big}>{result.total_pieces} peças no estoque</Text>
            <Text style={styles.muted}>{result.products} produto{result.products === 1 ? '' : 's'} · {formatCurrency(result.total_cost)} de mercadoria</Text>
            {result.replay && <Text style={styles.muted}>Esta compra já tinha sido lançada: nada foi duplicado.</Text>}
          </View>
          {!!labelNote && <View style={styles.card}><Text style={styles.cardText}>{labelNote}</Text></View>}
          <AppButton variant="primary" size="lg" fullWidth icon="print-outline" label={`Imprimir etiquetas (${result.total_pieces})`} onPress={() => router.push('/etiquetas/fila' as any)} />
          <AppButton variant="outlined" size="md" fullWidth label="Ver a compra" onPress={() => router.push(`/entries/${result.entry_id}` as any)} />
          <AppButton variant="outlined" size="md" fullWidth label="Receber outra compra" onPress={restart} />
        </ScrollView>
      </View>
    );
  }

  // ════════════════════════════ revisão ════════════════════════════
  if (step === 'review') {
    const groups = groupsBySupplier(draft);
    const extra = extraPerPiece(draft);
    return (
      <View style={styles.container}>
        <PageHeader title="Concluir compra" subtitle={`${groups.length} fornecedor${groups.length === 1 ? '' : 'es'}`} showBackButton onBack={() => setStep('home')} backFallback="/(tabs)/more" />
        <ScrollView contentContainerStyle={[styles.content, desktop]} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{t.products} produto{t.products === 1 ? '' : 's'} · {t.pieces} peças</Text>
              <Text style={styles.big}>{formatCurrency(t.value)}</Text>
            </View>
            <Text style={styles.muted}>Mercadoria, pelo custo de cada peça</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Por fornecedor</Text>
            {groups.map((g) => (
              <View key={g.key} style={styles.group}>
                <View style={styles.rowBetween}>
                  <Text style={styles.name} numberOfLines={1}>{g.supplier.name}</Text>
                  <Text style={styles.name}>{formatCurrency(g.value)}</Text>
                </View>
                <Text style={styles.muted}>{g.pieces} peças</Text>
                <TextInput mode="outlined" dense label="Desconto deste fornecedor (opcional)" value={discountText[g.key] ?? ''} keyboardType="decimal-pad"
                  left={<TextInput.Affix text="R$" />} activeOutlineColor={brand.primary}
                  onChangeText={(v) => {
                    const m = moneyInput(v);
                    setDiscountText((cur) => ({ ...cur, [g.key]: m }));
                    setDraft((d) => (d ? { ...d, discounts: { ...d.discounts, [g.key]: parseMoneyBr(m) ?? 0 } } : d));
                  }} />
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <TextInput mode="outlined" label="Despesas da compra: frete, embalagem... (opcional)" value={freightText} keyboardType="decimal-pad"
              left={<TextInput.Affix text="R$" />} activeOutlineColor={brand.primary}
              onChangeText={(v) => { const m = moneyInput(v); setFreightText(m); setDraft((d) => (d ? { ...d, freight: parseMoneyBr(m) ?? 0 } : d)); }} />
            <Text style={styles.muted}>
              {draft.freight > 0 || discountTotal(draft) > 0
                ? `O custo real de cada peça ${extra >= 0 ? 'sobe' : 'cai'} ${formatCurrency(Math.abs(extra))} (rateado nas ${t.pieces} peças).`
                : 'Sem despesas nem desconto, o custo fica como digitado.'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Etiquetas</Text>
            <Text style={styles.muted}>As peças chegaram sem etiqueta: ao lançar, o app põe uma etiqueta para cada peça, com o código dela, na fila de impressão.</Text>
          </View>

          {!!submitError && (
            <View style={[styles.card, { borderColor: Colors.light.error }]}>
              <Text style={[styles.cardText, { color: Colors.light.error }]}>{submitError}</Text>
            </View>
          )}
          <AppButton variant="primary" size="lg" fullWidth label="Lançar no estoque" loading={submit.isPending} onPress={() => submit.mutate()} />
          <Text style={styles.hint}>Nada entra no estoque antes deste botão. Se der erro, nada fica gravado e você pode tentar de novo.</Text>
        </ScrollView>
      </View>
    );
  }

  // ════════════════════════════ início ════════════════════════════
  return (
    <View style={styles.container}>
      <PageHeader title="Receber compra" subtitle={`Hoje, ${todayBr().slice(0, 5)}`} showBackButton backFallback="/(tabs)/more" />
      <ScrollView contentContainerStyle={[styles.content, desktop, { paddingBottom: 130 }]} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={styles.label}>Comprando de</Text>
          <TouchableOpacity style={styles.supplierRow} onPress={() => setPicker({ target: 'purchase' })} accessibilityRole="button" accessibilityLabel="Trocar fornecedor">
            <Text style={[styles.name, !draft.supplier.name && { color: Colors.light.textTertiary }]} numberOfLines={1}>{draft.supplier.name || 'Escolher o fornecedor'}</Text>
            <Ionicons name="chevron-down" size={18} color={Colors.light.textSecondary} />
          </TouchableOpacity>
        </View>

        {!!zeroNote && (
          <View style={styles.zeroNote} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle" size={18} color={Colors.light.warningDarker} />
            <Text style={styles.zeroNoteText}>{zeroNote}</Text>
            <AppButton variant="text" size="sm" label="Entendi" onPress={() => setZeroNote('')} />
          </View>
        )}

        <View>
          <Text style={styles.label}>Qual peça chegou?</Text>
          <View style={[styles.search, { borderColor: brand.primary }]}>
            <Ionicons name="search-outline" size={20} color={Colors.light.textTertiary} />
            <RNTextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Digite o nome da peça"
              placeholderTextColor={Colors.light.textTertiary} autoCorrect={false} accessibilityLabel="Qual peça chegou?" />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Limpar busca" hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.light.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {showResults && (
          <View style={{ gap: 8 }}>
            {!hits.length && typo.length > 0 && (
              <View style={[styles.card, { backgroundColor: Colors.light.warningLight, borderColor: Colors.light.warning }]}>
                <Text style={[styles.cardText, { color: Colors.light.warningDark }]}>Já existe <Text style={styles.strong}>{typo[0].name}</Text>. É a mesma peça? Toque nela para não cadastrar duas vezes.</Text>
              </View>
            )}
            {(hits.length ? hits : typo).map((g) => {
              const first = g.variants?.[0];
              return (
                <TouchableOpacity key={g.id} style={styles.hit} onPress={() => openExisting(g)} accessibilityRole="button" accessibilityLabel={`Peça ${g.name}`}>
                  <View style={[styles.thumb, { backgroundColor: brand.primary + '14' }]}>
                    <Text style={[styles.thumbText, { color: brand.primary }]}>{g.name.trim()[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{g.name}</Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      Já cadastrada · {g.total_stock} em estoque{first?.cost_price ? ` · último custo ${formatCurrency(Number(first.cost_price))}` : ''}
                    </Text>
                    {draft.items.some((i) => i.productId === g.id) && (
                      <Text style={[styles.muted, { color: brand.primary }]} numberOfLines={1}>
                        Já está na compra: {draft.items.filter((i) => i.productId === g.id).map((i) => `${i.supplier.name} (${itemPieces(i)})`).join(', ')}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.badge, { color: brand.primary }]}>cadastrada</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.hit, styles.hitNew, { borderColor: brand.primary }]} onPress={() => openNew(debounced)} accessibilityRole="button"
              accessibilityLabel={`Cadastrar ${debounced} como peça nova`}>
              <View style={[styles.thumb, { backgroundColor: brand.primary + '14' }]}><Ionicons name="add" size={22} color={brand.primary} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={2}>Cadastrar “{debounced}” como peça nova</Text>
                <Text style={styles.muted}>Você preenche aqui mesmo, sem sair da compra</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {!draft.items.length ? (
          <View style={styles.card}><Text style={[styles.cardText, { textAlign: 'center', color: Colors.light.textSecondary }]}>Nada lançado ainda. Digite o nome da primeira peça que chegou.</Text></View>
        ) : (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Nesta compra</Text>
              <Text style={styles.muted}>{t.products} produto{t.products === 1 ? '' : 's'} · {t.pieces} peças</Text>
            </View>
            {draft.items.map((it) => (
              <TouchableOpacity key={it.key} style={styles.line} onPress={() => openEdit(it)} accessibilityRole="button" accessibilityLabel={`Editar ${it.name}`}>
                <View style={[styles.thumb, { backgroundColor: brand.primary + '14' }]}>
                  <Text style={[styles.thumbText, { color: brand.primary }]}>{it.name.trim()[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{it.name}{!it.productId ? '  · nova' : ''}</Text>
                  <Text style={styles.muted} numberOfLines={2}>{it.supplier.name} · {linesText(it)}</Text>
                </View>
                <Text style={styles.name}>{itemPieces(it)} un</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.bar}>
        <AppButton variant="primary" size="lg" fullWidth disabled={!draft.items.length}
          label={draft.items.length ? `Concluir compra · ${t.pieces} peças · ${formatCurrency(t.value)}` : 'Concluir compra'}
          onPress={() => { setSubmitError(''); setStep('review'); }} />
        <Text style={styles.hint}>Salvo sozinho como rascunho neste aparelho.</Text>
      </View>

      {!!toast && (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <Text style={styles.toastText} numberOfLines={2}>{toast.msg}</Text>
          {!!toast.undo && (
            <TouchableOpacity onPress={() => { toast.undo?.(); setToast(null); }} accessibilityRole="button" accessibilityLabel="Desfazer" style={styles.toastUndo}>
              <Text style={styles.toastUndoText}>Desfazer</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <PieceSheet
        model={model}
        categories={categories}
        supplier={pieceSupplier ?? draft.supplier}
        onPickSupplier={() => setPicker({ target: 'piece' })}
        onSave={saveItem}
        onDelete={deleteItem}
        onDismiss={() => setModel(null)}
        onAddOtherSupplier={addOtherSupplier}
        conflict={productConflict}
      />
      <SupplierSheet
        visible={!!picker}
        onDismiss={() => setPicker(null)}
        suppliers={suppliers}
        current={picker?.target === 'piece' ? (pieceSupplier ?? draft.supplier) : draft.supplier}
        onPick={pickSupplier}
        title={picker?.target === 'piece' ? 'De quem veio esta peça?' : 'De quem você está comprando?'}
      />
    </View>
  );
}

function linesText(it: ReceiveItem): string {
  const byColor = new Map<string, string[]>();
  for (const l of it.lines) {
    const c = l.color ?? 'Sem cor';
    byColor.set(c, [...(byColor.get(c) ?? []), `${l.size ?? 'Único'}×${l.quantity}`]);
  }
  return [...byColor.entries()].map(([c, parts]) => `${c} ${parts.join(' ')}`).join(' · ');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  label: { fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary, marginBottom: 6 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  cardText: { fontSize: 14, lineHeight: 20, color: Colors.light.text },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  big: { fontSize: 22, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  muted: { fontSize: 12, color: Colors.light.textSecondary },
  strong: { fontWeight: theme.fontWeight.bold },
  name: { fontSize: 15, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  badge: { fontSize: 12, fontWeight: theme.fontWeight.bold },
  hint: { fontSize: 12, color: Colors.light.textSecondary, textAlign: 'center' },
  supplierRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 12, backgroundColor: Colors.light.card },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingHorizontal: 14, borderWidth: 2, borderRadius: 14, backgroundColor: Colors.light.card },
  searchInput: { flex: 1, height: 52, fontSize: 16, color: Colors.light.text, outlineStyle: 'none' } as any,
  zeroNote: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: 12, borderRadius: 12, backgroundColor: Colors.light.warningLight, borderWidth: 1, borderColor: Colors.light.warningDark },
  zeroNoteText: { flex: 1, minWidth: 200, fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.warningDarker },

  hit: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, padding: 10, borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 14, backgroundColor: Colors.light.card },
  hitNew: { borderStyle: 'dashed' },
  thumb: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  thumbText: { fontSize: 17, fontWeight: theme.fontWeight.bold },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.light.border },
  group: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.light.border },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 20, gap: 6, backgroundColor: Colors.light.background, borderTopWidth: 1, borderTopColor: Colors.light.border },
  centerBox: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  okIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 112, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, borderRadius: 14, backgroundColor: Colors.light.text },
  toastText: { flex: 1, fontSize: 14, color: Colors.light.background, fontWeight: theme.fontWeight.medium },
  toastUndo: { minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' },
  toastUndoText: { fontSize: 14, fontWeight: theme.fontWeight.bold, color: Colors.light.background, textDecorationLine: 'underline' },
});
