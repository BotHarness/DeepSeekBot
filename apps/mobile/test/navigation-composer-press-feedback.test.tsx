// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({ scheme: 'light' as 'light' | 'dark', platform: 'android' }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: {
    get OS() {
      return device.platform;
    },
  },
  useColorScheme: () => device.scheme,
  Pressable: (props: {
    accessibilityLabel: string;
    children: ReactNode;
    onPress(): void;
    style: Record<string, unknown> | ((state: { pressed: boolean }) => Record<string, unknown>);
    android_ripple?: { color: string };
  }) => {
    const [pressed, setPressed] = useState(false);
    const style = typeof props.style === 'function' ? props.style({ pressed }) : props.style;
    return createElement(
      'button',
      {
        'aria-label': props.accessibilityLabel,
        'data-fill': style?.backgroundColor,
        'data-ripple': props.android_ripple?.color,
        onMouseDown: () => setPressed(true),
        onMouseUp: () => setPressed(false),
        onMouseLeave: () => setPressed(false),
        onClick: props.onPress,
      },
      props.children,
    );
  },
}));
vi.mock('react-native-reanimated', async () => ({
  default: { View: (await import('./react-native-shim')).View },
  ReduceMotion: { System: 'system' },
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: (style: () => object) => style(),
  withTiming: (value: number) => value,
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('expo-router', () => ({ usePreventRemove: () => {} }));
vi.mock('../src/ui/chat/voice-button', () => ({ VoiceButton: () => null }));
vi.mock('../src/ui/chat/draft-editor', () => ({ DraftEditor: () => null }));
vi.mock('../src/ui/shell/icons', () => ({
  ArrowUpIcon: () => null,
  CameraIcon: () => null,
  ChevronUpIcon: () => null,
  CloseIcon: () => null,
  FileIcon: () => null,
  LockIcon: () => null,
  PhotoIcon: () => null,
  PlusIcon: () => null,
}));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));

import { Composer } from '../src/ui/chat/composer';
import { NavigationAction } from '../src/ui/shell/navigation-action';
import { pressTint, resolveTheme } from '../src/ui/design/theme';
import { haptic } from '../src/ui/haptics';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLElement;
beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const press = (button: HTMLButtonElement, event: string) =>
  act(() => {
    button.dispatchEvent(new MouseEvent(event, { bubbles: true }));
  });

describe.each(['light', 'dark'] as const)('%s pressed visual tokens', (scheme) => {
  it('highlights the default navigation action immediately, restores on cancellation, and has a ripple', () => {
    device.scheme = scheme;
    const theme = resolveTheme(scheme, {}, 'android');
    const onPress = vi.fn();
    act(() =>
      root.render(<NavigationAction size={theme.touch} label="Create" onPress={onPress} />),
    );
    const button = host.querySelector('button')!;
    expect(button.dataset.fill).toBe('transparent');
    expect(button.dataset.ripple).toBe(pressTint(theme.color.fg));
    press(button, 'mousedown');
    expect(button.dataset.fill).toBe(theme.layer.raised.pressed);
    expect(onPress).not.toHaveBeenCalled();
    press(button, 'mouseout');
    expect(button.dataset.fill).toBe('transparent');
    expect(onPress).not.toHaveBeenCalled();
    act(() => button.click());
    expect(onPress).toHaveBeenCalledOnce();
    expect(haptic).not.toHaveBeenCalled();
  });

  it('changes only the attachment remove visual during a press and removes once on activation', () => {
    device.scheme = scheme;
    const theme = resolveTheme(scheme, {}, 'android');
    const onRemove = vi.fn();
    const noop = () => {};
    act(() =>
      root.render(
        <Composer
          value=""
          placeholder="Message"
          disabled={false}
          files={[
            {
              id: 'attachment',
              name: 'note.txt',
              kind: 'file',
              uri: 'file:///note.txt',
              read: async () => new Blob(),
            },
          ]}
          canAttach
          dictation="idle"
          canDictate={false}
          onChange={noop}
          onSend={noop}
          onPick={noop}
          onRemove={onRemove}
          onDictate={noop}
          onStopDictation={noop}
          onCancelDictation={noop}
        />,
      ),
    );
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.removeAttachment('note.txt')}"]`,
    )!;
    expect(button.dataset.fill).toBe(theme.color.fg);
    expect(button.dataset.ripple).toBe(pressTint(theme.color.base));
    press(button, 'mousedown');
    expect(button.dataset.fill).toBe(theme.color.muted);
    expect(onRemove).not.toHaveBeenCalled();
    press(button, 'mouseout');
    expect(button.dataset.fill).toBe(theme.color.fg);
    expect(onRemove).not.toHaveBeenCalled();
    act(() => button.click());
    expect(onRemove).toHaveBeenCalledExactlyOnceWith('attachment');
    expect(haptic).not.toHaveBeenCalled();
  });
});
