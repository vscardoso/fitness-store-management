/**
 * Gênero do produto: lista fechada usada no seletor do app.
 */
export const GENDER_OPTIONS = ['Feminino', 'Masculino'] as const;

export type GenderOption = (typeof GENDER_OPTIONS)[number];

/**
 * Converte texto livre (ex.: "feminina", "MASCULINO", vindo do scanner de IA ou de
 * cadastros antigos) para uma das opções. Retorna undefined se não for reconhecido
 * (ex.: "Unissex"), para o chamador decidir se mantém o valor original.
 */
export function normalizeGender(value?: string | null): GenderOption | undefined {
  if (!value) return undefined;
  const v = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  if (v.startsWith('fem')) return 'Feminino';
  if (v.startsWith('masc')) return 'Masculino';
  return undefined;
}
