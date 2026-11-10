/**
 * Guarda a câmera aberta por um tempo depois que o leitor fecha, para NÃO pedir a permissão de novo a cada bipe.
 *
 * No iPhone o app instalado pergunta "app.provadorfit.com.br deseja ter acesso à câmera" toda vez que a câmera é
 * pedida de novo (cada getUserMedia depois de desligar tudo). Aqui a câmera já liberada fica ligada por `keepMs` depois
 * do último uso: abrir o leitor de novo nesse prazo reaproveita a mesma câmera, sem pergunta. Passado o prazo, ou se o
 * app for para o segundo plano (`dropNow`), ela desliga de verdade.
 * Sem React nem DOM aqui (testada por `scripts/test-camera-keeper.mts`).
 */
export interface KeeperDeps<S> {
  /** Pede a câmera ao aparelho (é aqui que o iPhone pergunta). */
  open: () => Promise<S>;
  /** A câmera ainda está ligada? (o aparelho pode ter desligado, por exemplo ao voltar de outro app) */
  isLive: (stream: S) => boolean;
  /** Desliga a câmera de verdade. */
  stop: (stream: S) => void;
  keepMs: number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export function createCameraKeeper<S>(deps: KeeperDeps<S>) {
  let stream: S | null = null;
  let pending: Promise<S> | null = null;
  let timer: unknown = null;

  const cancelTimer = () => {
    if (timer != null) { deps.clearTimer(timer); timer = null; }
  };
  const drop = () => {
    cancelTimer();
    if (stream != null) { deps.stop(stream); stream = null; }
  };

  return {
    /** Entrega a câmera: a que já está ligada ou uma nova. Dois pedidos juntos dividem a mesma. */
    async acquire(): Promise<S> {
      cancelTimer();
      if (stream != null && deps.isLive(stream)) return stream;
      stream = null;
      if (!pending) {
        pending = deps.open().then((s) => { stream = s; return s; }).finally(() => { pending = null; });
      }
      return pending;
    },
    /** O leitor fechou: guarda a câmera ligada por `keepMs` e só então desliga. */
    release() {
      cancelTimer();
      if (stream == null) return;
      timer = deps.setTimer(drop, deps.keepMs);
    },
    /** Desliga já (app foi para o segundo plano). */
    dropNow: drop,
    isHeld: () => stream != null,
  };
}
