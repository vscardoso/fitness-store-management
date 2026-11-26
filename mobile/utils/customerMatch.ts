/**
 * Busca de cliente igual em todas as telas: sem acento, sem diferenciar maiúscula, palavras em qualquer ordem
 * ("ana guarani" acha "Ana Júlia Guarani"), telefone e documento pelos números (com ou sem máscara) e e-mail.
 */
type Searchable = { full_name?: string | null; email?: string | null; phone?: string | null; document_number?: string | null };

const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function customerMatches(c: Searchable, query: string): boolean {
  const q = plain(query || '').trim();
  if (!q) return true;
  const name = plain(c.full_name || '');
  if (q.split(/\s+/).every((w) => name.includes(w))) return true;
  if (c.email && plain(c.email).includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3) {
    if ((c.phone || '').replace(/\D/g, '').includes(digits)) return true;
    if ((c.document_number || '').replace(/\D/g, '').includes(digits)) return true;
  }
  return false;
}

/** Ordem da lista: nome de A a Z (sem acento), para a cliente nova não ficar perdida no fim. */
export function byCustomerName(a: Searchable, b: Searchable): number {
  return plain(a.full_name || '').localeCompare(plain(b.full_name || ''), 'pt-BR');
}
