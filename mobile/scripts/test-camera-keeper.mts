// Testes da câmera guardada entre leituras (sem pedir a permissão de novo). Rodar: node scripts/test-camera-keeper.mts
import assert from 'node:assert/strict';
import { createCameraKeeper } from '../utils/cameraKeeper.ts';

let n = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); n += 1; console.log('ok', name); };

type Fake = { id: number; live: boolean };

function setup(keepMs = 180_000) {
  const opened: Fake[] = [];
  const stopped: number[] = [];
  const timers: { fn: () => void; ms: number; id: number; cleared: boolean }[] = [];
  const keeper = createCameraKeeper<Fake>({
    open: async () => { const s = { id: opened.length + 1, live: true }; opened.push(s); return s; },
    isLive: (s) => s.live,
    stop: (s) => { s.live = false; stopped.push(s.id); },
    keepMs,
    setTimer: (fn, ms) => { const tm = { fn, ms, id: timers.length + 1, cleared: false }; timers.push(tm); return tm; },
    clearTimer: (h) => { (h as { cleared: boolean }).cleared = true; },
  });
  const fire = () => { for (const tm of timers) if (!tm.cleared) { tm.cleared = true; tm.fn(); } };
  return { keeper, opened, stopped, timers, fire };
}

await t('abrir de novo dentro do prazo reaproveita a câmera: pede ao aparelho UMA vez só', async () => {
  const { keeper, opened } = setup();
  const a = await keeper.acquire();
  keeper.release();
  const b = await keeper.acquire();
  keeper.release();
  const c = await keeper.acquire();
  assert.equal(opened.length, 1);
  assert.equal(a, b);
  assert.equal(b, c);
});

await t('passado o prazo a câmera desliga de verdade e a próxima abertura pede de novo', async () => {
  const { keeper, opened, stopped, fire } = setup();
  const a = await keeper.acquire();
  keeper.release();
  fire();
  assert.deepEqual(stopped, [a.id]);
  assert.equal(keeper.isHeld(), false);
  const b = await keeper.acquire();
  assert.equal(opened.length, 2);
  assert.notEqual(a, b);
});

await t('reabrir antes do prazo cancela o desligamento', async () => {
  const { keeper, stopped, fire } = setup();
  await keeper.acquire();
  keeper.release();
  await keeper.acquire();
  fire();                       // o relógio antigo já foi cancelado: nada desliga
  assert.deepEqual(stopped, []);
  assert.equal(keeper.isHeld(), true);
});

await t('o prazo é o configurado (3 minutos) e só conta a partir de fechar o leitor', async () => {
  const { keeper, timers } = setup(180_000);
  await keeper.acquire();
  assert.equal(timers.length, 0);          // aberto: nenhum relógio correndo
  keeper.release();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 180_000);
});

await t('app foi para o segundo plano: desliga já, sem esperar o prazo', async () => {
  const { keeper, opened, stopped } = setup();
  const a = await keeper.acquire();
  keeper.release();
  keeper.dropNow();
  assert.deepEqual(stopped, [a.id]);
  await keeper.acquire();
  assert.equal(opened.length, 2);
});

await t('o aparelho desligou a câmera por conta própria: abre outra em vez de entregar uma morta', async () => {
  const { keeper, opened } = setup();
  const a = await keeper.acquire();
  keeper.release();
  a.live = false;
  const b = await keeper.acquire();
  assert.equal(opened.length, 2);
  assert.equal(b.live, true);
});

await t('dois pedidos ao mesmo tempo dividem a mesma câmera (nada de duas perguntas)', async () => {
  const { keeper, opened } = setup();
  const [a, b] = await Promise.all([keeper.acquire(), keeper.acquire()]);
  assert.equal(opened.length, 1);
  assert.equal(a, b);
});

await t('release sem câmera aberta não faz nada', () => {
  const { keeper, timers } = setup();
  keeper.release();
  assert.equal(timers.length, 0);
});

console.log(`${n} testes ok`);
