import type { HelpEntry } from './types';

export const LOJA: HelpEntry[] = [
  {
    id: 'historico-alteracoes',
    group: 'loja',
    title: 'Histórico de alterações',
    routes: ['/settings/audit'],
    open: '/settings/audit',
    purpose: 'Mostra quem mexeu em valores da loja, o que mudou e quando, para nenhuma alteração passar sem ninguém saber.',
    steps: [
      'Abra a tela e veja as alterações do dia mais novo para o mais antigo.',
      'Toque em “Dinheiro”, “Estoque”, “Vendas” ou “Pessoas” para ver só um assunto.',
      'Escolha o nome de uma pessoa para ver só o que ela fez.',
      'Toque em “Ver detalhes” para consultar os dados guardados em cada registro.',
      'Toque em “Ver mais antigos” para voltar no tempo.',
    ],
    parts: [
      { label: 'Frase', text: 'diz quem fez e o que mudou, com o valor de antes e o de depois.' },
      { label: 'Motivo', text: 'aparece quando quem fez escreveu o porquê.' },
    ],
    goodToKnow: [
      'Só o administrador vê esta tela.',
      'Registros antigos podem não ter todos os detalhes: a tela mostra apenas o que foi guardado na época.',
      'Os registros não podem ser apagados nem editados por ninguém.',
      'Quando um administrador corrige o saldo de uma conta, os outros administradores recebem um aviso no celular.',
    ],
    roles: ['admin'],
    sources: ['app/settings/audit.tsx'],
  },
];
