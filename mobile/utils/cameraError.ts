/**
 * Por que a câmera do navegador não abriu, em frase que a pessoa entende e sabe o que fazer.
 * Antes toda falha virava "A câmera não abriu. Confira a permissão" e o botão "Permitir câmera" só montava a câmera de novo
 * (que falhava igual): parecia que o botão não fazia nada. Puro (sem React/DOM): node scripts/test-camera-error.mts
 */
export type CameraFailure = 'denied' | 'busy' | 'missing' | 'no_image' | 'unsupported' | 'other';

/** `name` é o `error.name` do getUserMedia/play (ou 'NoImage', que o leitor usa quando abriu e não veio imagem). */
export function classifyCameraError(name?: string | null): CameraFailure {
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    case 'NoImage':
      return 'no_image';
    case 'NotSupportedError':
      return 'unsupported';
    default:
      return 'other';
  }
}

export interface CameraFailureText {
  title: string;
  /** Passos curtos para resolver (vazio quando só tentar de novo basta) */
  steps: string[];
  /** Tentar de novo adianta? Câmera bloqueada só volta depois de liberar nos Ajustes. */
  retryHelps: boolean;
}

export function cameraFailureText(kind: CameraFailure): CameraFailureText {
  switch (kind) {
    case 'denied':
      return {
        title: 'A câmera está bloqueada para este app.',
        steps: [
          'No iPhone: Ajustes > Safari > Câmera e escolha Perguntar ou Permitir.',
          'Se o app está na tela de início: Ajustes > Privacidade e Segurança > Câmera e deixe o Safari ligado.',
          'Volte aqui e toque em Tentar de novo.',
        ],
        retryHelps: false,
      };
    case 'busy':
      return {
        title: 'A câmera está em uso por outro app ou foi interrompida.',
        steps: ['Feche os outros apps que usam a câmera e toque em Tentar de novo.'],
        retryHelps: true,
      };
    case 'missing':
      return { title: 'Não achei a câmera traseira neste aparelho.', steps: ['Toque em Tentar de novo. Se continuar, digite o código da etiqueta.'], retryHelps: true };
    case 'no_image':
      return { title: 'A câmera abriu, mas não mostrou imagem.', steps: ['Toque em Tentar de novo.'], retryHelps: true };
    case 'unsupported':
      return { title: 'Este navegador não deixa o app usar a câmera.', steps: ['Abra o app pelo Safari (ou pelo ícone na tela de início) e tente de novo.'], retryHelps: false };
    default:
      return { title: 'A câmera não abriu.', steps: ['Toque em Tentar de novo. Se continuar, digite o código da etiqueta.'], retryHelps: true };
  }
}
