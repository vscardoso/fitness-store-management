/** Códigos das etiquetas (#101-1) das peças de uma venda, para controle nas listas. Não vai para o comprovante da cliente. */
interface SaleLike {
  items?: { variant_code?: string | null; quantity?: number }[] | null;
}

export function saleCodes(sale: SaleLike): string[] {
  const seen = new Set<string>();
  for (const it of sale.items ?? []) {
    if (it.variant_code) seen.add(it.variant_code);
  }
  return [...seen];
}

/** "#101-1 · #55-2 +2": mostra até `max` códigos e quantos ficaram de fora. Vazio quando nenhuma peça tem etiqueta. */
export function saleCodesText(sale: SaleLike, max = 3): string {
  const codes = saleCodes(sale);
  if (!codes.length) return '';
  const shown = codes.slice(0, max).join(' · ');
  return codes.length > max ? `${shown} +${codes.length - max}` : shown;
}
