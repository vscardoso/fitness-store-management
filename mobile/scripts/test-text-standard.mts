// Trava de acabamento (auditoria de primeira impressão): texto sem "(s)" e letra nunca menor que 12.
// "(s)" some com plural() de utils/plural.ts; fontSize abaixo de 12 só na prévia da etiqueta (é desenho de papel, não tela).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['app', 'components'];
// Dinheiro/Financeiro está em refatoração por outro setor; entra aqui quando ele terminar.
const SKIP = [/[\/]finance[\/]/, /[\/]cash[\/]/, /[\/]expenses[\/]/, /[\/]components[\/]labels[\/]/, /[\/]entries[\/]labels[\/]/, /StickerPreview/, /LabelChip/, /\(dev\)/];
const PLURAL_SUFFIX = /(?:peça|produto|unidade|linha|venda|conta|parcela|vencida|item|variação|devolução|órfão|novo|nova|vendida|zerado|vinculado|esgotado|similar|excluído|cliente|fornecedor|compra|entrada|dia|forma|método|nome)\((?:s|ns|es|ões)\)/i;
const TINY = /fontSize:\s*(?:[5-9]|1[01])\b/;

function walk(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const bad: string[] = [];
for (const root of ROOTS) {
  for (const f of walk(root)) {
    const fp = f.split(String.fromCharCode(92)).join('/');
    if (SKIP.some((r) => r.test(fp))) continue;
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('{/*')) return;
      if (PLURAL_SUFFIX.test(line) ) bad.push(`${f}:${i + 1} "(s)" no texto: use plural()/pluralWord()`);
      if (TINY.test(line)) bad.push(`${f}:${i + 1} fontSize menor que 12`);
    });
  }
}
if (bad.length) { console.error(bad.join('\n')); console.error(`\nFALHOU: ${bad.length} ocorrência(s)`); process.exit(1); }
console.log('ok texto: sem "(s)" e sem letra menor que 12');
