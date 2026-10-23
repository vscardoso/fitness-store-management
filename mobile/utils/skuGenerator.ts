/**
 * Gerador de SKU automático
 * Mesma lógica usada pelo AI Scanner no backend
 */

/**
 * Remove acentos e caracteres especiais de uma string
 */
function cleanString(str: string): string {
  if (!str) return '';

  // Remove acentos
  const normalized = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Remove caracteres não alfanuméricos
  const cleaned = normalized.replace(/[^A-Za-z0-9]/g, '');

  return cleaned.toUpperCase();
}

/** Forma comparável de um SKU: sem hífens e em maiúsculas (o SKU de variante perde os hífens do SKU base). */
function normalizeSku(sku: string): string {
  return sku.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Reúne todos os SKUs já usados na loja: o do produto e o de cada variante.
 * Sem as variantes a checagem nunca enxerga os SKUs reais (o sku do produto é só o da 1ª variante).
 */
export function collectSkus(
  products: Array<{ sku?: string | null; variants?: Array<{ sku?: string | null }> | null }>
): string[] {
  const out = new Set<string>();
  for (const p of products) {
    if (p.sku) out.add(p.sku);
    for (const v of p.variants ?? []) if (v.sku) out.add(v.sku);
  }
  return [...out];
}

/**
 * Gera um SKU baseado nos dados do produto
 *
 * Formato: [MARCA]-[NOME]-[COR]-[TAM]-XXX
 * Exemplo: NIKE-LEGGIN-PRT-M-001
 *
 * @param name Nome do produto (obrigatório)
 * @param brand Marca (opcional)
 * @param color Cor (opcional)
 * @param size Tamanho (opcional)
 * @param existingSKUs Lista de SKUs existentes para evitar duplicatas (opcional)
 */
export function generateSKU(
  name: string,
  brand?: string | null,
  color?: string | null,
  size?: string | null,
  existingSKUs?: string[]
): string {
  const parts: string[] = [];

  // Marca (primeiros 4 caracteres)
  if (brand) {
    parts.push(cleanString(brand).slice(0, 4));
  }

  // Nome (primeiros 6 caracteres)
  if (name) {
    parts.push(cleanString(name).slice(0, 6));
  }

  // Cor (primeiros 3 caracteres)
  if (color) {
    parts.push(cleanString(color).slice(0, 3));
  }

  // Tamanho (primeiros 3 caracteres)
  if (size) {
    parts.push(cleanString(size).slice(0, 3));
  }

  // Montar base do SKU
  const baseSku = parts.length > 0 ? parts.join('-') : 'PROD';

  // Adicionar contador para unicidade
  let counter = 1;
  let candidate = `${baseSku}-${counter.toString().padStart(3, '0')}`;

  // Se temos lista de SKUs existentes, verificar unicidade
  if (existingSKUs && existingSKUs.length > 0) {
    // O SKU base é "tronco" dos SKUs das variantes (ALO-CONJUN-001 -> ALOCONJUN001-MAR-G-001):
    // está ocupado se algum SKU existente, sem hífens, começa com ele.
    const existingNorm = existingSKUs.map(normalizeSku);
    const taken = (c: string) => {
      const n = normalizeSku(c);
      return existingNorm.some(e => e.startsWith(n));
    };

    while (taken(candidate) && counter < 999) {
      counter++;
      candidate = `${baseSku}-${counter.toString().padStart(3, '0')}`;
    }
  }

  return candidate;
}

/**
 * Gera o SKU de uma variante específica garantindo unicidade.
 *
 * Usado quando o produto tem variantes: cada combinação cor×tamanho recebe
 * seu próprio SKU derivado do SKU base do produto.
 *
 * Formato: [SKU_BASE]-[COR_3]-[TAMANHO]-XXX
 * Exemplos:
 *   NIKE-LEGGIN-001  +  Preto + M   →  NIKE-LEGGIN-001-PRT-M-001
 *   CAMI-001         +  Azul  + GG  →  CAMI-001-AZU-GG-001
 *   CAMI-001         +  (sem cor)   +  G   →  CAMI-001-G-001
 */
export function generateVariantSKU(
  baseSku: string,
  color?: string | null,
  size?: string | null,
  existingSKUs?: string[]
): string {
  const parts: string[] = [cleanString(baseSku)];

  if (color) parts.push(cleanString(color).slice(0, 3));
  if (size)  parts.push(cleanString(size).slice(0, 3));

  const base = parts.join('-');

  let counter = 1;
  let candidate = `${base}-${counter.toString().padStart(3, '0')}`;

  if (existingSKUs && existingSKUs.length > 0) {
    const existingSet = new Set(existingSKUs.map(normalizeSku));
    while (existingSet.has(normalizeSku(candidate)) && counter < 999) {
      counter++;
      candidate = `${base}-${counter.toString().padStart(3, '0')}`;
    }
  }

  return candidate;
}

/**
 * Gera SKU simplificado baseado apenas no nome
 * Útil para geração rápida no formulário manual
 */
export function generateSimpleSKU(name: string): string {
  if (!name || !name.trim()) return '';

  const cleaned = cleanString(name).slice(0, 8);
  const timestamp = Date.now().toString().slice(-4);

  return `${cleaned || 'PROD'}-${timestamp}`;
}

/**
 * Valida formato de SKU
 */
export function isValidSKU(sku: string): boolean {
  if (!sku || sku.length < 3) return false;

  // SKU deve conter apenas letras maiúsculas, números e hífens
  return /^[A-Z0-9-]+$/.test(sku.toUpperCase());
}

export default {
  generateSKU,
  generateVariantSKU,
  generateSimpleSKU,
  isValidSKU,
};
