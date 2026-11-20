import {
  MAX_MARKETPLACE_AVATAR_BYTES,
  MAX_MARKETPLACE_AVATAR_SIDE,
  MIN_MARKETPLACE_AVATAR_SIDE,
} from './marketplace-avatar.js';

type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const jpegFrames = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const pngRefused = new Set(['acTL', 'fcTL', 'fdAT', 'eXIf', 'tEXt', 'iTXt', 'zTXt']);
const webpRefused = new Set(['ANIM', 'ANMF', 'EXIF', 'XMP ']);

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function square(width: number, height: number): boolean {
  return (
    width === height && width >= MIN_MARKETPLACE_AVATAR_SIDE && width <= MAX_MARKETPLACE_AVATAR_SIDE
  );
}

function png(bytes: Uint8Array, view: DataView): boolean {
  if (bytes.length < 33 || view.getUint32(8) !== 13 || fourCC(bytes, 12) !== 'IHDR') return false;
  if (!square(view.getUint32(16), view.getUint32(20))) return false;
  let hasData = false;
  for (let offset = 33; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    const type = fourCC(bytes, offset + 4);
    offset += 12 + length;
    if (offset > bytes.length || pngRefused.has(type) || type === 'IHDR') return false;
    if (type === 'IDAT' && length > 0) hasData = true;
    if (type === 'IEND') return hasData && length === 0 && offset === bytes.length;
  }
  return false;
}

function jpeg(bytes: Uint8Array, view: DataView): boolean {
  let hasFrame = false;
  let hasScan = false;
  let scanning = false;
  for (let offset = 2; offset + 1 < bytes.length;) {
    if (bytes[offset++] !== 0xff) {
      if (scanning) continue;
      return false;
    }
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined) return false;
    if (scanning && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    scanning = false;
    if (marker === 0xd9) return hasFrame && hasScan && offset === bytes.length;
    if (marker === 0xe1 || marker === 0xd8 || offset + 2 > bytes.length) return false;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) return false;
    if (jpegFrames.has(marker)) {
      if (
        hasFrame ||
        length < 11 ||
        !square(view.getUint16(offset + 5), view.getUint16(offset + 3))
      )
        return false;
      hasFrame = true;
    }
    if (marker === 0xda) {
      if (!hasFrame || length < 8) return false;
      scanning = true;
      hasScan = true;
    }
    offset += length;
  }
  return false;
}

function webp(bytes: Uint8Array, view: DataView): boolean {
  if (bytes.length < 20 || view.getUint32(4, true) !== bytes.length - 8) return false;
  let hasImage = false;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) return false;
    const type = fourCC(bytes, offset);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const next = start + length + (length % 2);
    if (next > bytes.length || webpRefused.has(type)) return false;
    if (type === 'VP8X') {
      if (offset !== 12 || length !== 10 || (bytes[start]! & 0x0e) !== 0) return false;
      const width = (view.getUint32(start + 3, true) & 0xffffff) + 1;
      const height = (view.getUint32(start + 6, true) & 0xffffff) + 1;
      if (!square(width, height)) return false;
    }
    if (type === 'VP8L' || type === 'VP8 ') {
      if (hasImage) return false;
      if (type === 'VP8L') {
        if (length <= 5 || bytes[start] !== 0x2f) return false;
        const bits = view.getUint32(start + 1, true);
        if (bits >>> 29 !== 0 || !square((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1))
          return false;
      } else {
        if (
          length <= 10 ||
          (bytes[start]! & 1) !== 0 ||
          bytes[start + 3] !== 0x9d ||
          bytes[start + 4] !== 1 ||
          bytes[start + 5] !== 0x2a ||
          !square(
            view.getUint16(start + 6, true) & 0x3fff,
            view.getUint16(start + 8, true) & 0x3fff,
          )
        )
          return false;
      }
      if (fourCC(bytes, 12) === 'VP8X') {
        const canvasSide = (view.getUint32(23, true) & 0xffffff) + 1;
        const imageSide =
          type === 'VP8L'
            ? (view.getUint32(start + 1, true) & 0x3fff) + 1
            : view.getUint16(start + 6, true) & 0x3fff;
        if (canvasSide !== imageSide) return false;
      }
      hasImage = true;
    }
    offset = next;
  }
  return hasImage;
}

export function marketplaceAvatarImageType(bytes: Uint8Array): ImageType | undefined {
  if (bytes.length < 12 || bytes.length > MAX_MARKETPLACE_AVATAR_BYTES) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (pngSignature.every((byte, index) => bytes[index] === byte)) {
    return png(bytes, view) ? 'image/png' : undefined;
  }
  if (view.getUint16(0) === 0xffd8) return jpeg(bytes, view) ? 'image/jpeg' : undefined;
  if (fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WEBP') {
    return webp(bytes, view) ? 'image/webp' : undefined;
  }
}

export function readMarketplaceAvatarImage(image: string) {
  if (image.length > Math.ceil(MAX_MARKETPLACE_AVATAR_BYTES / 3) * 4 + 30) return;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(image);
  if (match?.[2] === undefined) return;
  if (match[2].length % 4 !== 0) return;
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const contentType = marketplaceAvatarImageType(bytes);
  if (contentType !== undefined && contentType === match[1]) return { bytes, contentType };
}
