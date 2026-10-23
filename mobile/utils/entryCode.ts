/**
 * Código da entrada: maiúsculas e traço no lugar de cada espaço
 * ("entrada sp 22" vira "ENTRADA-SP-22"). Enquanto digita, o traço do fim fica (para continuar a escrever).
 */
export function formatEntryCodeInput(text: string): string {
  return text.toUpperCase().replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^-+/, '');
}

/** Versão final, sem traço sobrando nas pontas. */
export function cleanEntryCode(text: string): string {
  return formatEntryCodeInput(text.trim()).replace(/-+$/, '');
}
