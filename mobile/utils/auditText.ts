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


// ── Regra geral do servidor (ROTA_<MÉTODO>_<CAMINHO>): toda gravação sem frase própria ──────────────────────────
const ENTIDADE: Record<string, string> = {
  suppliers: 'o fornecedor', categories: 'a categoria', products: 'o produto', 'product-variants': 'a variação do produto',
  'stock-entries': 'a entrada de estoque', 'stock-import': 'a importação de estoque', inventory: 'o estoque',
  returns: 'uma devolução', team: 'a equipe', customers: 'o cadastro de clientes', store: 'as configurações da loja',
  finance: 'o financeiro', expenses: 'as despesas', receivables: 'o fiado', cash: 'o caixa', looks: 'o lookbook',
  wishlist: 'a lista de desejos', 'label-printers': 'as impressoras de etiqueta', 'payment-discounts': 'os descontos por forma de pagamento',
  pdv: 'o ponto de venda', 'conditional-shipments': 'o envio condicional', reports: 'a conferência de estoque',
  'supplier-returns': 'a devolução ao fornecedor', whatsapp: 'o WhatsApp', 'catalog-feed': 'o catálogo do WhatsApp',
  'mp-connect': 'a conexão com o Mercado Pago', suggestions: 'as sugestões', sales: 'a venda', labels: 'as etiquetas',
};
const ACAO_ESPECIAL: Record<string, string> = {
  'adjust-quantity': 'ajustou a quantidade de um produto', 'reset-password': 'redefiniu a senha de uma pessoa',
  role: 'mudou o papel de uma pessoa', commit: 'importou o estoque por planilha', 'cover-variant': 'trocou a cor da capa do produto',
  reorder: 'reordenou as fotos', cover: 'trocou a foto de capa', 'main-photo': 'definiu a foto principal', upload: 'enviou uma foto',
  rebuild: 'refez o saldo do estoque', writeoff: 'deu baixa no estoque', items: 'adicionou item', variants: 'adicionou variação',
  bulk: 'alterou várias variações de uma vez', pix: 'mudou a chave Pix', branding: 'mudou a identidade visual da loja',
  logo: 'trocou o logo da loja', setup: 'configurou', resolve: 'resolveu a devolução ao fornecedor', 'postpone-return': 'adiou o retorno',
  'postpone-departure': 'adiou a saída', 'mark-as-sent': 'marcou como enviado', 'process-return': 'processou a devolução do condicional',
  rotate: 'gerou outro link', 'whatsapp-visible': 'mudou a visibilidade no WhatsApp', stock: 'fez uma ação no estoque',
};

const PAPEL: Record<string, string> = { admin: 'administrador', manager: 'gerente', seller: 'vendedor', cashier: 'caixa' };
const papel = (v: unknown) => PAPEL[String(v).toLowerCase().replace(/^userrole\./, '')] ?? String(v);
const ENTRY_KIND: Record<string, string> = {
  owner_withdrawal: 'retirada de sócio', owner_contribution: 'dinheiro colocado pelo sócio',
  card_bill: 'fatura do cartão', loan_given: 'empréstimo concedido', loan_paid: 'pagamento de empréstimo',
  loan_repaid: 'recebimento de empréstimo', loan_taken: 'empréstimo recebido',
  other_in: 'outra entrada', other_out: 'outra saída',
};

const DETAIL_LABEL: Record<string, string> = {
  corpo: 'Dados informados', antes: 'Antes', depois: 'Depois', ids: 'Identificadores',
  nome: 'Nome', motivo: 'Motivo', reason: 'Motivo', notes: 'Observações', note: 'Observação',
  description: 'Descrição', amount: 'Valor', total: 'Total', total_amount: 'Valor total',
  kind: 'Tipo', person: 'Pessoa', account_id: 'Código da conta', from_account_id: 'Código da conta de origem',
  to_account_id: 'Código da conta de destino', customer_id: 'Código da cliente', sale_id: 'Código da venda',
  product_id: 'Código do produto', variant_id: 'Código da variação', entry_id: 'Código da entrada',
  item_id: 'Código do item', payable_id: 'Código da conta a pagar', receivable_id: 'Código do fiado',
  payment_id: 'Código do recebimento', user_id: 'Código da pessoa', full_name: 'Nome completo',
  name: 'Nome', installments: 'Parcelas', due_date: 'Vencimento', occurred_on: 'Data do lançamento',
  received_on: 'Data do recebimento', start_date: 'Contar a partir de', opening_amount: 'Valor de abertura',
  counted_amount: 'Valor contado', cash_balance: 'Saldo da gaveta', balance: 'Saldo', banks: 'Bancos',
  quantity: 'Quantidade', size: 'Tamanho', color: 'Cor', method: 'Forma de pagamento',
  payment_method: 'Forma de pagamento', rota: 'Operação', metodo: 'Método', texto: 'Informação registrada',
  conta: 'Conta', items: 'Itens', year: 'Ano', month: 'Mês',
};
const DETAIL_MONEY = new Set([...MONEY, 'total', 'total_amount', 'opening_amount', 'counted_amount', 'cash_balance', 'balance', 'received', 'gross']);
const PRIVATE_FIELD = /pass|senha|token|secret|cpf|cnpj|document|hash|key/i;

export interface AuditDetailLine {
  label: string;
  value: string;
}

/** Mostra apenas o que foi efetivamente gravado, inclusive campos que ainda não têm tradução. */
export function auditDetails(item: AuditItem): AuditDetailLine[] {
  const d = parse(item.detail);
  const lines: AuditDetailLine[] = [];
  const visit = (value: unknown, key: string, prefix: string) => {
    if (PRIVATE_FIELD.test(key)) return;
    const label = DETAIL_LABEL[key] ?? FIELD[key]?.replace(/^(o |a )/, '') ?? key.replace(/_/g, ' ');
    const path = prefix ? `${prefix} · ${label}` : label;
    if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, String(i + 1), path));
    } else if (value !== null && typeof value === 'object') {
      Object.entries(value).forEach(([k, v]) => visit(v, k, path));
    } else {
      let shown: string;
      if (value === null || value === '') shown = 'não informado';
      else if (typeof value === 'boolean') shown = value ? 'sim' : 'não';
      else if (key === 'kind' && ENTRY_KIND[String(value)]) shown = ENTRY_KIND[String(value)];
      else if (DETAIL_MONEY.has(key) && value !== undefined) shown = money(value);
      else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) shown = value.split('-').reverse().join('/');
      else shown = String(value);
      lines.push({ label: path, value: shown });
    }
  };
  Object.entries(d).forEach(([key, value]) => visit(value, key, ''));
  if (item.entity_id != null && !d.ids) lines.push({ label: 'Código do registro', value: String(item.entity_id) });
  return lines;
}

/** Frase da regra geral. `rota` é o caminho do servidor ("/products/{product_id}/adjust-quantity"). */
function describeRoute(who: string, d: Record<string, any>, nome: unknown, ch: string): string {
  const rota = String(d.rota ?? '');
  const metodo = String(d.metodo ?? '').toUpperCase();
  const partes = rota.split('/').filter((x) => x && !x.startsWith('{'));
  const base = partes[0] ?? '';
  const objeto = ENTIDADE[base] ?? (base ? `o registro de ${base.replace(/-/g, ' ')}` : 'um registro');
  const nomeTxt = nome ? ` “${String(nome)}”` : '';
  const ultima = partes[partes.length - 1];
  let verbo: string;
  if (rota === '/finance/entries' && metodo === 'POST') {
    const kind = ENTRY_KIND[String(d.corpo?.kind)] ?? 'lançamento financeiro';
    const value = d.corpo?.amount;
    return `${who} registrou ${kind}${value != null && value !== '' ? ` de ${money(value)}` : ''}`;
  }
  if (rota === '/finance/setup' && metodo === 'POST') return `${who} configurou o financeiro`;
  if (partes.length > 1 && ACAO_ESPECIAL[ultima]) {
    return `${who} ${ACAO_ESPECIAL[ultima]}${nomeTxt}${ch ? `: ${ch}` : ''}`;
  }
  if (metodo === 'POST') verbo = partes.length > 1 ? 'registrou em' : objeto.startsWith('uma ') ? 'registrou' : 'cadastrou';
  else if (metodo === 'DELETE') verbo = 'apagou';
  else verbo = 'alterou';
  return `${who} ${verbo} ${objeto}${nomeTxt}${ch ? `: ${ch}` : ''}`;
}

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
    case 'FINANCE_CARD_AUTO_CHANGED':
      text = `${who} ${d.enabled ? 'ligou' : 'desligou'} o repasse automático da maquininha${d.enabled && d.banco ? ` (banco ${d.banco})` : ''}`;
      break;
    case 'FINANCE_CARD_AUTO_TRANSFER': {
      const dia = typeof d.dia_do_cartao === 'string' && d.dia_do_cartao.length >= 10 ? ` (cartão de ${d.dia_do_cartao.slice(8, 10)}/${d.dia_do_cartao.slice(5, 7)})` : '';
      text = `O sistema lançou, sozinho, o repasse de ${money(d.valor)} da maquininha para ${d.para ?? 'o banco'}${dia}`;
      break;
    }
    case 'FINANCE_CARD_AUTO_SETTLED': {
      const n = Number(d.repasses) || 0;
      text = `O sistema repassou ${money(d.total)} da maquininha para ${d.banco ?? 'o banco'} em ${n} lançamento${n === 1 ? '' : 's'}${Number(d.pulados) ? ` (${d.pulados} pulado${Number(d.pulados) === 1 ? '' : 's'}: mês fechado)` : ''}`;
      break;
    }
    case 'FINANCE_CARD_AUTO_FAILED':
      text = `O repasse automático da maquininha falhou e nada foi lançado${d.erro ? `: ${d.erro}` : ''}`;
      break;
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
      {
        let value = c.amount ?? c.total_amount;
        if (value == null && Array.isArray(c.installments) && c.installments.length &&
            c.installments.every((i: any) => i?.amount != null && i.amount !== '' && Number.isFinite(Number(i.amount)))) {
          value = c.installments.reduce((sum: number, i: any) => sum + Math.round(Number(i.amount) * 100), 0) / 100;
        }
        text = `${who} lançou um fiado antigo${value != null && value !== '' ? ` de ${money(value)}` : ''}`;
      }
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
    case 'STOCK_ENTRY_DELETED':
      text = `${who} apagou uma entrada de estoque${item.entity_id ? ` (número ${item.entity_id})` : ''}`;
      break;
    case 'ENTRY_ITEM_DELETED':
      text = `${who} tirou um produto de uma entrada de estoque`;
      break;
    case 'STOCK_ADJUSTMENT': {
      const q = Number(d.quantity_diff);
      const quanto = Number.isFinite(q) && q !== 0 ? ` (${q > 0 ? '+' : ''}${q} peça${Math.abs(q) === 1 ? '' : 's'})` : '';
      text = `${who} ajustou o estoque de uma peça${quanto}${d.reason ? `: ${d.reason}` : ''}`;
      break;
    }
    case 'LOYALTY_ADJUSTED': {
      const pts = Number(d.points);
      const q = Number.isFinite(pts) && pts !== 0 ? ` (${pts > 0 ? '+' : ''}${pts} ponto${Math.abs(pts) === 1 ? '' : 's'})` : '';
      text = `${who} ajustou os pontos de uma cliente${q}${d.note ? `: ${d.note}` : ''}`;
      break;
    }
    case 'USER_ROLE_CHANGED':
      text = `${who} mudou o papel de ${d.target_email ?? 'uma pessoa da equipe'}${d.old_role && d.new_role ? ` (de ${papel(d.old_role)} para ${papel(d.new_role)})` : ''}`;
      break;
    case 'PASSWORD_RESET':
      text = `${who} redefiniu a senha de ${d.target_email ?? 'uma pessoa da equipe'}`;
      break;
    case 'CONDITIONAL_SENT':
      text = `${who} marcou um envio condicional como enviado${d.carrier ? ` (${d.carrier})` : ''}`;
      break;
    case 'CONDITIONAL_CANCELLED':
      text = `${who} cancelou um envio condicional`;
      break;
    case 'CONDITIONAL_RETURN_PROCESSED':
      text = `${who} registrou a devolução de um envio condicional`;
      break;
    case 'PDV_SALE_CONFIRMED':
    case 'PDV_MANUAL_CONFIRMED':
    case 'PIX_SALE_CONFIRMED':
    case 'CIELO_PIX_CONFIRMED':
      text = `${who} confirmou o pagamento de uma venda`;
      break;
    case 'PDV_SALE_CANCELLED':
    case 'PIX_SALE_CANCELLED':
      text = `${who} cancelou uma venda no ponto de venda`;
      break;
    case 'PDV_SALE_REFUNDED':
    case 'PIX_SALE_REFUNDED':
    case 'PIX_REFUNDED':
    case 'CIELO_PIX_REFUNDED':
    case 'CIELO_PIX_REFUNDED_SALE':
      text = `${who} estornou o pagamento de uma venda`;
      break;
    case 'PIX_EXPIRED':
      text = `Um Pix de venda venceu sem ser pago`;
      break;
    case 'LOGIN_SUCCESS':
      text = `${who} entrou no sistema`;
      break;
    case 'LOGIN_FAILED':
      text = `Tentativa de entrada que falhou${item.user_email ? ` para ${item.user_email}` : ''}`;
      break;
    case 'CUSTOMER_VIEWED':
      text = `${who} abriu a ficha de uma cliente`;
      break;
    case 'CUSTOMER_UPDATED':
      text = `${who} alterou o cadastro de uma cliente`;
      break;
    case 'CUSTOMER_DELETED':
      text = `${who} apagou o cadastro de uma cliente`;
      break;
    case 'CUSTOMER_EXPORTED':
      text = `${who} exportou os dados de uma cliente`;
      break;
    case 'CUSTOMER_ANONYMIZED':
      text = `${who} anonimizou os dados de uma cliente`;
      break;
    default:
      if (item.action.startsWith('ROTA_')) {
        text = describeRoute(who, d, nome, ch);
      } else {
        text = `${who} fez uma ação no sistema (${item.action.toLowerCase().replace(/_/g, ' ')})`;
      }
  }
  return { text: text.replace(/\s+/g, ' ').trim(), reason };
}
