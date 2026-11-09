// Carregamento de tela: padrão único (components/ui/ScreenLoader). Nenhuma tela usa <ActivityIndicator size="large"> solto.
// Loader pequeno (size="small", dentro de botão ou campo) segue permitido. Rodar: node mobile/scripts/test-screen-loader.mts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Fora do padrão de propósito: o carregamento global e o desenho do loader, e telas com fundo escuro (câmera, mídia, scanner).
const ALLOWED = new Set([
  'components/ui/MagnifierLoader.tsx', 'components/ui/ScreenLoader.tsx', 'components/ui/LoadingOverlay.tsx',
  'components/ui/LoadedImage.tsx', 'components/layout/SystemUpdateOverlay.tsx', 'app/products/scan.tsx',
  'components/products/WizardStep1.tsx', 'components/whatsapp/MediaViewer.tsx', 'components/whatsapp/MessageMedia.tsx',
  'app/products/photos/[id].tsx', // moldura de foto pequena: o loader fica dentro do quadro
  'app/settings/branding.tsx',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    if (n.name === 'node_modules' || n.name.startsWith('.')) continue;
    const p = path.join(dir, n.name);
    if (n.isDirectory()) walk(p, out); else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const bad: string[] = [];
for (const root of ['app', 'components']) {
  for (const f of walk(path.join(MOBILE, root))) {
    const rel = path.relative(MOBILE, f).replace(/\\/g, '/');
    if (ALLOWED.has(rel)) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/<ActivityIndicator[^>]*size=("large"|\{(124|56)\})/.test(line)) bad.push(`${rel}:${i + 1}`);
    });
  }
}
assert.deepEqual(bad, [], `use <ScreenLoader /> (components/ui/ScreenLoader) no lugar do loader grande solto: ${bad.join(', ')}`);
console.log('ok nenhuma tela usa o loader grande fora do ScreenLoader');
