/**
 * Endereço da miniatura de uma foto do backend: o servidor reduz sob demanda com ?w= (tamanhos 96, 160, 240, 400, 800).
 * `full` já é a URL absoluta; só fotos em /uploads/ ganham miniatura (Cloudinary, file:// e data: ficam como estão; GIF animado também).
 */
export function thumbUrlFrom(full: string | undefined, cssSize: number, pixelRatio: number): string | undefined {
  if (!full || !full.includes('/uploads/') || full.includes('?') || /\.gif$/i.test(full)) return full;
  const ratio = Number.isFinite(pixelRatio) ? Math.min(Math.max(pixelRatio, 1), 3) : 1;
  const w = Math.ceil(cssSize * ratio);
  return `${full}?w=${w}`;
}
