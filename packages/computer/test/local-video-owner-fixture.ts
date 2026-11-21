import { rmSync } from 'node:fs';
import { vi } from 'vitest';
import { createLocalVideoOwner, type ComputerPauseStore } from '../src/local-video-owner.js';
import type {
  LocalVideoBinding,
  LocalVideoMedia,
  LocalVideoMediaStatus,
  LocalVideoOwner,
  LocalVideoState,
} from '../src/local-video-contract.js';

export const caller = { deviceId: 'phone-a' };
export const other = { deviceId: 'phone-b' };
export const click = { kind: 'click', x: 20, y: 30, button: 'left', count: 1 } as const;
const owners: LocalVideoOwner[] = [];
export const dirs: string[] = [];
export async function cleanup() {
  for (const owner of owners.splice(0)) await owner.dispose().catch(() => undefined);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function harness(
  options: {
    store?: ComputerPauseStore;
    media?: LocalVideoMedia;
    timeout?: number;
    points?: boolean;
    scrollMotion?: import('../src/macos-scroll.js').ScrollMotion;
  } = {},
) {
  let time = 10_000;
  let savedPause = false;
  let report: ((status: LocalVideoMediaStatus) => void) | undefined;
  const writes: boolean[] = [];
  const events: string[] = [];
  const driver = {
    call: vi.fn(async (_tool: string, _args: Record<string, unknown>, _signal?: AbortSignal) => ({
      content: [],
    })),
  };
  const cursorState = vi.fn(async (args: Record<string, unknown>) => ({
    structuredContent: { session: args['session'], enabled: false },
  }));
  const cursorSetup = vi.fn<(args: Record<string, unknown>) => Promise<unknown>>(async () => ({
    content: [],
  }));
  const geometry = { width: 1920, height: 1080, scale_factor: 1.5 };
  const probe = vi.fn(async () => ({ structuredContent: { ...geometry } }));
  const peer = {
    offer: { type: 'offer' as const, sdp: 'offer' },
    display: { width: 1920, height: 1080 },
    answer: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  const media =
    options.media ??
    ({
      open: vi.fn(async (input) => {
        report = input.onStatus;
        return peer;
      }),
    } satisfies LocalVideoMedia);
  const owner = createLocalVideoOwner({
    pause: options.store ?? {
      read: () => savedPause,
      write: (value) => {
        savedPause = value;
        writes.push(value);
      },
    },
    driver: {
      call: (tool, args, signal) =>
        tool === 'get_screen_size'
          ? probe()
          : tool === 'set_agent_cursor_enabled'
            ? cursorSetup(args)
            : tool === 'get_agent_cursor_state'
              ? cursorState(args)
              : driver.call(tool, args, signal),
    },
    media,
    ...(options.scrollMotion === undefined ? {} : { scrollMotion: options.scrollMotion }),
    isRunning: () => true,
    driverPlatform: options.points ? 'darwin' : 'win32',
    now: () => time,
    onEvent: (detail) => events.push(detail),
    operationTimeoutMs: options.timeout ?? 1_000,
    cleanupTimeoutMs: 100,
  });
  owners.push(owner);
  const capture = (alive = true): void =>
    report?.({
      status: 'live',
      captureAlive: alive,
      width: 1920,
      height: 1080,
      framesEncoded: 100,
    });
  const connect = async (): Promise<LocalVideoBinding> => {
    const opened = await owner.handle(caller, { kind: 'open' });
    const binding = opened.binding!;
    await owner.handle(caller, {
      kind: 'signal',
      binding,
      answer: { type: 'answer', sdp: 'answer' },
    });
    capture();
    await owner.handle(caller, {
      kind: 'heartbeat',
      binding,
      playback: { presenting: true, presentedFrames: 1 },
    });
    return binding;
  };
  const take = (binding: LocalVideoBinding): Promise<LocalVideoState> =>
    owner.handle(caller, { kind: 'takeover', binding });
  const input = (binding: LocalVideoBinding, generation: number, sequence = 1) =>
    owner.handle(caller, {
      kind: 'input',
      binding,
      generation,
      sequence,
      input: click,
    });
  const failMedia = (): void =>
    report?.({ status: 'failed', captureAlive: false, width: 1920, height: 1080 });
  return {
    owner,
    peer,
    media,
    driver,
    geometry,
    cursorSetup,
    cursorState,
    probe,
    writes,
    events,
    capture,
    failMedia,
    connect,
    take,
    input,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
