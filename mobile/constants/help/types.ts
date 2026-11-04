/**
 * Ficha de ajuda de uma tela. Regras de texto (docs/PLANO_AJUDA.md): frases curtas, palavras da lojista, sem travessão.
 * Nome de botão, aba ou campo vai entre aspas curvas “assim”: o teste scripts/test-help-labels.mts confere que o texto
 * existe nos arquivos de `sources` (botão renomeado sem atualizar a ajuda quebra o teste).
 */
export type HelpRole = 'cashier' | 'seller' | 'manager' | 'admin';

export type HelpGroupKey = 'vender' | 'estoque' | 'clientes' | 'whatsapp' | 'dinheiro' | 'relatorios' | 'loja';

export interface HelpEntry {
  /** Identificador estável da ficha */
  id: string;
  group: HelpGroupKey;
  /** Nome da tela igual ao do menu */
  title: string;
  /** Rotas (como o navegador mostra, sem os grupos do expo-router) que abrem esta ficha. Ex.: '/sales/[id]' */
  routes: string[];
  /** Para onde "Abrir esta tela" leva. Ausente quando a tela precisa de um item (ex.: detalhe da venda) */
  open?: string;
  /** Para que serve, em uma frase */
  purpose: string;
  /** Como fazer a tarefa principal (até 6 passos) */
  steps: string[];
  /** O que cada parte da tela mostra (até 6) */
  parts?: { label: string; text: string }[];
  /** O que o app faz sozinho e regras que pegam de surpresa (até 4) */
  goodToKnow?: string[];
  /** Diferenças só no notebook/web e só no celular (até 3 cada) */
  web?: string[];
  mobile?: string[];
  /** Quem vê a tela. Ausente = todos os papéis */
  roles?: HelpRole[];
  /** Ids de fichas ligadas (até 3) */
  related?: string[];
  /** Arquivos (relativos a mobile/) onde estão os textos citados entre aspas */
  sources: string[];
}

export interface HelpGroup {
  key: HelpGroupKey;
  title: string;
  icon: string;
}
