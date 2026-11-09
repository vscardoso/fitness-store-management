/**
 * ScreenLoader: O carregamento de tela do app (padrão único). Use sempre este, nunca um <ActivityIndicator> solto,
 * para carregar uma tela, lista ou seção.
 *
 *   <ScreenLoader />                              tela inteira (preenche e centraliza), logo grande
 *   <ScreenLoader message="Carregando vendas..." /> com texto embaixo
 *   <ScreenLoader inline />                       dentro de uma lista/seção: mesmo logo, sem ocupar a tela toda
 *   <ScreenLoader compact />                      dentro de um cartão pequeno: logo menor
 *
 * Sempre no degradê da loja (não passe cor). Botão que está salvando continua usando <ActivityIndicator size="small">.
 */
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { Text } from 'react-native-paper';
import { MagnifierLoader } from '@/components/ui/MagnifierLoader';
import { Colors } from '@/constants/Colors';

interface Props {
  message?: string;
  /** Dentro de lista ou seção: não ocupa a tela inteira */
  inline?: boolean;
  /** Dentro de cartão pequeno: logo menor */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

const FULL = 124;
const COMPACT = 72;

export default function ScreenLoader({ message, inline = false, compact = false, style }: Props) {
  return (
    <View style={[inline || compact ? styles.inline : styles.full, compact && styles.compact, style]}>
      <MagnifierLoader size={compact ? COMPACT : FULL} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 4 },
  inline: { alignItems: 'center', justifyContent: 'center', paddingVertical: 72, gap: 4 },
  compact: { paddingVertical: 12 },
  message: { fontSize: 14, color: Colors.light.textSecondary, textAlign: 'center' },
});
