/** Texto da regra do programa de fidelidade, em palavras simples (puro: usado na tela de configuração e testado em node). */
export interface LoyaltyRule {
  enabled: boolean;
  spend_per_point: number;
  point_value: number;
  min_redeem: number;
  expiry_days: number | null;
}

/** Frase simples da regra, para a lojista conferir o que configurou. */
export function describeLoyalty(s: LoyaltyRule): string {
  if (!s.enabled) return 'Programa desligado: ninguém ganha nem usa pontos.';
  const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
  const cashback = s.spend_per_point > 0 ? (s.point_value / s.spend_per_point) * 100 : 0;
  const venc = s.expiry_days ? `Os pontos vencem ${s.expiry_days} dias depois da compra.` : 'Os pontos não vencem.';
  const minimo = s.min_redeem > 0 ? ` Só dá para usar a partir de ${s.min_redeem} pontos.` : '';
  return `A cada ${brl(s.spend_per_point)} em compras, a cliente ganha 1 ponto. Cada ponto vale ${brl(s.point_value)} de desconto `
    + `(é como ${cashback.toFixed(1).replace('.', ',')}% de cashback). ${venc}${minimo}`;
}
