/**
 * Código que aparece embaixo do nome da peça no carrinho: o da ETIQUETA (#041-11), que é o que a vendedora vê na peça.
 * Carrinho guardado de antes (sem o código) cai no SKU. Sem imports do React Native (testes: node scripts/test-cart-code.mts).
 */
export function cartItemCodeText(product: { display_code?: string | null; sku?: string | null } | null | undefined): string {
  const code = product?.display_code?.trim();
  if (code) return code;
  const sku = product?.sku?.trim();
  return sku ? `SKU: ${sku}` : '';
}
