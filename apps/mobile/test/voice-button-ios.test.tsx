// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const speech = vi.hoisted(() => ({
  listeners: new Map<string, (event: unknown) => void>(),
  permission: undefined as Promise<{ granted: boolean }> | undefined,
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  held: vi.fn(),
}));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return { ...shim, Platform: { ...shim.Platform, OS: 'ios' } };
});
vi.mock('../src/ui/chat/composer-chrome', async () => import('../src/ui/chat/composer-chrome.ios'));
vi.mock('../src/ui/primitives/drawer-material', () => ({ useLiquidGlass: () => true }));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  foregroundStyle: () => ({}),
  accessibilityLabel: (label: string) => ({ label }),
  buttonStyle: () => ({}),
  buttonBorderShape: () => ({}),
  contentShape: () => ({}),
  background: () => ({}),
  frame: (params: unknown) => ({ frame: params }),
  shapes: { circle: () => ({}), rectangle: () => ({}) },
}));
vi.mock('@expo/ui', () => ({
  Host: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Button: ({
    children,
    onPress,
    testID,
    modifiers,
  }: {
    children: ReactNode;
    onPress(): void;
    testID?: string;
    modifiers: Array<{ label?: string }>;
  }) =>
    createElement(
      'button',
      {
        'aria-label': modifiers.find((m) => m.label)?.label,
        'data-testid': testID,
        onClick: onPress,
      },
      children,
    ),
  Image: ({
    systemName,
    modifiers,
  }: {
    systemName: string;
    modifiers: Array<{ frame?: unknown }>;
  }) =>
    createElement('span', {
      'data-symbol': systemName,
      'data-frame': JSON.stringify(modifiers.find((m) => m.frame)?.frame),
    }),
}));
vi.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => true,
    requestPermissionsAsync: () => speech.permission ?? Promise.resolve({ granted: true }),
    start: speech.start,
    stop: speech.stop,
    abort: speech.abort,
  },
  useSpeechRecognitionEvent: (name: string, listener: (event: unknown) => void) => {
    speech.listeners.set(name, listener);
  },
}));
const { VoiceButton } = await import('../src/ui/chat/voice-button.ios');
const { useDictation } = await import('../src/host/speech');
const { dictating } = await import('../src/ui/chat/dictation');
const { t } = await import('../src/ui/strings');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
function Harness() {
  const [draft, setDraft] = useState('');
  const dictation = useDictation(setDraft);
  return (
    <>
      <span ref={dictation.mountRef} data-testid="status">
        {dictation.state.status}
      </span>
      <span data-testid="draft">{draft}</span>
      <VoiceButton
        active={dictating(dictation.state.status)}
        onStart={dictation.start}
        onStop={dictation.stop}
        onCancel={dictation.cancel}
        onHeld={speech.held}
      />
      <button onClick={dictation.cancel} aria-label={t.cancelDictation}>
        Cancel
      </button>
    </>
  );
}
beforeEach(async () => {
  vi.clearAllMocks();
  speech.listeners.clear();
  speech.permission = undefined;
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(() => act(() => root.unmount()));
const button = () =>
  container.querySelector<HTMLButtonElement>('[data-testid="composer-dictation"]')!;
const status = () => container.querySelector('[data-testid="status"]')!.textContent;
const draft = () => container.querySelector('[data-testid="draft"]')!.textContent;
async function press() {
  await act(async () => button().click());
}
async function emit(name: string, event: unknown = null) {
  await act(async () => speech.listeners.get(name)!(event));
}

it('starts once through the native button, stops on the next activation and preserves the draft', async () => {
  expect(button().getAttribute('aria-label')).toBe(t.dictate);
  expect(button().querySelector('[data-symbol="mic.fill"]')).not.toBeNull();
  await press();
  expect(speech.start).toHaveBeenCalledTimes(1);
  expect(status()).toBe('starting');
  expect(button().getAttribute('aria-label')).toBe(t.stopDictation);
  expect(button().querySelector('[data-symbol="stop.fill"]')).not.toBeNull();
  await emit('start');
  await emit('result', { results: [{ transcript: 'Synthetic test draft' }] });
  expect(speech.stop).not.toHaveBeenCalled();
  expect(speech.abort).not.toHaveBeenCalled();
  await press();
  expect(speech.stop).toHaveBeenCalledTimes(1);
  await emit('end');
  expect(draft()).toBe('Synthetic test draft');
  expect(button().getAttribute('aria-label')).toBe(t.dictate);
  await press();
  expect(speech.start).toHaveBeenCalledTimes(2);
  expect(speech.held).not.toHaveBeenCalled();
});

it('does not start or stop on touch-down or a held touch without native activation', async () => {
  await act(async () => {
    button().dispatchEvent(new Event('touchstart', { bubbles: true }));
    button().dispatchEvent(new Event('touchend', { bubbles: true }));
  });
  expect(speech.start).not.toHaveBeenCalled();
  expect(speech.stop).not.toHaveBeenCalled();
  expect(speech.held).not.toHaveBeenCalled();
  await press();
  expect(speech.start).toHaveBeenCalledTimes(1);
  expect(speech.stop).not.toHaveBeenCalled();
});

it('cancels a pending permission request without starting when the grant arrives', async () => {
  let grant!: (permission: { granted: boolean }) => void;
  speech.permission = new Promise((resolve) => {
    grant = resolve;
  });
  await press();
  expect(status()).toBe('starting');
  await press();
  await act(async () => grant({ granted: true }));
  expect(speech.start).not.toHaveBeenCalled();
  expect(speech.abort).toHaveBeenCalledTimes(1);
  expect(button().getAttribute('aria-label')).toBe(t.dictate);
});

it('keeps explicit cancel available and discards dictated text', async () => {
  await press();
  await emit('start');
  await emit('result', { results: [{ transcript: 'Synthetic test draft' }] });
  await act(async () =>
    container.querySelector<HTMLButtonElement>(`[aria-label="${t.cancelDictation}"]`)!.click(),
  );
  expect(speech.abort).toHaveBeenCalledTimes(1);
  expect(draft()).toBe('');
  expect(button().getAttribute('aria-label')).toBe(t.dictate);
});

it('returns to a usable microphone after permission denial or a native error', async () => {
  speech.permission = Promise.resolve({ granted: false });
  await press();
  expect(speech.start).not.toHaveBeenCalled();
  expect(button().getAttribute('aria-label')).toBe(t.dictate);
  speech.permission = undefined;
  await press();
  await emit('error', { error: 'audio-capture' });
  await emit('end');
  expect(button().getAttribute('aria-label')).toBe(t.dictate);
  await press();
  expect(speech.start).toHaveBeenCalledTimes(2);
});

it('gives both symbols an explicitly centered full-size native frame', async () => {
  const frame = () =>
    JSON.parse(button().querySelector('[data-frame]')!.getAttribute('data-frame')!);
  const idle = frame();
  expect(idle.width).toBeGreaterThanOrEqual(44);
  expect(idle).toEqual({ width: idle.width, height: idle.width, alignment: 'center' });
  await press();
  expect(frame()).toEqual(idle);
});

it.each(['silence timer', 'iOS 18 phrase boundary'])(
  'keeps listening through a pause (%s) and accepts the next phrase until explicit Stop',
  async (boundary) => {
    vi.useFakeTimers();
    try {
      await press();
      await emit('start');
      await emit('result', { isFinal: false, results: [{ transcript: 'First phrase.' }] });
      const options = speech.start.mock.calls.at(-1)![0] as { continuous: boolean };
      await act(async () => {
        setTimeout(
          () => {
            if (!options.continuous) speech.listeners.get('end')!(null);
          },
          boundary === 'silence timer' ? 3_000 : 1_000,
        );
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(status()).toBe('listening');
      expect(button().getAttribute('aria-label')).toBe(t.stopDictation);
      expect(speech.stop).not.toHaveBeenCalled();
      expect(speech.abort).not.toHaveBeenCalled();
      await emit('result', {
        isFinal: false,
        results: [{ transcript: 'First phrase. Second phrase.' }],
      });
      expect(draft()).toBe('First phrase. Second phrase.');
      await press();
      expect(speech.stop).toHaveBeenCalledTimes(1);
      await emit('result', {
        isFinal: true,
        results: [{ transcript: 'First phrase. Second phrase!' }],
      });
      await emit('end');
      expect(status()).toBe('idle');
      expect(draft()).toBe('First phrase. Second phrase!');
    } finally {
      vi.useRealTimers();
    }
  },
);
