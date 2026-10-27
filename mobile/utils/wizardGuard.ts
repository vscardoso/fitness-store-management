/**
 * Depois que o cadastro de produto é concluído (resumo), nenhum "voltar" pode reabrir um passo anterior:
 * o produto e a entrada já foram gravados e refazer o passo duplicaria ou confundiria os dados.
 * O aviso vive fora da tela (módulo), então sobrevive ao gesto de voltar do iPhone, que recria a tela.
 */
const EXPIRES_MS = 15 * 60 * 1000;
let completedAt: number | null = null;

export function markWizardCompleted(): void {
  completedAt = Date.now();
}

export function clearWizardCompleted(): void {
  completedAt = null;
}

/** Verdadeiro se o cadastro acabou de ser concluído e a pessoa não começou outro. */
export function wasWizardJustCompleted(): boolean {
  return completedAt != null && Date.now() - completedAt < EXPIRES_MS;
}

/** Para onde o cadastro concluído leva ao sair (seta voltar, arrastar do iPhone, botão do navegador, telas antigas). */
export const PRODUCT_LIST_ROUTE = '/(tabs)/products';
