/**
 * KeyboardAwareScreen
 *
 * Componente reutilizavel para gerenciar o teclado em telas com formularios.
 *
 * Features:
 * - forwardRef + useImperativeHandle: expoe scrollToInput, registerInput, etc.
 * - iOS: automaticallyAdjustKeyboardInsets (nativo, sem conflito de KAV)
 * - Android: KeyboardAvoidingView behavior="height" com offset configuravel
 * - Padding bottom ajustavel para nao ocultar footer fixo
 *
 * Uso:
 *   const ref = useRef<KeyboardAwareScreenHandle>(null);
 *   <KeyboardAwareScreen ref={ref}>
 *     <TextInput
 *       ref={(r) => ref.current?.registerInput('campo', r)}
 *       onFocus={() => ref.current?.scrollToInput('campo')}
 *     />
 *   </KeyboardAwareScreen>
 */

import React, {
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  StyleSheet,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  findNodeHandle,
} from 'react-native';
import { Colors } from '@/constants/Colors';

// -----------------------------------------------------------------
// Types
// -----------------------------------------------------------------

export interface KeyboardAwareScreenHandle {
  /** Registra o ref de um TextInput pelo nome */
  registerInput: (key: string, ref: any) => void;
  /** Rola o ScrollView ate o input registrado */
  scrollToInput: (key: string) => void;
  /** Altura disponivel da janela */
  getAvailableHeight: () => number;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

interface KeyboardAwareScreenProps {
  /** Conteudo da tela */
  children: React.ReactNode;
  /** Espaco extra no bottom (para footer fixo, por exemplo) */
  bottomPadding?: number;
  /** Cor de fundo do scroll */
  backgroundColor?: string;
  /** Estilo adicional para o ScrollView */
  style?: any;
  /** Estilo adicional para o contentContainer */
  contentContainerStyle?: any;
  /**
   * Offset vertical do KAV (Android).
   * Deve ser a altura do header da tela, se houver.
   * @default 0
   */
  keyboardVerticalOffset?: number;
}

// -----------------------------------------------------------------
// Component
// -----------------------------------------------------------------

const KeyboardAwareScreen = forwardRef<KeyboardAwareScreenHandle, KeyboardAwareScreenProps>(
  function KeyboardAwareScreen(
    {
      children,
      bottomPadding = 140,
      backgroundColor = Colors.light.backgroundSecondary,
      style,
      contentContainerStyle,
      keyboardVerticalOffset = 0,
    },
    ref,
  ) {
    const scrollRef = useRef<ScrollView>(null);
    const inputRefs = useRef<Record<string, any>>({});

    const registerInput = useCallback((key: string, inputRef: any) => {
      if (inputRef) {
        inputRefs.current[key] = inputRef;
      }
    }, []);

    const scrollToInput = useCallback((key: string) => {
      const input = inputRefs.current[key];
      if (!input || !scrollRef.current) return;
      setTimeout(() => {
        const scrollNode = findNodeHandle(scrollRef.current);
        if (!scrollNode) return;
        input.measureLayout(
          scrollNode,
          (_x: number, y: number) => {
            scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
          },
          () => {},
        );
      }, 150);
    }, []);

    const scrollToTop = useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }, []);

    const scrollToBottom = useCallback(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, []);

    const getAvailableHeight = useCallback(() => {
      return Dimensions.get('window').height;
    }, []);

    useImperativeHandle(ref, () => ({
      registerInput,
      scrollToInput,
      scrollToTop,
      scrollToBottom,
      getAvailableHeight,
    }), [registerInput, scrollToInput, scrollToTop, scrollToBottom, getAvailableHeight]);

    return (
      // iOS: KAV desativado — automaticallyAdjustKeyboardInsets e suficiente e evita duplo ajuste.
      // Android: KAV com behavior="height" empurra o conteudo para cima ao abrir o teclado.
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardVerticalOffset}
        enabled={Platform.OS === 'android'}
      >
        <ScrollView
          ref={scrollRef}
          style={[styles.scrollView, style]}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomPadding },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  },
);

export default KeyboardAwareScreen;

// -----------------------------------------------------------------
// Styles
// -----------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
});