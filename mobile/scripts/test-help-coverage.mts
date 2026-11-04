// Ajuda: toda tela tem ficha (ou está em constants/help/coverage.ts) e as fichas seguem os limites do plano.
// Rodar: node mobile/scripts/test-help-coverage.mts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appRoutes, loadEntries, MOBILE } from './help-load.mts';
import { HELP_EXCLUDED, HELP_HIDDEN, HELP_PENDING } from '../constants/help/coverage.ts';

const entries = await loadEntries();
const routes = appRoutes();
let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok += 1; console.log('ok', nome); };

const withHelp = new Map<string, string>();
for (const e of entries) for (const r of e.routes) withHelp.set(r, e.id);

t('toda rota de app/ tem ficha ou está numa lista de exceção', () => {
  const sem = [...routes].filter((r) => !withHelp.has(r) && !(r in HELP_EXCLUDED) && !(r in HELP_HIDDEN) && !(r in HELP_PENDING));
  assert.deepEqual(sem, [], `telas sem ajuda: ${sem.join(', ')} (escreva a ficha em constants/help)`);
});

t('nenhuma rota está em duas listas, e as listas só citam rotas que existem', () => {
  const lists = { ficha: [...withHelp.keys()], excluida: Object.keys(HELP_EXCLUDED), escondida: Object.keys(HELP_HIDDEN), pendente: Object.keys(HELP_PENDING) };
  const seen = new Map<string, string>();
  for (const [nome, rs] of Object.entries(lists)) for (const r of rs) {
    assert.ok(!seen.has(r), `${r} está em "${seen.get(r)}" e em "${nome}"`);
    seen.set(r, nome);
    assert.ok(routes.has(r), `${r} (${nome}) não existe em app/`);
  }
});

t('ids únicos, "Veja também" aponta para fichas que existem, fontes existem', () => {
  const ids = new Set<string>();
  for (const e of entries) {
    assert.ok(!ids.has(e.id), `id repetido: ${e.id}`);
    ids.add(e.id);
  }
  for (const e of entries) {
    for (const r of e.related ?? []) assert.ok(ids.has(r), `${e.id}: related "${r}" não existe`);
    assert.ok(e.sources.length, `${e.id}: sem sources`);
    for (const s of e.sources) assert.ok(fs.existsSync(path.join(MOBILE, s)), `${e.id}: fonte ${s} não existe`);
    if (e.open) assert.ok([...routes].some((r) => r === e.open), `${e.id}: open ${e.open} não é rota`);
  }
});

t('limites de tamanho e texto (plano: frase curta, sem travessão)', () => {
  for (const e of entries) {
    assert.ok(e.steps.length >= 1 && e.steps.length <= 6, `${e.id}: ${e.steps.length} passos (1 a 6)`);
    assert.ok((e.parts ?? []).length <= 6, `${e.id}: partes demais`);
    assert.ok((e.goodToKnow ?? []).length <= 4, `${e.id}: bom saber demais`);
    assert.ok((e.web ?? []).length <= 3 && (e.mobile ?? []).length <= 3, `${e.id}: diferenças demais`);
    assert.ok((e.related ?? []).length <= 3, `${e.id}: veja também demais`);
    assert.ok(!/[.!?].+[.!?]\s*\S/.test(e.purpose.trim()), `${e.id}: "para que serve" tem mais de 1 frase`);
    const textos = [e.title, e.purpose, ...e.steps, ...(e.parts ?? []).flatMap((p) => [p.label, p.text]),
      ...(e.goodToKnow ?? []), ...(e.web ?? []), ...(e.mobile ?? [])];
    for (const x of textos) {
      assert.ok(!/—|–|--/.test(x), `${e.id}: travessão em "${x}"`);
      assert.ok(x.split(/\s+/).length <= 45, `${e.id}: frase longa demais (${x.split(/\s+/).length} palavras): "${x.slice(0, 60)}..."`);
      assert.ok(!/\b(CMV|ROI|FIFO|tenant|SKU)\b/.test(x), `${e.id}: jargão em "${x}"`);
    }
  }
});

console.log(`\n${ok} testes ok (${entries.length} fichas, ${routes.size} rotas, ${Object.keys(HELP_PENDING).length} pendentes)`);
