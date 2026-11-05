// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const speech = vi.hoisted(() => ({
  scale: 1,
  platform: 'android',
  hardware: new Map<boolean, { enabled: boolean; onSend(): void }>(),
  listeners: new Map<string, (event: unknown) => void>(),
  available: true,
  granted: true,
  permission: undefined as Promise<{ granted: boolean }> | undefined,
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  gesture: undefined as Record<string, (...args: unknown[]) => unknown> | undefined,
}));

vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('../src/ui/primitives/hardware-send', async () => {
  const { View } = await import('./react-native-shim');
  return {
    HardwareSend: (props: { enter: boolean; enabled: boolean; onSend(): void }) => {
      speech.hardware.set(props.enter, props);
      return View(props);
    },
  };
});
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
    Platform: {
      ...shim.Platform,
      get OS() {
        return speech.platform;
      },
    },
    useWindowDimensions: () => ({ width: 402, height: 874, scale: 3, fontScale: speech.scale }),
    Dimensions: {
      get: () => ({ width: 402, height: 874, scale: 3, fontScale: speech.scale }),
      addEventListener: (_event: string, _changed: () => void) => ({ remove() {} }),
    },
    View,
    Keyboard: { dismiss() {} },
    PanResponder: { create: (config: unknown) => ({ panHandlers: { __gesture: config } }) },
  };
});
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./react-native-shim');
  return {
    default: { View: shim.View },
    ReduceMotion: { System: 'system' },
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: (style: () => object) => style(),
    withTiming: (value: number) => value,
  };
});
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('../src/ui/chat/composer-action', async (importOriginal) => {
  const fallback = await importOriginal<typeof import('../src/ui/chat/composer-action')>();
  const ios = await import('../src/ui/chat/composer-action.ios');
  return {
    ComposerActionButton: (props: Parameters<typeof fallback.ComposerActionButton>[0]) =>
      speech.platform === 'ios'
        ? createElement(ios.ComposerActionButton, props)
        : createElement(fallback.ComposerActionButton, props),
  };
});
vi.mock('../src/ui/chat/voice-button', async () => {
  const android = await import('../src/ui/chat/voice-button.android');
  const ios = await import('../src/ui/chat/voice-button.ios');
  return {
    VoiceButton: (props: Parameters<typeof android.VoiceButton>[0]) =>
      createElement(speech.platform === 'android' ? android.VoiceButton : ios.VoiceButton, props),
  };
});
vi.mock('../src/ui/chat/composer-hold', () => ({
  ComposerHold: ({
    children,
    onStart,
    onStop,
  }: {
    children: ReactNode;
    onStart(): void;
    onStop(): void;
  }) => {
    speech.gesture = { start: onStart, stop: onStop };
    return children;
  },
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: (label: string) => ({ label }),
  disabled: (disabled: boolean) => ({ disabled }),
  opacity: () => ({}),
  foregroundStyle: () => ({}),
  background: () => ({}),
  buttonBorderShape: () => ({}),
  buttonStyle: () => ({}),
  contentShape: () => ({}),
  frame: () => ({}),
  shapes: { circle: () => ({}), rectangle: () => ({}) },
}));
vi.mock('@expo/ui', () => ({
  Host: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Button: ({
    children,
    testID,
    onPress,
    modifiers,
  }: {
    children: ReactNode;
    testID?: string;
    onPress(): void;
    modifiers: Array<{ label?: string; disabled?: boolean }>;
  }) =>
    createElement(
      'button',
      {
        'data-testid': testID,
        'aria-label': modifiers.find((m) => m.label)?.label,
        disabled: modifiers.some((m) => m.disabled),
        onClick: onPress,
      },
      children,
    ),
  Image: () => null,
}));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('expo-router', () => ({ usePreventRemove: () => {} }));
vi.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => speech.available,
    getPermissionsAsync: () =>
      Promise.resolve({ granted: speech.granted && speech.permission === undefined }),
    requestPermissionsAsync: vi.fn(
      () => speech.permission ?? Promise.resolve({ granted: speech.granted }),
    ),
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
const { ExpoSpeechRecognitionModule } = await import('expo-speech-recognition');
const { t } = await import('../src/ui/strings');
const { played } = await import('./expo-haptics-shim');
const { setHapticsEnabled } = await import('../src/ui/haptics');
const { interfacePreferences } = await import('../src/ui/interface-preferences');
const strings = await import('../src/ui/strings');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const sent = vi.fn();

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  const dictation = useDictation(setDraft);
  return (
    <>
      <span ref={dictation.mountRef} data-testid="status">
        {dictation.state.status}
      </span>
      <Composer
        value={draft}
        above={
          <button type="button" aria-label="Pick Mika" onClick={() => setDraft('@Mika ')}>
            Mika
          </button>
        }
        placeholder="Message Mika"
        disabled={disabled}
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
  setHapticsEnabled(true);
  speech.platform = 'android';
  speech.scale = 1;
  speech.hardware.clear();
  played.length = 0;
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
  interfacePreferences.setLanguage('system');
  interfacePreferences.setAppearance('system');
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
  it.each(['ios', 'android'])(
    'retains the mounted draft and caret while language and appearance change on %s',
    async (platform) => {
      speech.platform = platform;
      await press('Pick Mika');
      const input = field();
      input.focus();
      input.setSelectionRange(1, 3);
      await act(async () => interfacePreferences.setLanguage('zh'));
      expect(button(strings.t.send)).not.toBeNull();
      await act(async () => interfacePreferences.setAppearance('dark'));
      expect(field()).toBe(input);
      expect(input.value).toBe('@Mika ');
      expect(input.selectionStart).toBe(1);
      expect(input.selectionEnd).toBe(3);
      expect(document.activeElement).toBe(input);
      await act(async () => interfacePreferences.setLanguage('en'));
      expect(field()).toBe(input);
      expect(button(strings.t.send)).not.toBeNull();
      expect(sent).not.toHaveBeenCalled();
    },
  );
  it.each(['ios', 'android'])(
    'keeps Send disabled through disconnect and restores the same draft on %s',
    async (platform) => {
      speech.platform = platform;
      await press('Pick Mika');
      const input = field();
      expect(button(t.send)?.disabled).toBe(false);
      await act(async () => root!.render(<Harness disabled />));
      const send = button(t.send);
      expect(send).not.toBeNull();
      expect(send!.disabled).toBe(true);
      expect(speech.hardware.get(true)?.enabled).toBe(false);
      await act(async () => speech.hardware.get(true)?.onSend());
      await act(async () => send!.click());
      expect(sent).not.toHaveBeenCalled();
      expect(played).toEqual([]);
      expect(field()).toBe(input);
      expect(field().value).toBe('@Mika ');
      await act(async () => root!.render(<Harness />));
      expect(button(t.send)).toBe(send);
      expect(send!.disabled).toBe(false);
      await press(t.send);
      expect(sent).toHaveBeenCalledExactlyOnceWith('@Mika ');
      expect(played).toEqual(['impact:light']);
    },
  );

  it.each(['ios', 'android'])(
    'keeps the expanded editor open with disabled Send during disconnection on %s',
    async (platform) => {
      speech.platform = platform;
      speech.scale = 3;
      await press('Pick Mika');
      await act(async () => root!.render(<Harness />));
      await press(t.expandDraft);
      const editor = () => host.querySelector('[role="dialog"]')!;
      const editorSend = () =>
        editor().querySelector<HTMLButtonElement>(`button[aria-label="${t.send}"]`)!;
      const send = editorSend();
      await act(async () => root!.render(<Harness disabled />));
      expect(editorSend()).toBe(send);
      expect(send.disabled).toBe(true);
      expect(speech.hardware.get(false)?.enabled).toBe(false);
      await act(async () => speech.hardware.get(false)?.onSend());
      await act(async () => send.click());
      expect(sent).not.toHaveBeenCalled();
      expect(played).toEqual([]);
      expect(editor()).not.toBeNull();
      expect(editor().querySelector('textarea')!.value).toBe('@Mika ');
      await act(async () => root!.render(<Harness />));
      expect(send.disabled).toBe(false);
      await act(async () => send.click());
      expect(sent).toHaveBeenCalledExactlyOnceWith('@Mika ');
      expect(played).toEqual(['impact:light']);
      expect(editor()).toBeNull();
    },
  );

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

describe('Composer test IDs', () => {
  const byId = (id: string) => host.querySelector(`[data-testid="${id}"]`);

  it('keeps stable test IDs on the field, attach and send controls', async () => {
    expect(byId('composer-input')).toBe(field());
    expect(byId('composer-attach')?.getAttribute('aria-label')).toBe(t.attach);
    expect(byId('composer-send')).toBeNull();

    await press('Pick Mika');
    expect(byId('composer-send')?.getAttribute('aria-label')).toBe(t.send);
  });
});

describe('Holding the Android input', () => {
  it('starts an already-authorized hold without reopening the permission activity', async () => {
    await act(async () => speech.gesture!['start']!());
    expect(speech.start).toHaveBeenCalledOnce();
    expect(ExpoSpeechRecognitionModule.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(status()).toBe('starting');
    expect(sent).not.toHaveBeenCalled();
  });

  it('clears the held hint after native end before finger release without losing the draft', async () => {
    await act(async () => speech.gesture!['start']!());
    await emit('start');
    await emit('result', result('Keep this draft', true));
    await emit('end');
    expect(field().placeholder).toBe(t.composerInputHint);
    expect(field().value).toBe('Keep this draft');
    await act(async () => speech.gesture!['stop']!());
    expect(field().value).toBe('Keep this draft');
    expect(sent).not.toHaveBeenCalled();
  });
  it('stops on release and retains the final transcript for manual Send', async () => {
    await act(async () => speech.gesture!['start']!());
    expect(speech.start).toHaveBeenCalled();
    expect(field().placeholder).toBe(t.dictationReleaseHint);
    await emit('start');
    await emit('result', result('see you at seven', false));
    await act(async () => speech.gesture!['stop']!());
    expect(speech.stop).toHaveBeenCalledOnce();
    await emit('result', result('See you at seven.', true));
    await emit('end');
    expect(field().value).toBe('See you at seven.');
    expect(sent).not.toHaveBeenCalled();
    await press(t.send);
    expect(sent).toHaveBeenCalledExactlyOnceWith('See you at seven.');
  });

  it('does not start later when released while permission is pending', async () => {
    let resolve!: (value: { granted: boolean }) => void;
    speech.permission = new Promise((done) => {
      resolve = done;
    });
    await act(async () => speech.gesture!['start']!());
    await act(async () => speech.gesture!['stop']!());
    await act(async () => resolve({ granted: true }));
    expect(speech.start).not.toHaveBeenCalled();
    expect(status()).toBe('idle');
    expect(sent).not.toHaveBeenCalled();
  });

  it('keeps microphone taps available without a hold or lock gesture', async () => {
    await press(t.dictate);
    await emit('start');
    expect(speech.stop).not.toHaveBeenCalled();
    await press(t.stopDictation);
    expect(speech.stop).toHaveBeenCalledOnce();
    expect(sent).not.toHaveBeenCalled();
  });
});

describe('native compose bar', () => {
  it('keeps +, the input and mic or Send inside one field capsule', async () => {
    const attach = button(t.attach)!;
    const capsule = attach.parentElement!.parentElement!;
    expect(capsule.contains(field())).toBe(true);
    expect(capsule.contains(button(t.dictate))).toBe(true);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        field(),
        'Hello',
      );
      field().dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(capsule.contains(button(t.send))).toBe(true);
    expect(button(t.attach)).toBe(attach);
  });

  it('puts cancel in the + slot while listening', async () => {
    const slot = button(t.attach)!.parentElement!;
    await press(t.dictate);
    expect(button(t.attach)).toBeNull();
    expect(button(t.cancelDictation)!.parentElement).toBe(slot);
  });
});

describe('expanded draft', () => {
  it('shares edits with the existing composer and sends the current draft once', async () => {
    const original = field();
    speech.scale = 3.571;
    await act(async () => root!.render(<Harness />));
    expect(field()).toBe(original);
    await press(t.expandDraft);
    expect(host.querySelectorAll('button[aria-label="Pick Mika"]')).toHaveLength(1);
    const choice = host.querySelector<HTMLButtonElement>(
      '[role="dialog"] button[aria-label="Pick Mika"]',
    )!;
    await act(async () => choice.click());
    const editor = host.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!;
    expect(editor.value).toBe('@Mika ');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        editor,
        'Long draft updated',
      );
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(original.value).toBe('Long draft updated');
    await press(t.done);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(field()).toBe(original);
    expect(field().value).toBe('Long draft updated');
    await press(t.expandDraft);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(`[role="dialog"] button[aria-label="${t.send}"]`)!
        .click(),
    );
    expect(sent).toHaveBeenCalledExactlyOnceWith('Long draft updated');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe.each(['ios', 'android'])('%s composer haptic coverage', (platform) => {
  it('acknowledges attachment opening once, closes silently and can reopen', async () => {
    speech.platform = platform;
    await act(async () => root!.render(<Harness />));
    const attach = button(t.attach)!;
    await act(async () => {
      attach.click();
      attach.click();
    });
    expect(played).toEqual(['impact:light']);
    expect(button(t.attach)).not.toBeNull();
    await press(t.close);
    await press(t.attach);
    expect(played).toEqual(['impact:light', 'impact:light']);
    await press(t.attachPhotos);
    expect(played).toEqual(['impact:light', 'impact:light']);
    expect(button(t.attach)).not.toBeNull();
  });

  it('keeps attachment and compact/expanded send functional with feedback off', async () => {
    speech.platform = platform;
    speech.scale = 3;
    setHapticsEnabled(false);
    await act(async () => root!.render(<Harness />));
    await press(t.attach);
    expect(button(t.close)).not.toBeNull();
    await press(t.close);
    await press('Pick Mika');
    await press(t.send);
    expect(sent).toHaveBeenCalledTimes(1);
    await press(t.expandDraft);
    const send = host.querySelector<HTMLButtonElement>(
      `[role="dialog"] button[aria-label="${t.send}"]`,
    )!;
    await act(async () => send.click());
    expect(sent).toHaveBeenCalledTimes(2);
    expect(played).toEqual([]);
    setHapticsEnabled(true);
    await press(t.send);
    expect(played).toEqual(['impact:light']);
  });
});
