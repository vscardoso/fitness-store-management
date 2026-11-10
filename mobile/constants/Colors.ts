/**
 * Tema de cores e design tokens do app
 * Suporta modo claro e escuro
 */

const tintColorLight = '#667eea';
const tintColorDark = '#764ba2';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    backgroundSecondary: '#F8F9FA',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: tintColorLight,
    border: '#E5E7EB',
    card: '#fff',
    error: '#EF4444',
    errorLight: '#FEE2E2',
    success: '#10B981',
    successLight: '#D1FAE5',
    warning: '#F59E0B',
    warningLight: '#FEF3C7',
    info: '#3B82F6',
    infoLight: '#DBEAFE',
    primary: '#7C3AED',      // violeta Provador (constants/Brand.ts)
    primaryLight: '#EDE9FE',
    secondary: '#DB2777',    // magenta Provador
    secondaryLight: '#FCE7F3',
    // Novos tokens
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    divider: '#E5E7EB',
    overlay: 'rgba(0, 0, 0, 0.5)',
    ripple: 'rgba(102, 126, 234, 0.12)',
    // Tons de apoio (padrão visual, 2026-11-09): usar estes nomes, nunca o hexadecimal solto
    white: '#fff',
    black: '#000',
    onPrimary: '#fff',        // texto e ícone sobre a cor da loja
    surfaceMuted: '#F3F4F6',  // fundo cinza claro (chip, campo desligado)
    surfaceSoft: '#F9FAFB',
    textStrong: '#1F2937',
    successSoft: '#ECFDF5',
    successDark: '#047857',
    warningDark: '#B45309',
    warningDarker: '#92400E',
    errorSoft: '#FEF2F2',
    errorDark: '#B91C1C',
  },
  dark: {
    text: '#F9FAFB',
    background: '#111827',
    backgroundSecondary: '#1F2937',
    tint: tintColorDark,
    icon: '#9CA3AF',
    tabIconDefault: '#6B7280',
    tabIconSelected: tintColorDark,
    border: '#374151',
    card: '#1F2937',
    error: '#EF4444',
    errorLight: '#7F1D1D',
    success: '#10B981',
    successLight: '#064E3B',
    warning: '#F59E0B',
    warningLight: '#78350F',
    info: '#3B82F6',
    infoLight: '#1E3A8A',
    primary: '#A78BFA',
    primaryLight: '#4C1D95',
    secondary: '#F472B6',
    secondaryLight: '#831843',
    // Novos tokens
    textSecondary: '#9CA3AF',
    textTertiary: '#6B7280',
    divider: '#374151',
    overlay: 'rgba(0, 0, 0, 0.7)',
    ripple: 'rgba(129, 140, 248, 0.12)',
    white: '#fff',
    black: '#000',
    onPrimary: '#fff',
    surfaceMuted: '#374151',
    surfaceSoft: '#1F2937',
    textStrong: '#F9FAFB',
    successSoft: '#064E3B',
    successDark: '#6EE7B7',
    warningDark: '#FCD34D',
    warningDarker: '#FDE68A',
    errorSoft: '#7F1D1D',
    errorDark: '#FCA5A5',
  },
};

export const theme = {
  colors: Colors.light,
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 24,
    full: 9999,
  },
  fontSize: {
    xxs: 10,
    xs: 11,
    sm: 12,
    md: 14,
    base: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  elevation: {
    xs: 1,
    sm: 2,
    md: 4,
    lg: 8,
    xl: 12,
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 8,
    },
  },
} as const;

/**
 * Cores semânticas para campos de valor — padrão único do app.
 * NÃO usar branding primary para valores financeiros.
 *
 * neutro  → fato sem julgamento (preço, quantidade, estoque)
 * positivo → receita, lucro, margem ↑, tendência boa
 * negativo → custo, prejuízo, margem ↓, estoque baixo
 */
export const VALUE_COLORS = {
  positive: '#10B981',   // verde — receita, lucro
  negative: '#EF4444',   // vermelho — custo, prejuízo
  neutral:  '#11181C',   // texto escuro — valores sem julgamento
  warning:  '#F59E0B',   // laranja — atenção (estoque baixo, prazo)
} as const;

export type ValueColorType = keyof typeof VALUE_COLORS;

/**
 * Cores do app no notebook (PDV de balcão e tabela de vendas): cinzas com um toque de violeta, mesmo visual de antes,
 * agora com nome. Em tela nova de notebook usar estes, não hexadecimal solto.
 */
export const DESK = {
  ink: '#160F28',          // texto principal
  muted: '#5B5670',        // texto secundário
  faint: '#8A839E',        // placeholder e ícone apagado
  fainter: '#9A93AD',      // ícone ainda mais apagado
  line: '#E6E3EE',         // linha divisória
  softLine: '#F0EDF5',     // linha divisória fraca
  border: '#E0DBEA',       // contorno de campo e chip
  borderStrong: '#CFC8DE', // contorno de campo desligado
  screen: '#F6F5FA',       // fundo da tela
  surfaceAlt: '#FBFAFD',   // fundo de cartão interno
  surfaceHover: '#F7F6FA', // fundo de linha sob o cursor
  track: '#ECEAF2',        // trilho e botão neutro
  okText: '#065F46',       // texto de confirmação
  okBorder: '#A7F3D0',     // contorno de confirmação
  noteBg: '#FFFBEB',       // fundo de aviso
  noteBorder: '#FDE68A',   // contorno de aviso
  danger: '#B4235C',       // ação de risco
} as const;

/** Cor do selo de venda devolvida (roxo), igual em lista, tabela e detalhe da venda. */
export const REFUNDED_COLOR = '#7B1FA2';

// Paletas de branding pré-definidas
export const PRESET_THEMES = [
  { name: 'Provador',       primary: '#7C3AED', secondary: '#DB2777', accent: '#10B981' },
  { name: 'Azul Oceano',    primary: '#0EA5E9', secondary: '#0284C7', accent: '#F59E0B' },
  { name: 'Verde Fitness',  primary: '#10B981', secondary: '#059669', accent: '#7C3AED' },
  { name: 'Laranja Energia',primary: '#F97316', secondary: '#EA580C', accent: '#0EA5E9' },
  { name: 'Rosa Vibrante',  primary: '#EC4899', secondary: '#DB2777', accent: '#8B5CF6' },
  { name: 'Cinza Neutro',   primary: '#374151', secondary: '#1F2937', accent: '#7C3AED' },
] as const;
