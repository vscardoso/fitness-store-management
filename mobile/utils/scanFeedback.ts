/**
 * Feedback de leitura igual nas três telas: som (no navegador) + vibração (no celular) + cor.
 * ok = leitura certa, warn = leu mas tem aviso (sem estoque, fora da lista), error = não achou.
 * O botão de silenciar fica guardado no aparelho.
 */
import { Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ScanKind = 'ok' | 'warn' | 'error';

const KEY = '@provador:scan_mudo';
let muted = false;
let loaded = false;
const listeners = new Set<(m: boolean) => void>();

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    muted = (await AsyncStorage.getItem(KEY)) === '1';
    listeners.forEach((l) => l(muted));
  } catch {
    /* sem armazenamento: continua com som */
  }
}
load();

export const isScanMuted = () => muted;

export function onScanMutedChange(fn: (m: boolean) => void): () => void {
  listeners.add(fn);
  load();
  return () => {
    listeners.delete(fn);
  };
}

export function setScanMuted(next: boolean) {
  muted = next;
  listeners.forEach((l) => l(next));
  AsyncStorage.setItem(KEY, next ? '1' : '0').catch(() => {});
}

let audioCtx: any = null;
function beep(freq: number, ms: number, delayMs = 0) {
  try {
    const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    const t0 = audioCtx.currentTime + delayMs / 1000;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + ms / 1000 + 0.02);
  } catch {
    /* navegador sem áudio liberado: segue sem som */
  }
}

export function playScan(kind: ScanKind) {
  if (muted) return;
  if (Platform.OS === 'web') {
    if (kind === 'ok') beep(1040, 90);
    else if (kind === 'warn') {
      beep(660, 90);
      beep(660, 90, 140);
    } else beep(220, 280);
    try {
      (navigator as any)?.vibrate?.(kind === 'ok' ? 40 : kind === 'warn' ? [40, 60, 40] : 200);
    } catch {
      /* iPhone Safari não vibra */
    }
    return;
  }
  Vibration.vibrate(kind === 'ok' ? 40 : kind === 'warn' ? [0, 40, 60, 40] : 200);
}
