import type { CuaDriver } from './tool/driver.js';

export interface DesktopFrame {
  readonly seq: number;
  readonly data: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly capturedAt: number;
}

export type DesktopInput =
  | {
      kind: 'click';
      x: number;
      y: number;
      button: 'left' | 'right';
      count: 1 | 2;
    }
  | {
      kind: 'scroll';
      direction: 'up' | 'down';
      amount: number;
      x?: number;
      y?: number;
    }
  | { kind: 'type'; text: string }
  | {
      kind: 'key';
      key: string;
      modifiers: readonly ('alt' | 'ctrl' | 'meta' | 'shift')[];
    };

export type DesktopViewRefusal = 'not-running' | 'not-paused' | 'capture-failed' | 'input-failed';

export class DesktopViewError extends Error {
  constructor(
    readonly code: DesktopViewRefusal,
    message: string,
  ) {
    super(message);
  }
}

export interface DesktopView {
  next(after: number | undefined, signal?: AbortSignal): Promise<DesktopFrame | undefined>;
  input(input: DesktopInput, signal?: AbortSignal): Promise<void>;
  setPaused(active: boolean): boolean;
  isPaused(): boolean;
  stats(): DesktopViewStats;
}

export interface DesktopViewStats {
  readonly captures: number;
  readonly unchanged: number;
  readonly published: number;
  readonly lastCaptureMs: number;
}

const MODIFIERS = new Set(['alt', 'ctrl', 'meta', 'shift']);
export const VIEWER_SESSION = 'phone-viewer';
export const VIEWER_MAX_DIMENSION = 1600;
export const VIEWER_JPEG_QUALITY = 70;
const MAX_TEXT = 2000;

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function parseDesktopInput(body: Record<string, unknown>): DesktopInput | undefined {
  const x = finite(body['x']);
  const y = finite(body['y']);
  switch (body['kind']) {
    case 'click': {
      if (x === undefined || y === undefined || x < 0 || y < 0) return undefined;
      const button = body['button'] === 'right' ? 'right' : 'left';
      if (body['button'] !== undefined && body['button'] !== 'left' && body['button'] !== 'right')
        return undefined;
      const count = body['count'] === 2 ? 2 : 1;
      return {
        kind: 'click',
        x: Math.round(x),
        y: Math.round(y),
        button,
        count,
      };
    }
    case 'scroll': {
      const direction = body['direction'];
      const amount = finite(body['amount']) ?? 3;
      if (direction !== 'up' && direction !== 'down') return undefined;
      return {
        kind: 'scroll',
        direction,
        amount: Math.min(50, Math.max(1, Math.round(amount))),
        ...(x === undefined || y === undefined ? {} : { x: Math.round(x), y: Math.round(y) }),
      };
    }
    case 'type': {
      const text = body['text'];
      if (typeof text !== 'string' || text === '' || text.length > MAX_TEXT) return undefined;
      return { kind: 'type', text };
    }
    case 'key': {
      const key = body['key'];
      const modifiers = body['modifiers'] ?? [];
      if (typeof key !== 'string' || key === '' || key.length > 32) return undefined;
      if (!Array.isArray(modifiers) || !modifiers.every((m) => MODIFIERS.has(m as string)))
        return undefined;
      return {
        kind: 'key',
        key,
        modifiers: modifiers as ('alt' | 'ctrl' | 'meta' | 'shift')[],
      };
    }
    default:
      return undefined;
  }
}

function driverModifier(modifier: 'alt' | 'ctrl' | 'meta' | 'shift'): string {
  return modifier === 'meta' ? 'cmd' : modifier;
}

export function desktopInputCall(
  input: DesktopInput,
  pointer: { x: number; y: number } | undefined,
): { tool: string; args: Record<string, unknown> } {
  switch (input.kind) {
    case 'click':
      return {
        tool: 'click',
        args: {
          scope: 'desktop',
          x: input.x,
          y: input.y,
          ...(input.button === 'right' ? { button: 'right' } : {}),
          ...(input.count === 2 ? { count: 2 } : {}),
        },
      };
    case 'scroll': {
      const at = input.x !== undefined && input.y !== undefined ? input : pointer;
      return {
        tool: 'scroll',
        args: {
          scope: 'desktop',
          direction: input.direction,
          amount: input.amount,
          ...(at === undefined ? {} : { x: at.x, y: at.y }),
        },
      };
    }
    case 'type':
      return {
        tool: 'type_text',
        args: { scope: 'desktop', delivery_mode: 'foreground', text: input.text },
      };
    case 'key':
      return input.modifiers.length === 0
        ? {
            tool: 'press_key',
            args: { scope: 'desktop', delivery_mode: 'foreground', key: input.key },
          }
        : {
            tool: 'hotkey',
            args: {
              scope: 'desktop',
              delivery_mode: 'foreground',
              keys: [...input.modifiers.map(driverModifier), input.key],
            },
          };
  }
}

interface Capture {
  readonly data: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
}

function refusalText(result: unknown): string | undefined {
  const value = result as { isError?: unknown; content?: unknown };
  if (value?.isError !== true) return undefined;
  const first = Array.isArray(value.content) ? (value.content[0] as { text?: unknown }) : undefined;
  return typeof first?.text === 'string' ? first.text : 'the desktop driver refused the action';
}

export function desktopCapture(result: unknown): Capture | undefined {
  const value = result as {
    content?: unknown;
    structuredContent?: Record<string, unknown>;
  };
  if (refusalText(result) !== undefined || !Array.isArray(value?.content)) return undefined;
  const image = (value.content as { type?: unknown; data?: unknown; mimeType?: unknown }[]).find(
    (item) => item.type === 'image' && typeof item.data === 'string',
  );
  if (image === undefined) return undefined;
  const meta = value.structuredContent ?? {};
  const width = finite(meta['screenshot_width']) ?? finite(meta['screen_width']) ?? 0;
  const height = finite(meta['screenshot_height']) ?? finite(meta['screen_height']) ?? 0;
  return {
    data: image.data as string,
    mimeType: typeof image.mimeType === 'string' ? image.mimeType : 'image/png',
    width,
    height,
  };
}

export type FrameEncoder = (
  png: Buffer,
) => Promise<{ readonly bytes: Buffer; readonly mimeType: string } | undefined>;

export const jpegEncoder: FrameEncoder = async (png) => {
  try {
    const { default: sharp } = await import('sharp');
    const bytes = await sharp(png).jpeg({ quality: VIEWER_JPEG_QUALITY }).toBuffer();
    return { bytes, mimeType: 'image/jpeg' };
  } catch {
    return undefined;
  }
};

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted === true) return resolve();
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done);
  });

function untilAborted<T>(work: Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
  if (signal === undefined) return work;
  if (signal.aborted) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const abort = (): void => resolve(undefined);
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function createDesktopView(options: {
  driver: Pick<CuaDriver, 'call'>;
  isRunning: () => boolean;
  intervalMs?: number;
  waitMs?: number;
  pauseLeaseMs?: number;
  encode?: FrameEncoder;
  now?: () => number;
}): DesktopView {
  const encode = options.encode ?? jpegEncoder;
  const intervalMs = options.intervalMs ?? 150;
  const waitMs = options.waitMs ?? 10_000;
  const now = options.now ?? Date.now;
  const pauseLeaseMs = options.pauseLeaseMs ?? 30_000;
  let pausedUntil = 0;
  const isPaused = (): boolean => pausedUntil > now();
  const renewPause = (): void => {
    if (isPaused()) pausedUntil = now() + pauseLeaseMs;
  };
  let latest: DesktopFrame | undefined;
  let latestCapture: string | undefined;
  let capturing: Promise<DesktopFrame | undefined> | undefined;
  let lastStarted = 0;
  let pointer: { x: number; y: number } | undefined;
  let seq = 0;
  let captures = 0;
  let unchanged = 0;
  let published = 0;
  let lastCaptureMs = 0;

  const capture = (): Promise<DesktopFrame | undefined> => {
    capturing ??= (async () => {
      const gap = lastStarted + intervalMs - now();
      if (gap > 0) await wait(gap);
      lastStarted = now();
      captures += 1;
      const result = await options.driver.call('get_desktop_state', {
        max_image_dimension: VIEWER_MAX_DIMENSION,
        session: VIEWER_SESSION,
      });
      lastCaptureMs = now() - lastStarted;
      const shot = desktopCapture(result);
      if (shot === undefined)
        throw new DesktopViewError(
          'capture-failed',
          refusalText(result) ?? 'The desktop driver returned no screenshot.',
        );
      if (latestCapture === shot.data) {
        unchanged += 1;
        return undefined;
      }
      latestCapture = shot.data;
      const encoded =
        shot.mimeType === 'image/png' ? await encode(Buffer.from(shot.data, 'base64')) : undefined;
      seq += 1;
      published += 1;
      latest = {
        seq,
        ...shot,
        ...(encoded === undefined
          ? {}
          : { data: encoded.bytes.toString('base64'), mimeType: encoded.mimeType }),
        capturedAt: lastStarted,
      };
      return latest;
    })().finally(() => {
      capturing = undefined;
    });
    return capturing;
  };

  const requireRunning = (): void => {
    if (!options.isRunning())
      throw new DesktopViewError('not-running', 'The Computer is not running.');
  };

  return {
    async next(after, signal) {
      requireRunning();
      renewPause();
      if (latest !== undefined && after !== undefined && latest.seq > after) return latest;
      const deadline = now() + waitMs;
      while (signal?.aborted !== true) {
        requireRunning();
        const current = (await untilAborted(capture(), signal)) ?? latest;
        if (current !== undefined && (after === undefined || current.seq > after)) return current;
        if (now() >= deadline) return undefined;
      }
      return undefined;
    },
    async input(input, signal) {
      requireRunning();
      if (!isPaused())
        throw new DesktopViewError('not-paused', 'Pause the Bot before using the desktop.');
      renewPause();
      if (input.kind === 'click') pointer = { x: input.x, y: input.y };
      const call = desktopInputCall(input, pointer);
      const result = await options.driver.call(
        call.tool,
        { ...call.args, session: VIEWER_SESSION },
        signal,
      );
      const refused = refusalText(result);
      if (refused !== undefined) throw new DesktopViewError('input-failed', refused);
      lastStarted = 0;
    },
    setPaused(active) {
      pausedUntil = active ? now() + pauseLeaseMs : 0;
      return isPaused();
    },
    isPaused,
    stats: () => ({ captures, unchanged, published, lastCaptureMs }),
  };
}
