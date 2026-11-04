/** Fichas de ajuda do grupo Clientes. Regras de texto em constants/help/types.ts. */
import type { HelpEntry } from './types';

export const CLIENTES: HelpEntry[] = [
  {
    id: 'clientes',
    group: 'clientes',
    title: 'Clientes',
    routes: ['/customers'],
    open: '/customers',
    purpose: 'Lista as clientes da loja para achar, abrir a ficha ou cadastrar uma nova.',
    steps: [
      'Busque pelo nome, telefone, e-mail ou CPF.',
      'Use os filtros “Ativos”, “Inativos” e “Todos” para separar a lista.',
      'Toque na cliente para abrir a ficha com compras, pontos e contato.',
      'Para cadastrar, toque no “+” (no computador, em “Novo cliente”).',
    ],
    parts: [
      { label: 'Resumo de Clientes', text: 'quantas clientes estão ativas, inativas e o total.' },
    ],
    related: ['cliente-novo', 'cliente-ficha'],
    sources: ['app/(tabs)/customers.tsx', 'components/FAB.tsx'],
  },
  {
    id: 'cliente-novo',
    group: 'clientes',
    title: 'Nova cliente',
    routes: ['/customers/add'],
    open: '/customers/add',
    purpose: 'Cadastra uma cliente com contato, documento e endereço.',
    steps: [
      'Preencha o nome completo e o telefone, que são obrigatórios.',
      'E-mail, CPF, data de nascimento e endereço são opcionais.',
      'Digite o CEP e o endereço é preenchido sozinho.',
      'Toque em “Salvar Cliente”.',
    ],
    goodToKnow: [
      'Com o telefone cadastrado dá para abrir a conversa dela no WhatsApp da loja.',
      'O endereço é usado no envio condicional e já vem preenchido lá.',
    ],
    related: ['clientes', 'cliente-ficha'],
    sources: ['app/customers/add.tsx'],
  },
  {
    id: 'cliente-ficha',
    group: 'clientes',
    title: 'Ficha da cliente',
    routes: ['/customers/[id]'],
    purpose: 'Reúne contato, compras, pontos, WhatsApp e os pedidos de privacidade da cliente.',
    steps: [
      'Use “Ligar” ou “Email” no alto para falar com ela.',
      'Toque em “Abrir conversa no WhatsApp” para responder pela caixa da loja.',
      'Se ela ainda não escreveu para a loja, use “Convidar para o WhatsApp da loja”.',
      'Toque numa compra do histórico para abrir a venda.',
      'Para mudar os dados, toque no lápis do alto.',
    ],
    parts: [
      { label: 'Informações Adicionais', text: 'pontos de fidelidade, total gasto e quantas compras ela fez.' },
      { label: 'Histórico de Compras', text: 'as últimas 10 vendas, com a situação de cada uma.' },
      { label: 'Privacidade (LGPD)', text: 'para quando a cliente pede os dados dela ou pede para ser apagada.' },
    ],
    goodToKnow: [
      'Cada venda dá pontos à cliente (1 ponto a cada R$ 10); devolução tira os pontos na mesma proporção.',
      '“Exportar dados da cliente” gera um arquivo com cadastro, compras, condicionais e conversas.',
      '“Anonimizar cliente” apaga nome, contato, CPF e endereço e não tem volta; as vendas continuam nos relatórios.',
      'Excluir a cliente só a tira da lista: as compras dela continuam gravadas.',
    ],
    related: ['cliente-editar', 'clientes'],
    sources: ['app/customers/[id].tsx', 'components/customers/CustomerPrivacyCard.tsx'],
  },
  {
    id: 'cliente-editar',
    group: 'clientes',
    title: 'Editar cliente',
    routes: ['/customers/edit/[id]'],
    purpose: 'Corrige ou completa os dados de uma cliente.',
    steps: [
      'Altere os campos que precisar; nome completo e telefone continuam obrigatórios.',
      'Digite um CEP novo para o endereço ser preenchido de novo.',
      'Toque em “Salvar”.',
    ],
    goodToKnow: ['Pontos e total gasto não se editam: eles vêm das vendas.'],
    related: ['cliente-ficha'],
    sources: ['app/customers/edit/[id].tsx'],
  },
];
