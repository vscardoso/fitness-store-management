// Trava: PDF do servidor é aberto/compartilhado SÓ por services/pdfDelivery.ts (link https). Sem código próprio em cada tela.
// Falha se um arquivo (fora do pdfDelivery) montar um blob: de PDF ou compartilhar 'application/pdf' por conta própria.
// Rodar: node scripts/test-pdf-delivery.mts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = new Set([
  'services/pdfDelivery.ts',
  // PDF gerado NO APARELHO a partir de HTML (expo-print), não do servidor: outro caminho, sem blob de PDF do servidor
  'app/reports/sales.tsx',
  'app/reports/stock-check.tsx',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    if (n.name === 'node_modules' || n.name.startsWith('.')) continue;
    const p = path.join(dir, n.name);
    if (n.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n.name)) out.push(p);
  }
  return out;
}

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

const files: string[] = [];
for (const d of ['app', 'components', 'services', 'hooks', 'utils']) files.push(...walk(path.join(MOBILE, d)));
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');

t('nenhum arquivo monta blob: de PDF nem compartilha application/pdf por conta própria', () => {
  const bad: string[] = [];
  for (const f of files) {
    const r = rel(f);
    if (ALLOWED.has(r)) continue;
    const src = fs.readFileSync(f, 'utf8');
    if (/new Blob\(\[[^\]]*\]\s*,\s*\{\s*type:\s*'application\/pdf'/.test(src)) bad.push(`${r}: blob de PDF`);
    if (/Sharing\.shareAsync\([^)]*application\/pdf/.test(src)) bad.push(`${r}: compartilha PDF direto`);
    if (/responseType:\s*'(blob|arraybuffer)'[\s\S]{0,200}\/pdf/.test(src) && !/pdfDelivery/.test(src)) bad.push(`${r}: baixa PDF como arquivo`);
  }
  assert.deepEqual(bad, [], `use openServerPdf / pdfFromUrl (services/pdfDelivery.ts) em vez de copiar a entrega do PDF:\n${bad.join('\n')}`);
});

t('as rotas de PDF do app passam pelo pdfDelivery', () => {
  for (const f of ['services/receiptService.ts', 'services/giftService.ts', 'services/reportService.ts', 'services/monthlyReportService.ts', 'services/labelService.ts']) {
    assert.ok(/pdfDelivery/.test(fs.readFileSync(path.join(MOBILE, f), 'utf8')), `${f} deveria usar services/pdfDelivery.ts`);
  }
});
console.log(`${n} testes ok`);
