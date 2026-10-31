/**
 * Design tokens complementares ao theme de Colors.ts
 * Valores reutilizáveis que padronizam badges, ícones e animações.
 */

import { Colors } from './Colors';

export const BADGE = {
  sm: { fontSize: 10, paddingH: 6,  paddingV: 2, borderRadius: 8  },
  md: { fontSize: 12, paddingH: 8,  paddingV: 4, borderRadius: 10 },
  lg: { fontSize: 14, paddingH: 12, paddingV: 6, borderRadius: 12 },
} as const;

export const ICON_SIZE = {
  xs:   14,
  sm:   18,
  md:   24,
  lg:   32,
  xl:   48,
  hero: 80,
} as const;

export const ANIMATION = {
  fast:     150,
  normal:   250,
  slow:     400,
  skeleton: 1000,
} as const;

export const HIT_SLOP = {
  sm: { top: 4,  bottom: 4,  left: 4,  right: 4  },
  md: { top: 8,  bottom: 8,  left: 8,  right: 8  },
  lg: { top: 12, bottom: 12, left: 12, right: 12 },
} as const;

/**
 * Sistema de botões padronizado.
 *
 * TAMANHOS (height + padding):
 *   sm  → h32  | chips, filtros inline, ações compactas
 *   md  → h44  | botão padrão (CTA secundário, ações de lista)
 *   lg  → h52  | CTA principal, botões de tela cheia
 *
 * VARIANTES (visual):
 *   primary        → gradiente da loja (brandingColors)
 *   secondary      → fundo leve primary + borda
 *   outlined       → borda primary, fundo transparente
 *   ghost          → sem borda, fundo muito sutil ao pressionar
 *   danger         → vermelho sólido
 *   danger-outline → borda vermelha, fundo transparente
 *   text           → sem fundo/borda, apenas texto colorido
 *
 * USO:
 *   <AppButton variant="primary" size="lg" label="Confirmar" onPress={...} />
 *   <AppButton variant="outlined" size="md" label="Cancelar" onPress={...} />
 *   <AppButton variant="ghost" size="sm" icon="pencil" iconOnly onPress={...} />
 */
export const BUTTON = {
  size: {
    sm: { height: 32, paddingH: 12, paddingV: 6,  fontSize: 12, iconSize: 14, borderRadius: 8,  gap: 4  },
    md: { height: 44, paddingH: 16, paddingV: 10, fontSize: 14, iconSize: 18, borderRadius: 10, gap: 6  },
    lg: { height: 52, paddingH: 20, paddingV: 14, fontSize: 16, iconSize: 20, borderRadius: 12, gap: 8  },
  },
  // borderRadius separado — para quando precisa apenas do raio sem o tamanho completo
  radius: {
    sm: 8,
    md: 10,
    lg: 12,
    full: 9999,
  },
} as const;

export type ButtonSize    = keyof typeof BUTTON.size;
export type ButtonVariant = 'primary' | 'secondary' | 'outlined' | 'ghost' | 'danger' | 'danger-outline' | 'text';


/**
 * Tokens da caixa de conversas (WhatsApp da loja), em claro e escuro. Todos derivam da paleta do Provador em
 * Colors.ts: nenhuma cor nova solta nos componentes. Use `useChatColors()` (hooks/useThemeColors.ts).
 */
const chatScheme = (c: typeof Colors.light) => ({
  background: c.backgroundSecondary,       // fundo da conversa e da lista
  surface: c.card,                         // cartões da lista, barra de resposta
  border: c.border,
  text: c.text,
  textMuted: c.textSecondary,
  bubbleOut: c.primary === Colors.light.primary ? c.primary : c.primaryLight,   // balão enviado
  bubbleOutText: c.primary === Colors.light.primary ? c.background : c.text,
  bubbleOutMuted: c.primary === Colors.light.primary ? c.primaryLight : c.textSecondary,
  bubbleIn: c.card,                        // balão recebido
  bubbleInText: c.text,
  bubbleInBorder: c.border,
  inputBg: c.backgroundSecondary,
  accent: c.primary,
  warning: c.warning,
  warningSoft: c.warningLight,
  danger: c.error,
  // etiquetas: chave do servidor -> fundo e texto
  label: {
    primary: { bg: c.primaryLight, fg: c.primary },
    secondary: { bg: c.secondaryLight, fg: c.secondary },
    success: { bg: c.successLight, fg: c.success },
    warning: { bg: c.warningLight, fg: c.warning },
    info: { bg: c.infoLight, fg: c.info },
    error: { bg: c.errorLight, fg: c.error },
  },
});

export const CHAT = { light: chatScheme(Colors.light), dark: chatScheme(Colors.dark) } as const;
export type ChatColors = typeof CHAT.light;
export const LABEL_COLOR_KEYS = ['primary', 'secondary', 'success', 'warning', 'info', 'error'] as const;
export type LabelColorKey = (typeof LABEL_COLOR_KEYS)[number];
