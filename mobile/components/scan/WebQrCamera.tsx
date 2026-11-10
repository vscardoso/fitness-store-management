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

const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.2.0/dist/jsQR.min.js';   // o mesmo que a CSP já libera
const CROP = 0.75;     // lado do quadrado lido, em fração do lado menor do vídeo
const MAX_SIDE = 560;  // px analisados por quadro
const TICK_MS = 80;

type Decode = (img: ImageData) => Promise<string | null>;

function jsqrWorker(): { decode: Decode; stop: () => void } {
  const src = [
    `importScripts('${JSQR_URL}');`,
    'self.onmessage = (e) => {',
    '  const { data, width, height } = e.data;',
    "  const r = self.jsQR(data, width, height, { inversionAttempts: 'dontInvert' });",
    '  self.postMessage(r ? r.data : null);',
    '};',
  ].join('\n');
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  let pending: ((v: string | null) => void) | null = null;
  worker.onmessage = (e) => { pending?.(e.data); pending = null; };
  worker.onerror = () => { pending?.(null); pending = null; };
  return {
    decode: (img) => new Promise((resolve) => {
      pending = resolve;
      worker.postMessage({ data: img.data, width: img.width, height: img.height }, [img.data.buffer]);
    }),
    stop: () => worker.terminate(),
  };
}

export default function WebQrCamera({ onCode, onError }: { onCode: (text: string) => void; onError?: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stream: MediaStream | null = null;
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

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.muted = true;
        v.setAttribute('playsinline', 'true');
        await v.play();
        tick();
      } catch {
        if (!stopped) onError?.();
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
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
