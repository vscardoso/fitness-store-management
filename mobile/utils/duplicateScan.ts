/**
 * Peça bipada de novo na MESMA conferência (Conferência de estoque e Conferir recebimento): avisa "duplicada" e NÃO conta,
 * a menos que a pessoa confirme que é outra peça igual (ou desligue o aviso, para contar muitas iguais seguidas).
 * Lógica pura, testada em scripts/test-duplicate-scan.mts.
 */

/** A peça já tem leitura nesta conferência (de qualquer pessoa)? Então a leitura nova precisa de confirmação. */
export const needsDuplicateConfirm = (alreadyCounted: number, warnEnabled: boolean): boolean => warnEnabled && alreadyCounted >= 1;

/** Frase do aviso: diz quantas já foram contadas e o que fazer. `expected` = o que o sistema (ou a nota) espera, se houver. */
export const duplicateMessage = (title: string, alreadyCounted: number, expected?: number | null): string => {
  const quanto = expected != null && expected > 0 ? `${alreadyCounted} de ${expected}` : String(alreadyCounted);
  return `${title} já foi bipada (${quanto}). Duplicada: só conte de novo se for outra peça igual.`;
};
