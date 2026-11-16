/**
 * Observação que o lojista escreveu, sem as marcas técnicas que o sistema grava junto
 * (`[compra:<id>]` da compra recebida de uma vez, `[planilha:<hash>]` da importação). Elas servem para o servidor
 * não lançar duas vezes e não dizem nada a quem lê.
 */
export function cleanNotes(notes?: string | null): string {
  return (notes ?? '').replace(/\[(?:compra|planilha):[^\]]*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
}
