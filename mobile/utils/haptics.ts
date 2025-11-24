import * as Haptics from 'expo-haptics';

/**
 * Utilitários para feedback háptico
 * Melhora a experiência do usuário com vibrações sutis
 */

export const haptics = {
  /**
   * Feedback leve - Para ações simples como selecionar items
   */
  light: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  /**
   * Feedback médio - Para ações importantes como adicionar ao carrinho
   */
  medium: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },

  /**
   * Feedback pesado - Para ações críticas como confirmar venda
   */
  heavy: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },

  /**
   * Feedback de sucesso - Para operações bem-sucedidas
   */
  success: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  /**
   * Feedback de aviso - Para alertas e avisos
   */
  warning: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },

  /**
   * Feedback de erro - Para erros e falhas
   */
  error: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  /**
   * Feedback de seleção - Para mudanças de seleção/toggle
   */
  selection: () => {
    Haptics.selectionAsync();
  },
};
