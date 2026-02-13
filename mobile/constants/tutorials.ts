/**
 * Definições dos tutoriais interativos
 * Cada tela tem seus passos de tutorial definidos aqui
 */

export type TutorialStepPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetRef?: string; // ID do elemento alvo (para spotlight)
  position?: TutorialStepPosition;
  highlightPadding?: number;
}

export interface Tutorial {
  id: string;
  name: string;
  description: string;
  icon: string;
  screen: string;
  steps: TutorialStep[];
}

// Storage keys
export const TUTORIAL_STORAGE_KEYS = {
  COMPLETED: '@fitness:tutorial_completed',
  PROGRESS: '@fitness:tutorial_progress',
  DISMISSED: '@fitness:tutorial_dismissed',
  WELCOME_SHOWN: '@fitness:welcome_tutorial_shown',
} as const;

// Cores do tutorial
export const TUTORIAL_COLORS = {
  background: 'rgba(0, 0, 0, 0.75)',
  tooltip: '#FFFFFF',
  accent: '#3B82F6',
  text: '#11181C',
  textSecondary: '#6B7280',
  arrow: '#FFFFFF',
  success: '#10B981',
} as const;

// Tutoriais por tela
export const TUTORIALS: Record<string, Tutorial> = {
  dashboard: {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Aprenda a usar o painel principal',
    icon: 'home',
    screen: '/(tabs)',
    steps: [
      {
        id: 'dashboard-welcome',
        title: 'Bem-vindo ao seu painel!',
        description: 'Este é seu centro de comando. Aqui você tem uma visão geral de tudo que acontece na sua loja.',
        position: 'bottom',
      },
      {
        id: 'dashboard-sales-today',
        title: 'Vendas do dia',
        description: 'Acompanhe o faturamento e número de vendas realizadas hoje. Toque para ver detalhes.',
        targetRef: 'main-card',
        position: 'bottom',
      },
      {
        id: 'dashboard-quick-actions',
        title: 'Ações rápidas',
        description: 'Acesse rapidamente as funções mais usadas: nova venda, produtos, clientes e mais.',
        targetRef: 'quick-actions',
        position: 'bottom',
      },
      {
        id: 'dashboard-stock',
        title: 'Seu estoque',
        description: 'Veja o valor investido, potencial de venda e lucro previsto do seu estoque atual.',
        targetRef: 'stock-card',
        position: 'top',
      },
    ],
  },

  sale: {
    id: 'sale',
    name: 'PDV (Vendas)',
    description: 'Aprenda a realizar vendas',
    icon: 'cart',
    screen: '/(tabs)/sale',
    steps: [
      {
        id: 'sale-welcome',
        title: 'Ponto de Venda',
        description: 'Aqui você realiza suas vendas de forma rápida e simples.',
        position: 'bottom',
      },
      {
        id: 'sale-customer',
        title: 'Selecione o cliente',
        description: 'Toque aqui para vincular a venda a um cliente. Clientes cadastrados acumulam pontos de fidelidade.',
        targetRef: 'customer-button',
        position: 'bottom',
      },
      {
        id: 'sale-add-product',
        title: 'Adicione produtos',
        description: 'Use o botão de busca ou escaneie o código de barras para adicionar produtos ao carrinho.',
        targetRef: 'add-product-button',
        position: 'bottom',
      },
      {
        id: 'sale-cart',
        title: 'Carrinho de compras',
        description: 'Aqui aparecem os produtos adicionados. Use os botões + e - para ajustar quantidades.',
        targetRef: 'cart-area',
        position: 'top',
      },
      {
        id: 'sale-finish',
        title: 'Finalize a venda',
        description: 'Quando estiver pronto, toque em Finalizar para escolher a forma de pagamento e concluir.',
        targetRef: 'finish-button',
        position: 'top',
      },
    ],
  },

  products: {
    id: 'products',
    name: 'Produtos',
    description: 'Aprenda a gerenciar produtos',
    icon: 'cube',
    screen: '/(tabs)/products',
    steps: [
      {
        id: 'products-welcome',
        title: 'Catálogo de produtos',
        description: 'Gerencie todos os produtos da sua loja em um só lugar.',
        position: 'bottom',
      },
      {
        id: 'products-search',
        title: 'Busca rápida',
        description: 'Digite o nome, código ou SKU do produto para encontrá-lo rapidamente.',
        targetRef: 'search-bar',
        position: 'bottom',
      },
      {
        id: 'products-filter',
        title: 'Filtros',
        description: 'Use os filtros para mostrar apenas produtos em estoque, por categoria ou ordenação.',
        targetRef: 'filter-chips',
        position: 'bottom',
      },
      {
        id: 'products-card',
        title: 'Detalhes do produto',
        description: 'Toque em qualquer produto para ver detalhes, editar informações ou ajustar estoque.',
        targetRef: 'product-card',
        position: 'bottom',
      },
      {
        id: 'products-fab',
        title: 'Novo produto',
        description: 'Toque no botão + para cadastrar um novo produto no sistema.',
        targetRef: 'fab-button',
        position: 'top',
      },
    ],
  },

  customers: {
    id: 'customers',
    name: 'Clientes',
    description: 'Aprenda a gerenciar clientes',
    icon: 'people',
    screen: '/(tabs)/customers',
    steps: [
      {
        id: 'customers-welcome',
        title: 'Gestão de clientes',
        description: 'Mantenha um cadastro organizado dos seus clientes e acompanhe o histórico de compras.',
        position: 'bottom',
      },
      {
        id: 'customers-search',
        title: 'Buscar cliente',
        description: 'Encontre clientes pelo nome, telefone ou documento.',
        targetRef: 'search-bar',
        position: 'bottom',
      },
      {
        id: 'customers-card',
        title: 'Ficha do cliente',
        description: 'Toque para ver detalhes completos, histórico de compras e pontos de fidelidade.',
        targetRef: 'customer-card',
        position: 'bottom',
      },
      {
        id: 'customers-fab',
        title: 'Novo cliente',
        description: 'Cadastre novos clientes tocando no botão +.',
        targetRef: 'fab-button',
        position: 'top',
      },
    ],
  },

  inventory: {
    id: 'inventory',
    name: 'Estoque',
    description: 'Aprenda a controlar o estoque',
    icon: 'archive',
    screen: '/(tabs)/inventory',
    steps: [
      {
        id: 'inventory-welcome',
        title: 'Controle de estoque',
        description: 'Tenha visão completa do seu inventário e controle todas as entradas e saídas.',
        position: 'bottom',
      },
      {
        id: 'inventory-kpis',
        title: 'Indicadores',
        description: 'Acompanhe os principais números: valor total, produtos cadastrados e alertas.',
        targetRef: 'kpi-cards',
        position: 'bottom',
      },
      {
        id: 'inventory-alerts',
        title: 'Alertas de estoque',
        description: 'Produtos abaixo do mínimo aparecem aqui. Fique atento para não perder vendas!',
        targetRef: 'alert-section',
        position: 'bottom',
      },
      {
        id: 'inventory-fab',
        title: 'Nova entrada',
        description: 'Registre compras e entradas de mercadorias tocando no botão +.',
        targetRef: 'fab-button',
        position: 'top',
      },
    ],
  },
};

// Lista de tutoriais para a tela de ajuda
export const TUTORIAL_LIST = Object.values(TUTORIALS);

// Função helper para obter tutorial por screen
export const getTutorialByScreen = (screen: string): Tutorial | undefined => {
  return Object.values(TUTORIALS).find(t => t.screen === screen || screen.includes(t.id));
};
