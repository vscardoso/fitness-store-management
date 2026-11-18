/** "1 conta", "2 contas": número com a palavra no singular ou no plural (nunca "conta(s)"). */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Só a palavra, sem o número: `${n} peça ${pluralWord(n, 'saiu', 'saíram')}`. */
export function pluralWord(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
