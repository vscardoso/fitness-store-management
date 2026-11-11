import { Colors } from '@/constants/Colors';
/**
 * Leitor de QR do app web, mais rápido que o do expo-camera (que analisava a foto inteira da câmera, testava cada
 * quadro também com as cores invertidas e só a cada 300 ms: no iPhone demorava, 05/11/2026).
 *  - lê só o quadrado do meio (onde fica a moldura), reduzido para no máximo 560 px;
 *  - tenta a cada 80 ms, sem fila: só começa um quadro novo quando o anterior terminou;
 *  - usa o leitor nativo do navegador (BarcodeDetector) quando existe (Chrome no Android); senão jsQR num worker.
 * As etiquetas são preto no branco, então não precisa testar a imagem invertida.
 */
import React, { useEffect, useRef } from 'react';
import { createCameraKeeper } from '@/utils/cameraKeeper';
import { classifyCameraError } from '@/utils/cameraError';
import { trailReport } from '@/utils/navTrail';

const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.2.0/dist/jsQR.min.js';   // o mesmo que a CSP já libera
const CROP = 0.75;     // lado do quadrado lido, em fração do lado menor do vídeo
const MAX_SIDE = 560;  // px analisados por quadro
const TICK_MS = 80;

type Decode = (img: ImageData) => Promise<string | null>;

// A câmera já liberada fica ligada 30 minutos depois de fechar o leitor (quem confere o estoque bipa o dia todo): no iPhone instalado o aviso "deseja ter acesso à câmera"
// aparecia a CADA abertura. Ao sair do app (segundo plano) ela desliga na hora.
const KEEP_CAMERA_MS = 30 * 60 * 1000;
const NO_IMAGE_MS = 5000;   // câmera abriu e nenhum quadro chegou: está travada, não aberta

async function openCamera(): Promise<MediaStream> {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!md || !md.getUserMedia) throw Object.assign(new Error('mediaDevices indisponível'), { name: 'NotSupportedError' });
  try {
    return await md.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e: any) {
    if (e?.name === 'OverconstrainedError') return md.getUserMedia({ video: true, audio: false });   // plano B: qualquer câmera
    throw e;
  }
}

const keeper = createCameraKeeper<MediaStream>({
  open: openCamera,
  isLive: (s) => s.getTracks().some((t) => t.readyState === 'live'),
  stop: (s) => s.getTracks().forEach((t) => t.stop()),
  keepMs: KEEP_CAMERA_MS,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
});
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) keeper.dropNow(); });
}

function jsqrWorker(): { decode: Decode; stop: () => void } {
  const src = [
    `importScripts('${JSQR_URL}');`,
    'self.onmessage = (e) => {',
    '  const { data, width, height } = e.data;',
    "  const r = self.jsQR(data, width, height, { inversionAttempts: 'dontInvert' });",
    '  self.postMessage(r ? r.data : null);',
    '};',
  ].join('\n');
  const blobUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const worker = new Worker(blobUrl);
  let pending: ((v: string | null) => void) | null = null;
  worker.onmessage = (e) => { pending?.(e.data); pending = null; };
  worker.onerror = () => { pending?.(null); pending = null; };
  return {
    decode: (img) => new Promise((resolve) => {
      pending = resolve;
      worker.postMessage({ data: img.data, width: img.width, height: img.height }, [img.data.buffer]);
    }),
    stop: () => { worker.terminate(); URL.revokeObjectURL(blobUrl); },
  };
}

export default function WebQrCamera({ onCode, onError }: { onCode: (text: string) => void; onError?: (reason?: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let acquired = false;
    let busy = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
    const BD = (window as any).BarcodeDetector;
    const detector = BD ? new BD({ formats: ['qr_code'] }) : null;
    const worker = detector ? null : jsqrWorker();

    const tick = async () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && ctx && v.readyState >= 2 && v.videoWidth && !busy) {
        busy = true;
        try {
          const side = Math.floor(Math.min(v.videoWidth, v.videoHeight) * CROP);
          const sx = Math.floor((v.videoWidth - side) / 2);
          const sy = Math.floor((v.videoHeight - side) / 2);
          const out = Math.min(side, MAX_SIDE);
          canvas.width = out;
          canvas.height = out;
          ctx.drawImage(v, sx, sy, side, side, 0, 0, out, out);
          let text: string | null = null;
          if (detector) {
            const found = await detector.detect(canvas);
            text = found?.[0]?.rawValue ?? null;
          } else if (worker) {
            text = await worker.decode(ctx.getImageData(0, 0, out, out));
          }
          if (text && !stopped) onCodeRef.current(text);
        } catch {
          // quadro ruim: tenta o próximo
        } finally {
          busy = false;
        }
      }
      timer = setTimeout(tick, TICK_MS);
    };

    // Falhou: descarta a câmera guardada (ela pode estar ruim e o "tentar de novo" reaproveitava a mesma, falhando igual), tenta
    // uma vez sozinho quando o motivo não é permissão e, se continuar, avisa o MOTIVO REAL (e registra no servidor).
    const fail = (name: string, attempt: number, err?: any) => {
      if (stopped) return;
      acquired = false;
      keeper.dropNow();
      const kind = classifyCameraError(name);
      if (attempt === 0 && kind !== 'denied' && kind !== 'unsupported') {
        retryTimer = setTimeout(() => { void start(1); }, 400);
        return;
      }
      void trailReport('camera_erro', { nome: name, tipo: kind, msg: String(err?.message ?? '').slice(0, 120) });
      onError?.(name);
    };

    const start = async (attempt: number) => {
      try {
        const stream = await keeper.acquire();
        acquired = true;
        if (stopped) { keeper.release(); acquired = false; return; }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.muted = true;
        v.setAttribute('playsinline', 'true');
        try {
          await v.play();
        } catch (e: any) {
          if (e?.name !== 'AbortError') throw e;   // trocar a fonte do vídeo interrompe o play: aguarda e tenta uma vez
          await new Promise((r) => setTimeout(r, 300));
          await v.play();
        }
        watchdog = setTimeout(() => {
          const el = videoRef.current;
          if (!stopped && !(el && el.videoWidth > 0 && el.readyState >= 2)) fail('NoImage', attempt);
        }, NO_IMAGE_MS);
        tick();
      } catch (e: any) {
        fail(e?.name || 'Error', attempt, e);
      }
    };
    void start(0);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (watchdog) clearTimeout(watchdog);
      if (retryTimer) clearTimeout(retryTimer);
      const v = videoRef.current;
      if (v) v.srcObject = null;
      if (acquired) keeper.release();   // não desliga já: guarda a câmera para a próxima leitura não pedir permissão
      worker?.stop();
    };
  }, [onError]);

  return React.createElement('video', {
    ref: videoRef,
    playsInline: true,
    muted: true,
    autoPlay: true,
    style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', background: Colors.light.black },
  });
}
