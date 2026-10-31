/**
 * Chaves de funcionalidade: o que ainda não está no ar ou não está completo fica FALSO e some do menu e das rotas.
 * Para liberar uma, troque para true aqui (ou, só para testar, EXPO_PUBLIC_FEATURES=lookbook,wishlist no build).
 * Menu novo de fase 2 nasce falso e só vira true depois de testado de ponta a ponta.
 */
const DEFAULTS = {
  /** Lookbook (montar e vender looks). Fase A feita; envio pelo WhatsApp (fase B) não existe; nunca clicado em aparelho. */
  lookbook: false,
  /** Demanda da wishlist (produtos mais desejados). Depende do Lookbook e da lista de desejos; não está no ar. */
  wishlist: false,
  /** Maquininha integrada (Cielo, Stone, Mercado Pago Point). Sem teste com maquininha real e com credenciais recusadas. Cartão fica como registro manual. */
  maquininhas: false,
  /** PIX integrado (QR gerado pelo servidor, provedor MP ou Cielo, chave PIX, confirmação automática). Nada disso foi validado com PIX real. */
  pixIntegrado: false,
  /** Meu Perfil: a tela não existe, só mostrava "em breve". */
  meuPerfil: false,
} as const;

export type FeatureKey = keyof typeof DEFAULTS;

const fromEnv = new Set<string>(
  (process.env.EXPO_PUBLIC_FEATURES || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean),
);

export const FEATURES: Record<FeatureKey, boolean> = Object.fromEntries(
  (Object.keys(DEFAULTS) as FeatureKey[]).map((k) => [k, DEFAULTS[k] || fromEnv.has(k)]),
) as Record<FeatureKey, boolean>;

/** Pagamentos pendentes só existem com PIX integrado ou maquininha. */
export const temPagamentoIntegrado = (): boolean => FEATURES.pixIntegrado || FEATURES.maquininhas;

export const isFeatureOn = (k: FeatureKey): boolean => FEATURES[k];
