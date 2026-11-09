// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const speech = vi.hoisted(() => ({
  available: true,
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  emit: undefined as ((samples: Int16Array) => void) | undefined,
  micStarts: 0,
  micStops: 0,
}));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return { ...shim, Platform: { ...shim.Platform, OS: 'ios' } };
});
vi.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => speech.available,
    getPermissionsAsync: () => Promise.resolve({ granted: true }),
    requestPermissionsAsync: () => Promise.resolve({ granted: true }),
    start: speech.start,
    stop: speech.stop,
    abort: speech.abort,
  },
  useSpeechRecognitionEvent: () => undefined,
}));
vi.mock('../src/host/dictation-mic', () => ({
  createDictationMic: () => ({
    async start(onPcm: (samples: Int16Array) => void) {
      speech.micStarts += 1;
      speech.emit = onPcm;
    },
    stop() {
      speech.micStops += 1;
      speech.emit = undefined;
    },
  }),
}));

const { useDictation } = await import('../src/host/speech');
const { hostDictationReady } = await import('../src/host/host-dictation');
type HostClient = import('../src/host/client').HostClient;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function fakeHost(options: { ready: boolean | 'hang'; text?: string }) {
  const calls: Array<Record<string, unknown>> = [];
  const view = (state: string) => ({
    dictation: { id: 'dict-0000000000000001', text: options.text ?? '', state, mode: 'stream' },
  });
  const client = {
    getSnapshot: () => ({ connection: { status: 'connected' } }),
    call: vi.fn(async (method: string, args: Record<string, unknown>) => {
      expect(method).toBe('voiceDictation');
      calls.push(args);
      if (args['kind'] === 'readiness') {
        if (options.ready === 'hang') return new Promise(() => undefined);
        return { readiness: { ready: options.ready, providerId: 'p', mode: 'stream' } };
      }
      if (args['kind'] === 'stop') return view('done');
      if (args['kind'] === 'cancel') return view('cancelled');
      return view('listening');
    }),
  } as unknown as HostClient;
  return { client, calls };
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot> | undefined;
const problems: string[] = [];
let api: ReturnType<typeof useDictation> | undefined;

function Harness({ client }: { client?: HostClient }) {
  const [draft, setDraft] = useState('');
  api = useDictation(setDraft, {
    client,
    slug: 'mika',
    onProblem: (problem) => problems.push(problem),
  });
  return (
    <>
      <span ref={api.mountRef} data-testid="status">
        {api.state.status}
      </span>
      <span data-testid="draft">{draft}</span>
    </>
  );
}

const status = () => container.querySelector('[data-testid="status"]')!.textContent;
const draft = () => container.querySelector('[data-testid="draft"]')!.textContent;
const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

async function mount(client?: HostClient) {
  container = document.createElement('div');
  const created = createRoot(container);
  root = created;
  await act(async () => created.render(<Harness {...(client === undefined ? {} : { client })} />));
}

beforeEach(() => {
  vi.clearAllMocks();
  speech.available = true;
  speech.micStarts = 0;
  speech.micStops = 0;
  problems.length = 0;
});
afterEach(() => {
  if (root !== undefined) act(() => root!.unmount());
  root = undefined;
});

describe('mobile dictation source', () => {
  it('uses the Host speech-to-text Provider first', async () => {
    const { client, calls } = fakeHost({ ready: true, text: 'hello there' });
    await mount(client);
    await act(async () => api!.start({ text: 'Say: ' }));
    await flush();
    expect(status()).toBe('listening');
    expect(speech.micStarts).toBe(1);
    expect(speech.start).not.toHaveBeenCalled();
    expect(calls.map((call) => call['kind'])).toEqual(['readiness', 'open']);
    expect(calls[0]).toMatchObject({ slug: 'mika' });
    await act(async () => speech.emit!(new Int16Array(16_000)));
    await flush();
    expect(calls.some((call) => call['kind'] === 'push')).toBe(true);
    expect(draft()).toBe('Say: hello there');
    await act(async () => api!.stop());
    await flush();
    expect(status()).toBe('idle');
    expect(speech.micStops).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  it('falls back to the phone’s speech recognition without a Host Provider', async () => {
    const { client } = fakeHost({ ready: false });
    await mount(client);
    await act(async () => api!.start());
    await flush();
    expect(speech.start).toHaveBeenCalledOnce();
    expect(speech.micStarts).toBe(0);
  });

  it('prompts only when neither source can dictate', async () => {
    speech.available = false;
    await mount(fakeHost({ ready: false }).client);
    expect(problems).toEqual([]);
    await act(async () => api!.start());
    await flush();
    expect(status()).toBe('unavailable');
    expect(problems).toEqual(['unavailable']);
  });

  it('cancelling a Host dictation restores the draft', async () => {
    const { client, calls } = fakeHost({ ready: true, text: 'nope' });
    await mount(client);
    await act(async () => api!.start({ text: 'keep' }));
    await flush();
    await act(async () => speech.emit!(new Int16Array(16_000)));
    await flush();
    expect(draft()).toBe('keepnope');
    await act(async () => api!.cancel());
    await flush();
    expect(draft()).toBe('keep');
    expect(status()).toBe('idle');
    expect(calls.some((call) => call['kind'] === 'cancel')).toBe(true);
  });
});

describe('hostDictationReady', () => {
  it('treats a Host that does not answer in time as not ready', async () => {
    vi.useFakeTimers();
    try {
      const answer = hostDictationReady(fakeHost({ ready: 'hang' }).client, undefined);
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(answer).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers from the cached readiness while refreshing it', async () => {
    const { client, calls } = fakeHost({ ready: true });
    await expect(hostDictationReady(client, 'a', () => 0)).resolves.toBe(true);
    await expect(hostDictationReady(client, 'a', () => 1)).resolves.toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('is not ready without a connected Host', async () => {
    await expect(hostDictationReady(undefined, undefined)).resolves.toBe(false);
  });
});
