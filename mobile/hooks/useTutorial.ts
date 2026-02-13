/**
 * useTutorial Hook
 * Hook para facilitar o uso do sistema de tutorial em componentes
 */

import { useCallback, useRef, useEffect } from 'react';
import { View, LayoutChangeEvent, findNodeHandle, UIManager } from 'react-native';
import { useTutorialContext } from '@/contexts/TutorialContext';
import { TUTORIALS, Tutorial } from '@/constants/tutorials';

interface UseTutorialOptions {
  tutorialId: string;
}

interface TutorialRefRegistration {
  refId: string;
  ref: React.RefObject<View>;
}

export function useTutorial({ tutorialId }: UseTutorialOptions) {
  const context = useTutorialContext();
  const registeredRefs = useRef<Map<string, React.RefObject<View>>>(new Map());

  const {
    isActive,
    currentTutorialId,
    currentStepIndex,
    startTutorial,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    registerTarget,
    unregisterTarget,
    getCurrentTutorial,
    getCurrentStep,
    getProgress,
    isTutorialCompleted,
    targets,
  } = context;

  // Verificar se este tutorial está ativo
  const isThisTutorialActive = isActive && currentTutorialId === tutorialId;

  // Obter tutorial e step atuais
  const tutorial = isThisTutorialActive ? getCurrentTutorial() : null;
  const currentStep = isThisTutorialActive ? getCurrentStep() : null;
  const progress = isThisTutorialActive ? getProgress() : { current: 0, total: 0 };

  // Verificar se este tutorial foi completado
  const isCompleted = isTutorialCompleted(tutorialId);

  // Registrar uma ref para um elemento alvo
  const registerRef = useCallback((refId: string, ref: React.RefObject<View>) => {
    registeredRefs.current.set(refId, ref);
  }, []);

  // Medir elemento e registrar posição
  const measureAndRegister = useCallback((refId: string) => {
    const ref = registeredRefs.current.get(refId);
    if (!ref?.current) return;

    const handle = findNodeHandle(ref.current);
    if (handle) {
      UIManager.measure(handle, (x, y, width, height, pageX, pageY) => {
        if (width > 0 && height > 0) {
          registerTarget(refId, {
            x: pageX,
            y: pageY,
            width,
            height,
          });
        }
      });
    }
  }, [registerTarget]);

  // Medir todos os elementos registrados
  const measureAllTargets = useCallback(() => {
    registeredRefs.current.forEach((_, refId) => {
      measureAndRegister(refId);
    });
  }, [measureAndRegister]);

  // Medir quando o tutorial fica ativo ou muda de step
  useEffect(() => {
    if (isThisTutorialActive && currentStep?.targetRef) {
      // Pequeno delay para garantir que o layout está pronto
      const timer = setTimeout(() => {
        measureAndRegister(currentStep.targetRef!);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isThisTutorialActive, currentStep?.targetRef, measureAndRegister]);

  // Limpar registros ao desmontar
  useEffect(() => {
    return () => {
      registeredRefs.current.forEach((_, refId) => {
        unregisterTarget(refId);
      });
      registeredRefs.current.clear();
    };
  }, [unregisterTarget]);

  // Iniciar este tutorial
  const start = useCallback(() => {
    startTutorial(tutorialId);
  }, [startTutorial, tutorialId]);

  // Obter medições do elemento alvo atual
  const getCurrentTargetMeasurements = useCallback(() => {
    if (!currentStep?.targetRef) return undefined;
    return targets[currentStep.targetRef];
  }, [currentStep?.targetRef, targets]);

  return {
    // Estado
    isActive: isThisTutorialActive,
    isCompleted,
    tutorial,
    currentStep,
    progress,
    currentStepIndex: isThisTutorialActive ? currentStepIndex : -1,

    // Ações
    start,
    next: nextStep,
    previous: previousStep,
    skip: skipTutorial,
    complete: completeTutorial,

    // Registro de elementos
    registerRef,
    measureAllTargets,
    measureAndRegister,

    // Medições
    getCurrentTargetMeasurements,
    targets,
  };
}

/**
 * Hook para criar uma ref que se auto-registra no sistema de tutorial
 */
export function useTutorialRef(refId: string) {
  const ref = useRef<View>(null);
  const { registerTarget, unregisterTarget } = useTutorialContext();

  const measure = useCallback(() => {
    if (!ref.current) return;

    const handle = findNodeHandle(ref.current);
    if (handle) {
      UIManager.measure(handle, (x, y, width, height, pageX, pageY) => {
        if (width > 0 && height > 0) {
          registerTarget(refId, {
            x: pageX,
            y: pageY,
            width,
            height,
          });
        }
      });
    }
  }, [refId, registerTarget]);

  // Medir ao montar e quando ref muda
  useEffect(() => {
    const timer = setTimeout(measure, 100);
    return () => clearTimeout(timer);
  }, [measure]);

  // Limpar ao desmontar
  useEffect(() => {
    return () => {
      unregisterTarget(refId);
    };
  }, [refId, unregisterTarget]);

  return { ref, measure };
}

export default useTutorial;
