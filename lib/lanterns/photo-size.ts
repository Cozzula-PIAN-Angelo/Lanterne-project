/** Le dimensioni entro `max`, con le stesse proporzioni. Non ingrandisce mai. */
export function scaledSize(width: number, height: number, max: number): { width: number; height: number } {
  const ratio = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}
