// Véu de carregamento: pedidos em sequência (salvar produto e cada variação) não fazem piscar. Rodar: node scripts/test-loading-manager.mts
import assert from 'node:assert/strict';
(globalThis as any).__DEV__ = false;
const { loadingManager } = await import('../services/loadingManager.ts');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const changes: boolean[] = [];
loadingManager.subscribe((s) => { if (changes[changes.length - 1] !== s.isLoading) changes.push(s.isLoading); });
changes.length = 0;

// 4 pedidos seguidos de 300 ms com 30 ms entre eles: aparece UMA vez e some no fim
for (let i = 0; i < 4; i++) {
  loadingManager.show();
  await sleep(300);
  loadingManager.hide();
  await sleep(30);
}
await sleep(700);
assert.deepEqual(changes, [true, false], `véu piscou: ${JSON.stringify(changes)}`);
console.log('ok pedidos seguidos: o véu aparece uma vez só');

// pedido rápido (< 200 ms) não mostra o véu
changes.length = 0;
loadingManager.show();
await sleep(50);
loadingManager.hide();
await sleep(600);
assert.ok(!changes.includes(true), `pedido rápido mostrou o véu: ${JSON.stringify(changes)}`);
console.log('ok pedido rápido não mostra o véu');
console.log('2 testes ok');
