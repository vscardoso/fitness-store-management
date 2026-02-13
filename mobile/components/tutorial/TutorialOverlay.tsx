/**
 * TutorialOverlay
 * Componente que orquestra o sistema de tutorial
 * Renderiza o spotlight e tooltip quando um tutorial está ativo
 */

import React, { useEffect, useState } from 'react';
import { useTutorialContext } from '@/contexts/TutorialContext';
import { useAuthStore } from '@/store/authStore';
import { TutorialSpotlight } from './TutorialSpotlight';
import { TutorialTooltip } from './TutorialTooltip';
import { WelcomeTutorialModal } from './WelcomeTutorialModal';

export function TutorialOverlay() {
  const {
    isActive,
    currentStepIndex,
    targets,
    getCurrentTutorial,
    getCurrentStep,
    getProgress,
    nextStep,
    previousStep,
    skipTutorial,
    startTutorial,
    setWelcomeShown,
    dismissWelcome,
    welcomeShown,
    tutorialDismissed,
  } = useTutorialContext();

  const user = useAuthStore((state) => state.user);
  const [showWelcome, setShowWelcome] = useState(false);

  // Mostrar modal de boas-vindas para novos usuários
  useEffect(() => {
    if (user && !welcomeShown && !tutorialDismissed) {
      // Delay para o app carregar completamente
      const timer = setTimeout(() => {
        setShowWelcome(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [user, welcomeShown, tutorialDismissed]);

  const tutorial = getCurrentTutorial();
  const currentStep = getCurrentStep();
  const progress = getProgress();

  // Handler para iniciar tutorial a partir do welcome modal
  const handleStartTutorial = () => {
    setShowWelcome(false);
    setWelcomeShown();
    // Iniciar tutorial do dashboard
    setTimeout(() => {
      startTutorial('dashboard');
    }, 300);
  };

  // Handler para dispensar welcome modal
  const handleDismissWelcome = () => {
    setShowWelcome(false);
    dismissWelcome();
  };

  // Obter medições do elemento alvo atual
  const targetMeasurements = currentStep?.targetRef
    ? targets[currentStep.targetRef]
    : undefined;

  // Se não há tutorial ativo, mostrar apenas o welcome modal se necessário
  if (!isActive) {
    return (
      <WelcomeTutorialModal
        visible={showWelcome}
        onStartTutorial={handleStartTutorial}
        onDismiss={handleDismissWelcome}
        userName={user?.full_name?.split(' ')[0]}
      />
    );
  }

  // Se não há step atual, não renderizar nada
  if (!tutorial || !currentStep) {
    return null;
  }

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === tutorial.steps.length - 1;

  return (
    <>
      {/* Welcome Modal (quando não está em tutorial) */}
      <WelcomeTutorialModal
        visible={showWelcome && !isActive}
        onStartTutorial={handleStartTutorial}
        onDismiss={handleDismissWelcome}
        userName={user?.full_name?.split(' ')[0]}
      />

      {/* Spotlight com overlay */}
      <TutorialSpotlight
        targetMeasurements={targetMeasurements}
        onPress={() => {
          // Toque fora fecha o tutorial
          // skipTutorial();
        }}
      >
        {/* Tooltip */}
        <TutorialTooltip
          title={currentStep.title}
          description={currentStep.description}
          position={currentStep.position}
          targetMeasurements={targetMeasurements}
          currentStep={progress.current}
          totalSteps={progress.total}
          onNext={nextStep}
          onPrevious={previousStep}
          onSkip={skipTutorial}
          isFirstStep={isFirstStep}
          isLastStep={isLastStep}
        />
      </TutorialSpotlight>
    </>
  );
}

export default TutorialOverlay;
