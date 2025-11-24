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
  },
  elevation: {
    xs: 1,
    sm: 2,
    md: 4,
    lg: 8,
    xl: 12,
  },
} as const;
