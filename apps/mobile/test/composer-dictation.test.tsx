// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const speech = vi.hoisted(() => ({
  listeners: new Map<string, (event: unknown) => void>(),
  available: true,
  granted: true,
  permission: undefined as Promise<{ granted: boolean }> | undefined,
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  gesture: undefined as Record<string, (...args: unknown[]) => unknown> | undefined,
}));

vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  const { createElement } = await import('react');
  const View = (props: Record<string, unknown>) => {
    if (props['__gesture'] !== undefined) speech.gesture = props['__gesture'] as never;
    const tap = props['onAccessibilityTap'] as (() => void) | undefined;
    return tap === undefined
      ? shim.View(props)
      : createElement(
          'button',
          { type: 'button', 'aria-label': props['accessibilityLabel'], onClick: tap },
          props['children'] as never,
        );
  };
  return {
    ...shim,
    View,
    Keyboard: { dismiss() {} },
    PanResponder: { create: (config: unknown) => ({ panHandlers: { __gesture: config } }) },
  };
});
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => speech.available,
    requestPermissionsAsync: () =>
      speech.permission ?? Promise.resolve({ granted: speech.granted }),
    start: speech.start,
    stop: speech.stop,
    abort: speech.abort,
  },
  useSpeechRecognitionEvent: (name: string, listener: (event: unknown) => void) => {
    speech.listeners.set(name, listener);
  },
}));

const { Composer } = await import('../src/ui/chat/composer');
const { useDictation } = await import('../src/host/speech');
const { t } = await import('../src/ui/strings');
const { played } = await import('./expo-haptics-shim');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const sent = vi.fn();

function Harness() {
  const [draft, setDraft] = useState('');
  const dictation = useDictation(setDraft);
  return (
    <>
      <span ref={dictation.mountRef} data-testid="status">
        {dictation.state.status}
      </span>
      <Composer
        value={draft}
        placeholder="Message Mika"
        disabled={false}
        files={[]}
        canAttach
        dictation={dictation.state.status}
        canDictate
        onChange={setDraft}
        onSend={() => sent(draft)}
        onPick={() => undefined}
        onRemove={() => undefined}
        onDictate={dictation.start}
        onStopDictation={dictation.stop}
        onCancelDictation={dictation.cancel}
      />
    </>
  );
}

let root: Root | undefined;
let host: HTMLElement;

beforeEach(async () => {
  speech.listeners.clear();
  speech.available = true;
  speech.granted = true;
  speech.permission = undefined;
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness />));
});

afterEach(() => {
  act(() => root?.unmount());
  host.remove();
});

const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const field = () => host.querySelector('textarea')!;
const status = () => host.querySelector('[data-testid="status"]')!.textContent;

async function press(label: string) {
  await act(async () => button(label)!.click());
}

async function emit(name: string, event: unknown = null) {
  await act(async () => speech.listeners.get(name)!(event));
}

const result = (transcript: string, isFinal: boolean) => ({
  isFinal,
  results: [{ transcript, confidence: 1, segments: [] }],
});

describe('Composer dictation', () => {
  it('shows the mic while empty and fills the field with what was heard', async () => {
    expect(button(t.dictate)).not.toBeNull();
    expect(button(t.send)).toBeNull();

    await press(t.dictate);
    expect(speech.start).toHaveBeenCalledWith(
      expect.objectContaining({ interimResults: true, continuous: false }),
    );
    expect(field().placeholder).toBe(t.dictationStarting);
    expect(button(t.stopDictation)).not.toBeNull();
    expect(button(t.cancelDictation)).not.toBeNull();
    expect(button(t.attach)).toBeNull();

    await emit('start');
    expect(field().placeholder).toBe(t.dictationListening);
    await emit('result', result('book a table', false));
    expect(field().value).toBe('book a table');
    expect(field().disabled).toBe(true);
    expect(button(t.send)).toBeNull();

    await press(t.stopDictation);
    expect(speech.stop).toHaveBeenCalled();
    await emit('result', result('Book a table for two.', true));
    await emit('end');

    expect(status()).toBe('idle');
    expect(field().value).toBe('Book a table for two.');
    expect(field().disabled).toBe(false);
    expect(button(t.dictate)).toBeNull();
    expect(played).toEqual([]);
    await press(t.send);
    expect(sent).toHaveBeenCalledWith('Book a table for two.');
    expect(played).toEqual(['impact:light']);
  });

  it('cancels a dictation and clears what it had written', async () => {
    await press(t.dictate);
    await emit('start');
    await emit('result', result('never mind', false));
    await press(t.cancelDictation);

    expect(speech.abort).toHaveBeenCalled();
    expect(field().value).toBe('');
    expect(status()).toBe('idle');
    expect(button(t.dictate)).not.toBeNull();
    await emit('error', { error: 'aborted', message: '' });
    await emit('end');
    expect(status()).toBe('idle');
  });

  it('does not start listening when permission is denied', async () => {
    speech.granted = false;
    await press(t.dictate);
    expect(speech.start).not.toHaveBeenCalled();
    expect(status()).toBe('denied');
    expect(button(t.dictate)).not.toBeNull();
  });

  it('does not start when speech recognition is unavailable', async () => {
    speech.available = false;
    await press(t.dictate);
    expect(speech.start).not.toHaveBeenCalled();
    expect(status()).toBe('unavailable');
  });

  it('does not start after the Human cancelled during the permission prompt', async () => {
    let allow: (value: { granted: boolean }) => void = () => undefined;
    speech.permission = new Promise((resolve) => {
      allow = resolve;
    });
    await press(t.dictate);
    await press(t.cancelDictation);
    await act(async () => allow({ granted: true }));
    expect(speech.start).not.toHaveBeenCalled();
    expect(status()).toBe('idle');
  });

  it('stops listening when the chat closes', async () => {
    await press(t.dictate);
    await emit('start');
    act(() => root!.unmount());
    root = undefined;
    expect(speech.abort).toHaveBeenCalledOnce();
  });
});

describe('Holding the mic', () => {
  const grab = async (heldMs: number, move?: { dx: number; dy: number }) => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    await act(async () => speech.gesture!['onPanResponderGrant']!());
    if (move !== undefined) await act(async () => speech.gesture!['onPanResponderMove']!({}, move));
    now.mockReturnValue(1_000 + heldMs);
    await act(async () => speech.gesture!['onPanResponderRelease']!());
    now.mockRestore();
  };

  it('listens while held and stops on release, keeping the text', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    await act(async () => speech.gesture!['onPanResponderGrant']!());
    expect(speech.start).toHaveBeenCalled();
    expect(field().placeholder).toBe(t.dictationHoldHint);
    await emit('start');
    await emit('result', result('see you at seven', false));
    now.mockReturnValue(2_500);
    await act(async () => speech.gesture!['onPanResponderRelease']!());
    now.mockRestore();
    expect(speech.stop).toHaveBeenCalled();
    await emit('result', result('See you at seven.', true));
    await emit('end');
    expect(field().value).toBe('See you at seven.');
  });

  it('cancels when the held mic slides left', async () => {
    await grab(1_500, { dx: -120, dy: 0 });
    expect(speech.abort).toHaveBeenCalled();
    expect(speech.stop).not.toHaveBeenCalled();
    expect(status()).toBe('idle');
  });

  it('locks when the held mic slides up, so releasing keeps listening', async () => {
    await grab(1_500, { dx: 0, dy: -90 });
    expect(speech.stop).not.toHaveBeenCalled();
    expect(status()).not.toBe('idle');
    expect(button(t.stopDictation)).not.toBeNull();
  });

  it('keeps listening after a quick tap until Stop', async () => {
    await grab(120);
    expect(speech.stop).not.toHaveBeenCalled();
    await emit('start');
    await grab(80);
    expect(speech.stop).toHaveBeenCalled();
  });
});
