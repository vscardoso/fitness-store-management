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
  '/exclusao-de-dados': 'página legal',
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
  '/whatsapp': 'whatsapp', '/whatsapp/[id]': 'whatsapp', '/settings/whatsapp-profile': 'whatsapp',
  '/settings/whatsapp-hours': 'whatsapp', '/settings/whatsapp-greeting': 'whatsapp', '/settings/whatsapp-connect': 'whatsapp', '/settings/whatsapp-catalog': 'whatsapp',
  '/settings/whatsapp-quick-replies': 'whatsapp', '/settings/whatsapp-labels': 'whatsapp',
  '/more': 'loja', '/settings/branding': 'loja', '/team': 'loja', '/team/add': 'loja', '/team/[id]': 'loja',
  '/settings/returns': 'loja', '/settings/loyalty': 'loja', '/notifications': 'loja', '/help': 'loja',
};
