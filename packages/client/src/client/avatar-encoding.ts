export const AVATAR_OUTPUT_SIZE = 1024;
export const AVATAR_SOURCE_BYTES = 5_000_000;
export const BOT_AVATAR_BYTES = 131_072;
export const GROUP_AVATAR_BYTES = 98_280;

function decodedBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function encodeAvatar(canvas: HTMLCanvasElement, maxBytes = BOT_AVATAR_BYTES): string {
  for (const size of [1024, 768, 512, 384, 256, 128]) {
    const width = Math.min(canvas.width, size);
    const target = width === canvas.width ? canvas : document.createElement('canvas');
    if (target !== canvas) {
      target.width = width;
      target.height = Math.max(1, Math.round((canvas.height * width) / canvas.width));
      const context = target.getContext('2d');
      if (!context) throw new Error('canvas unavailable');
      context.drawImage(canvas, 0, 0, target.width, target.height);
    }
    for (const quality of [0.85, 0.75, 0.65, 0.5]) {
      const dataUrl = target.toDataURL('image/webp', quality);
      if (!dataUrl.startsWith('data:image/webp;base64,')) throw new Error('unsupported canvas');
      if (decodedBytes(dataUrl) <= maxBytes) return dataUrl;
    }
    if (width <= 128) break;
  }
  throw new Error('avatar too large');
}
