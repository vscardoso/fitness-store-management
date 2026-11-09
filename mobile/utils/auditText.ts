/**
 * Frase em português simples para cada linha do Histórico de alterações.
 * Função pura (sem React): testada por scripts/test-audit-text.mts.
 */
export interface AuditItem {
  id?: number;
  action: string;
  user_name?: string | null;
  user_email?: string | null;
  entity_id?: number | null;
  /** JSON em texto, como o servidor guarda */
  detail?: string | null;
}

export interface AuditSentence {
  /** "Alice Borges corrigiu o saldo da Gaveta de R$ 800,00 para R$ 750,00" */
  text: string;
  /** Motivo escrito por quem fez, quando houver */
  reason: string | null;
}

export const money = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  const sign = n < 0 ? '-' : '';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${sign}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
};

const FIELD: Record<string, string> = {
  name: 'o nome', description: 'a descrição', amount: 'o valor', sale_price: 'o preço de venda', cost_price: 'o custo',
  price: 'o preço', unit_cost: 'o custo', list_unit_cost: 'o preço de tabela', discount_amount: 'o desconto',
  quantity_received: 'a quantidade recebida', total_cost: 'o total', expense_date: 'a data', entry_date: 'a data',
  color: 'a cor', size: 'o tamanho', is_active: 'a situação', due_date: 'o vencimento', status: 'a situação',
  opening_balance: 'o saldo de partida', invoice_number: 'a nota', supplier_id: 'o fornecedor',
  return_window_days: 'o prazo de troca', loyalty_enabled: 'a fidelidade', allow_money_refund: 'devolver dinheiro',
  allow_stock_writeoff: 'a baixa de estoque',
};
const MONEY = new Set(['amount', 'sale_price', 'cost_price', 'price', 'unit_cost', 'list_unit_cost', 'discount_amount',
  'total_cost', 'opening_balance']);

const plain = (key: string, v: unknown): string => {
  if (MONEY.has(key)) return money(v);
  if (v === true) return 'sim';
  if (v === false) return 'não';
  if (v === null || v === undefined || v === '') return 'vazio';
  return String(v);
};

function parse(detail?: string | null): Record<string, any> {
  if (!detail) return {};
  try {
    const d = JSON.parse(detail);
    return d && typeof d === 'object' && !Array.isArray(d) ? d : { texto: String(d) };
  } catch {
    return { texto: detail };
  }
}

/** "o preço de venda de R$ 10,00 para R$ 12,00; o custo de R$ 5,00 para R$ 6,00" */
function changes(d: Record<string, any>): string {
  const a = d.antes || {};
  const b = d.depois || {};
  const keys = Object.keys(b).filter((k) => k !== 'is_active' && FIELD[k]);
  if (!keys.length) return '';
  return keys.slice(0, 4).map((k) => `${FIELD[k]} de ${plain(k, a[k])} para ${plain(k, b[k])}`).join('; ');
}

const q = (s: unknown) => (s ? ` "${String(s)}"` : '');

export function describeAudit(item: AuditItem): AuditSentence {
  const who = (item.user_name || item.user_email || 'Alguém').trim();
  const d = parse(item.detail);
  const c = d.corpo || {};
  const nome = d.nome;
  const ids = d.ids || {};
  const reason = d.motivo ? String(d.motivo) : null;
  const ch = changes(d);
  const withChanges = (base: string) => `${who} ${base}${ch ? `: ${ch}` : ''}`;
  let text: string;

  switch (item.action) {
    case 'FINANCE_ACCOUNT_ADJUSTED':
      text = `${who} corrigiu o saldo da ${d.conta ?? 'conta'} de ${money(d.antes)} para ${money(d.depois)}`;
      break;
    case 'FINANCE_ACCOUNT_UPDATED':
      text = `${who} mudou a conta${q(d.depois?.name)}: saldo de partida de ${money(d.antes?.opening_balance)} para ${money(d.depois?.opening_balance)}`;
      break;
    case 'EXPENSE_CREATED':
      text = `${who} lançou a despesa${q(c.description)} de ${money(c.amount)}`;
      break;
    case 'EXPENSE_UPDATED':
      text = withChanges(`alterou a despesa${q(nome)}`);
      break;
    case 'EXPENSE_DELETED':
      text = `${who} apagou a despesa${q(nome)}${d.antes?.amount !== undefined || d.depois?.amount !== undefined ? '' : ''}`;
      break;
    case 'TRANSFER_CREATED':
      text = `${who} fez uma transferência de ${money(c.amount)} entre contas`;
      break;
    case 'TRANSFER_DELETED':
      text = `${who} apagou uma transferência entre contas`;
      break;
    case 'PAYABLE_CREATED':
      text = `${who} lançou a conta a pagar${q(c.description)} de ${money(c.amount)}`;
      break;
    case 'PAYABLE_PAID':
      text = `${who} pagou a conta${q(nome)}`;
      break;
    case 'PAYABLE_UNPAID':
      text = `${who} desfez o pagamento da conta${q(nome)}`;
      break;
    case 'PAYABLE_CANCELLED':
      text = `${who} cancelou a conta a pagar${q(nome)}`;
      break;
    case 'RECEIVABLE_RECEIVED':
      text = `${who} recebeu ${money(c.amount)} de fiado`;
      break;
    case 'RECEIVABLE_OPENING_CREATED':
      text = `${who} lançou um fiado antigo de ${money(c.amount ?? c.total_amount)}`;
      break;
    case 'RECEIVABLE_CANCELLED':
      text = `${who} cancelou um fiado lançado`;
      break;
    case 'RECEIVABLE_PAYMENT_UNDONE':
      text = `${who} desfez um recebimento de fiado`;
      break;
    case 'CASH_SESSION_OPENED':
      text = `${who} abriu o caixa com ${money(c.opening_amount)}`;
      break;
    case 'CASH_SESSION_CLOSED':
      text = `${who} fechou o caixa contando ${money(c.counted_amount)}`;
      break;
    case 'CASH_MOVEMENT_CREATED':
      text = `${who} ${c.kind === 'supply' ? 'colocou' : 'tirou'} ${money(c.amount)} ${c.kind === 'supply' ? 'no' : 'do'} caixa`;
      break;
    case 'CARD_SETTLED':
      text = `${who} fez o repasse da maquininha: caiu ${money(c.received)} no banco`;
      break;
    case 'MONTH_CLOSED':
      text = `${who} fechou o mês ${String(ids.month ?? '').padStart(2, '0')}/${ids.year ?? ''}`;
      break;
    case 'MONTH_REOPENED':
      text = `${who} reabriu o mês ${String(ids.month ?? '').padStart(2, '0')}/${ids.year ?? ''}`;
      break;
    case 'PRODUCT_UPDATED':
      text = withChanges(`alterou o produto${q(nome)}`);
      break;
    case 'VARIANT_UPDATED':
      text = withChanges(`alterou uma variação${q(nome)}`);
      break;
    case 'ENTRY_UPDATED':
      text = withChanges(`alterou a entrada${q(d.depois?.entry_code ?? nome)}`);
      break;
    case 'ENTRY_ITEM_UPDATED':
    case 'ENTRY_ITEM_CORRECTED':
      text = withChanges('corrigiu um item de uma entrada');
      break;
    case 'SETTINGS_UPDATED':
      text = withChanges('mudou as configurações da loja');
      break;
    case 'USER_CREATED':
      text = `${who} cadastrou a pessoa${q(c.full_name)} na equipe`;
      break;
    case 'USER_ACTIVATED':
      text = `${who} ativou o acesso de${q(nome)}`;
      break;
    case 'USER_DEACTIVATED':
      text = `${who} desativou o acesso de${q(nome)}`;
      break;
    case 'SALE_CREATED':
      text = `${who} registrou uma venda${item.entity_id ? ` (número ${item.entity_id})` : ''}`;
      break;
    case 'SALE_CANCELLED':
      text = `${who} cancelou uma venda${item.entity_id ? ` (número ${item.entity_id})` : ''}`;
      break;
    case 'SALE_RETURN_CORRECTION':
      text = `${who} estornou uma venda por erro de lançamento`;
      break;
    default:
      text = `${who} fez uma alteração (${item.action.toLowerCase().replace(/_/g, ' ')})`;
  }
  return { text: text.replace(/\s+/g, ' ').trim(), reason };
}
