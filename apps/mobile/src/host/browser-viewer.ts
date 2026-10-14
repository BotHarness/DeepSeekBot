import { deviceRefusal, type HostApiAnswer, type HostApiInit, type HostClient } from './client';

export interface BrowserFrame {
  seq: number;
  uri: string;
  width: number;
  height: number;
}

export type BrowserViewerStatus =
  | 'loading'
  | 'live'
  | 'not-running'
  | 'no-access'
  | 'unreachable'
  | 'refused';

export interface BrowserViewerState {
  status: BrowserViewerStatus;
  frame?: BrowserFrame;
  takeover: boolean;
  switching: boolean;
  notice?: string | undefined;
}

export type BrowserInput =
  | { kind: 'click'; x: number; y: number; button?: 'left' | 'right' }
  | { kind: 'scroll'; direction: 'up' | 'down'; amount: number }
  | { kind: 'type'; text: string }
  | { kind: 'key'; key: string; modifiers?: readonly ('alt' | 'ctrl' | 'meta' | 'shift')[] };

export interface BrowserViewer {
  getState(): BrowserViewerState;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
  setTakeover(active: boolean): Promise<void>;
  send(input: BrowserInput): Promise<void>;
}

export interface BrowserViewerOptions {
  client: Pick<HostClient, 'api'>;
  slug: string;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  frameTimeoutMs?: number;
}

const SNAPSHOT_PACE_MS = 1000;
const RETRY_MS = 2000;
const FRAME_TIMEOUT_MS = 20_000;
const FALLBACK_SIZE = { width: 1280, height: 800 };

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function errorOf(answer: HostApiAnswer): string {
  const body = record(answer.body);
  if (typeof body['error'] === 'string') return body['error'];
  if (typeof answer.body === 'string' && answer.body !== '') return answer.body;
  return `The Host answered ${answer.status}.`;
}

const pause = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });

export function createBrowserViewer(options: BrowserViewerOptions): BrowserViewer {
  const { client, slug } = options;
  const wait = options.wait ?? pause;
  const frameTimeoutMs = options.frameTimeoutMs ?? FRAME_TIMEOUT_MS;
  const listeners = new Set<() => void>();
  const query = `slug=${encodeURIComponent(slug)}`;
  let state: BrowserViewerState = { status: 'loading', takeover: false, switching: false };
  let run: AbortController | undefined;

  const update = (next: Partial<BrowserViewerState>): void => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  const request = (path: string, init?: HostApiInit): Promise<HostApiAnswer> =>
    client.api(path, init);

  const fail = (error: unknown): void => {
    if (deviceRefusal(error) !== undefined) update({ status: 'refused' });
    else
      update({
        status: 'unreachable',
        notice: error instanceof Error ? error.message : String(error),
      });
  };

  const observe = async (signal: AbortSignal): Promise<void> => {
    const answer = await request(`/api/browser/observation?${query}`, { signal });
    const body = record(answer.body);
    if (answer.status === 200 && typeof body['takeover'] === 'boolean')
      update({ takeover: body['takeover'] });
  };

  const loop = async (signal: AbortSignal): Promise<void> => {
    let seq: number | undefined;
    try {
      await observe(signal);
    } catch (error) {
      if (signal.aborted) return;
      fail(error);
      if (state.status === 'refused') return;
    }
    while (!signal.aborted) {
      let answer: HostApiAnswer;
      try {
        answer = await request(
          `/api/browser/frame?${query}${seq === undefined ? '' : `&after=${seq}`}`,
          { signal, timeoutMs: frameTimeoutMs },
        );
      } catch (error) {
        if (signal.aborted) return;
        fail(error);
        if (state.status === 'refused') return;
        await wait(RETRY_MS, signal);
        continue;
      }
      if (signal.aborted) return;
      if (answer.status === 204) continue;
      if (answer.status === 403) {
        update({ status: 'no-access', notice: errorOf(answer) });
        return;
      }
      if (answer.status === 404) {
        seq = undefined;
        update({ status: 'not-running' });
        await wait(RETRY_MS, signal);
        continue;
      }
      const body = record(answer.body);
      if (answer.status !== 200 || typeof body['data'] !== 'string') {
        update({ status: 'unreachable', notice: errorOf(answer) });
        await wait(RETRY_MS, signal);
        continue;
      }
      const viewport = record(body['viewport']);
      const width = typeof viewport['width'] === 'number' ? viewport['width'] : undefined;
      const height = typeof viewport['height'] === 'number' ? viewport['height'] : undefined;
      seq = typeof body['seq'] === 'number' ? body['seq'] : undefined;
      update({
        status: 'live',
        frame: {
          seq: seq ?? 0,
          uri: `data:${typeof body['mimeType'] === 'string' ? body['mimeType'] : 'image/jpeg'};base64,${body['data']}`,
          width: width ?? state.frame?.width ?? FALLBACK_SIZE.width,
          height: height ?? state.frame?.height ?? FALLBACK_SIZE.height,
        },
        notice: undefined,
      });
      if (body['mode'] !== 'stream') await wait(SNAPSHOT_PACE_MS, signal);
    }
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (run !== undefined) return;
      run = new AbortController();
      void loop(run.signal);
    },
    stop() {
      run?.abort();
      run = undefined;
    },
    async setTakeover(active) {
      update({ switching: true });
      try {
        const answer = await request('/api/browser/takeover', { body: { slug, active } });
        const body = record(answer.body);
        if (answer.status === 200 && typeof body['takeover'] === 'boolean')
          update({ takeover: body['takeover'], switching: false, notice: undefined });
        else update({ switching: false, notice: errorOf(answer) });
      } catch (error) {
        update({ switching: false });
        fail(error);
      }
    },
    async send(input) {
      try {
        const answer = await request('/api/browser/input', { body: { ...input, slug } });
        if (answer.status === 200) return;
        if (answer.status === 409 && errorOf(answer).startsWith('Pause'))
          update({ takeover: false });
        update({ notice: errorOf(answer) });
      } catch (error) {
        fail(error);
      }
    },
  };
}

export interface StageLayout {
  width: number;
  height: number;
}

export interface StageZoom {
  scale: number;
  x: number;
  y: number;
}

export function fittedFrame(
  frame: { width: number; height: number },
  stage: StageLayout,
): { left: number; top: number; width: number; height: number } {
  'worklet';
  if (frame.width <= 0 || frame.height <= 0 || stage.width <= 0 || stage.height <= 0)
    return { left: 0, top: 0, width: stage.width, height: stage.height };
  const ratio = Math.min(stage.width / frame.width, stage.height / frame.height);
  const width = frame.width * ratio;
  const height = frame.height * ratio;
  return { left: (stage.width - width) / 2, top: (stage.height - height) / 2, width, height };
}

export function pagePoint(
  touch: { x: number; y: number },
  frame: { width: number; height: number },
  stage: StageLayout,
  zoom: StageZoom = { scale: 1, x: 0, y: 0 },
): { x: number; y: number } | undefined {
  'worklet';
  const fit = fittedFrame(frame, stage);
  if (fit.width <= 0 || fit.height <= 0) return undefined;
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  const sx = (touch.x - cx - zoom.x) / zoom.scale + cx;
  const sy = (touch.y - cy - zoom.y) / zoom.scale + cy;
  const px = ((sx - fit.left) / fit.width) * frame.width;
  const py = ((sy - fit.top) / fit.height) * frame.height;
  if (px < 0 || py < 0 || px > frame.width || py > frame.height) return undefined;
  return { x: Math.round(px), y: Math.round(py) };
}

export function stagePoint(
  page: { x: number; y: number },
  frame: { width: number; height: number },
  stage: StageLayout,
  zoom: StageZoom = { scale: 1, x: 0, y: 0 },
): { x: number; y: number } {
  'worklet';
  const fit = fittedFrame(frame, stage);
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  const sx = fit.left + (page.x / frame.width) * fit.width;
  const sy = fit.top + (page.y / frame.height) * fit.height;
  return { x: (sx - cx) * zoom.scale + cx + zoom.x, y: (sy - cy) * zoom.scale + cy + zoom.y };
}

export function moveCursor(
  cursor: { x: number; y: number },
  delta: { x: number; y: number },
  frame: { width: number; height: number },
  stage: StageLayout,
  zoom: StageZoom = { scale: 1, x: 0, y: 0 },
): { x: number; y: number } {
  'worklet';
  const fit = fittedFrame(frame, stage);
  const perPoint = fit.width > 0 ? frame.width / (fit.width * zoom.scale) : 1;
  return {
    x: Math.round(Math.min(frame.width, Math.max(0, cursor.x + delta.x * perPoint))),
    y: Math.round(Math.min(frame.height, Math.max(0, cursor.y + delta.y * perPoint))),
  };
}

export function scrollFor(dragY: number): { direction: 'up' | 'down'; amount: number } {
  'worklet';
  return {
    direction: dragY < 0 ? 'down' : 'up',
    amount: Math.max(100, Math.min(1500, Math.round(Math.abs(dragY) * 2))),
  };
}
