/**
 * Conferência de estoque: lista cada cor/tamanho com a quantidade que o sistema diz ter, e você digita o que contou.
 * Mostra na hora quem confere, quem sobra e quem falta. Dá para imprimir a lista para contar na mão (coluna "Contado"
 * em branco) e imprimir o resultado depois. A contagem fica salva no aparelho (pode continuar outro dia).
 * Esta tela só confere: não altera o estoque.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput as RNTextInput,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors, VALUE_COLORS } from '@/constants/Colors';
import useBackToList from '@/hooks/useBackToList';
import { useAuthStore } from '@/store/authStore';
import { useBrandingColors } from '@/store/brandingStore';
import { getStockCheck, type StockCheckRow } from '@/services/stockCheckService';
import { variantCodeText } from '@/utils/shortCode';
import HScroll from '@/components/ui/HScroll';
import { formatInt } from '@/utils/format';

type Counts = Record<number, string>;

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const variantLabel = (r: StockCheckRow) => [r.color, r.size].filter(Boolean).join(' / ') || 'Única';

function diffOf(row: StockCheckRow, counts: Counts): number | null {
  const raw = counts[row.variant_id];
  if (raw === undefined || raw === '') return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n - row.system_quantity : null;
}

export default function StockCheckScreen() {
  const brand = useBrandingColors();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/more');
  const tenantId = useAuthStore((s) => s.tenant_id);

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Counts>({});
  const [loaded, setLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState('');

  const storageKey = `@provador:conferencia:${tenantId ?? 'loja'}`;

  // Contagem salva no aparelho: continua de onde parou
  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (raw) setCounts(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(counts)).catch(() => {});
  }, [counts, loaded, storageKey]);

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['stock-check', categoryId, onlyInStock],
    queryFn: () => getStockCheck({ categoryId, onlyInStock }),
    staleTime: 60 * 1000, // a lista é grande: não baixa de novo a cada volta à tela
  });
  // categorias para filtrar vêm da própria lista (sem filtro de categoria ativo)
  const { data: allData } = useQuery({
    queryKey: ['stock-check', null, false],
    queryFn: () => getStockCheck({}),
    staleTime: 60 * 1000,
  });
  const categories = useMemo(() => {
    const map = new Map<number, string>();
    (allData?.rows ?? []).forEach((r) => {
      if (r.category_id) map.set(r.category_id, r.category_name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [allData]);

  const rows = data?.rows ?? [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.product_name} ${r.color ?? ''} ${r.size ?? ''} ${r.sku ?? ''} ${variantCodeText(r) ?? ''}`.toLowerCase().includes(q)) return false;
      if (onlyDiffs) {
        const d = diffOf(r, counts);
        return d !== null && d !== 0;
      }
      return true;
    });
  }, [rows, search, onlyDiffs, counts]);

  const grouped = useMemo(() => {
    const out: { key: string; name: string; category: string; rows: StockCheckRow[] }[] = [];
    visible.forEach((r) => {
      const last = out[out.length - 1];
      if (last && last.key === `${r.product_id}`) last.rows.push(r);
      else out.push({ key: `${r.product_id}`, name: r.product_name, category: r.category_name, rows: [r] });
    });
    return out;
  }, [visible]);

  // Lojas grandes têm milhares de variações: desenhar tudo de uma vez trava o celular.
  // Mostra os primeiros produtos e libera mais sob demanda (o resumo continua somando tudo).
  const PAGE = 30;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => {
    setShown(PAGE);
  }, [search, onlyDiffs, categoryId, onlyInStock]);
  const shownGroups = useMemo(() => grouped.slice(0, shown), [grouped, shown]);

  const summary = useMemo(() => {
    let counted = 0;
    let countedPieces = 0;
    let systemOfCounted = 0;
    let falta = 0;
    let sobra = 0;
    let ok = 0;
    rows.forEach((r) => {
      const d = diffOf(r, counts);
      if (d === null) return;
      counted += 1;
      countedPieces += r.system_quantity + d;
      systemOfCounted += r.system_quantity;
      if (d === 0) ok += 1;
      else if (d < 0) falta += -d;
      else sobra += d;
    });
    return { counted, countedPieces, systemOfCounted, falta, sobra, ok, diffs: counted - ok };
  }, [rows, counts]);

  const setCount = useCallback((variantId: number, text: string) => {
    setCounts((prev) => ({ ...prev, [variantId]: text.replace(/[^0-9]/g, '') }));
  }, []);

  const buildHtml = (withResult: boolean) => {
    const title = withResult ? 'Resultado da conferência de estoque' : 'Lista para conferência de estoque';
    const today = new Date().toLocaleDateString('pt-BR');
    let body = '';
    let currentProduct = -1;
    visible.forEach((r) => {
      if (r.product_id !== currentProduct) {
        currentProduct = r.product_id;
        body += `<tr class="prod"><td colspan="${withResult ? 5 : 4}">${esc(r.product_name)} <span class="cat">${esc(r.category_name)}</span></td></tr>`;
      }
      const d = diffOf(r, counts);
      const code = variantCodeText(r) ?? r.sku ?? '';
      if (withResult) {
        const counted = counts[r.variant_id] ?? '';
        const cls = d === null ? '' : d === 0 ? 'ok' : d < 0 ? 'falta' : 'sobra';
        const label = d === null ? 'não contado' : d === 0 ? 'confere' : d < 0 ? `falta ${-d}` : `sobra ${d}`;
        body += `<tr class="${cls}"><td>${esc(variantLabel(r))}</td><td>${esc(code)}</td><td class="n">${r.system_quantity}</td><td class="n">${esc(counted)}</td><td>${label}</td></tr>`;
      } else {
        body += `<tr><td>${esc(variantLabel(r))}</td><td>${esc(code)}</td><td class="n">${r.system_quantity}</td><td class="blank"></td></tr>`;
      }
    });
    const head = withResult
      ? '<th>Cor / tamanho</th><th>Código</th><th>Sistema</th><th>Contado</th><th>Resultado</th>'
      : '<th>Cor / tamanho</th><th>Código</th><th>Sistema</th><th>Contado</th>';
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:18px;color:#111}
      h1{font-size:18px;margin:0 0 4px}.sub{color:#555;margin-bottom:12px}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:5px 8px;text-align:left}
      th{background:#eee}td.n{text-align:center;width:70px}td.blank{width:90px}
      tr.prod td{background:#f4f4f4;font-weight:bold}.cat{font-weight:normal;color:#666;margin-left:8px}
      tr.falta td{background:#fde8e8}tr.sobra td{background:#fff4d6}tr.ok td{color:#2a7a3b}
    </style></head><body>
      <h1>${title}</h1>
      <div class="sub">${today}${categoryId ? ' · só uma categoria' : ''} · ${formatInt(visible.length)} variações${
        withResult ? ` · contadas ${formatInt(summary.counted)}, divergentes ${formatInt(summary.diffs)}, faltam ${formatInt(summary.falta)} peça(s), sobram ${formatInt(summary.sobra)}` : ''
      }</div>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </body></html>`;
  };

  const printList = async (withResult: boolean) => {
    setMessage('');
    try {
      const html = buildHtml(withResult);
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
        else await Print.printAsync({ uri });
      }
    } catch {
      setMessage('Não foi possível gerar a impressão. Tente de novo.');
    }
  };

  const pending = rows.length - summary.counted;

  return (
    <View style={styles.container}>
      <PageHeader title="Conferência de estoque" subtitle="Compare o sistema com a contagem" showBackButton onBack={goBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <View style={styles.intro}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.light.textSecondary} />
          <Text style={styles.introText}>
            Conte as peças da prateleira e digite o número ao lado de cada cor e tamanho. A tela mostra na hora o que confere, o que falta
            e o que sobra. Esta tela só confere: ela não muda o estoque.
          </Text>
        </View>

        {/* Resumo */}
        <View style={styles.cards}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Variações contadas</Text>
            <Text style={styles.cardValue}>{formatInt(summary.counted)} de {formatInt(rows.length)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Peças no sistema</Text>
            <Text style={styles.cardValue}>{formatInt(data?.total_pieces)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Confere</Text>
            <Text style={[styles.cardValue, { color: VALUE_COLORS.positive }]}>{formatInt(summary.ok)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Faltam / sobram</Text>
            <Text style={[styles.cardValue, { color: summary.diffs > 0 ? VALUE_COLORS.negative : Colors.light.text }]}>
              {formatInt(summary.falta)} / {formatInt(summary.sobra)}
            </Text>
          </View>
        </View>

        {/* Filtros */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.light.textTertiary} />
          <RNTextInput
            style={styles.searchInput}
            placeholder="Buscar por produto, cor, tamanho, SKU ou #código"
            placeholderTextColor={Colors.light.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <HScroll showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Todas as categorias" active={categoryId === null} onPress={() => setCategoryId(null)} color={brand.primary} />
          {categories.map(([id, name]) => (
            <Chip key={id} label={name} active={categoryId === id} onPress={() => setCategoryId(id)} color={brand.primary} />
          ))}
        </HScroll>
        <View style={styles.chips}>
          <Chip label="Só com estoque no sistema" active={onlyInStock} onPress={() => setOnlyInStock((v) => !v)} color={brand.primary} />
          <Chip label="Só divergências" active={onlyDiffs} onPress={() => setOnlyDiffs((v) => !v)} color={brand.primary} />
        </View>

        {/* Ações */}
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: brand.primary }]} onPress={() => printList(false)} activeOpacity={0.8}>
            <Ionicons name="print-outline" size={16} color={brand.primary} />
            <Text style={[styles.actionText, { color: brand.primary }]}>Imprimir lista para contar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: brand.primary, opacity: summary.counted ? 1 : 0.5 }]}
            onPress={() => summary.counted && printList(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="document-text-outline" size={16} color={brand.primary} />
            <Text style={[styles.actionText, { color: brand.primary }]}>Imprimir resultado</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: Colors.light.border, opacity: summary.counted ? 1 : 0.5 }]}
            onPress={() => summary.counted && setConfirmClear(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-outline" size={16} color={Colors.light.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.light.textSecondary }]}>Limpar contagem</Text>
          </TouchableOpacity>
        </View>
        {!!message && <Text style={styles.error}>{message}</Text>}

        {/* Lista */}
        {isLoading ? (
          <ActivityIndicator size="large" color={brand.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={styles.empty}>
            <Ionicons name="wifi-outline" size={40} color={Colors.light.textTertiary} />
            <Text style={styles.emptyText}>Não foi possível carregar o estoque.</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={[styles.link, { color: brand.primary }]}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : grouped.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={40} color={Colors.light.textTertiary} />
            <Text style={styles.emptyText}>{onlyDiffs ? 'Nenhuma divergência até agora.' : 'Nenhuma variação encontrada.'}</Text>
          </View>
        ) : (
          shownGroups.map((g) => (
            <View key={g.key} style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={styles.groupName} numberOfLines={2}>{g.name}</Text>
                <Text style={styles.groupCat}>{g.category}</Text>
              </View>
              {g.rows.map((r) => {
                const d = diffOf(r, counts);
                const code = variantCodeText(r);
                return (
                  <View key={r.variant_id} style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.variant} numberOfLines={1}>{variantLabel(r)}</Text>
                      <Text style={styles.meta} numberOfLines={1}>{[code, r.sku].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <View style={styles.sys}>
                      <Text style={styles.sysLabel}>Sistema</Text>
                      <Text style={styles.sysValue}>{formatInt(r.system_quantity)}</Text>
                    </View>
                    <RNTextInput
                      style={[
                        styles.countInput,
                        d !== null && d === 0 && { borderColor: VALUE_COLORS.positive },
                        d !== null && d !== 0 && { borderColor: VALUE_COLORS.negative },
                      ]}
                      value={counts[r.variant_id] ?? ''}
                      onChangeText={(t) => setCount(r.variant_id, t)}
                      keyboardType="numeric"
                      placeholder="Contado"
                      placeholderTextColor={Colors.light.textTertiary}
                      inputMode="numeric"
                    />
                    <View style={styles.diff}>
                      {d === null ? (
                        <Text style={styles.diffNone}>-</Text>
                      ) : d === 0 ? (
                        <Ionicons name="checkmark-circle" size={22} color={VALUE_COLORS.positive} accessibilityLabel="Confere" />
                      ) : (
                        <Text style={[styles.diffText, { color: VALUE_COLORS.negative }]}>{d < 0 ? `falta ${-d}` : `sobra ${d}`}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}

        {grouped.length > shownGroups.length && (
          <TouchableOpacity onPress={() => setShown((n) => n + PAGE)} style={{ alignItems: 'center', padding: 16 }}>
            <Text style={[styles.link, { color: brand.primary }]}>
              Mostrar mais ({formatInt(grouped.length - shownGroups.length)} produtos restantes)
            </Text>
          </TouchableOpacity>
        )}

        {!isLoading && rows.length > 0 && (
          <Text style={styles.footer}>
            {pending > 0 ? `${formatInt(pending)} variação(ões) ainda sem contagem.` : 'Todas as variações foram contadas.'}
          </Text>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirmClear}
        type="warning"
        title="Limpar a contagem?"
        message="Os números que você digitou serão apagados deste aparelho. O estoque do sistema não muda."
        confirmText="Limpar"
        cancelText="Cancelar"
        onConfirm={() => {
          setCounts({});
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
}

function Chip({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.chip, active && { borderColor: color, backgroundColor: color + '14' }]}
    >
      <Text style={[styles.chipText, active && { color, fontWeight: '700' }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48 },
  intro: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  introText: { flex: 1, fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  card: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: Colors.light.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cardLabel: { fontSize: 12, color: Colors.light.textSecondary },
  cardValue: { fontSize: 20, fontWeight: '800', color: Colors.light.text, marginTop: 2 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.light.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  chipText: { fontSize: 13, color: Colors.light.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  actionText: { fontSize: 13, fontWeight: '700' },
  group: { backgroundColor: Colors.light.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, marginTop: 10, overflow: 'hidden' },
  groupHead: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.light.backgroundSecondary },
  groupName: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  groupCat: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.light.border },
  variant: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  meta: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 1 },
  sys: { alignItems: 'center', minWidth: 52 },
  sysLabel: { fontSize: 10, color: Colors.light.textSecondary },
  sysValue: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  countInput: {
    width: 72,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 15,
    color: Colors.light.text,
    backgroundColor: Colors.light.card,
  },
  diff: { width: 62, alignItems: 'center' },
  diffNone: { color: Colors.light.textTertiary, fontSize: 16 },
  diffText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.light.textSecondary, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '700' },
  error: { color: Colors.light.error, marginBottom: 6 },
  footer: { textAlign: 'center', color: Colors.light.textSecondary, fontSize: 13, marginTop: 16 },
});
