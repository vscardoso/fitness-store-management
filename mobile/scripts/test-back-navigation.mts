// Voltar padrão: sempre a tela anterior (utils/navBack.goBackOr). Nenhuma tela empurra ou troca a origem no voltar,
// porque isso abre outra cópia da origem por cima da pilha e a seta fica em loop (entrada <-> lista, 10/11/2026).
// Rodar: node scripts/test-back-navigation.mts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { goBackOr } from '../utils/navBack.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

function fakeRouter(canGoBack: boolean) {
  const calls: string[] = [];
  return {
    calls,
    canGoBack: () => canGoBack,
    back: () => { calls.push('back'); },
    replace: (href: string) => { calls.push(`replace:${href}`); },
  };
}

t('com tela anterior: só volta (nunca abre a origem de novo)', () => {
  const r = fakeRouter(true);
  goBackOr(r, '/(tabs)/entries', '/(tabs)/entries');
  assert.deepEqual(r.calls, ['back']);
});
t('sem histórico: vai para a origem informada', () => {
  const r = fakeRouter(false);
  goBackOr(r, '/(tabs)/more', '/reports/lots');
  assert.deepEqual(r.calls, ['replace:/reports/lots']);
});
t('sem histórico e sem origem: vai para a tela de saída', () => {
  const r = fakeRouter(false);
  goBackOr(r, '/(tabs)/more');
  assert.deepEqual(r.calls, ['replace:/(tabs)/more']);
});

// ── Varredura: nenhuma tela usa push/replace no botão de voltar ─────────────────────────────────────────────────
const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Fecham um fluxo de propósito (decisão do Victor: o resumo da venda e o resumo do cadastro de produto não voltam para a tela anterior).
const FLOW_END = new Set([
  'app/checkout/success.tsx',      // venda concluída: seta leva à Início
  'app/products/wizard.tsx',       // assistente de cadastro: passos e resumo têm regra própria
  'components/products/WizardComplete.tsx',
  'app/(tabs)/stock-losses/register.tsx', // registrar prejuízo: sai para o envio, em outra aba (voltar cairia na Início)
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const NAV = /router\.(push|replace|navigate)\(/;
const bad: string[] = [];
for (const root of ['app', 'components']) {
  for (const f of walk(path.join(MOBILE, root))) {
    const rel = path.relative(MOBILE, f).replace(/\\/g, '/');
    if (FLOW_END.has(rel) || rel === 'components/layout/PageHeader.tsx') continue;
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      // onBack={() => router.push(...)} / replace / navigate
      if (/onBack=\{/.test(line) && NAV.test(line)) bad.push(`${rel}:${i + 1}: onBack com ${line.match(NAV)![0]}`);
      // const goBack / handleGoBack / handleBack = ... router.push/replace (na mesma linha ou nas 6 seguintes até fechar)
      if (/const\s+(goBack|handleGoBack|handleBack)\s*=/.test(line)) {
        const body = lines.slice(i, i + 7).join('\n');
        const end = body.search(/\n\s*\};?\s*\n|\n\s*\}, \[/);
        const scope = end > 0 ? body.slice(0, end) : body.split('\n')[0];
        if (NAV.test(scope)) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 60)} navega com push/replace`);
      }
      // seta de voltar feita à mão com router.back() cru (sem saída quando não há histórico)
      if (/onPress=\{\(\) => router\.back\(\)\}/.test(line) && lines.slice(i, i + 6).some((l) => /arrow-back|chevron-back/.test(l))) {
        bad.push(`${rel}:${i + 1}: seta de voltar com router.back() sem saída (use goBackOr)`);
      }
    });
  }
}
t('nenhuma tela volta com push/replace da origem (padrão: utils/navBack)', () => {
  assert.deepEqual(bad, [], 'Fora do padrão de voltar:\n' + bad.join('\n'));
});
console.log(`${n} testes ok`);
