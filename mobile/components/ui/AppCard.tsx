/**
 * AppCard: o cartão padrão do app (fundo do cartão, borda fina, raio 16, respiro 16, espaço 12 entre os filhos).
 * Use no lugar de <View style={styles.card}> com números próprios em cada tela.
 *   <AppCard title="Pagamento" subtitle="Como a cliente pagou">...</AppCard>
 *   <AppCard tone="warning">...</AppCard>      aviso (fundo claro da cor do aviso)
 *   <AppCard flat>...</AppCard>                sem sombra (dentro de outro cartão ou de folha)
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Colors, theme } from '@/constants/Colors';
import SectionTitle from '@/components/ui/SectionTitle';

export type CardTone = 'default' | 'success' | 'warning' | 'error' | 'info';

const TONES: Record<CardTone, { bg: string; border: string }> = {
  default: { bg: Colors.light.card, border: Colors.light.border },
  success: { bg: Colors.light.successSoft, border: Colors.light.successLight },
  warning: { bg: Colors.light.warningLight, border: Colors.light.warning },
  error: { bg: Colors.light.errorSoft, border: Colors.light.errorLight },
  info: { bg: Colors.light.infoLight, border: Colors.light.info },
};

interface AppCardProps {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
  /** Elemento à direita do título (link, selo, botão pequeno). */
  action?: React.ReactNode;
  tone?: CardTone;
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function AppCard({ children, title, subtitle, action, tone = 'default', flat = false, style }: AppCardProps) {
  const t = TONES[tone];
  return (
    <View style={[styles.card, { backgroundColor: t.bg, borderColor: t.border }, !flat && tone === 'default' && theme.shadows.sm, style]}>
      {!!title && <SectionTitle title={title} subtitle={subtitle} action={action} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    gap: 12,
  },
});
