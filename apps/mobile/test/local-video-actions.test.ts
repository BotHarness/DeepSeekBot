import { expect, it, vi } from 'vitest';
import { localVideoActions, watchLocalVideoForeground } from '../src/host/local-video-actions';
import type { LocalVideoClientState } from '../../../packages/computer/src/local-video-client';
import type { ConnectionState } from '../src/host/client';

const connected = {
  status: 'connected',
  route: 'http://192.168.1.2:4321',
} satisfies ConnectionState;

it('keeps one hand-back action and Reconnect available when a stall removes input eligibility', () => {
  const state: LocalVideoClientState = {
    status: 'observing',
    presenting: false,
    busy: false,
    code: undefined,
    host: {
      computerId: 'local',
      runtimeId: 'runtime',
      paused: true,
      controller: false,
      viewerCount: 1,
      controlHeld: true,
      lastInputSequence: 0,
      binding: {
        computerId: 'local',
        runtimeId: 'runtime',
        viewerId: 'viewer',
        attemptId: 'attempt',
      },
      grant: { generation: 1, expiresAt: 30000 },
      media: { status: 'stalled', captureAlive: true, width: 1280, height: 720 },
    },
  };
  expect(localVideoActions(state, connected)).toEqual({ handBack: true, recovery: 'video' });
  const { grant: _grant, ...released } = state.host!;
  expect(localVideoActions({ ...state, host: released }, connected)).toEqual({
    handBack: true,
    recovery: 'video',
  });
  expect(
    localVideoActions(
      { ...state, host: { ...released, paused: false, controlHeld: false } },
      connected,
    ),
  ).toEqual({ handBack: false, recovery: 'video' });
  expect(localVideoActions({ ...state, host: undefined, status: 'opening' }, connected)).toEqual({
    handBack: false,
    recovery: undefined,
  });
});

it.each([
  {
    connection: { status: 'unreachable', route: connected.route, attempt: 1, reason: 'network' },
    recovery: 'host',
  },
  { connection: { status: 'reconnecting', route: connected.route, attempt: 2 }, recovery: 'host' },
  {
    connection: {
      status: 'refused',
      route: connected.route,
      code: 'device-revoked',
      reason: 'revoked',
    },
    recovery: 'pair',
  },
  { connection: { status: 'connecting', route: connected.route }, recovery: undefined },
  { connection: { status: 'stopped', route: connected.route }, recovery: undefined },
] satisfies Array<{ connection: ConnectionState; recovery: 'host' | 'pair' | undefined }>)(
  'offers $recovery for $connection.status even without a video binding',
  ({ connection, recovery }) => {
    const state: LocalVideoClientState = {
      status: 'idle',
      host: undefined,
      presenting: false,
      busy: false,
      code: undefined,
    };
    expect(localVideoActions(state, connection)).toEqual({ handBack: false, recovery });
  },
);

it('starts only while foreground and retires the listener on blur or disconnection', () => {
  const viewer = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  let foreground: (active: boolean) => void = () => {};
  const remove = vi.fn();
  const close = watchLocalVideoForeground(viewer, false, (listener) => {
    foreground = listener;
    return remove;
  });
  expect(viewer.start).not.toHaveBeenCalled();
  foreground(true);
  foreground(true);
  expect(viewer.start).toHaveBeenCalledTimes(1);
  foreground(false);
  expect(viewer.stop).toHaveBeenCalledTimes(1);
  foreground(true);
  expect(viewer.start).toHaveBeenCalledTimes(2);
  close();
  close();
  foreground(true);
  foreground(false);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(viewer.stop).toHaveBeenCalledTimes(2);
  expect(viewer.start).toHaveBeenCalledTimes(2);
});

it('allows a new focused lifetime while an old cleaned listener stays retired', () => {
  const events: string[] = [];
  const viewer = {
    start: async () => {
      events.push('start');
    },
    stop: async () => {
      events.push('stop');
    },
  };
  let oldForeground: (active: boolean) => void = () => {};
  const first = watchLocalVideoForeground(viewer, true, (listener) => {
    oldForeground = listener;
    return () => events.push('unsubscribe');
  });
  first();
  const second = watchLocalVideoForeground(viewer, true, () => () => events.push('unsubscribe'));
  oldForeground(false);
  expect(events).toEqual(['start', 'unsubscribe', 'stop', 'start']);
  second();
  expect(events).toEqual(['start', 'unsubscribe', 'stop', 'start', 'unsubscribe', 'stop']);
});
