import { rgbaToThumbHash } from 'thumbhash';

export const THUMBNAIL_VARIANTS = {
  '96c': { size: 96, fit: 'cover' },
  '320': { size: 320, fit: 'inside' },
  '800': { size: 800, fit: 'inside' },
} as const;

export type ThumbnailVariant = keyof typeof THUMBNAIL_VARIANTS;

export const THUMBNAIL_MIME = 'image/webp';

const MAX_INPUT_PIXELS = 50_000_000;
const THUMBHASH_SIZE = 100;

export interface ImageFacts {
  width: number;
  height: number;
  thumbhash: string;
}

export interface ImageProcessor {
  facts(bytes: Uint8Array): Promise<ImageFacts | undefined>;
  thumbnail(bytes: Uint8Array, variant: ThumbnailVariant): Promise<Buffer | undefined>;
}

type Sharp = (typeof import('sharp'))['default'];

let loading: Promise<Sharp | undefined> | undefined;

function loadSharp(warn?: (message: string) => void): Promise<Sharp | undefined> {
  loading ??= import('sharp').then(
    (module) => module.default,
    (error: unknown) => {
      warn?.(
        `botharness.thumbnails phase=unavailable reason=${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    },
  );
  return loading;
}

function isThumbnailVariant(value: string): value is ThumbnailVariant {
  return Object.hasOwn(THUMBNAIL_VARIANTS, value);
}

export function parseThumbnailVariant(value: string): ThumbnailVariant | undefined {
  return isThumbnailVariant(value) ? value : undefined;
}

export async function loadImageProcessor(
  warn?: (message: string) => void,
): Promise<ImageProcessor | undefined> {
  const sharp = await loadSharp(warn);
  if (sharp === undefined) return undefined;
  const open = (bytes: Uint8Array) =>
    sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, pages: 1, failOn: 'error' }).rotate();
  return {
    async facts(bytes) {
      try {
        const { data, info } = await open(bytes)
          .resize({
            width: THUMBHASH_SIZE,
            height: THUMBHASH_SIZE,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const metadata = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
        if (metadata.width === undefined || metadata.height === undefined) return undefined;
        const swapped = (metadata.orientation ?? 1) >= 5;
        return {
          width: swapped ? metadata.height : metadata.width,
          height: swapped ? metadata.width : metadata.height,
          thumbhash: Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64'),
        };
      } catch {
        return undefined;
      }
    },
    async thumbnail(bytes, variant) {
      const { size, fit } = THUMBNAIL_VARIANTS[variant];
      try {
        return await open(bytes)
          .resize({ width: size, height: size, fit, withoutEnlargement: true })
          .webp({ quality: 75 })
          .toBuffer();
      } catch {
        return undefined;
      }
    },
  };
}
