/**
 * Ajuda por tela: grupos (iguais aos da barra lateral), todas as fichas e a busca da ficha da tela atual.
 * Plano e regras: docs/PLANO_AJUDA.md.
 */
import { normalizeRole } from '@/utils/roles';
import { routeMatches, routeSpecificity } from '@/utils/helpRoutes';
import type { HelpEntry, HelpGroup, HelpRole } from './types';
import { VENDER } from './vender';
import { CLIENTES } from './clientes';

export type { HelpEntry, HelpGroup, HelpRole } from './types';

export const HELP_GROUPS: HelpGroup[] = [
  { key: 'vender', title: 'Vender', icon: 'cart-outline' },
  { key: 'estoque', title: 'Estoque', icon: 'cube-outline' },
  { key: 'clientes', title: 'Clientes', icon: 'people-outline' },
  { key: 'whatsapp', title: 'WhatsApp', icon: 'logo-whatsapp' },
  { key: 'dinheiro', title: 'Dinheiro', icon: 'wallet-outline' },
  { key: 'relatorios', title: 'Relatórios', icon: 'bar-chart-outline' },
  { key: 'loja', title: 'Loja', icon: 'storefront-outline' },
];

export const HELP_ENTRIES: HelpEntry[] = [...VENDER, ...CLIENTES];

const BY_ID = new Map(HELP_ENTRIES.map((e) => [e.id, e]));

export const helpById = (id: string | null | undefined): HelpEntry | undefined => (id ? BY_ID.get(id) : undefined);

/** Papel do usuário logado para a ficha ("admin" vê tudo). */
export function canSeeHelp(entry: HelpEntry, role: unknown): boolean {
  if (!entry.roles) return true;
  const r = normalizeRole(role) as HelpRole;
  return r === 'admin' || entry.roles.includes(r);
}

/** Ficha da tela aberta: a rota mais específica vence ('/conditional/create' antes de '/conditional/[id]'). */
export function findHelpForPath(pathname: string | null | undefined): HelpEntry | undefined {
  if (!pathname) return undefined;
  let best: HelpEntry | undefined;
  let bestScore = -1;
  for (const e of HELP_ENTRIES) {
    for (const r of e.routes) {
      if (routeMatches(r, pathname) && routeSpecificity(r) > bestScore) {
        best = e;
        bestScore = routeSpecificity(r);
      }
    }
  }
  return best;
}

/** Texto para a busca da Central: título, para que serve, passos, partes e "bom saber". */
export function helpSearchText(e: HelpEntry): string[] {
  return [
    e.title,
    e.purpose,
    ...e.steps,
    ...(e.parts ?? []).flatMap((p) => [p.label, p.text]),
    ...(e.goodToKnow ?? []),
    ...(e.web ?? []),
    ...(e.mobile ?? []),
  ];
}
