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

t('só o hook e o serviço entregam PDF (.deliver): telas usam <PdfActions /> ou usePdfDelivery', () => {
  const DELIVER_OK = new Set(['services/pdfDelivery.ts', 'hooks/usePdfDelivery.ts']);
  const bad: string[] = [];
  for (const f of files) {
    const r = rel(f);
    if (DELIVER_OK.has(r)) continue;
    if (/\.deliver\(/.test(fs.readFileSync(f, 'utf8'))) bad.push(r);
  }
  assert.deepEqual(bad, [], `não chame .deliver() na tela: use <PdfActions /> (components/ui/PdfActions.tsx): ${bad.join(', ')}`);
});

t('as rotas de PDF do app passam pelo pdfDelivery', () => {
  for (const f of ['services/receiptService.ts', 'services/giftService.ts', 'services/reportService.ts', 'services/monthlyReportService.ts', 'services/labelService.ts']) {
    assert.ok(/pdfDelivery/.test(fs.readFileSync(path.join(MOBILE, f), 'utf8')), `${f} deveria usar services/pdfDelivery.ts`);
  }
});

t('o hook entrega o PDF já pronto SEM await antes (o iPhone só abre aba e compartilhar dentro do toque; esperar caía na tela preta)', () => {
  const src = fs.readFileSync(path.join(MOBILE, 'hooks/usePdfDelivery.ts'), 'utf8');
  assert.ok(/pdf \?\? hit \?\? \(await resolve\(\)\)/.test(src), 'run() deve usar `pdf ?? hit ?? (await resolve())`: só espera quando o PDF ainda não existe');
  const body = src.slice(src.indexOf('const run = useCallback'), src.indexOf('pdf ?? hit')).replace(/\/\/.*$/gm, '');   // sem os comentários
  assert.ok(!/await/.test(body), 'nada pode ser esperado (await) antes de escolher o PDF pronto dentro de run()');
});
t('etiquetas: o ÚNICO botão de PDF (tela de gerar e lista dos últimos PDFs) é "Compartilhar o arquivo PDF": sem Baixar nem Abrir; gerar não abre aba sozinha', () => {
  const read = (f: string) => fs.readFileSync(path.join(MOBILE, f), 'utf8');
  for (const f of ['components/labels/studio/PrintBar.tsx', 'components/labels/studio/RecentPrints.tsx']) {
    const tags = read(f).replace(/\/\*[\s\S]*?\*\//g, '').match(/<PdfActions[^>]*\/>/g) || [];
    assert.ok(tags.length >= 1, `${f} deve usar <PdfActions />`);
    for (const t1 of tags) {
      assert.ok(!/showOpen|showSave|openFirst|saveFirst/.test(t1), `${f}: só o botão Compartilhar o arquivo PDF (sem Baixar/Abrir): ${t1}`);
      assert.ok(/shareLabel="Compartilhar o arquivo PDF"/.test(t1), `${f}: o botão deve se chamar "Compartilhar o arquivo PDF"`);
    }
  }
  const gen = read('components/labels/studio/useLabelPrint.ts').replace(/\/\/.*$/gm, '');
  assert.ok(!/printed\.deliver\(/.test(gen), 'generate() não pode abrir o PDF sozinho (a aba abria preta no iPhone)');
});
t('etiquetas: não há botão de teste do Arquivos: só "Compartilhar o arquivo PDF" (Victor, 12/11/2026)', () => {
  const bar = fs.readFileSync(path.join(MOBILE, 'components/labels/studio/PrintBar.tsx'), 'utf8');
  assert.ok(!/shareddocuments|Abrir o app Arquivos/.test(bar), 'PrintBar não deve ter o botão de teste do app Arquivos');
});
console.log(`${n} testes ok`);
