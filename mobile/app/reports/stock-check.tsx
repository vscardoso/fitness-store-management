/**
 * Conferência de estoque: lista cada cor/tamanho com a quantidade que o sistema diz ter, e você digita o que contou.
 * Mostra na hora quem confere, quem sobra e quem falta. Dá para imprimir a lista para contar na mão (coluna "Contado"
 * em branco) e imprimir o resultado depois. A contagem fica salva no aparelho (pode continuar outro dia).
 * A conferência só compara. Só o admin, e só se ligar a opção "Dar baixa pela conferência" (chave em "Mais opções"), pode dar baixa
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
import {
  applyStockCount, createStockCount, discardStockCount, getStockCount, listStockCounts,
  type CountedItemInput, type CountOp, type StockCountDetail, type StockCountSummary,
} from '@/services/stockCountService';
import { variantCodeText } from '@/utils/shortCode';
import HScroll from '@/components/ui/HScroll';
import { formatInt, formatDateTime } from '@/utils/format';
import ScanBar, { type ScanStatus } from '@/components/scan/ScanBar';
import { lookupCode } from '@/services/codeResolver';
import { buildCodeIndex, findVariantLocal } from '@/utils/scanLogic';
import { useScreenWakeLock } from '@/hooks/usePwaExtras';
import { playScan } from '@/utils/scanFeedback';
import { buildSearchIndex, matchesSearch } from '@/utils/searchMatch';
import { useDesktopContentStyle, useDesktopGrid } from '@/hooks/useLayout';

type Counts = Record<number, string>;

interface Draft {
  id: number;
  revision: number;
  name: string;
  note: string;
  categoryId: number | null;
  createdBy?: string | null;
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
  const desktopContent = useDesktopContentStyle();
  const brand = useBrandingColors();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/more');
  const tenantId = useAuthStore((s) => s.tenant_id);
  const isAdmin = isAdminRole(useAuthStore((s) => s.user?.role));
  const myName = useAuthStore((s) => s.user?.full_name || s.user?.email || '');

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);   // "Falta bipar": só o que ninguém contou ainda
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Counts>({});
  const [loaded, setLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [writeoffOn, setWriteoffOn] = useState(false);
  const [writeoffBusy, setWriteoffBusy] = useState(false);
  const [wo, setWo] = useState<{ row: StockCheckRow; qty: number } | null>(null);
  // Sem motivo marcado: a pessoa escolhe sempre (antes vinha "Perda" marcado e dava baixa sem perguntar)
  const [woReason, setWoReason] = useState<WriteoffReason | null>(null);
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
    if (!woReason) {
      setWoError('Escolha o motivo da baixa.');
      return;
    }
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
  const resumedRef = useRef<string | null>(null);
  const params = useLocalSearchParams<{ resume?: string; q?: string }>();
  useScreenWakeLock(true);   // a tela não apaga no meio da contagem
  // Atalho "Ajustar quantidade" da página do produto: abre a conferência já filtrada pelo código dele
  useEffect(() => {
    if (params.q) setSearch(String(params.q));
  }, [params.q]);
  // leitura por QR
  const scrollRef = useRef<ScrollView>(null);
  const [showTop, setShowTop] = useState(false);   // botão "voltar ao topo" quando a lista está lá embaixo
  // posição da grade dentro da rolagem (as posições dos cartões são relativas a ela)
  const gridY = useRef(0);
  const grid = useDesktopGrid(360, 12);
  const groupY = useRef<Record<string, number>>({});
  const rowY = useRef<Record<number, number>>({});
  const countsRef = useRef<Counts>({});
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [lastScan, setLastScan] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);

  // v2 (05/11/2026, conferência compartilhada): as contagens antigas guardadas só no aparelho são descartadas
  const storageKey = `@provador:conferencia2:${tenantId ?? 'loja'}`;
  useEffect(() => {
    AsyncStorage.multiRemove([`@provador:conferencia:${tenantId ?? 'loja'}`, `@provador:conferencia_andamento:${tenantId ?? 'loja'}`]).catch(() => {});
  }, [tenantId]);

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

  const liveRef = useRef<Map<number, number> | null>(null);
  useEffect(() => {
    liveRef.current = allData ? new Map(allData.rows.map((r) => [r.variant_id, r.system_quantity])) : null;
  }, [allData]);

  const rows = data?.rows ?? [];
  useEffect(() => {
    countsRef.current = counts;
  }, [counts]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.variant_id, r])), [rows]);
  const codeIndex = useMemo(() => buildCodeIndex(rows), [rows]);
  const allIndex = useMemo(() => buildCodeIndex(allData?.rows ?? []), [allData]);

  // Busca por início de palavra (letra ou número já no primeiro toque); o texto de cada peça é preparado uma vez só
  const searchIndex = useMemo(
    () => new Map(rows.map((r) => [r.variant_id, buildSearchIndex([r.product_name, r.color ?? '', r.size ?? ''], [variantCodeText(r), r.sku])])),
    [rows],
  );
  const visible = useMemo(() => {
    const q = search.trim();
    return rows.filter((r) => {
      if (q && !matchesSearch(searchIndex.get(r.variant_id)!, q)) return false;
      const d = diffOf(r, counts);
      if (onlyPending && d !== null) return false;
      if (onlyDiffs) return d !== null && d !== 0;
      return true;
    });
  }, [rows, search, searchIndex, onlyDiffs, onlyPending, counts]);

  const grouped = useMemo(() => {
    // um cartão por produto, mesmo quando as cores de dois produtos de mesmo nome se intercalam na lista
    // (06/11/2026: "Conjunto Calça Ciclista" #020 e #027 viravam cartões repetidos com a mesma chave e, ao filtrar
    // "Só divergências", a tela deixava cartões antigos que conferiam)
    const out: { key: string; name: string; category: string; rows: StockCheckRow[] }[] = [];
    const byProduct = new Map<number, (typeof out)[number]>();
    visible.forEach((r) => {
      const g = byProduct.get(r.product_id);
      if (g) g.rows.push(r);
      else {
        const novo = { key: `${r.product_id}`, name: r.product_name, category: r.category_name, rows: [r] };
        byProduct.set(r.product_id, novo);
        out.push(novo);
      }
    });
    return out;
  }, [visible]);

  // Lojas grandes têm milhares de variações: desenhar tudo de uma vez trava o celular.
  // Mostra os primeiros produtos e libera mais sob demanda (o resumo continua somando tudo).
  const PAGE = 30;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => {
    setShown(PAGE);
  }, [search, onlyDiffs, onlyPending, categoryId, onlyInStock]);
  const shownGroups = useMemo(() => grouped.slice(0, shown), [grouped, shown]);

  const summary = useMemo(() => {
    let counted = 0;
    let countedPieces = 0;
    let systemOfCounted = 0;
    let falta = 0;
    let sobra = 0;
    let ok = 0;
    let okPieces = 0;
    rows.forEach((r) => {
      const d = diffOf(r, counts);
      if (d === null) return;
      counted += 1;
      countedPieces += r.system_quantity + d;
      systemOfCounted += r.system_quantity;
      if (d === 0) { ok += 1; okPieces += r.system_quantity; }
      else if (d < 0) falta += -d;
      else sobra += d;
    });
    return { counted, countedPieces, systemOfCounted, falta, sobra, ok, okPieces, diffs: counted - ok };
  }, [rows, counts]);

  // Qual conferência em andamento este aparelho está continuando (a contagem em si já fica salva acima)
  const draftKey = `@provador:conferencia_andamento2:${tenantId ?? 'loja'}`;
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

  // ===== Conferência compartilhada =====
  // Uma conferência aberta por loja; todo aparelho que abre esta tela entra nela. Cada bipada vai para o servidor
  // como operação (+1, -1, quantidade digitada, limpar) e soma com as dos outros; a tela puxa as dos outros a cada 4 s.
  const [countedBy, setCountedBy] = useState<Record<number, string>>({});
  const [people, setPeople] = useState<string[]>([]);
  const [joinAsk, setJoinAsk] = useState<StockCountSummary | null>(null);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [openChecked, setOpenChecked] = useState(false);
  const [syncError, setSyncError] = useState('');
  const draftRef = useRef<Draft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const opsRef = useRef<CountOp[]>([]);
  const flushing = useRef(false);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const creatingRef = useRef(false);

  const setDraftNow = useCallback((d: Draft | null) => {
    draftRef.current = d;
    setDraft(d);
  }, []);

  const scheduleFlush = useCallback((ms: number) => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => { flushRef.current(); }, ms);
  }, []);

  // Põe na tela o que está no servidor; operações deste aparelho ainda não enviadas continuam valendo por cima
  const applyDetail = useCallback((detail: StockCountDetail) => {
    // o servidor acompanha venda/entrada feita durante a conferência: se o estoque de uma peça contada mudou,
    // baixa a lista de novo para a comparação usar o estoque de agora
    const live = liveRef.current;
    if (live && detail.items.some((i) => i.variant_id != null && live.has(i.variant_id) && live.get(i.variant_id) !== i.system_quantity)) {
      queryClient.invalidateQueries({ queryKey: ['stock-check'] });
    }
    const next: Counts = {};
    const by: Record<number, string> = {};
    const who = new Set<string>();
    detail.items.forEach((i) => {
      if (i.variant_id == null) return;
      next[i.variant_id] = String(i.counted_quantity);
      if (i.counted_by_name) {
        by[i.variant_id] = i.counted_by_name;
        who.add(i.counted_by_name);
      }
    });
    opsRef.current.forEach((op) => {
      if (op.clear) delete next[op.variant_id];
      else if (op.set != null) next[op.variant_id] = String(op.set);
      else next[op.variant_id] = String(Math.max(0, (parseInt(next[op.variant_id] ?? '0', 10) || 0) + (op.delta ?? 0)));
    });
    if (detail.count.created_by_name) who.add(detail.count.created_by_name);
    setCounts(next);
    setCountedBy(by);
    setPeople(Array.from(who));
    const c = detail.count;
    setDraftNow({ id: c.id, revision: c.revision, name: c.name ?? '', note: c.note ?? '', categoryId: c.category_id, createdBy: c.created_by_name });
    setSavedAt(c.updated_at ?? c.created_at);
  }, [setDraftNow, queryClient]);

  const endedByOther = useCallback(() => {
    opsRef.current = [];
    countsRef.current = {};
    setDraftNow(null);
    setCounts({});
    setCountedBy({});
    setPeople([]);
    setMessage('Esta conferência foi finalizada. O relatório está em Conferências salvas.');
  }, [setDraftNow]);

  flushRef.current = async () => {
    const d = draftRef.current;
    if (!d || flushing.current || !opsRef.current.length) return;
    flushing.current = true;
    const batch = opsRef.current;
    opsRef.current = [];
    try {
      const res = await applyStockCount(d.id, { ops: batch });
      if (draftRef.current && draftRef.current.id === res.id) setDraftNow({ ...draftRef.current, revision: res.revision });
      setSavedAt(new Date().toISOString());
      setSyncError('');
    } catch (e: any) {
      const st = e?.response?.status;
      if (st === 409 || st === 404) endedByOther();
      else {
        opsRef.current = [...batch, ...opsRef.current];
        setSyncError('Sem conexão: as contagens deste aparelho vão ser enviadas assim que a internet voltar.');
      }
    } finally {
      flushing.current = false;
      if (opsRef.current.length && draftRef.current) scheduleFlush(2500);
    }
  };

  const queueOp = useCallback((op: CountOp) => {
    if (!draftRef.current) return;   // sem conferência no servidor ainda: a 1ª contagem cria (abaixo) com tudo
    opsRef.current.push(op);
    scheduleFlush(300);
  }, [scheduleFlush]);

  // Entra numa conferência do servidor (sumLocal: soma os números que estavam só neste aparelho)
  const joinCount = useCallback(async (id: number, sumLocal: boolean) => {
    const local = sumLocal ? { ...countsRef.current } : {};
    try {
      const det = await getStockCount(id);
      if (det.count.status !== 'open') {
        endedByOther();
        return;
      }
      opsRef.current = [];
      applyDetail(det);
      setCategoryId(null);
      setConflict('');
      // Números que estavam só neste aparelho entram SÓ nas peças que a conferência ainda não tem; nunca somam
      // por cima (05/11/2026: somar a cópia que o próprio aparelho guardava dobrou a conferência inteira duas vezes)
      const onServer = new Set(det.items.map((i) => i.variant_id));
      Object.entries(local).forEach(([vid, raw]) => {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n > 0 && !onServer.has(Number(vid))) {
          opsRef.current.push({ variant_id: Number(vid), set: n });
          setCounts((prev) => ({ ...prev, [vid]: String(n) }));
        }
      });
      if (opsRef.current.length) scheduleFlush(200);
      setMessage(`Você está na conferência${det.count.name ? ' "' + det.count.name + '"' : ''} começada por ${det.count.created_by_name || 'outra pessoa'}.`);
    } catch (e: any) {
      if (e?.response?.status === 404) endedByOther();   // conferência apagada: limpa este aparelho
      else setMessage(e?.message || 'Não foi possível abrir a conferência. Tente de novo.');
    }
  }, [applyDetail, endedByOther, scheduleFlush]);

  const syncNow = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    await flushRef.current();
    const det = await getStockCount(d.id, false, true);
    if (det.count.status !== 'open') {
      endedByOther();
      return;
    }
    applyDetail(det);
  }, [applyDetail, endedByOther]);

  // Puxa o que os outros contaram, a cada 4 s
  useEffect(() => {
    if (!draft?.id) return;
    const id = draft.id;
    const t = setInterval(async () => {
      if (flushing.current || opsRef.current.length) return;
      try {
        const det = await getStockCount(id, false, true);
        if (det.count.status !== 'open') {
          endedByOther();
          return;
        }
        if (det.count.revision !== draftRef.current?.revision && !opsRef.current.length && !flushing.current) applyDetail(det);
      } catch (e: any) {
        if (e?.response?.status === 404) endedByOther();   // conferência apagada: limpa este aparelho
        // sem rede: tenta de novo no próximo
      }
    }, 4000);
    return () => clearInterval(t);
  }, [draft?.id, applyDetail, endedByOther]);

  const setCount = useCallback((variantId: number, text: string) => {
    const clean = text.replace(/[^0-9]/g, '');
    setCounts((prev) => ({ ...prev, [variantId]: clean }));
    queueOp(clean === '' ? { variant_id: variantId, clear: true } : { variant_id: variantId, set: parseInt(clean, 10) });
  }, [queueOp]);

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
        let res: StockCountSummary;
        if (draft) {
          // manda o que falta deste aparelho; finalizar só com tudo enviado e a tela na última versão
          if (flushTimer.current) clearTimeout(flushTimer.current);
          await flushRef.current();
          if (opsRef.current.length) {
            setSaveError('Ainda há contagens deste aparelho para enviar (sem conexão). Tente de novo em instantes.');
            return false;
          }
          res = await applyStockCount(draft.id, {
            name: opts.name ?? draft.name, note: opts.note ?? draft.note, finish: opts.finish,
            revision: opts.finish ? draftRef.current?.revision : undefined,
          });
        } else {
          res = await createStockCount({ name: opts.name, note: opts.note, categoryId: null, items, finish: opts.finish });
        }
        queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
        setConflict('');
        setSavedAt(new Date().toISOString());
        if (opts.finish) {
          setDraftNow(null);
          setCounts({});
          setCountedBy({});
          setPeople([]);
          setSaveOpen(false);
          setFinishOpen(false);
          router.push({ pathname: '/reports/stock-counts/[id]', params: { id: String(res.id) } } as any);
        } else {
          setDraftNow({ id: res.id, revision: res.revision, name: res.name ?? '', note: res.note ?? '', categoryId: res.category_id, createdBy: res.created_by_name });
          setSaveOpen(false);
        }
        return true;
      } catch (e: any) {
        const detail: string = e?.response?.data?.detail || e?.message || '';
        const joinId = /\[#(\d+)\]/.exec(detail);
        if (e?.response?.status === 409 && joinId) {
          // outra pessoa abriu a conferência antes: entra nela somando o que este aparelho contou
          setSaveOpen(false);
          await joinCount(Number(joinId[1]), true);
        } else if (e?.response?.status === 409 && draft) {
          // chegou contagem nova de outra pessoa (ou ela já finalizou): atualiza a tela para conferir de novo
          setFinishOpen(false);
          setSaveOpen(false);
          try { await syncNow(); } catch { /* o aviso abaixo basta */ }
          setMessage(detail || 'Chegaram contagens novas. Confira e finalize de novo.');
        } else if (!opts.silent) {
          setSaveError(e?.message || 'Não foi possível salvar a conferência. Tente de novo.');
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [payloadItems, draft, queryClient, router, joinCount, syncNow, setDraftNow],
  );

  // Abre uma conferência do servidor (lista de conferências > Continuar) e põe os números dela na tela
  const loadDraft = useCallback((id: number) => joinCount(id, false), [joinCount]);

  // Ao abrir a tela: atualiza a conferência que este aparelho já estava seguindo, ou entra na que está aberta na loja
  useEffect(() => {
    if (!loaded || !draftLoaded || openChecked) return;
    (async () => {
      try {
        if (draftRef.current) await joinCount(draftRef.current.id, false);
        if (!draftRef.current) {   // não seguia nenhuma, ou a que seguia foi apagada/finalizada: entra na aberta
          const { results } = await listStockCounts({ status: 'open', limit: 1 });
          const open = results[0];
          if (open) {
            const hasLocal = Object.values(countsRef.current).some((v) => v !== '');
            await joinCount(open.id, hasLocal);   // números só deste aparelho completam o que falta, nunca somam
          }
        }
      } catch {
        // sem rede: a primeira contagem tenta de novo
      } finally {
        setOpenChecked(true);
      }
    })();
  }, [loaded, draftLoaded, openChecked, joinCount]);

  // Sem conferência na loja: a primeira peça contada já cria uma (aí os outros aparelhos entram nela)
  useEffect(() => {
    if (!loaded || !draftLoaded || !openChecked || draft || joinAsk || creatingRef.current) return;
    const items = Object.entries(counts)
      .filter(([, v]) => v !== '' && Number.isFinite(parseInt(v, 10)))
      .map(([vid, v]) => ({ variant_id: Number(vid), counted_quantity: parseInt(v, 10) }));
    if (!items.length) return;
    creatingRef.current = true;
    createStockCount({ categoryId: null, items })
      .then((res) => {
        setDraftNow({ id: res.id, revision: res.revision, name: res.name ?? '', note: res.note ?? '', categoryId: res.category_id, createdBy: res.created_by_name });
        setSavedAt(res.created_at);
        queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      })
      .catch(async (e: any) => {
        const m = /\[#(\d+)\]/.exec(e?.response?.data?.detail || e?.message || '');
        if (m) await joinCount(Number(m[1]), true);   // outro aparelho abriu antes: entra somando
        else setSyncError('Não foi possível começar a conferência no servidor. Os números continuam neste aparelho.');
      })
      .finally(() => {
        creatingRef.current = false;
      });
  }, [counts, loaded, draftLoaded, openChecked, draft, joinAsk, joinCount, setDraftNow, queryClient]);

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
    const raw = countsRef.current[variantId];
    const cur = raw === undefined || raw === '' ? null : parseInt(raw, 10) || 0;
    const next = cur === null ? (delta > 0 ? 1 : 0) : Math.max(0, cur + delta);
    setCounts((prev) => ({ ...prev, [variantId]: String(next) }));
    countsRef.current = { ...countsRef.current, [variantId]: String(next) };
    queueOp(cur === null && delta < 0 ? { variant_id: variantId, set: 0 } : { variant_id: variantId, delta });
  }, [queueOp]);

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
      countsRef.current = { ...countsRef.current, [vid]: String(next) };
      queueOp({ variant_id: vid, delta: 1 });
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
    [codeIndex, allIndex, rowById, allData, queueOp],
  );

  // Um campo só: digitar filtra a lista; Enter (ou o leitor, que manda Enter) com um código inteiro conta 1 peça
  const submitSearch = () => {
    const raw = search.trim();
    if (!raw) return;
    if (findVariantLocal(codeIndex, raw) !== null || findVariantLocal(allIndex, raw) !== null) {
      handleScan(raw);
      setSearch('');
    }
  };

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
        scrollRef.current?.scrollTo({ y: Math.max(0, gridY.current + gy + ry - 140), animated: true });
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
        contentContainerStyle={[styles.content, desktopContent]}
        onScroll={(e) => {
          const down = e.nativeEvent.contentOffset.y > 600;
          setShowTop((v) => (v === down ? v : down));
        }}
        scrollEventThrottle={100}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Resumo: uma linha, sem 4 cartões */}
        <View style={styles.summary}>
          <View style={styles.summaryTop}>
            <Text style={styles.summaryMain}>
              <Text style={styles.summaryBig}>{formatInt(summary.countedPieces)}</Text> de {formatInt(data?.total_pieces)} peças contadas
            </Text>
            <Text style={styles.summarySys}>{formatInt(summary.counted)} de {formatInt(rows.length)} cores e tamanhos</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: brand.primary, width: `${rows.length ? Math.min(100, Math.round((summary.counted / rows.length) * 100)) : 0}%` },
              ]}
            />
          </View>
          {summary.counted > 0 ? (
            <View style={styles.summaryStats}>
              <Text style={[styles.stat, { color: VALUE_COLORS.positive }]}>{formatInt(summary.okPieces)} conferem</Text>
              <Text style={[styles.stat, { color: summary.falta > 0 ? VALUE_COLORS.negative : Colors.light.textSecondary }]}>{formatInt(summary.falta)} faltam</Text>
              <Text style={[styles.stat, { color: summary.sobra > 0 ? VALUE_COLORS.warning : Colors.light.textSecondary }]}>{formatInt(summary.sobra)} sobram</Text>
            </View>
          ) : (
            <Text style={styles.summaryHint}>Digite o que contou ao lado de cada cor e tamanho. Aqui só se confere, o estoque não muda.</Text>
          )}
        </View>

        {/* Leitura do QR: câmera, leitor USB/Bluetooth ou digitar o código */}
        <ScanBar
          onCode={handleScan}
          status={scanStatus}
          field={
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={16} color={Colors.light.textTertiary} />
              <RNTextInput
                style={styles.searchInput}
                placeholder="Buscar ou bipar: produto, cor ou código"
                placeholderTextColor={Colors.light.textTertiary}
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={submitSearch}
                returnKeyType="done"
                blurOnSubmit={false}
                autoCorrect={false}
                accessibilityLabel="Buscar ou bipar"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Limpar busca">
                  <Ionicons name="close-circle" size={16} color={Colors.light.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          }
          right={
            lastScan !== null ? (
              <TouchableOpacity onPress={undoScan} style={styles.undoBtn} accessibilityRole="button" accessibilityLabel="Desfazer última leitura">
                <Ionicons name="arrow-undo-outline" size={18} color={Colors.light.text} />
              </TouchableOpacity>
            ) : null
          }
        />

        {/* Filtros */}
        <HScroll showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Falta bipar" active={onlyPending} onPress={() => { setOnlyPending((v) => !v); setOnlyDiffs(false); }} color={brand.primary} />
          <Chip label="Só divergências" active={onlyDiffs} onPress={() => { setOnlyDiffs((v) => !v); setOnlyPending(false); }} color={brand.primary} />
          <Chip label="Só com estoque" active={onlyInStock} onPress={() => setOnlyInStock((v) => !v)} color={brand.primary} />
          <View style={styles.chipDivider} />
          <Chip label="Todas" active={categoryId === null} onPress={() => setCategoryId(null)} color={brand.primary} disabled={!!draft && draft.categoryId !== null} />
          {categories.map(([id, name]) => (
            <Chip key={id} label={name} active={categoryId === id} onPress={() => setCategoryId(id)} color={brand.primary} disabled={!!draft && draft.categoryId !== null && draft.categoryId !== id} />
          ))}
        </HScroll>

        {/* Conferência em andamento */}
        {!!draft && (
          <View style={styles.draftBanner}>
            <Ionicons name="people-outline" size={16} color="#92400E" />
            <Text style={styles.draftText} numberOfLines={3}>
              Conferência compartilhada{draft.name ? ': ' + draft.name : ''}
              {draft.createdBy ? ' · começada por ' + draft.createdBy : ''}
              {people.length ? ' · contando: ' + people.join(', ') : ''}
              {savedAt ? ' · atualizada às ' + formatDateTime(savedAt).slice(-5) : ''}
            </Text>
          </View>
        )}
        {!!syncError && <Text style={[styles.conflictText, { marginTop: 6 }]}>{syncError}</Text>}
        {!!conflict && (
          <View style={styles.conflictBanner}>
            <Text style={styles.conflictText}>{conflict}</Text>
            <TouchableOpacity onPress={() => draft && loadDraft(draft.id)} style={styles.conflictBtn} activeOpacity={0.8}>
              <Text style={styles.conflictBtnText}>Recarregar a versão salva</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.actions}>
          {/* sem botão de salvar: cada bipada já vai para o servidor na hora (pedido do Victor, 05/11/2026) */}
          <View style={[styles.saveMain, { backgroundColor: syncError ? '#FEE2E2' : '#ECFDF5' }]} accessibilityRole="text">
            <Ionicons name={syncError ? 'cloud-offline-outline' : 'cloud-done-outline'} size={17} color={syncError ? '#991B1B' : VALUE_COLORS.positive} />
            <Text style={[styles.saveMainText, { color: syncError ? '#991B1B' : VALUE_COLORS.positive }]} numberOfLines={1}>
              {syncError ? 'Sem conexão: enviando depois'
                : draft ? 'Salvo automaticamente' + (savedAt ? ' às ' + formatDateTime(savedAt).slice(-5) : '')
                : 'Bipe a primeira peça'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.finishBtn, { borderColor: VALUE_COLORS.positive, opacity: summary.counted && allData ? 1 : 0.45 }]}
            onPress={() => {
              if (!summary.counted || !allData) return;
              setSaveError('');
              if (draft) {
                // antes de perguntar: manda o que falta e traz o que os outros contaram (a pessoa vê tudo atualizado)
                syncNow()
                  .then(() => setFinishOpen(true))
                  .catch(() => setSaveError('Sem conexão para atualizar a conferência. Tente de novo.'));
              } else {
                setSaveMode('finish');
                setSaveOpen(true);
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.finishText, { color: VALUE_COLORS.positive }]}>Finalizar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={() => setMenuOpen(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Mais opções"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={Colors.light.text} />
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
            <Text style={styles.emptyText}>{onlyPending ? 'Tudo contado: nenhuma peça falta bipar.' : onlyDiffs ? 'Nenhuma divergência até agora.' : 'Nenhuma variação encontrada.'}</Text>
          </View>
        ) : (
          // no PC os produtos viram cartões em grade (várias colunas); no celular é a lista de sempre
          <View
            style={[grid.gridStyle, grid.isGrid && { marginTop: 10 }]}
            onLayout={(e) => { grid.onLayout(e); gridY.current = e.nativeEvent.layout.y; }}
          >
          {shownGroups.map((g) => (
            <View key={g.key} style={[styles.group, grid.cardStyle, grid.isGrid && styles.groupGrid]} onLayout={(e) => { groupY.current[g.key] = e.nativeEvent.layout.y; }}>
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
                    style={[
                      styles.row,
                      d !== null && { borderLeftColor: d === 0 ? VALUE_COLORS.positive : d < 0 ? VALUE_COLORS.negative : VALUE_COLORS.warning },
                      highlightId === r.variant_id && styles.rowHighlight,
                    ]}
                    onLayout={(e) => { rowY.current[r.variant_id] = e.nativeEvent.layout.y; }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.variant} numberOfLines={1}>{variantLabel(r)}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {code ? code + ' · ' : ''}sistema {formatInt(r.system_quantity)}
                      </Text>
                      {!!countedBy[r.variant_id] && countedBy[r.variant_id] !== myName && (
                        <Text style={styles.meta} numberOfLines={1}>contado por {countedBy[r.variant_id]}</Text>
                      )}
                      {d !== null && (
                        <View style={styles.resultLine}>
                          {d === 0 ? (
                            <Text style={[styles.resultText, { color: VALUE_COLORS.positive }]}>Confere</Text>
                          ) : (
                            <Text style={[styles.resultText, { color: d < 0 ? VALUE_COLORS.negative : VALUE_COLORS.warning }]}>
                              {d < 0 ? `Falta ${-d}` : `Sobra ${d}`}
                            </Text>
                          )}
                          {isAdmin && writeoffOn && d < 0 && r.system_quantity > 0 && (
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={`Dar baixa de ${-d} peças`}
                              onPress={() => { setWo({ row: r, qty: Math.min(-d, r.system_quantity) }); setWoReason(null); setWoNote(''); setWoError(''); }}
                              hitSlop={8}
                            >
                              <Text style={[styles.woBtnText, { color: brand.primary }]}>Dar baixa</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
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
                  </View>
                );
              })}
            </View>
          ))}
          </View>
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

      {showTop && (
        <TouchableOpacity
          style={[styles.toTop, { backgroundColor: brand.primary }]}
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          accessibilityRole="button"
          accessibilityLabel="Voltar ao topo"
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      <BottomSheet visible={menuOpen} onDismiss={() => setMenuOpen(false)} title="Mais opções" icon="ellipsis-horizontal">
        <MenuRow icon="time-outline" label="Conferências salvas" onPress={() => { setMenuOpen(false); router.push('/reports/stock-counts' as any); }} />
        {!!draft && (
          <MenuRow icon="trash-outline" label="Apagar a conferência e começar de novo" onPress={() => { setMenuOpen(false); setDiscardAsk(true); }} />
        )}
        <MenuRow icon="print-outline" label="Imprimir lista para contar" onPress={() => { setMenuOpen(false); printList(false); }} />
        <MenuRow
          icon="document-text-outline"
          label="Imprimir resultado"
          disabled={!summary.counted}
          onPress={() => { setMenuOpen(false); printList(true); }}
        />
        <MenuRow
          icon="refresh-outline"
          label="Limpar contagem"
          disabled={!summary.counted}
          onPress={() => { setMenuOpen(false); setConfirmClear(true); }}
        />
        {isAdmin && (
          <View style={styles.woCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.woTitle}>Dar baixa pela conferência</Text>
              <Text style={styles.woNote}>
                {writeoffOn ? 'Ligado: peças com falta ganham o botão "Dar baixa".' : 'Desligado: a conferência só compara.'}
              </Text>
            </View>
            <Switch value={writeoffOn} onValueChange={toggleWriteoff} disabled={writeoffBusy} color={brand.primary} />
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={!!wo}
        onDismiss={() => !woSaving && setWo(null)}
        title="Dar baixa no estoque"
        subtitle={wo ? `${wo.row.product_name} · ${variantLabel(wo.row)}` : ''}
        icon="remove-circle-outline"
        actions={[
          { label: 'Cancelar', onPress: () => setWo(null), variant: 'secondary', disabled: woSaving },
          { label: wo ? `Dar baixa de ${wo.qty}` : 'Dar baixa', onPress: confirmWriteoff, variant: 'primary', loading: woSaving, icon: 'checkmark', disabled: !woReason || woSaving },
        ]}
      >
        <Text style={styles.saveHelp}>
          Tira {wo?.qty ?? 0} peça(s) do estoque do sistema, das entradas mais antigas. Não dá para desfazer por aqui; fica registrado com o motivo.
        </Text>
        <Text style={styles.woQuestion}>Qual o motivo? *</Text>
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
        message={`${people.length > 1 ? 'Contaram: ' + people.join(', ') + '. ' : ''}Foram contadas ${formatInt(summary.counted)} de ${formatInt(rows.length)} variações (${formatInt(pending)} sem contagem ficam como "não contadas"). Os números da tela são os de todo mundo, atualizados agora. Depois de finalizar, ela vira relatório e ninguém muda mais.`}
        confirmText="Finalizar"
        cancelText="Voltar"
        onConfirm={() => persist({ finish: true })}
        onCancel={() => setFinishOpen(false)}
      />

      <ConfirmDialog
        visible={discardAsk}
        type="danger"
        icon="trash-outline"
        title="Apagar a conferência e começar de novo?"
        message={`Apaga a contagem de todo mundo${people.length ? ' (' + people.join(', ') + ')' : ''} e todos os celulares voltam ao zero. O estoque não muda. Não dá para desfazer.`}
        confirmText={discarding ? 'Apagando...' : 'Apagar e começar de novo'}
        cancelText="Cancelar"
        loading={discarding}
        onConfirm={async () => {
          if (!draft || discarding) return;
          setDiscarding(true);
          try {
            if (flushTimer.current) clearTimeout(flushTimer.current);
            await discardStockCount(draft.id);
            endedByOther();
            setMessage('Conferência apagada. Pode começar de novo: a primeira peça bipada abre uma nova para todos.');
            queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
          } catch (e: any) {
            setMessage(e?.message || 'Não foi possível apagar a conferência. Tente de novo.');
          } finally {
            setDiscarding(false);
            setDiscardAsk(false);
          }
        }}
        onCancel={() => setDiscardAsk(false)}
      />

      <ConfirmDialog
        visible={!!joinAsk}
        type="info"
        icon="people-outline"
        title="Já tem uma conferência em andamento"
        message={joinAsk ? `${joinAsk.name ? '"' + joinAsk.name + '", c' : 'C'}omeçada por ${joinAsk.created_by_name || 'outra pessoa'}. A loja conta numa conferência só. Este aparelho tem números contados só nele: somar os números dele à conferência (se ele contou peças diferentes) ou entrar sem eles (se outra pessoa já contou as mesmas peças)?` : ''}
        confirmText="Entrar e somar os meus"
        cancelText="Entrar sem os meus"
        onConfirm={() => {
          const id = joinAsk!.id;
          setJoinAsk(null);
          joinCount(id, true);
        }}
        onCancel={() => {
          const id = joinAsk!.id;
          setJoinAsk(null);
          joinCount(id, false);
        }}
        onDismiss={() => {}}
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
          ? 'Esta conferência é compartilhada: limpar daqui apagaria a contagem de todo mundo. Para encerrar, use Finalizar.'
          : 'Os números que você digitou serão apagados deste aparelho. O estoque do sistema não muda.'}
        confirmText={draft ? 'Entendi' : 'Limpar'}
        cancelText="Cancelar"
        onConfirm={() => {
          if (!draft) setCounts({});
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
}

function MenuRow({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      activeOpacity={0.7}
      style={[styles.menuRow, disabled && { opacity: 0.4 }]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={20} color={Colors.light.textSecondary} />
      <Text style={styles.menuRowText}>{label}</Text>
    </TouchableOpacity>
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
  summary: { backgroundColor: Colors.light.card, borderRadius: 16, borderWidth: 1, borderColor: Colors.light.border, padding: 14, marginBottom: 12, gap: 8 },
  summaryTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  summaryMain: { fontSize: 14, color: Colors.light.textSecondary },
  summaryBig: { fontSize: 22, fontWeight: '800', color: Colors.light.text },
  summarySys: { fontSize: 12, color: Colors.light.textTertiary },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.light.backgroundSecondary, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  summaryStats: { flexDirection: 'row', gap: 14 },
  stat: { fontSize: 13, fontWeight: '700' },
  summaryHint: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  // mesma caixa do campo de bipar: branca, com borda (antes era cinza e o navegador desenhava o contorno azul dentro)
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
    marginTop: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, height: '100%', fontSize: 15, color: Colors.light.text, outlineStyle: 'none' } as any,
  chips: { flexDirection: 'row', gap: 6, marginBottom: 10, alignItems: 'center' },
  chipDivider: { width: 1, height: 18, backgroundColor: Colors.light.border, marginHorizontal: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  chipText: { fontSize: 13, color: Colors.light.text },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 6 },
  toTop: {
    position: 'absolute', right: 16, bottom: 24, width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  saveMain: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14 },
  saveMainText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  finishBtn: { height: 46, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  finishText: { fontSize: 15, fontWeight: '800' },
  moreBtn: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card, alignItems: 'center', justifyContent: 'center' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  menuRowText: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  resultLine: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 3 },
  resultText: { fontSize: 12, fontWeight: '800' },
  // na grade o espaço entre cartões vem do gap da grade
  groupGrid: { marginTop: 0 },
  group: { backgroundColor: Colors.light.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, marginTop: 10, overflow: 'hidden' },
  groupHead: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.light.backgroundSecondary },
  groupName: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  groupCat: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.light.border, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  variant: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  meta: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 1 },
  undoBtn: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card },
  rowHighlight: { backgroundColor: '#FEF9C3' },
  draftBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#FEF3C7', marginBottom: 8 },
  draftText: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#92400E' },
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
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.light.textSecondary, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '700' },
  woCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card },
  woTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  woNote: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary, marginTop: 2 },
  woBtnText: { fontSize: 12, fontWeight: '800' },
  woQuestion: { fontSize: 15, fontWeight: '800', color: Colors.light.text, marginTop: 12 },
  woReasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  woChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border },
  error: { color: Colors.light.error, marginBottom: 6 },
  footer: { textAlign: 'center', color: Colors.light.textSecondary, fontSize: 13, marginTop: 16 },
});
