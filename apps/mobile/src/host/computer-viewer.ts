import { deviceRefusal, type HostApiAnswer, type HostApiInit, type HostClient } from './client';
import type { BrowserFrame, BrowserInput } from './browser-viewer';

export type ComputerViewerStatus = 'loading' | 'live' | 'not-running' | 'unreachable' | 'refused';

export interface ComputerViewerState {
  status: ComputerViewerStatus;
  frame?: BrowserFrame;
  control: boolean;
  notice?: string | undefined;
}

export interface ComputerViewer {
  getState(): ComputerViewerState;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
  setControl(active: boolean): Promise<void>;
  hold(active: boolean): Promise<void>;
  send(input: BrowserInput): Promise<void>;
}

export interface ComputerViewerOptions {
  client: Pick<HostClient, 'api'>;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  frameTimeoutMs?: number;
  releaseMs?: number;
}

export type ComputerModifier = 'alt' | 'ctrl' | 'meta' | 'shift';

export const COMPUTER_KEYS = {
  enter: 'return',
  backspace: 'delete',
  tab: 'tab',
  escape: 'escape',
} as const;

export const WHEEL_STEP = 16;
const MAX_NOTCHES = 15;

export function wheelInput(
  dragY: number,
  at?: { x: number; y: number },
): Extract<BrowserInput, { kind: 'scroll' }> | undefined {
  const notches = Math.min(MAX_NOTCHES, Math.floor(Math.abs(dragY) / WHEEL_STEP));
  if (notches === 0) return undefined;
  return {
    kind: 'scroll',
    direction: dragY < 0 ? 'down' : 'up',
    amount: notches,
    ...(at === undefined ? {} : { x: Math.round(at.x), y: Math.round(at.y) }),
  };
}

export function typedInputs(text: string, modifiers: readonly ComputerModifier[]): BrowserInput[] {
  if (text === '') return [];
  if (modifiers.length === 0) return [{ kind: 'type', text }];
  return [...text].map((key) => ({
    kind: 'key',
    key: key.toLowerCase(),
    modifiers: [...modifiers],
  }));
}

export function addedText(previous: string, next: string): string {
  return next.startsWith(previous) ? next.slice(previous.length) : '';
}

const RETRY_MS = 2000;
const RELEASE_MS = 30_000;
const FRAME_TIMEOUT_MS = 20_000;

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function errorOf(answer: HostApiAnswer): string {
  const body = record(answer.body);
  if (typeof body['error'] === 'string') return body['error'];
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

export function createComputerViewer(options: ComputerViewerOptions): ComputerViewer {
  const { client } = options;
  const wait = options.wait ?? pause;
  const frameTimeoutMs = options.frameTimeoutMs ?? FRAME_TIMEOUT_MS;
  const listeners = new Set<() => void>();
  let state: ComputerViewerState = { status: 'loading', control: false };
  let run: AbortController | undefined;
  let queue: Promise<void> = Promise.resolve();
  const releaseMs = options.releaseMs ?? RELEASE_MS;
  let release: ReturnType<typeof setTimeout> | undefined;
  let held = false;
  const disarm = (): void => {
    if (release !== undefined) clearTimeout(release);
    release = undefined;
  };
  const arm = (): void => {
    disarm();
    if (held) return;
    release = setTimeout(() => {
      release = undefined;
      if (state.control) void takeover(false);
    }, releaseMs);
  };

  const update = (next: Partial<ComputerViewerState>): void => {
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

  const takeover = async (active: boolean): Promise<void> => {
    try {
      const answer = await request('/api/computer/takeover', {
        body: { active },
      });
      const paused = answer.status === 200 && record(answer.body)['paused'] === true;
      update({
        control: paused,
        notice: answer.status === 200 ? undefined : errorOf(answer),
      });
    } catch (error) {
      update({ control: false });
      fail(error);
    }
  };

  const loop = async (signal: AbortSignal): Promise<void> => {
    let seq: number | undefined;
    while (!signal.aborted) {
      let answer: HostApiAnswer;
      try {
        answer = await request(`/api/computer/frame${seq === undefined ? '' : `?after=${seq}`}`, {
          signal,
          timeoutMs: frameTimeoutMs,
        });
      } catch (error) {
        if (signal.aborted) return;
        fail(error);
        if (state.status === 'refused') return;
        await wait(RETRY_MS, signal);
        continue;
      }
      if (signal.aborted) return;
      if (answer.status === 204) continue;
      const body = record(answer.body);
      if (answer.status === 409 && body['code'] === 'not-running') {
        seq = undefined;
        update({ status: 'not-running', control: false });
        await wait(RETRY_MS, signal);
        continue;
      }
      if (answer.status !== 200 || typeof body['data'] !== 'string') {
        update({ status: 'unreachable', notice: errorOf(answer) });
        await wait(RETRY_MS, signal);
        continue;
      }
      seq = typeof body['seq'] === 'number' ? body['seq'] : undefined;
      if (state.control && body['paused'] === false) update({ control: false });
      const width = typeof body['width'] === 'number' ? body['width'] : 0;
      const height = typeof body['height'] === 'number' ? body['height'] : 0;
      update({
        status: 'live',
        frame: {
          seq: seq ?? 0,
          uri: `data:${typeof body['mimeType'] === 'string' ? body['mimeType'] : 'image/png'};base64,${body['data']}`,
          width: width > 0 ? width : (state.frame?.width ?? 1440),
          height: height > 0 ? height : (state.frame?.height ?? 900),
        },
        notice: undefined,
      });
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
      disarm();
      if (state.control) void takeover(false);
    },
    async setControl(active) {
      if (active && state.status !== 'live') return;
      if (!active) {
        held = false;
        disarm();
      }
      await takeover(active);
    },
    async hold(active) {
      held = active;
      if (!active) return state.control ? arm() : undefined;
      disarm();
      if (!state.control && state.status === 'live') await takeover(true);
    },
    send(input) {
      const next = queue.then(() => deliver(input));
      queue = next.catch(() => {});
      return next;
    },
  };

  async function deliver(input: BrowserInput, retry = true): Promise<void> {
    if (state.status !== 'live') return;
    if (!state.control) await takeover(true);
    if (!state.control) return;
    try {
      const answer = await request('/api/computer/input', {
        body: { ...input },
      });
      if (answer.status === 200) return arm();
      const code = record(answer.body)['code'];
      if (code === 'not-running' || code === 'not-paused') update({ control: false });
      if (code === 'not-paused' && retry) return deliver(input, false);
      update({ notice: errorOf(answer) });
    } catch (error) {
      fail(error);
    }
  }
}
