/**
 * Rotas sem ficha de ajuda, conferidas por scripts/test-help-coverage.mts: toda rota de app/ precisa de ficha ou estar aqui.
 */

/** Nunca têm ficha: antes do login, páginas legais, vitrine pública, redirecionamentos e telas de desenvolvimento. */
export const HELP_EXCLUDED: Record<string, string> = {
  '/login': 'antes do login',
  '/signup': 'antes do login',
  '/create-store': 'antes do login',
  '/forgot-password': 'antes do login',
  '/onboarding': 'apresentação antes do login',
  '/termos': 'página legal',
  '/privacidade': 'página legal',
  '/aceite-termos': 'página legal',
  '/produtos/[id]': 'vitrine pública para a cliente',
  '/[...rest]': 'página não encontrada',
  '/catalog': 'redireciona para Produtos',
  '/products/add': 'redireciona para o assistente',
  '/products/incomplete': 'redireciona para Produtos',
  '/products/qrcode/[id]': 'redireciona para Etiquetas',
  '/loading-demo': 'desenvolvimento',
  '/test-notification': 'desenvolvimento',
};

/** Funcionalidades desligadas em constants/features.ts ou sem uso até haver impressora: ganham ficha quando ligarem. */
export const HELP_HIDDEN: Record<string, string> = {
  '/looks': 'lookbook',
  '/looks/[id]': 'lookbook',
  '/looks/builder': 'lookbook',
  '/wishlist': 'wishlist',
  '/demand': 'wishlist',
  '/pdv': 'maquininhas / pixIntegrado',
  '/pdv/pix-checkout': 'pixIntegrado',
  '/pdv/terminal-checkout': 'maquininhas',
  '/pdv/terminals': 'maquininhas',
  '/settings/pix-key': 'pixIntegrado',
  '/settings/printers': 'impressora',
  '/settings/printers/new': 'impressora',
  '/labels': 'impressora',
  '/labels/queue': 'impressora',
};

/** Fichas das próximas fases (docs/PLANO_AJUDA.md). A lista encolhe a cada fase e some na fase 4. */
export const HELP_PENDING: Record<string, string> = {
  '/products': 'estoque', '/products/wizard': 'estoque', '/products/[id]': 'estoque', '/products/edit/[id]': 'estoque',
  '/products/photos/[id]': 'estoque', '/products/consult': 'estoque', '/products/scan': 'estoque',
  '/products/label': 'estoque', '/products/label/[id]': 'estoque',
  '/entries': 'estoque', '/entries/add': 'estoque', '/entries/add-stock': 'estoque', '/entries/[id]': 'estoque',
  '/entries/check/[id]': 'estoque', '/entries/import': 'estoque',
  '/categories': 'estoque', '/categories/add': 'estoque', '/categories/edit/[id]': 'estoque', '/inventory': 'estoque',
  '/stock-losses': 'estoque', '/stock-losses/register': 'estoque', '/stock-losses/[id]': 'estoque',
  '/suppliers': 'estoque', '/suppliers/[id]': 'estoque', '/suppliers/ranking': 'estoque', '/suppliers/costs': 'estoque',
  '/suppliers/restock': 'estoque', '/suppliers/returns': 'estoque',
  '/trips': 'estoque', '/trips/add': 'estoque', '/trips/[id]': 'estoque',
  '/customers': 'clientes', '/customers/add': 'clientes', '/customers/[id]': 'clientes', '/customers/edit/[id]': 'clientes',
  '/finance': 'dinheiro', '/finance/setup': 'dinheiro', '/finance/payables': 'dinheiro', '/expenses': 'dinheiro',
  '/expenses/create': 'dinheiro', '/expenses/edit': 'dinheiro', '/expenses/resultado': 'dinheiro',
  '/settings/payment-discounts': 'dinheiro',
  '/reports': 'relatorios', '/reports/sales': 'relatorios', '/reports/sales-period': 'relatorios',
  '/reports/top-products': 'relatorios', '/reports/lots': 'relatorios', '/reports/history': 'relatorios',
  '/reports/stock-check': 'relatorios', '/reports/stock-counts': 'relatorios', '/reports/stock-counts/[id]': 'relatorios',
  '/whatsapp': 'whatsapp', '/whatsapp/[id]': 'whatsapp', '/settings/whatsapp-profile': 'whatsapp',
  '/settings/whatsapp-hours': 'whatsapp', '/settings/whatsapp-greeting': 'whatsapp', '/settings/whatsapp-catalog': 'whatsapp',
  '/settings/whatsapp-quick-replies': 'whatsapp', '/settings/whatsapp-labels': 'whatsapp',
  '/more': 'loja', '/settings/branding': 'loja', '/team': 'loja', '/team/add': 'loja', '/team/[id]': 'loja',
  '/settings/returns': 'loja', '/notifications': 'loja', '/help': 'loja',
};
