/**
 * Marca do Provador (o aplicativo). Usada nas telas antes do login (apresentação, login, cadastro)
 * e nos ícones. Depois do login, as telas usam a cor de cada loja (useBrandingColors).
 * Arquivos-fonte do logo: assets/brand/*.svg
 */
export const BRAND = {
  name: 'Provador',
  tagline: 'Gestão para lojas de moda fitness',
  violet: '#7C3AED',
  magenta: '#DB2777',
  ink: '#160F28',
  mist: '#F4F2F7',
} as const;

export const BRAND_GRADIENT: [string, string] = [BRAND.violet, BRAND.magenta];
