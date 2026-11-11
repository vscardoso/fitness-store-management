/**
 * Aviso de peça duplicada, o mesmo nas duas conferências. Uso:
 *   const dup = useDuplicateScan();
 *   // ao contar uma peça lida: se `dup.check(...)` devolver false, a leitura ficou à espera da confirmação (não conta ainda)
 *   if (!dup.check({ variantId, title, alreadyCounted, expected }, () => contar())) return;
 *   contar();
 *   // e na tela: <DuplicateScanNotice dup={dup} />
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { duplicateMessage, needsDuplicateConfirm } from '@/utils/duplicateScan';

const KEY = '@provador:bipe_avisa_duplicada';

export interface DuplicatePending {
  variantId: number;
  message: string;
}

export function useDuplicateScan() {
  const [warn, setWarnState] = useState(true);
  const [pending, setPending] = useState<DuplicatePending | null>(null);
  const warnRef = useRef(true);
  const proceedRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === '0') {
        warnRef.current = false;
        setWarnState(false);
      }
    }).catch(() => {});
  }, []);

  const setWarn = useCallback((on: boolean) => {
    warnRef.current = on;
    setWarnState(on);
    if (!on) {
      proceedRef.current = null;
      setPending(null);
    }
    AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
  }, []);

  /** true = pode contar já; false = guardou a leitura à espera da confirmação (`proceed` roda se a pessoa confirmar). */
  const check = useCallback((info: { variantId: number; title: string; alreadyCounted: number; expected?: number | null }, proceed: () => void): boolean => {
    if (!needsDuplicateConfirm(info.alreadyCounted, warnRef.current)) {
      proceedRef.current = null;
      setPending(null);
      return true;
    }
    proceedRef.current = proceed;
    setPending({ variantId: info.variantId, message: duplicateMessage(info.title, info.alreadyCounted, info.expected) });
    return false;
  }, []);

  const confirm = useCallback(() => {
    const run = proceedRef.current;
    proceedRef.current = null;
    setPending(null);
    run?.();
  }, []);

  const dismiss = useCallback(() => {
    proceedRef.current = null;
    setPending(null);
  }, []);

  return { warn, setWarn, pending, check, confirm, dismiss };
}

export type DuplicateScan = ReturnType<typeof useDuplicateScan>;
