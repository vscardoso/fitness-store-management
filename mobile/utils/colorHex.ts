/**
 * Cor (hex) a partir do nome da cor da variação, ex.: "Rosa Claro", "Azul Marinho".
 * Devolve null quando o nome não é reconhecido (quem chama escolhe um neutro,
 * nunca a cor da marca, que enganaria o usuário).
 */
const BASE: Record<string, string> = {
  preto: '#1a1a1a', negro: '#1a1a1a', black: '#1a1a1a',
  branco: '#f5f5f5', white: '#f5f5f5', offwhite: '#f1ece2', gelo: '#f1ece2',
  cinza: '#9ca3af', gray: '#9ca3af', grey: '#9ca3af', chumbo: '#4b5563', grafite: '#374151',
  vermelho: '#ef4444', red: '#ef4444', vinho: '#7f1d1d', bordo: '#7f1d1d', bordô: '#7f1d1d',
  azul: '#3b82f6', blue: '#3b82f6', marinho: '#1e3a8a', navy: '#1e3a8a', turquesa: '#14b8a6',
  verde: '#22c55e', green: '#22c55e', oliva: '#6b7d3a', militar: '#4b5320',
  amarelo: '#eab308', yellow: '#eab308', mostarda: '#ca9a1a',
  laranja: '#f97316', orange: '#f97316', coral: '#fb7185', terracota: '#c2653f',
  rosa: '#ec4899', pink: '#ec4899', magenta: '#d946ef', fucsia: '#d946ef', fúcsia: '#d946ef',
  roxo: '#a855f7', purple: '#a855f7', lilas: '#c4a1ff', lilás: '#c4a1ff', violeta: '#8b5cf6',
  marrom: '#92400e', brown: '#92400e', caramelo: '#b45f06', chocolate: '#5a3a22',
  bege: '#d4b896', beige: '#d4b896', nude: '#e0b9a0', creme: '#f3e8c8', areia: '#d8c7a0',
  dourado: '#d4af37', prata: '#c0c0c0',
  mescla: '#b8b8b8', salmao: '#fa8072', salmão: '#fa8072', menta: '#a8e6cf', limao: '#bfff00', limão: '#bfff00',
  musgo: '#4a5d23', jade: '#00a86b', abacate: '#568203', bandeira: '#009c3b', cobalto: '#0047ab', jeans: '#5b7da6',
  piscina: '#2bb3d6', ceu: '#87ceeb', céu: '#87ceeb', blush: '#de98ab', rose: '#e8a598', rosê: '#e8a598',
  chiclete: '#ff8fb1', cereja: '#9b111e', marsala: '#955251', uva: '#6f2da8', berinjela: '#5b3256',
  pessego: '#ffcba4', pêssego: '#ffcba4', tangerina: '#f28500', canario: '#ffef00', canário: '#ffef00',
  cobre: '#b87333', bronze: '#cd7f32', telha: '#b5502d', cappuccino: '#a9876a', cafe: '#4b3621', café: '#4b3621',
  cacau: '#3d2314', marfim: '#fffff0', champanhe: '#f7e7ce', neon: '#39ff14',
  // nomes comuns de moda que caíam no cinza neutro (Lavanda, 04/11/2026)
  lavanda: '#b57edc', lavender: '#b57edc', perola: '#eae0c8', pérola: '#eae0c8', petroleo: '#1d5e6e', petróleo: '#1d5e6e',
  royal: '#2f5bd3', agua: '#66cdaa', água: '#66cdaa', aqua: '#66cdaa', tiffany: '#0abab5', ciano: '#06b6d4',
  anil: '#3f2a8c', indigo: '#4b0082', índigo: '#4b0082', lima: '#84cc16', esmeralda: '#10b981', caqui: '#c3b091',
  khaki: '#c3b091', kaki: '#c3b091', camel: '#c19a6b', taupe: '#8b7d6b', ameixa: '#8e4585', framboesa: '#c72c48',
  goiaba: '#e8636f', melancia: '#fc6c85', mel: '#e3a857', ferrugem: '#b7410e', tijolo: '#a0522d', rubi: '#e0115f',
  carmim: '#960018', nevoa: '#c9ccd1', névoa: '#c9ccd1', fume: '#6e6e6e', fumê: '#6e6e6e', cimento: '#a7a39b',
  acafrao: '#f4c430', açafrão: '#f4c430', ouro: '#d4af37', baunilha: '#f3e5ab', lilac: '#c4a1ff',
};

const CLARO = new Set(['claro', 'clara', 'light', 'bebe', 'bebê', 'pastel']);
const ESCURO = new Set(['escuro', 'escura', 'dark']);
// "Cinza Médio": um pouco mais escuro que a cor base, para não ficar igual ao cinza neutro de "cor desconhecida"
const MEDIO = new Set(['medio', 'médio', 'media', 'média']);

function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c + (target - c) * amount).toString(16).padStart(2, '0'),
  );
  return `#${ch.join('')}`;
}

export function colorNameToHex(name?: string | null): string | null {
  if (!name) return null;
  const words = name.toLowerCase().trim().split(/[\s/-]+/).filter(Boolean);
  let base: string | null = null;
  let tone: 'claro' | 'escuro' | 'medio' | null = null;
  for (const w of words) {
    if (CLARO.has(w)) tone = 'claro';
    else if (ESCURO.has(w)) tone = 'escuro';
    else if (MEDIO.has(w)) tone = 'medio';
    else if (BASE[w] && base === null) base = BASE[w];
    // "Azul Marinho": o termo mais específico (marinho) vence a cor genérica (azul)
    else if (BASE[w]) base = BASE[w];
  }
  if (!base) return null;
  if (tone === 'claro') return mix(base, 255, 0.55);
  if (tone === 'escuro') return mix(base, 0, 0.45);
  if (tone === 'medio') return mix(base, 0, 0.25);
  return base;
}
