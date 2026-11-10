// Padrão visual do app: trava para o problema NÃO VOLTAR a crescer e mostra o tamanho dele, arquivo por arquivo.
// Conta, em cada .tsx de app/ e components/:
//   paperButton    <Button ...> do react-native-paper (o `contained` vira pílula de outro formato; usar AppButton)
//   staticPrimary  Colors.light.primary (cor FIXA do Provador: depois do login vale a cor da loja, useBrandingColors)
//   hexColors      cores hexadecimais soltas entre aspas (usar Colors.light.* / theme)
// Regra: nenhum arquivo pode ter MAIS ocorrências do que está em scripts/ui-standard-baseline.json (arquivo novo parte de zero).
// Quando um arquivo for corrigido, rode `node scripts/test-ui-standard.mts --update` para baixar o teto dele.
// Sem argumento: valida. Com --report: lista os 25 arquivos mais fora do padrão.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(MOBILE, 'scripts', 'ui-standard-baseline.json');
// Telas que existem ANTES de conhecer a loja (login, cadastro) usam a cor do Provador de propósito.
const STATIC_PRIMARY_OK = /^app\/\(auth\)\//;

type Counts = { paperButton: number; staticPrimary: number; hexColors: number };
const KEYS: (keyof Counts)[] = ['paperButton', 'staticPrimary', 'hexColors'];

function walk(dir: string, out: string[] = []): string[] {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    if (n.name === 'node_modules' || n.name.startsWith('.')) continue;
    const p = path.join(dir, n.name);
    if (n.isDirectory()) walk(p, out); else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function count(rel: string, src: string): Counts {
  const importsPaperButton = /import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*'react-native-paper'/.test(src);
  return {
    paperButton: importsPaperButton ? (src.match(/<Button\b/g) ?? []).length : 0,
    staticPrimary: STATIC_PRIMARY_OK.test(rel) ? 0 : (src.match(/Colors\.light\.primary\b/g) ?? []).length,
    hexColors: (src.match(/'#[0-9a-fA-F]{3,8}'/g) ?? []).length,
  };
}

const current: Record<string, Counts> = {};
for (const root of ['app', 'components']) {
  for (const f of walk(path.join(MOBILE, root))) {
    const rel = path.relative(MOBILE, f).replace(/\\/g, '/');
    const c = count(rel, fs.readFileSync(f, 'utf8'));
    if (KEYS.some((k) => c[k] > 0)) current[rel] = c;
  }
}
const sum = (k: keyof Counts) => Object.values(current).reduce((n, c) => n + c[k], 0);

if (process.argv.includes('--update')) {
  fs.writeFileSync(BASELINE, JSON.stringify(current, null, 1) + '\n');
  console.log(`baseline gravada: ${Object.keys(current).length} arquivos | Button do Paper ${sum('paperButton')} | cor fixa ${sum('staticPrimary')} | hex soltos ${sum('hexColors')}`);
  process.exit(0);
}

if (process.argv.includes('--report')) {
  const score = (c: Counts) => c.paperButton * 5 + c.staticPrimary * 3 + c.hexColors;
  const top = Object.entries(current).sort((a, b) => score(b[1]) - score(a[1])).slice(0, 25);
  console.log(`Button do Paper ${sum('paperButton')} | cor fixa ${sum('staticPrimary')} | hex soltos ${sum('hexColors')}\n`);
  for (const [f, c] of top) console.log(`${String(score(c)).padStart(4)}  paper ${String(c.paperButton).padStart(2)}  fixa ${String(c.staticPrimary).padStart(2)}  hex ${String(c.hexColors).padStart(3)}  ${f}`);
  process.exit(0);
}

const base: Record<string, Counts> = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
const worse: string[] = [];
for (const [f, c] of Object.entries(current)) {
  for (const k of KEYS) {
    const allowed = base[f]?.[k] ?? 0;
    if (c[k] > allowed) worse.push(`${f}: ${k} ${allowed} -> ${c[k]}`);
  }
}
if (worse.length) {
  console.error('Padrão visual: arquivo(s) piorou(aram). Use AppButton, useBrandingColors e tokens do theme.\n  ' + worse.join('\n  '));
  process.exit(1);
}
const gone = Object.entries(base).filter(([f, b]) => KEYS.some((k) => (current[f]?.[k] ?? 0) < b[k])).length;
console.log(`ok padrão visual: Button do Paper ${sum('paperButton')} | cor fixa ${sum('staticPrimary')} | hex soltos ${sum('hexColors')}` +
  (gone ? ` (${gone} arquivo(s) melhoraram: rode --update para baixar o teto)` : ''));
