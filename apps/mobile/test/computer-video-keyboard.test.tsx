// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyboardInputEvent } from '../src/ui/chat/computer-video-keyboard';

interface NativeProps {
  session: string;
  opened: boolean;
  accepting: boolean;
  onInput(event: { nativeEvent: KeyboardInputEvent }): void;
  onDismissed(event: { nativeEvent: { session: string; reason?: 'queue-full' } }): void;
}
const native = vi.hoisted((): { current?: NativeProps } => ({}));
vi.mock('react-native', async () => {
  const { createElement } = await import('react');
  return {
    View: ({ children, ...props }: { children?: import('react').ReactNode }) =>
      createElement('div', props, children),
  };
});
vi.mock('expo', async () => {
  const { createElement } = await import('react');
  return {
    requireOptionalNativeModule: () => ({}),
    requireNativeView: () => (props: NativeProps) => {
      native.current = props;
      return createElement('div', { 'data-native-keyboard': true });
    },
  };
});
import { ComputerVideoKeyboard } from '../src/ui/chat/computer-video-keyboard';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  delete native.current;
  document.body.replaceChildren();
});
function props() {
  if (!native.current) throw Error('Native keyboard is not mounted');
  return native.current;
}
async function render(extra = {}, onInput = vi.fn(async () => true), onClose = vi.fn()) {
  if (!root) {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  await act(() =>
    root!.render(
      createElement(ComputerVideoKeyboard, {
        open: true,
        enabled: true,
        session: 'first',
        onInput,
        onClose,
        onFailure: vi.fn(),
        ...extra,
      }),
    ),
  );
  return { onInput, onClose };
}
const input: KeyboardInputEvent['input'] = { kind: 'type', text: '中文' };
describe('Computer native keyboard', () => {
  it('keeps one invisible native target across playback rerenders without a draft or Send controls', async () => {
    await render();
    const target = document.querySelector('[data-native-keyboard]');
    await render();
    expect(document.querySelector('[data-native-keyboard]')).toBe(target);
    expect(document.querySelector('input,textarea,button')).toBeNull();
    expect(props().opened).toBe(true);
  });
  it('forwards committed Unicode directly and does not close after acknowledgement', async () => {
    const { onInput, onClose } = await render();
    await act(() => props().onInput({ nativeEvent: { session: 'first', input } }));
    expect(onInput).toHaveBeenCalledWith(input);
    expect(onClose).not.toHaveBeenCalled();
  });
  it('rejects stale sessions, hidden input and unavailable control', async () => {
    const send = vi.fn(async () => true);
    await render({}, send);
    await act(() => props().onInput({ nativeEvent: { session: 'previous', input } }));
    await render({ open: false }, send);
    await act(() => props().onInput({ nativeEvent: { session: 'first', input } }));
    await render({ enabled: false }, send);
    await act(() => props().onInput({ nativeEvent: { session: 'first', input } }));
    expect(send).not.toHaveBeenCalled();
  });
  it('closes capture after uncertain input without replay', async () => {
    const send = vi.fn(async () => false);
    const onFailure = vi.fn();
    const { onClose } = await render({ onFailure }, send);
    await act(() => props().onInput({ nativeEvent: { session: 'first', input } }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith('input-unconfirmed');
  });
  it('stops without replay when native input capacity is exceeded', async () => {
    const onFailure = vi.fn();
    const { onInput, onClose } = await render({ onFailure });
    await act(() =>
      props().onDismissed({ nativeEvent: { session: 'previous', reason: 'queue-full' } }),
    );
    expect(onFailure).not.toHaveBeenCalled();
    await act(() =>
      props().onDismissed({ nativeEvent: { session: 'first', reason: 'queue-full' } }),
    );
    await act(() => props().onInput({ nativeEvent: { session: 'first', input } }));
    expect(onFailure).toHaveBeenCalledWith('queue-full');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onInput).not.toHaveBeenCalled();
  });
  it('native keyboard Back closes only its current session', async () => {
    const { onClose } = await render();
    await act(() => props().onDismissed({ nativeEvent: { session: 'previous' } }));
    expect(onClose).not.toHaveBeenCalled();
    await act(() => props().onDismissed({ nativeEvent: { session: 'first' } }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
