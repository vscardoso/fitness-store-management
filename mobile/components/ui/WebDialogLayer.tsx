/**
 * Camada de diálogo para o app web: janela própria do navegador (RN Modal) com fundo escuro, SEMPRE por cima de qualquer
 * folha ou janela aberta atrás. O Portal do Paper fica no fim da árvore do app: dentro de uma folha, o diálogo saía
 * cortado pelo cabeçalho dela e, em alguns casos, ficava escondido atrás. Use só na web (no celular nativo, o Portal serve).
 */
import React from 'react';
import { Modal as RNModal, Pressable, StyleSheet } from 'react-native';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Largura máxima do cartão (px) */
  maxWidth?: number;
}

export default function WebDialogLayer({ visible, onDismiss, children, maxWidth = 460 }: Props) {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.wrap, { maxWidth }]} onPress={(e: any) => e?.stopPropagation?.()}>
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  wrap: { width: '100%' },
});
