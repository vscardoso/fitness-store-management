// Ajuda: todo texto entre aspas curvas “assim” nas fichas existe no código da tela (botão renomeado quebra o teste).
// Rodar: node mobile/scripts/test-help-labels.mts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEntries, MOBILE } from './help-load.mts';

const entries = await loadEntries();
const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
let checked = 0;
const faltando: string[] = [];
for (const e of entries) {
  const code = norm(e.sources.map((s) => fs.readFileSync(path.join(MOBILE, s), 'utf8')).join('\n'));
  const textos = [e.purpose, ...e.steps, ...(e.parts ?? []).flatMap((p) => [p.label, p.text]), ...(e.goodToKnow ?? []),
    ...(e.web ?? []), ...(e.mobile ?? [])];
  for (const x of textos) for (const m of x.matchAll(/“([^”]+)”/g)) {
    checked += 1;
    if (!code.includes(norm(m[1]))) faltando.push(`${e.id}: “${m[1]}”`);
  }
}
assert.deepEqual(faltando, [], 'textos citados que não existem no código da tela:\n' + faltando.join('\n'));
console.log(`ok ${checked} nomes de botão conferidos em ${entries.length} fichas`);
