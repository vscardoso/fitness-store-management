/**
 * TutorialContext
 * Gerencia o estado global do sistema de tutorial interativo
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TUTORIAL_STORAGE_KEYS, TUTORIALS, TutorialStep, Tutorial } from '@/constants/tutorials';

// Tipos
interface TutorialTarget {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TutorialState {
  // Estado do tutorial atual
  isActive: boolean;
  currentTutorialId: string | null;
  currentStepIndex: number;

  // Progresso salvo
  completedTutorials: string[];
  welcomeShown: boolean;
  tutorialDismissed: boolean;

  // Medições dos elementos alvo
  targets: Record<string, TutorialTarget>;
}

interface TutorialContextValue extends TutorialState {
  // Ações
  startTutorial: (tutorialId: string) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
  resetTutorial: (tutorialId: string) => void;
  resetAllTutorials: () => void;

  // Registro de elementos
  registerTarget: (refId: string, measurements: TutorialTarget) => void;
  unregisterTarget: (refId: string) => void;

  // Estado do welcome modal
  showWelcome: () => void;
  dismissWelcome: () => void;
  setWelcomeShown: () => void;

  // Getters
  getCurrentTutorial: () => Tutorial | null;
  getCurrentStep: () => TutorialStep | null;
  getProgress: () => { current: number; total: number };
  isTutorialCompleted: (tutorialId: string) => boolean;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

interface TutorialProviderProps {
  children: ReactNode;
}

export function TutorialProvider({ children }: TutorialProviderProps) {
  const [state, setState] = useState<TutorialState>({
    isActive: false,
    currentTutorialId: null,
    currentStepIndex: 0,
    completedTutorials: [],
    welcomeShown: false,
    tutorialDismissed: false,
    targets: {},
  });

  const [isWelcomeVisible, setIsWelcomeVisible] = useState(false);

  // Carregar estado do AsyncStorage
  useEffect(() => {
    loadStoredState();
  }, []);

  const loadStoredState = async () => {
    try {
      const [completed, welcomeShown, dismissed] = await Promise.all([
        AsyncStorage.getItem(TUTORIAL_STORAGE_KEYS.COMPLETED),
        AsyncStorage.getItem(TUTORIAL_STORAGE_KEYS.WELCOME_SHOWN),
        AsyncStorage.getItem(TUTORIAL_STORAGE_KEYS.DISMISSED),
      ]);

      setState(prev => ({
        ...prev,
        completedTutorials: completed ? JSON.parse(completed) : [],
        welcomeShown: welcomeShown === 'true',
        tutorialDismissed: dismissed === 'true',
      }));

      // Se nunca mostrou o welcome, mostrar agora
      if (welcomeShown !== 'true' && dismissed !== 'true') {
        // Delay para garantir que o app carregou
        setTimeout(() => {
          setIsWelcomeVisible(true);
        }, 1000);
      }
    } catch (error) {
      console.error('Erro ao carregar estado do tutorial:', error);
    }
  };

  // Salvar tutorial completado
  const saveCompletedTutorial = async (tutorialId: string) => {
    try {
      const newCompleted = [...state.completedTutorials, tutorialId];
      await AsyncStorage.setItem(
        TUTORIAL_STORAGE_KEYS.COMPLETED,
        JSON.stringify(newCompleted)
      );
      setState(prev => ({
        ...prev,
        completedTutorials: newCompleted,
      }));
    } catch (error) {
      console.error('Erro ao salvar tutorial completado:', error);
    }
  };

  // Iniciar tutorial
  const startTutorial = useCallback((tutorialId: string) => {
    const tutorial = TUTORIALS[tutorialId];
    if (!tutorial) {
      console.warn(`Tutorial "${tutorialId}" não encontrado`);
      return;
    }

    setState(prev => ({
      ...prev,
      isActive: true,
      currentTutorialId: tutorialId,
      currentStepIndex: 0,
    }));
  }, []);

  // Próximo passo
  const nextStep = useCallback(() => {
    setState(prev => {
      const tutorial = prev.currentTutorialId ? TUTORIALS[prev.currentTutorialId] : null;
      if (!tutorial) return prev;

      const nextIndex = prev.currentStepIndex + 1;

      // Se chegou ao fim, completar
      if (nextIndex >= tutorial.steps.length) {
        saveCompletedTutorial(prev.currentTutorialId!);
        return {
          ...prev,
          isActive: false,
          currentTutorialId: null,
          currentStepIndex: 0,
        };
      }

      return {
        ...prev,
        currentStepIndex: nextIndex,
      };
    });
  }, []);

  // Passo anterior
  const previousStep = useCallback(() => {
    setState(prev => {
      if (prev.currentStepIndex > 0) {
        return {
          ...prev,
          currentStepIndex: prev.currentStepIndex - 1,
        };
      }
      return prev;
    });
  }, []);

  // Pular tutorial
  const skipTutorial = useCallback(() => {
    setState(prev => ({
      ...prev,
      isActive: false,
      currentTutorialId: null,
      currentStepIndex: 0,
    }));
  }, []);

  // Completar tutorial
  const completeTutorial = useCallback(() => {
    setState(prev => {
      if (prev.currentTutorialId) {
        saveCompletedTutorial(prev.currentTutorialId);
      }
      return {
        ...prev,
        isActive: false,
        currentTutorialId: null,
        currentStepIndex: 0,
      };
    });
  }, []);

  // Resetar um tutorial específico
  const resetTutorial = useCallback(async (tutorialId: string) => {
    try {
      const newCompleted = state.completedTutorials.filter(id => id !== tutorialId);
      await AsyncStorage.setItem(
        TUTORIAL_STORAGE_KEYS.COMPLETED,
        JSON.stringify(newCompleted)
      );
      setState(prev => ({
        ...prev,
        completedTutorials: newCompleted,
      }));
    } catch (error) {
      console.error('Erro ao resetar tutorial:', error);
    }
  }, [state.completedTutorials]);

  // Resetar todos os tutoriais
  const resetAllTutorials = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(TUTORIAL_STORAGE_KEYS.COMPLETED),
        AsyncStorage.removeItem(TUTORIAL_STORAGE_KEYS.WELCOME_SHOWN),
        AsyncStorage.removeItem(TUTORIAL_STORAGE_KEYS.DISMISSED),
      ]);
      setState(prev => ({
        ...prev,
        completedTutorials: [],
        welcomeShown: false,
        tutorialDismissed: false,
        isActive: false,
        currentTutorialId: null,
        currentStepIndex: 0,
      }));
    } catch (error) {
      console.error('Erro ao resetar tutoriais:', error);
    }
  }, []);

  // Registrar elemento alvo
  const registerTarget = useCallback((refId: string, measurements: TutorialTarget) => {
    setState(prev => ({
      ...prev,
      targets: {
        ...prev.targets,
        [refId]: measurements,
      },
    }));
  }, []);

  // Remover registro de elemento
  const unregisterTarget = useCallback((refId: string) => {
    setState(prev => {
      const { [refId]: _, ...rest } = prev.targets;
      return {
        ...prev,
        targets: rest,
      };
    });
  }, []);

  // Mostrar welcome modal
  const showWelcome = useCallback(() => {
    setIsWelcomeVisible(true);
  }, []);

  // Dispensar welcome modal
  const dismissWelcome = useCallback(async () => {
    setIsWelcomeVisible(false);
    try {
      await AsyncStorage.setItem(TUTORIAL_STORAGE_KEYS.DISMISSED, 'true');
      setState(prev => ({
        ...prev,
        tutorialDismissed: true,
      }));
    } catch (error) {
      console.error('Erro ao salvar dismissal:', error);
    }
  }, []);

  // Marcar welcome como mostrado
  const setWelcomeShown = useCallback(async () => {
    setIsWelcomeVisible(false);
    try {
      await AsyncStorage.setItem(TUTORIAL_STORAGE_KEYS.WELCOME_SHOWN, 'true');
      setState(prev => ({
        ...prev,
        welcomeShown: true,
      }));
    } catch (error) {
      console.error('Erro ao salvar welcome shown:', error);
    }
  }, []);

  // Getters
  const getCurrentTutorial = useCallback((): Tutorial | null => {
    if (!state.currentTutorialId) return null;
    return TUTORIALS[state.currentTutorialId] || null;
  }, [state.currentTutorialId]);

  const getCurrentStep = useCallback((): TutorialStep | null => {
    const tutorial = getCurrentTutorial();
    if (!tutorial) return null;
    return tutorial.steps[state.currentStepIndex] || null;
  }, [getCurrentTutorial, state.currentStepIndex]);

  const getProgress = useCallback(() => {
    const tutorial = getCurrentTutorial();
    return {
      current: state.currentStepIndex + 1,
      total: tutorial?.steps.length || 0,
    };
  }, [getCurrentTutorial, state.currentStepIndex]);

  const isTutorialCompleted = useCallback((tutorialId: string) => {
    return state.completedTutorials.includes(tutorialId);
  }, [state.completedTutorials]);

  const value: TutorialContextValue = {
    ...state,
    isActive: state.isActive,
    startTutorial,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    resetTutorial,
    resetAllTutorials,
    registerTarget,
    unregisterTarget,
    showWelcome,
    dismissWelcome,
    setWelcomeShown,
    getCurrentTutorial,
    getCurrentStep,
    getProgress,
    isTutorialCompleted,
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorialContext() {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorialContext deve ser usado dentro de TutorialProvider');
  }
  return context;
}

export default TutorialContext;
