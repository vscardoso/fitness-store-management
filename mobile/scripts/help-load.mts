// Carrega as fichas de ajuda (constants/help/<grupo>.ts) e as rotas de app/ para os testes da ajuda.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeFromFile } from '../utils/helpRoutes.ts';
import type { HelpEntry } from '../constants/help/types.ts';

export const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELP_DIR = path.join(MOBILE, 'constants', 'help');
const NOT_GROUPS = new Set(['index.ts', 'types.ts', 'coverage.ts']);

export async function loadEntries(): Promise<HelpEntry[]> {
  const all: HelpEntry[] = [];
  for (const f of fs.readdirSync(HELP_DIR).filter((f) => f.endsWith('.ts') && !NOT_GROUPS.has(f)).sort()) {
    const mod = await import('../constants/help/' + f);
    for (const v of Object.values(mod)) if (Array.isArray(v)) all.push(...(v as HelpEntry[]));
  }
  return all;
}

/** Rotas de app/ (sem _layout), como o navegador mostra. */
export function appRoutes(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) walk(full);
      else if (/\.tsx$/.test(d.name) && d.name !== '_layout.tsx') out.add(routeFromFile(path.relative(path.join(MOBILE, 'app'), full)));
    }
  };
  walk(path.join(MOBILE, 'app'));
  return out;
}
