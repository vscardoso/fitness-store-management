/**
 * Conferência de estoque: lista cada cor/tamanho com a quantidade que o sistema diz ter, e você digita o que contou.
 * Mostra na hora quem confere, quem sobra e quem falta. Dá para imprimir a lista para contar na mão (coluna "Contado"
 * em branco) e imprimir o resultado depois. A contagem fica salva no aparelho (pode continuar outro dia).
 * A conferência só compara. Só o admin, e só se ligar a opção "Dar baixa pela conferência" (chave no topo), pode dar baixa
 * nas peças que faltam (perda, avaria, furto ou ajuste); a baixa desconta das entradas e fica registrada com o motivo.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import BottomSheet from '@/components/ui/BottomSheet';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors, VALUE_COLORS } from '@/constants/Colors';
import useBackToList from '@/hooks/useBackToList';
import { useAuthStore } from '@/store/authStore';
import { useBrandingColors } from '@/store/brandingStore';
import {
  getStockCheck, getStockWriteoffEnabled, setStockWriteoffEnabled, writeoffStock,
  type StockCheckRow, type WriteoffReason,
} from '@/services/stockCheckService';
import { isAdminRole } from '@/utils/roles';
import { parseApiError } from '@/utils/apiError';
import { Switch } from 'react-native-paper';
import { countsKey, createStockCount, getStockCount, updateStockCount, type CountedItemInput } from '@/services/stockCountService';
import { variantCodeText } from '@/utils/shortCode';
import HScroll from '@/components/ui/HScroll';
import { formatInt, formatDateTime } from '@/utils/format';
import ScanBar, { type ScanStatus } from '@/components/scan/ScanBar';
import { lookupCode } from '@/services/codeResolver';
import { buildCodeIndex, findVariantLocal } from '@/utils/scanLogic';
import { playScan } from '@/utils/scanFeedback';

type Counts = Record<number, string>;

interface Draft {
  id: number;
  revision: number;
  name: string;
  note: string;
  categoryId: number | null;
}

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
  const isAdmin = isAdminRole(useAuthStore((s) => s.user?.role));

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Counts>({});
  const [loaded, setLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();
  const [writeoffOn, setWriteoffOn] = useState(false);
  const [writeoffBusy, setWriteoffBusy] = useState(false);
  const [wo, setWo] = useState<{ row: StockCheckRow; qty: number } | null>(null);
  const [woReason, setWoReason] = useState<WriteoffReason>('perda');
  const [woNote, setWoNote] = useState('');
  const [woError, setWoError] = useState('');
  const [woSaving, setWoSaving] = useState(false);
  useEffect(() => {
    getStockWriteoffEnabled().then(setWriteoffOn).catch(() => setWriteoffOn(false));
  }, []);
  const toggleWriteoff = async (v: boolean) => {
    setWriteoffBusy(true);
    try {
      setWriteoffOn(await setStockWriteoffEnabled(v));
    } catch (e: any) {
      setMessage(parseApiError(e) || 'Não foi possível alterar a opção.');
    } finally {
      setWriteoffBusy(false);
    }
  };
  const confirmWriteoff = async () => {
    if (!wo) return;
    setWoSaving(true);
    setWoError('');
    try {
      await writeoffStock({ reason: woReason, note: woNote.trim() || undefined, items: [{ variant_id: wo.row.variant_id, quantity: wo.qty }] });
      setWo(null);
      setWoNote('');
      await queryClient.invalidateQueries({ queryKey: ['stock-check'] });
      setMessage('Baixa registrada.');
    } catch (e: any) {
      setWoError(parseApiError(e) || 'Não foi possível dar baixa.');
    } finally {
      setWoSaving(false);
    }
  };
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Conferência em andamento no servidor (continua em qualquer aparelho)
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveMode, setSaveMode] = useState<'draft' | 'finish'>('draft');
  const [finishOpen, setFinishOpen] = useState(false);
  const [conflict, setConflict] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pendingResume, setPendingResume] = useState<number | null>(null);
  const lastSavedRef = useRef('');
  const resumedRef = useRef<string | null>(null);
  const params = useLocalSearchParams<{ resume?: string }>();
  // leitura por QR
  const scrollRef = useRef<ScrollView>(null);
  const groupY = useRef<Record<string, number>>({});
  const rowY = useRef<Record<number, number>>({});
  const countsRef = useRef<Counts>({});
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [lastScan, setLastScan] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);

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
  useEffect(() => {
    countsRef.current = counts;
  }, [counts]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.variant_id, r])), [rows]);
  const codeIndex = useMemo(() => buildCodeIndex(rows), [rows]);
  const allIndex = useMemo(() => buildCodeIndex(allData?.rows ?? []), [allData]);

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

  // Qual conferência em andamento este aparelho está continuando (a contagem em si já fica salva acima)
  const draftKey = `@provador:conferencia_andamento:${tenantId ?? 'loja'}`;
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(draftKey)
      .then((raw) => {
        if (raw) setDraft(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setDraftLoaded(true));
  }, [draftKey]);
  useEffect(() => {
    if (!draftLoaded) return;
    if (draft) AsyncStorage.setItem(draftKey, JSON.stringify(draft)).catch(() => {});
    else AsyncStorage.removeItem(draftKey).catch(() => {});
  }, [draft, draftLoaded, draftKey]);

  const setCount = useCallback((variantId: number, text: string) => {
    setCounts((prev) => ({ ...prev, [variantId]: text.replace(/[^0-9]/g, '') }));
  }, []);

  // O que vai para o servidor: TODAS as peças contadas do escopo da conferência (nunca só as que o filtro mostra agora)
  const scopeCategory = draft ? draft.categoryId : categoryId;
  const payloadItems = useCallback((): CountedItemInput[] => {
    const src = allData?.rows ?? [];
    return src
      .filter((r) => (scopeCategory == null || r.category_id === scopeCategory) && diffOf(r, counts) !== null)
      .map((r) => ({ variant_id: r.variant_id, counted_quantity: parseInt(counts[r.variant_id], 10) }));
  }, [allData, scopeCategory, counts]);

  // Salva no servidor: cria a conferência em andamento (1ª vez), atualiza a mesma (as seguintes) ou finaliza.
  const persist = useCallback(
    async (opts: { finish?: boolean; name?: string; note?: string; silent?: boolean } = {}) => {
      const items = payloadItems();
      if (opts.finish && !items.length) {
        setSaveError('Conte ao menos uma peça antes de finalizar.');
        return false;
      }
      if (!draft && !items.length) return false;
      setSaving(true);
      setSaveError('');
      try {
        const res = draft
          ? await updateStockCount(draft.id, {
              revision: draft.revision, name: opts.name ?? draft.name, note: opts.note ?? draft.note, items, finish: opts.finish,
            })
          : await createStockCount({ name: opts.name, note: opts.note, categoryId: scopeCategory, items, finish: opts.finish });
        queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
        lastSavedRef.current = countsKey(items);
        setConflict('');
        setSavedAt(new Date().toISOString());
        if (opts.finish) {
          setDraft(null);
          setCounts({});
          lastSavedRef.current = '';
          setSaveOpen(false);
          setFinishOpen(false);
          router.push({ pathname: '/reports/stock-counts/[id]', params: { id: String(res.id) } } as any);
        } else {
          setDraft({ id: res.id, revision: res.revision, name: res.name ?? '', note: res.note ?? '', categoryId: res.category_id });
          setSaveOpen(false);
        }
        return true;
      } catch (e: any) {
        if (e?.response?.status === 409) {
          setConflict(e?.response?.data?.detail || 'Outra pessoa salvou esta conferência depois de você. Recarregue a versão salva.');
          setFinishOpen(false);
        } else if (!opts.silent) {
          setSaveError(e?.message || 'Não foi possível salvar a conferência. Tente de novo.');
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [payloadItems, draft, scopeCategory, queryClient, router],
  );

  // Salva sozinho, 20 s depois da última mudança, quando há conferência em andamento
  useEffect(() => {
    if (!draft || conflict || saving || !allData) return;
    if (countsKey(payloadItems()) === lastSavedRef.current) return;
    const t = setTimeout(() => {
      persist({ silent: true });
    }, 20000);
    return () => clearTimeout(t);
  }, [draft, conflict, saving, allData, payloadItems, persist]);

  // Abre uma conferência em andamento do servidor e põe os números dela na tela
  const loadDraft = useCallback(async (id: number) => {
    try {
      const detail = await getStockCount(id);
      if (detail.count.status !== 'open') {
        setMessage('Esta conferência já foi finalizada e não pode mais ser continuada.');
        return;
      }
      const next: Counts = {};
      detail.items.forEach((i) => {
        if (i.variant_id != null) next[i.variant_id] = String(i.counted_quantity);
      });
      setCounts(next);
      setCategoryId(detail.count.category_id);
      setDraft({
        id: detail.count.id, revision: detail.count.revision, name: detail.count.name ?? '',
        note: detail.count.note ?? '', categoryId: detail.count.category_id,
      });
      lastSavedRef.current = countsKey(
        detail.items.filter((i) => i.variant_id != null).map((i) => ({ variant_id: i.variant_id as number, counted_quantity: i.counted_quantity })),
      );
      setConflict('');
      setSavedAt(detail.count.updated_at ?? detail.count.created_at);
      setMessage('');
    } catch (e: any) {
      setMessage(e?.message || 'Não foi possível abrir a conferência. Tente de novo.');
    }
  }, []);

  // Veio da lista de conferências ("Continuar")
  useEffect(() => {
    const id = params.resume;
    if (!id || !loaded || !draftLoaded || resumedRef.current === id) return;
    resumedRef.current = id;
    const n = Number(id);
    if (!Number.isFinite(n)) return;
    const hasLocal = Object.keys(countsRef.current).length > 0;
    if (hasLocal && draft?.id !== n) setPendingResume(n);
    else loadDraft(n);
  }, [params.resume, loaded, draftLoaded, draft, loadDraft]);

  // seta de + e -: sem número ainda, o primeiro + conta 1 e o primeiro - conta 0; nunca passa de 0 para baixo
  const stepCount = useCallback((variantId: number, delta: 1 | -1) => {
    setCounts((prev) => {
      const raw = prev[variantId];
      const cur = raw === undefined || raw === '' ? null : parseInt(raw, 10) || 0;
      const next = cur === null ? (delta > 0 ? 1 : 0) : Math.max(0, cur + delta);
      return { ...prev, [variantId]: String(next) };
    });
  }, []);

  // Leitura do QR: acha a peça na lista (na hora, sem servidor), soma 1, rola até a linha e destaca
  const handleScan = useCallback(
    async (code: string) => {
      const id = findVariantLocal(codeIndex, code);
      const row = id !== null ? rowById.get(id) : undefined;
      if (!row) {
        const inAll = findVariantLocal(allIndex, code);
        if (inAll !== null) {
          const r = (allData?.rows ?? []).find((x) => x.variant_id === inAll);
          playScan('warn');
          setScanStatus({ kind: 'warn', text: (r?.product_name ?? 'Peça') + ' está fora do filtro atual. Escolha "Todas as categorias" para contar.' });
          return;
        }
        try {
          const found = await lookupCode(code);
          if (found) {
            playScan('warn');
            setScanStatus({ kind: 'warn', text: found.product.name + ' existe, mas não está na lista (puxe a tela para baixo para atualizar).' });
          } else {
            playScan('error');
            setScanStatus({ kind: 'error', text: 'Código ' + code + ' não encontrado nesta loja.' });
          }
        } catch (e: any) {
          playScan('error');
          setScanStatus({ kind: 'error', text: e?.message || 'Não foi possível consultar o código. Tente de novo.' });
        }
        return;
      }
      const vid = row.variant_id;
      const before = countsRef.current[vid];
      const cur = before === undefined || before === '' ? 0 : parseInt(before, 10) || 0;
      const next = cur + 1;
      setCounts((prev) => ({ ...prev, [vid]: String(next) }));
      setLastScan(vid);
      const diff = next - row.system_quantity;
      playScan(diff > 0 ? 'warn' : 'ok');
      const tail = diff > 0 ? ' (sobra ' + diff + ')' : diff === 0 ? ' (confere)' : '';
      setScanStatus({
        kind: diff > 0 ? 'warn' : 'ok',
        text: row.product_name + ' · ' + variantLabel(row) + ': contado ' + next + ' de ' + row.system_quantity + tail,
      });
      setHighlightId(vid);
      setFocusId(vid);
    },
    [codeIndex, allIndex, rowById, allData],
  );

  const undoScan = useCallback(() => {
    if (lastScan === null) return;
    stepCount(lastScan, -1);
    setScanStatus({ kind: 'ok', text: 'Última leitura desfeita.' });
    setLastScan(null);
  }, [lastScan, stepCount]);

  // some o destaque e o aviso depois de alguns segundos
  useEffect(() => {
    if (highlightId === null) return;
    const t = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(t);
  }, [highlightId]);
  useEffect(() => {
    if (!scanStatus) return;
    const t = setTimeout(() => {
      setScanStatus(null);
      setLastScan(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [scanStatus]);

  // rola até a linha lida: abre a página da lista onde ela está e espera a medida da linha
  useEffect(() => {
    if (focusId === null) return;
    const idx = grouped.findIndex((g) => g.rows.some((r) => r.variant_id === focusId));
    if (idx < 0) {
      setFocusId(null);
      return;
    }
    if (idx >= shown) {
      setShown(idx + 1 + PAGE);
      return;
    }
    const key = grouped[idx].key;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const gy = groupY.current[key];
      const ry = rowY.current[focusId];
      if (gy !== undefined && ry !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, gy + ry - 140), animated: true });
        setFocusId(null);
      } else if (tries++ < 8) {
        timer = setTimeout(tick, 60);
      } else {
        setFocusId(null);
      }
    };
    timer = setTimeout(tick, 30);
    return () => clearTimeout(timer);
  }, [focusId, grouped, shown]);

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
        ref={scrollRef}
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

        {/* Leitura do QR: câmera, leitor USB/Bluetooth ou digitar o código */}
        <ScanBar
          onCode={handleScan}
          status={scanStatus}
          placeholder="Bipe ou digite o código"
          right={
            lastScan !== null ? (
              <TouchableOpacity onPress={undoScan} style={styles.undoBtn} accessibilityRole="button" accessibilityLabel="Desfazer última leitura">
                <Ionicons name="arrow-undo-outline" size={18} color={Colors.light.text} />
              </TouchableOpacity>
            ) : null
          }
        />

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
          <Chip label="Todas as categorias" active={categoryId === null} onPress={() => setCategoryId(null)} color={brand.primary} disabled={!!draft && draft.categoryId !== null} />
          {categories.map(([id, name]) => (
            <Chip key={id} label={name} active={categoryId === id} onPress={() => setCategoryId(id)} color={brand.primary} disabled={!!draft && draft.categoryId !== null && draft.categoryId !== id} />
          ))}
        </HScroll>
        <View style={styles.chips}>
          <Chip label="Só com estoque no sistema" active={onlyInStock} onPress={() => setOnlyInStock((v) => !v)} color={brand.primary} />
          <Chip label="Só divergências" active={onlyDiffs} onPress={() => setOnlyDiffs((v) => !v)} color={brand.primary} />
        </View>

        {/* Conferência em andamento: salvar, finalizar e histórico */}
        {!!draft && (
          <View style={styles.draftBanner}>
            <Ionicons name="cloud-done-outline" size={18} color="#92400E" />
            <Text style={styles.draftText}>
              Em andamento{draft.name ? ': ' + draft.name : ''}. {savedAt ? 'Salva às ' + formatDateTime(savedAt).slice(-5) + '. ' : ''}
              Ela fica guardada e você continua de onde parou, em qualquer aparelho. O salvamento é automático.
            </Text>
          </View>
        )}
        {!!conflict && (
          <View style={styles.conflictBanner}>
            <Text style={styles.conflictText}>{conflict}</Text>
            <TouchableOpacity onPress={() => draft && loadDraft(draft.id)} style={styles.conflictBtn} activeOpacity={0.8}>
              <Text style={styles.conflictBtnText}>Recarregar a versão salva</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.saveBtn, { backgroundColor: brand.primary, borderColor: brand.primary, opacity: summary.counted && allData && !saving ? 1 : 0.5 }]}
            onPress={() => {
              if (!summary.counted || !allData || saving) return;
              setSaveError('');
              if (draft) persist();
              else {
                setSaveMode('draft');
                setSaveOpen(true);
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="save-outline" size={16} color="#fff" />
            <Text style={[styles.actionText, { color: '#fff' }]}>{draft ? 'Salvar andamento' : 'Salvar conferência'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: VALUE_COLORS.positive, opacity: summary.counted && allData ? 1 : 0.5 }]}
            onPress={() => {
              if (!summary.counted || !allData) return;
              setSaveError('');
              if (draft) setFinishOpen(true);
              else {
                setSaveMode('finish');
                setSaveOpen(true);
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-done-outline" size={16} color={VALUE_COLORS.positive} />
            <Text style={[styles.actionText, { color: VALUE_COLORS.positive }]}>Finalizar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: Colors.light.border }]}
            onPress={() => router.push('/reports/stock-counts' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={16} color={Colors.light.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.light.textSecondary }]}>Conferências salvas</Text>
          </TouchableOpacity>
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

        {isAdmin && (
          <View style={styles.woCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.woTitle}>Dar baixa pela conferência</Text>
              <Text style={styles.woNote}>
                {writeoffOn
                  ? 'Ligado: nas peças com falta aparece "Dar baixa". A baixa desconta do estoque e fica registrada com o motivo.'
                  : 'Desligado: a conferência só compara e não altera o estoque.'}
              </Text>
            </View>
            <Switch value={writeoffOn} onValueChange={toggleWriteoff} disabled={writeoffBusy} color={brand.primary} />
          </View>
        )}

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
            <View key={g.key} style={styles.group} onLayout={(e) => { groupY.current[g.key] = e.nativeEvent.layout.y; }}>
              <View style={styles.groupHead}>
                <Text style={styles.groupName} numberOfLines={2}>{g.name}</Text>
                <Text style={styles.groupCat}>{g.category}</Text>
              </View>
              {g.rows.map((r) => {
                const d = diffOf(r, counts);
                const code = variantCodeText(r);
                return (
                  <View
                    key={r.variant_id}
                    style={[styles.row, highlightId === r.variant_id && styles.rowHighlight]}
                    onLayout={(e) => { rowY.current[r.variant_id] = e.nativeEvent.layout.y; }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.variant} numberOfLines={1}>{variantLabel(r)}</Text>
                      <Text style={styles.meta} numberOfLines={1}>{[code, r.sku].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <View style={styles.sys}>
                      <Text style={styles.sysLabel}>Sistema</Text>
                      <Text style={styles.sysValue}>{formatInt(r.system_quantity)}</Text>
                    </View>
                    <View style={styles.stepper}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Diminuir contagem"
                        onPress={() => stepCount(r.variant_id, -1)}
                        style={styles.stepBtn}
                      >
                        <Ionicons name="remove" size={18} color={Colors.light.text} />
                      </TouchableOpacity>
                      <RNTextInput
                        style={[
                          styles.countInput,
                          d !== null && d === 0 && { borderColor: VALUE_COLORS.positive },
                          d !== null && d !== 0 && { borderColor: VALUE_COLORS.negative },
                        ]}
                        value={counts[r.variant_id] ?? ''}
                        onChangeText={(t) => setCount(r.variant_id, t)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={Colors.light.textTertiary}
                        inputMode="numeric"
                        selectTextOnFocus
                      />
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Aumentar contagem"
                        onPress={() => stepCount(r.variant_id, 1)}
                        style={styles.stepBtn}
                      >
                        <Ionicons name="add" size={18} color={Colors.light.text} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.diff}>
                      {d === null ? (
                        // ainda sem contagem: mostra o que faltaria se nada for achado (cinza = provisório)
                        r.system_quantity > 0 ? (
                          <Text style={styles.diffPending}>falta {formatInt(r.system_quantity)}</Text>
                        ) : (
                          <Text style={styles.diffNone}>-</Text>
                        )
                      ) : d === 0 ? (
                        <Ionicons name="checkmark-circle" size={22} color={VALUE_COLORS.positive} accessibilityLabel="Confere" />
                      ) : (
                        <Text style={[styles.diffText, { color: VALUE_COLORS.negative }]}>{d < 0 ? `falta ${-d}` : `sobra ${d}`}</Text>
                      )}
                        {isAdmin && writeoffOn && d !== null && d < 0 && r.system_quantity > 0 && (
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`Dar baixa de ${-d} peças`}
                            onPress={() => { setWo({ row: r, qty: Math.min(-d, r.system_quantity) }); setWoReason('perda'); setWoNote(''); setWoError(''); }}
                            style={styles.woBtn}
                          >
                            <Text style={[styles.woBtnText, { color: VALUE_COLORS.negative }]}>Dar baixa</Text>
                          </TouchableOpacity>
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

      <BottomSheet
        visible={!!wo}
        onDismiss={() => !woSaving && setWo(null)}
        title="Dar baixa no estoque"
        subtitle={wo ? `${wo.row.product_name} · ${variantLabel(wo.row)}` : ''}
        icon="remove-circle-outline"
        actions={[
          { label: 'Cancelar', onPress: () => setWo(null), variant: 'secondary', disabled: woSaving },
          { label: wo ? `Dar baixa de ${wo.qty}` : 'Dar baixa', onPress: confirmWriteoff, variant: 'primary', loading: woSaving, icon: 'checkmark' },
        ]}
      >
        <Text style={styles.saveHelp}>
          Tira {wo?.qty ?? 0} peça(s) do estoque do sistema, das entradas mais antigas. Não dá para desfazer por aqui; fica registrado com o motivo.
        </Text>
        <View style={styles.woReasons}>
          {(['perda', 'avaria', 'furto', 'ajuste'] as WriteoffReason[]).map((k) => (
            <TouchableOpacity
              key={k}
              onPress={() => setWoReason(k)}
              style={[styles.woChip, woReason === k && { borderColor: brand.primary, backgroundColor: brand.primary + '20' }]}
            >
              <Text style={{ color: woReason === k ? brand.primary : Colors.light.textSecondary, fontWeight: '700', fontSize: 13 }}>
                {k === 'perda' ? 'Perda' : k === 'avaria' ? 'Avaria' : k === 'furto' ? 'Furto' : 'Ajuste de contagem'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <RNTextInput
          style={styles.saveInput}
          value={woNote}
          onChangeText={setWoNote}
          placeholder="Observação (opcional)"
          placeholderTextColor={Colors.light.textTertiary}
          maxLength={300}
        />
        {!!woError && <Text style={styles.error}>{woError}</Text>}
      </BottomSheet>

      <BottomSheet
        visible={saveOpen}
        onDismiss={() => !saving && setSaveOpen(false)}
        title={saveMode === 'finish' ? 'Finalizar conferência' : 'Salvar conferência'}
        subtitle={`${formatInt(summary.counted)} variações contadas, ${formatInt(summary.diffs)} divergentes`}
        icon={saveMode === 'finish' ? 'checkmark-done-outline' : 'save-outline'}
        actions={[
          { label: 'Cancelar', onPress: () => setSaveOpen(false), variant: 'secondary', disabled: saving },
          {
            label: saveMode === 'finish' ? 'Finalizar' : 'Salvar',
            onPress: () => persist({ finish: saveMode === 'finish', name: saveName, note: saveNote }),
            variant: 'primary',
            loading: saving,
            icon: 'checkmark',
          },
        ]}
      >
        <Text style={styles.saveHelp}>
          {saveMode === 'finish'
            ? 'A conferência vira um relatório fechado, com a data de hoje e o seu nome, e não muda mais. Peças que você não contou ficam como "não contadas". O estoque não muda.'
            : 'Fica guardada como "em andamento": você continua de onde parou, em qualquer aparelho, e ela é salva sozinha enquanto você conta. Quando terminar, toque em Finalizar.'}
        </Text>
        <RNTextInput
          style={styles.saveInput}
          value={saveName}
          onChangeText={setSaveName}
          placeholder="Nome da conferência (opcional), ex.: Prateleira 2"
          placeholderTextColor={Colors.light.textTertiary}
          maxLength={120}
        />
        <RNTextInput
          style={[styles.saveInput, { height: 80, textAlignVertical: 'top' }]}
          value={saveNote}
          onChangeText={setSaveNote}
          placeholder="Observação (opcional)"
          placeholderTextColor={Colors.light.textTertiary}
          multiline
          maxLength={2000}
        />
        {!!saveError && <Text style={styles.error}>{saveError}</Text>}
      </BottomSheet>

      <ConfirmDialog
        visible={finishOpen}
        type="warning"
        title="Finalizar a conferência?"
        message={`Você contou ${formatInt(summary.counted)} de ${formatInt(rows.length)} variações (${formatInt(pending)} sem contagem ficam como "não contadas"). Depois de finalizar, ela vira relatório e não dá mais para mudar.`}
        confirmText="Finalizar"
        cancelText="Voltar"
        onConfirm={() => persist({ finish: true })}
        onCancel={() => setFinishOpen(false)}
      />

      <ConfirmDialog
        visible={pendingResume !== null}
        type="warning"
        title="Continuar a conferência salva?"
        message="Este aparelho tem uma contagem em andamento. Continuar a conferência salva troca essa contagem pela da conferência salva."
        confirmText="Continuar a salva"
        cancelText="Manter a deste aparelho"
        onConfirm={() => {
          const id = pendingResume;
          setPendingResume(null);
          if (id !== null) loadDraft(id);
        }}
        onCancel={() => setPendingResume(null)}
      />

      <ConfirmDialog
        visible={confirmClear}
        type="warning"
        title="Limpar a contagem?"
        message={draft
          ? 'Os números serão apagados deste aparelho e ele deixa de continuar a conferência em andamento. Ela continua guardada na lista de conferências salvas, como estava no último salvamento. O estoque não muda.'
          : 'Os números que você digitou serão apagados deste aparelho. O estoque do sistema não muda.'}
        confirmText="Limpar"
        cancelText="Cancelar"
        onConfirm={() => {
          setCounts({});
          setDraft(null);
          lastSavedRef.current = '';
          setConflict('');
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
}

function Chip({ label, active, onPress, color, disabled }: { label: string; active: boolean; onPress: () => void; color: string; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      activeOpacity={0.75}
      style={[styles.chip, active && { borderColor: color, backgroundColor: color + '14' }, disabled && { opacity: 0.35 }]}
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
  saveBtn: { borderWidth: 1 },
  undoBtn: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card },
  rowHighlight: { backgroundColor: '#FEF9C3' },
  draftBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FEF3C7', marginTop: 8 },
  draftText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#92400E' },
  conflictBanner: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FEE2E2', marginTop: 8 },
  conflictText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#991B1B' },
  conflictBtn: { alignSelf: 'flex-start', backgroundColor: '#991B1B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  conflictBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
  },
  savedText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#166534' },
  saveHelp: { fontSize: 13, color: Colors.light.textSecondary, marginBottom: 12 },
  saveInput: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.light.text,
    backgroundColor: Colors.light.card,
    marginBottom: 10,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 32,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  countInput: {
    width: 52,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 15,
    color: Colors.light.text,
    backgroundColor: Colors.light.card,
  },
  diff: { width: 54, alignItems: 'center' },
  diffPending: { fontSize: 12, fontWeight: '600', textAlign: 'center', color: Colors.light.textTertiary },
  diffNone: { color: Colors.light.textTertiary, fontSize: 16 },
  diffText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.light.textSecondary, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '700' },
  woCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginBottom: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card },
  woTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  woNote: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary, marginTop: 2 },
  woBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  woBtnText: { fontSize: 12, fontWeight: '800' },
  woReasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  woChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border },
  error: { color: Colors.light.error, marginBottom: 6 },
  footer: { textAlign: 'center', color: Colors.light.textSecondary, fontSize: 13, marginTop: 16 },
});
