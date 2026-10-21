/**
 * Foto do produto novo, guardada em memória enquanto o usuário escolhe a entrada.
 * O produto só é criado no servidor quando o lançamento na entrada der certo; a foto sobe depois.
 */
let pendingImageUri: string | null = null;

export const setPendingProductImage = (uri: string | null) => {
  pendingImageUri = uri;
};

export const takePendingProductImage = (): string | null => {
  const uri = pendingImageUri;
  pendingImageUri = null;
  return uri;
};
