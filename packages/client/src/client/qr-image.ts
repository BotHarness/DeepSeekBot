import jsQR from 'jsqr';

export const QR_IMAGE_MAX_EDGE = 1200;
export const QR_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export function decodeQrPixels(data: Uint8ClampedArray, width: number, height: number): string {
  if (width < 1 || height < 1 || width > QR_IMAGE_MAX_EDGE || height > QR_IMAGE_MAX_EDGE)
    throw new Error('image-too-large');
  const value = jsQR(data, width, height)?.data;
  if (!value || value.length > 3200) throw new Error('qr-not-found');
  return value;
}

export async function readQrImage(file: File): Promise<string> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > QR_IMAGE_MAX_BYTES
  )
    throw new Error('unsupported-image');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      QR_IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('image-unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return decodeQrPixels(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
