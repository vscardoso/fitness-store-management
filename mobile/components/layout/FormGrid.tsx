/**
 * Seções de formulário em duas colunas no PC (pedido do Victor, 2026-11-04).
 * No celular devolve os filhos como estão (nenhuma View a mais: a tela fica idêntica).
 * No PC cada seção (filho direto) ocupa meia largura; a última sobra de uma linha ímpar estica
 * para a largura toda. Botões de salvar/cancelar ficam FORA do FormGrid (largura toda).
 */
import { Children, ReactNode, isValidElement } from 'react';
import { View, StyleSheet } from 'react-native';
import { useIsDesktop } from '@/hooks/useLayout';

export default function FormGrid({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <>{children}</>;
  const items = Children.toArray(children).filter((c) => isValidElement(c));
  return (
    <View style={styles.grid}>
      {items.map((child, i) => (
        <View key={(child as any).key ?? i} style={styles.cell}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 16 },
  cell: { flexBasis: '45%', flexGrow: 1, minWidth: 0 },
});
