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
    primary: '#667eea',
    primaryLight: '#E0E7FF',
    secondary: '#764ba2',
    secondaryLight: '#F3E8FF',
    // Novos tokens
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    divider: '#E5E7EB',
    overlay: 'rgba(0, 0, 0, 0.5)',
    ripple: 'rgba(102, 126, 234, 0.12)',
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
    primary: '#818CF8',
    primaryLight: '#312E81',
    secondary: '#A78BFA',
    secondaryLight: '#4C1D95',
    // Novos tokens
    textSecondary: '#9CA3AF',
    textTertiary: '#6B7280',
    divider: '#374151',
    overlay: 'rgba(0, 0, 0, 0.7)',
    ripple: 'rgba(129, 140, 248, 0.12)',
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

// Paletas de branding pré-definidas
export const PRESET_THEMES = [
  { name: 'Roxo Padrão',    primary: '#667eea', secondary: '#764ba2', accent: '#10B981' },
  { name: 'Azul Oceano',    primary: '#0EA5E9', secondary: '#0284C7', accent: '#F59E0B' },
  { name: 'Verde Fitness',  primary: '#10B981', secondary: '#059669', accent: '#667eea' },
  { name: 'Laranja Energia',primary: '#F97316', secondary: '#EA580C', accent: '#0EA5E9' },
  { name: 'Rosa Vibrante',  primary: '#EC4899', secondary: '#DB2777', accent: '#8B5CF6' },
  { name: 'Cinza Neutro',   primary: '#374151', secondary: '#1F2937', accent: '#667eea' },
] as const;
