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
    const existingSet = new Set(existingSKUs.map(s => s.toUpperCase()));

    while (existingSet.has(candidate.toUpperCase()) && counter < 999) {
      counter++;
      candidate = `${baseSku}-${counter.toString().padStart(3, '0')}`;
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
  generateSimpleSKU,
  isValidSKU,
};
