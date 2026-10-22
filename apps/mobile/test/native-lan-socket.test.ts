import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  available: true,
  listener: undefined as ((value: { id: string; type: string; text: string }) => void) | undefined,
  open: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('expo', () => ({
  requireOptionalNativeModule: () =>
    state.available
      ? {
          open: state.open,
          send: state.send,
          close: state.close,
          addListener: (_name: string, listener: typeof state.listener) => {
            state.listener = listener;
            return { remove: state.remove };
          },
        }
      : null,
}));
import { openLanSocket } from '../src/host/native-lan-socket';
afterEach(() => {
  vi.clearAllMocks();
  state.available = true;
});
it('keeps each native channel scoped and removes its event subscription on close', () => {
  const events = { open: vi.fn(), message: vi.fn(), closed: vi.fn() };
  const socket = openLanSocket('ws://192.168.1.20:39101/botharness-device/channel', events);
  const id = state.open.mock.calls[0]![0] as string;
  expect(state.open).toHaveBeenCalledWith(id, '192.168.1.20', 39101);
  state.listener!({ id: 'other', type: 'message', text: 'ignored' });
  expect(events.message).not.toHaveBeenCalled();
  state.listener!({ id, type: 'open', text: '' });
  expect(events.open).toHaveBeenCalledOnce();
  socket.send('h00');
  expect(state.send).toHaveBeenCalledWith(id, 'h00');
  socket.close();
  socket.close();
  expect(state.remove).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});
it('refuses public addresses, other paths and stale native builds', () => {
  const events = { open: vi.fn(), message: vi.fn(), closed: vi.fn() };
  for (const url of [
    'ws://8.8.8.8:90/botharness-device/channel',
    'ws://192.168.1.1:90/api',
    'ws://192.168.1.1:90/botharness-device/channel?token=x',
  ])
    expect(() => openLanSocket(url, events)).toThrow('lan-route-invalid');
  state.available = false;
  expect(() => openLanSocket('ws://192.168.1.20:39101/botharness-device/channel', events)).toThrow(
    'lan-build-required',
  );
  expect(state.open).not.toHaveBeenCalled();
});
