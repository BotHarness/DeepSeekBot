import { gridLayout, type CallGridLayout } from './keyframes.js';

export const GRID_LONG_EDGE = 1536;
const TILE_SOURCE_EDGE = GRID_LONG_EDGE / 2;
const MAX_INPUT_PIXELS = 40_000_000;
const GRID_QUALITY = 80;

export interface PreparedFrame {
  readonly tile: Buffer;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly width: number;
  readonly height: number;
  readonly jpeg: Uint8Array;
}

export interface GridImage {
  readonly jpeg: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly layout: CallGridLayout;
}

export interface CallImaging {
  prepare(jpeg: Uint8Array): Promise<PreparedFrame>;
  compose(frames: readonly PreparedFrame[], labels: readonly string[]): Promise<GridImage>;
}

export class CallFrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CallFrameError';
  }
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function frameLabel(index: number, secondsBefore: number): string {
  return `${index + 1} · -${Math.max(0, Math.round(secondsBefore))}s`;
}

const GLYPHS: Record<string, readonly string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  s: ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
  '·': ['00000', '00000', '00000', '00100', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

export function drawLabel(
  canvas: Buffer,
  canvasWidth: number,
  left: number,
  top: number,
  text: string,
  scale: number,
): void {
  const chars = [...text].filter((char) => GLYPHS[char] !== undefined);
  const pad = 2 * scale;
  const boxWidth = chars.length * 6 * scale - scale + pad * 2;
  const boxHeight = 7 * scale + pad * 2;
  const canvasHeight = canvas.length / 3 / canvasWidth;
  const put = (x: number, y: number, value: number) => {
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return;
    const offset = (y * canvasWidth + x) * 3;
    canvas[offset] = value;
    canvas[offset + 1] = value;
    canvas[offset + 2] = value;
  };
  for (let y = 0; y < boxHeight; y += 1)
    for (let x = 0; x < boxWidth; x += 1) put(left + x, top + y, 0);
  chars.forEach((char, position) => {
    const rows = GLYPHS[char]!;
    for (let row = 0; row < 7; row += 1)
      for (let col = 0; col < 5; col += 1) {
        if (rows[row]![col] !== '1') continue;
        for (let dy = 0; dy < scale; dy += 1)
          for (let dx = 0; dx < scale; dx += 1)
            put(left + pad + (position * 6 + col) * scale + dx, top + pad + row * scale + dy, 255);
      }
  });
}

type Sharp = typeof import('sharp').default;

let sharpModule: Promise<Sharp> | undefined;
const loadSharp = () => (sharpModule ??= import('sharp').then((module) => module.default as Sharp));

export function createCallImaging(): CallImaging {
  return {
    async prepare(jpeg) {
      if (!isJpeg(jpeg)) throw new CallFrameError('A keyframe must be a JPEG image.');
      const sharp = await loadSharp();
      try {
        const image = sharp(jpeg, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
        const meta = await image.metadata();
        if (meta.width === undefined || meta.height === undefined)
          throw new CallFrameError('The keyframe has no size.');
        const { data, info } = await image
          .rotate()
          .resize(TILE_SOURCE_EDGE, TILE_SOURCE_EDGE, { fit: 'inside', withoutEnlargement: true })
          .removeAlpha()
          .toColourspace('srgb')
          .raw()
          .toBuffer({ resolveWithObject: true });
        return {
          tile: data,
          tileWidth: info.width,
          tileHeight: info.height,
          width: meta.width,
          height: meta.height,
          jpeg,
        };
      } catch (error) {
        if (error instanceof CallFrameError) throw error;
        throw new CallFrameError('The keyframe could not be decoded.');
      }
    },
    async compose(frames, labels) {
      if (frames.length === 0) throw new CallFrameError('A grid needs at least one frame.');
      const sharp = await loadSharp();
      const { layout, cols } = gridLayout(frames.length);
      if (frames.length === 1) {
        const { data, info } = await sharp(frames[0]!.jpeg, { limitInputPixels: MAX_INPUT_PIXELS })
          .rotate()
          .resize(GRID_LONG_EDGE, GRID_LONG_EDGE, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: GRID_QUALITY, mozjpeg: false })
          .toBuffer({ resolveWithObject: true });
        return { jpeg: new Uint8Array(data), width: info.width, height: info.height, layout };
      }
      const reference = frames.at(-1)!;
      const aspect = reference.tileWidth / reference.tileHeight;
      const tileWidth = Math.floor(
        aspect >= 1 ? GRID_LONG_EDGE / cols : (GRID_LONG_EDGE / cols) * aspect,
      );
      const tileHeight = Math.floor(tileWidth / aspect);
      const width = tileWidth * cols;
      const height = tileHeight * Math.ceil(frames.length / cols);
      const canvas = Buffer.alloc(width * height * 3);
      const scale = Math.max(2, Math.round(tileWidth / 160));
      await Promise.all(
        frames.map(async (frame, index) => {
          const { data, info } = await sharp(frame.tile, {
            raw: { width: frame.tileWidth, height: frame.tileHeight, channels: 3 },
          })
            .resize(tileWidth, tileHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
            .raw()
            .toBuffer({ resolveWithObject: true });
          const left = (index % cols) * tileWidth;
          const top = Math.floor(index / cols) * tileHeight;
          for (let row = 0; row < info.height; row += 1) {
            const from = row * info.width * 3;
            data.copy(canvas, ((top + row) * width + left) * 3, from, from + info.width * 3);
          }
          const label = labels[index];
          if (label !== undefined) drawLabel(canvas, width, left, top, label, scale);
        }),
      );
      const jpeg = await sharp(canvas, { raw: { width, height, channels: 3 } })
        .jpeg({ quality: GRID_QUALITY, mozjpeg: false })
        .toBuffer();
      return { jpeg: new Uint8Array(jpeg), width, height, layout };
    },
  };
}
