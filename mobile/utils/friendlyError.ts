/**
 * Erro em português claro para a lojista: nunca SQL, nome de tabela, endereço de servidor ou rastreio.
 * O servidor já troca esses textos; aqui é a segunda trava (versão antiga do servidor, erro de rede, validação).
 */

const TECH_MARKERS = [
  'sqlalchemy', '[sql:', 'asyncpg', 'psycopg', 'traceback', 'error creating', 'background on this error',
  '[parameters:', 'dbapi', 'violates', 'stringdatarighttruncation', 'invalid input syntax', 'pydantic',
  'internal server error', 'errno', 'greenlet', 'nonetype', 'keyerror', 'attributeerror', 'typeerror',
  'request failed with status code', 'axioserror', 'network request failed', 'undefined is not',
];

export const GENERIC_ERROR = 'Não conseguimos concluir agora. Tente de novo; se continuar, avise o suporte.';
export const OFFLINE_ERROR = 'Sem conexão com a internet. Confira o Wi-Fi ou o 4G e tente de novo.';

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome', product_name: 'Nome do produto', brand: 'Marca', product_brand: 'Marca', material: 'Material',
  product_material: 'Material', description: 'Descrição', product_description: 'Descrição', color: 'Cor',
  product_color: 'Cor', size: 'Tamanho', product_size: 'Tamanho', gender: 'Gênero', product_gender: 'Gênero',
  price: 'Preço de venda', product_price: 'Preço de venda', base_price: 'Preço de venda', cost_price: 'Custo',
  unit_cost: 'Custo da peça', quantity: 'Quantidade', quantity_received: 'Quantidade', email: 'E-mail',
  password: 'Senha', phone: 'Telefone', cnpj: 'CNPJ/CPF', cpf: 'CPF', sku: 'Código (SKU)',
  barcode: 'Código de barras', category_id: 'Categoria', product_category_id: 'Categoria',
  supplier_name: 'Fornecedor', supplier_id: 'Fornecedor', entry_code: 'Código da entrada', notes: 'Observação',
  full_name: 'Nome completo', store_name: 'Nome da loja', customer_id: 'Cliente', payment_method: 'Forma de pagamento',
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function isTechnical(text?: string | null): boolean {
  const t = (text ?? '').toLowerCase();
  return TECH_MARKERS.some((m) => t.includes(m));
}

/** Traduz um texto técnico para algo que a pessoa entende e sabe resolver. */
export function friendlyFromText(text?: string | null): string {
  const t = (text ?? '').toLowerCase();
  if (t.includes('value too long') || t.includes('stringdatarighttruncation')) {
    const m = t.match(/character varying\((\d+)\)/);
    const limit = m ? ` (o limite é ${m[1]} letras)` : '';
    return `Algum texto está maior do que o campo aceita${limit}. Encurte o nome, a marca, o material ou a descrição e tente de novo.`;
  }
  if (t.includes('duplicate key') || t.includes('uniqueviolation') || t.includes('unique constraint') || t.includes('already exists')) {
    return 'Já existe um cadastro igual a este (mesmo código, nome ou SKU). Confira e tente de novo.';
  }
  if (t.includes('foreign key') || t.includes('foreignkeyviolation')) {
    return 'Este item está ligado a outros dados e não pode ser mexido desta forma.';
  }
  if (t.includes('null value in column') || t.includes('not-null') || t.includes('notnullviolation')) {
    return 'Falta preencher um campo obrigatório. Confira o formulário e tente de novo.';
  }
  if (t.includes('numeric field overflow') || t.includes('out of range')) {
    return 'Algum valor numérico está grande demais. Confira preços e quantidades.';
  }
  if (['deadlock', 'could not serialize', 'timeout', 'timed out', 'too many clients'].some((k) => t.includes(k))) {
    return 'O sistema está ocupado agora. Aguarde alguns segundos e tente de novo.';
  }
  if (t.includes('network') || t.includes('failed to fetch')) return OFFLINE_ERROR;
  return GENERIC_ERROR;
}

/** Uma frase para cada erro de validação do servidor (lista do Pydantic). */
export function validationSentence(err: any): string {
  const loc: string[] = (err?.loc ?? []).map(String).filter((p: string) => !['body', 'query', 'path'].includes(p));
  const campo = loc.length ? fieldLabel(loc[loc.length - 1]) : 'Campo';
  const kind: string = err?.type ?? '';
  const ctx = err?.ctx ?? {};
  if (kind === 'string_too_long') return `${campo}: no máximo ${ctx.max_length} letras`;
  if (kind === 'string_too_short' || kind === 'missing') return `${campo}: preencha este campo`;
  if (kind === 'greater_than' || kind === 'greater_than_equal') return `${campo}: valor menor que o permitido`;
  if (kind === 'less_than' || kind === 'less_than_equal') return `${campo}: valor maior que o permitido`;
  return `${campo}: valor inválido`;
}

export function validationMessage(detail: unknown): string {
  if (!Array.isArray(detail) || detail.length === 0) return 'Confira os campos e tente de novo.';
  const frases = Array.from(new Set(detail.slice(0, 3).map(validationSentence)));
  return `Confira os campos: ${frases.join('; ')}.`;
}

/** Texto seguro para mostrar: técnico vira frase clara, o resto passa como veio. */
export function safeMessage(text?: string | null, fallback: string = GENERIC_ERROR): string {
  if (!text || !text.trim()) return fallback;
  return isTechnical(text) ? friendlyFromText(text) : text;
}
