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

// iPhone (Safari/PWA): o som só toca depois que a pessoa TOCA na tela uma vez, e o contexto de áudio da Web fica mudo
// com a chave de silêncio ligada. Por isso o bipe é um arquivo de áudio comum (data URI) "destravado" no toque em Bipar.
const tones: Record<ScanKind, string> = { ok: '', warn: '', error: '' };
const audios: Partial<Record<ScanKind, any>> = {};

function makeWavDataUri(freqs: { f: number; ms: number }[]): string {
  const rate = 22050;
  const samples: number[] = [];
  freqs.forEach(({ f, ms }, k) => {
    const n = Math.floor((rate * ms) / 1000);
    for (let i = 0; i < n; i += 1) {
      const env = Math.min(1, i / 200, (n - i) / 400); // sobe e desce rápido: sem estalo
      samples.push(Math.round(Math.sin((2 * Math.PI * f * i) / rate) * 0.55 * 32767 * Math.max(0, env)));
    }
    if (k < freqs.length - 1) for (let i = 0; i < rate * 0.05; i += 1) samples.push(0);
  });
  const buf = new Uint8Array(44 + samples.length * 2);
  const dv = new DataView(buf.buffer);
  const w = (o: number, s: string) => s.split('').forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => dv.setInt16(44 + i * 2, v, true));
  let bin = '';
  for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
  return 'data:audio/wav;base64,' + (globalThis as any).btoa(bin);
}

function audioFor(kind: ScanKind): any {
  const AudioCtor = (globalThis as any).Audio;
  if (!AudioCtor) return null;
  if (!audios[kind]) {
    if (!tones[kind]) {
      tones[kind] = makeWavDataUri(
        kind === 'ok' ? [{ f: 1040, ms: 110 }] : kind === 'warn' ? [{ f: 700, ms: 100 }, { f: 700, ms: 100 }] : [{ f: 240, ms: 320 }],
      );
    }
    const a = new AudioCtor(tones[kind]);
    a.preload = 'auto';
    audios[kind] = a;
  }
  return audios[kind];
}

/** Chamar DENTRO de um toque (ex.: botão Bipar): libera o som no iPhone para as leituras seguintes. */
export function unlockAudio() {
  if (Platform.OS !== 'web') return;
  try {
    (['ok', 'warn', 'error'] as ScanKind[]).forEach((k) => {
      const a = audioFor(k);
      if (!a) return;
      a.muted = true;
      const p = a.play();
      const done = () => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      };
      if (p && p.then) p.then(done).catch(() => { a.muted = false; });
      else done();
    });
    const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (AC) {
      audioCtx = audioCtx || new AC();
      audioCtx.resume?.();
    }
  } catch {
    /* sem áudio: segue só com a cor */
  }
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

function beepFallback(kind: ScanKind) {
  if (kind === 'ok') beep(1040, 90);
  else if (kind === 'warn') {
    beep(660, 90);
    beep(660, 90, 140);
  } else beep(220, 280);
}

export function playScan(kind: ScanKind) {
  if (muted) return;
  if (Platform.OS === 'web') {
    const a = audioFor(kind);
    let played = false;
    if (a) {
      try {
        a.muted = false;
        a.currentTime = 0;
        const p = a.play();
        played = true;
        if (p && p.catch) p.catch(() => beepFallback(kind));
      } catch {
        played = false;
      }
    }
    if (!played) beepFallback(kind);
    try {
      (navigator as any)?.vibrate?.(kind === 'ok' ? 40 : kind === 'warn' ? [40, 60, 40] : 200);
    } catch {
      /* iPhone Safari não vibra */
    }
    return;
  }
  Vibration.vibrate(kind === 'ok' ? 40 : kind === 'warn' ? [0, 40, 60, 40] : 200);
}
