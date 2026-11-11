// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Bounds = { x: number; y: number; width: number; height: number } | null;

const state = vi.hoisted(() => ({
  tag: 7 as number | null,
  answer: (): Promise<Bounds> => Promise.resolve(null),
  layout: undefined as undefined | (() => void),
  detached: false,
}));

vi.mock('expo', () => ({
  requireOptionalNativeModule: () => ({
    supported: true,
    measureInWindow: () => state.answer(),
  }),
}));
vi.mock('react-native', () => ({ findNodeHandle: () => state.tag }));
vi.mock(
  '../src/ui/primitives/measure-message-view',
  () => import('../src/ui/primitives/measure-message-view.android'),
);
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  const View = (props: {
    ref?: { current: unknown };
    onLayout?: () => void;
    style?: Array<{ opacity?: number } | undefined>;
    children?: ReactNode;
  }) => {
    if (props.ref) props.ref.current = state.detached ? null : {};
    state.layout = props.onLayout;
    const opacity = props.style?.find((style) => style?.opacity !== undefined)?.opacity;
    return createElement('div', { 'data-opacity': opacity }, props.children);
  };
  const { useRef } = await import('react');
  const useSharedValue = <T,>(value: T) => useRef(shim.useSharedValue(value)).current;
  return { ...shim, useSharedValue, default: { ...shim.default, View } };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  state.tag = 7;
  state.answer = () => Promise.resolve(null);
  state.layout = undefined;
  state.detached = false;
});

async function measure() {
  vi.stubEnv('EXPO_PUBLIC_CHAT_LIST', 'recycler');
  const { measureMessageView } = await import('../src/ui/primitives/measure-message-view.android');
  const measured = vi.fn();
  const failed = vi.fn();
  measureMessageView({} as never, measured, failed);
  await Promise.resolve();
  await Promise.resolve();
  return { measured, failed };
}

describe('Recycler message measurement', () => {
  it('reports a view the native list has not attached yet as failed', async () => {
    const { measured, failed } = await measure();
    expect(measured).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('reports a rejected native measurement as failed', async () => {
    state.answer = () => Promise.reject(new Error('gone'));
    const { failed } = await measure();
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('reports a view without a native tag as failed', async () => {
    state.tag = null;
    const { failed } = await measure();
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('reports a missing view as failed without measuring', async () => {
    vi.stubEnv('EXPO_PUBLIC_CHAT_LIST', 'recycler');
    const { measureMessageView } =
      await import('../src/ui/primitives/measure-message-view.android');
    const measured = vi.fn();
    const failed = vi.fn();
    measureMessageView(null, measured, failed);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(measured).not.toHaveBeenCalled();
  });

  it('passes native window bounds through once', async () => {
    state.answer = () => Promise.resolve({ x: 1, y: 2, width: 3, height: 4 });
    const { measured, failed } = await measure();
    expect(measured).toHaveBeenCalledWith(1, 2, 3, 4);
    expect(failed).not.toHaveBeenCalled();
  });
});

describe('send flight frame', () => {
  it('shows and lands the sent bubble when it cannot be measured', async () => {
    vi.stubEnv('EXPO_PUBLIC_CHAT_LIST', 'recycler');
    const { SendFlyFrame } = await import('../src/ui/chat/send-fly-frame');
    const { createSendFlights } = await import('../src/ui/chat/send-fly');
    const flights = createSendFlights(true);
    const flight = { from: { x: 0, y: 700, width: 200, height: 22 } };
    flights.launch('m1', flight);
    const container = document.createElement('div');
    const root = createRoot(container);
    const render = () =>
      root.render(
        <SendFlyFrame messageId="m1" flight={flight} flights={flights} style={undefined}>
          <span>hello</span>
        </SendFlyFrame>,
      );
    await act(async () => render());
    expect(container.querySelector('[data-opacity]')?.getAttribute('data-opacity')).toBe('0');
    await act(async () => {
      state.layout?.();
      await Promise.resolve();
    });
    await act(async () => render());
    expect(container.querySelector('[data-opacity]')?.getAttribute('data-opacity')).toBe('1');
    expect(flights.flight('m1')).toBeUndefined();
    await act(async () => root.unmount());
  });

  it('shows and lands the sent bubble when its view reference is missing', async () => {
    vi.stubEnv('EXPO_PUBLIC_CHAT_LIST', 'recycler');
    state.detached = true;
    const { SendFlyFrame } = await import('../src/ui/chat/send-fly-frame');
    const { createSendFlights } = await import('../src/ui/chat/send-fly');
    const flights = createSendFlights(true);
    const flight = { from: { x: 0, y: 700, width: 200, height: 22 } };
    flights.launch('m1', flight);
    const container = document.createElement('div');
    const root = createRoot(container);
    const render = () =>
      root.render(
        <SendFlyFrame messageId="m1" flight={flight} flights={flights} style={undefined}>
          <span>hello</span>
        </SendFlyFrame>,
      );
    await act(async () => render());
    expect(container.querySelector('[data-opacity]')?.getAttribute('data-opacity')).toBe('0');
    await act(async () => {
      state.layout?.();
      await Promise.resolve();
    });
    await act(async () => render());
    expect(container.querySelector('[data-opacity]')?.getAttribute('data-opacity')).toBe('1');
    expect(flights.flight('m1')).toBeUndefined();
    await act(async () => root.unmount());
  });
});
