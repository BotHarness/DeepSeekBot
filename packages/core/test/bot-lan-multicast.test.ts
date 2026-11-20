import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createLanBotDiscovery } from '../src/devices/bot-lan-discovery.js';

const native = vi.hoisted(() => ({ socket: vi.fn(), interfaces: vi.fn() }));
vi.mock('node:dgram', () => ({ createSocket: native.socket }));
vi.mock('node:os', () => ({ networkInterfaces: native.interfaces }));

class Socket extends EventEmitter {
  failure?: 'bind' | 'setup' | 'send';
  selected = 'default';
  sent: string[] = [];
  joins: string[] = [];
  close = vi.fn();
  unref() {}
  setMulticastTTL() {}
  setMulticastLoopback() {}
  setMulticastInterface(address: string) {
    this.selected = address;
  }
  addMembership(_group: string, address: string) {
    if (this.failure === 'setup') throw new Error('private-interface-details');
    this.joins.push(address);
  }
  bind(_port: number, _address: string, ready: () => void) {
    queueMicrotask(() => {
      if (this.failure === 'bind') this.emit('error', new Error('private-bind-details'));
      else ready();
    });
  }
  send(_packet: Uint8Array, _port: number, _group: string, done: (error: Error | null) => void) {
    queueMicrotask(() => {
      this.sent.push(this.selected);
      done(this.failure === 'send' ? new Error('private-send-details') : null);
    });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

it.each([
  ['bind', 'lan-bind-failed'],
  ['setup', 'lan-multicast-setup-failed'],
  ['send', 'lan-send-failed'],
] as const)('closes after %s failure and reports only its bounded code', async (failure, code) => {
  const socket = new Socket();
  socket.failure = failure;
  native.socket.mockReturnValue(socket);
  native.interfaces.mockReturnValue({
    ethernet: [{ internal: false, family: 'IPv4', address: '192.168.1.4' }],
  });
  const record = vi.fn();
  const discovery = createLanBotDiscovery({
    identity: async () => ({ hostId: 'local', publicKey: '11'.repeat(32), name: 'Local' }),
    record,
  });
  try {
    await discovery.start(17001);
    await expect.poll(() => discovery.status()).toBe('error');
    expect(record).toHaveBeenCalledWith({
      phase: 'lan-discovery-failed',
      durationMs: expect.any(Number),
      code,
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain('private-');
    expect(discovery.candidates()).toEqual([]);
    expect(socket.close).toHaveBeenCalledTimes(1);
  } finally {
    discovery.close();
  }
});

it('advertises on every eligible interface instead of the default multicast route', async () => {
  const socket = new Socket();
  native.socket.mockReturnValue(socket);
  native.interfaces.mockReturnValue({
    ethernet: [{ internal: false, family: 'IPv4', address: '192.168.1.4' }],
    wifi: [{ internal: false, family: 'IPv4', address: '10.0.0.4' }],
    loopback: [{ internal: true, family: 'IPv4', address: '127.0.0.1' }],
  });
  const discovery = createLanBotDiscovery({
    identity: async () => ({ hostId: 'local', publicKey: '11'.repeat(32), name: 'Local' }),
  });
  try {
    await discovery.start(17001);
    await expect.poll(() => socket.sent).toEqual(['192.168.1.4', '10.0.0.4']);
    expect(socket.joins).toEqual(socket.sent);
  } finally {
    discovery.close();
  }
  expect(socket.close).toHaveBeenCalledTimes(1);
});

it('reports a bounded missing-interface reason and elapsed startup duration', async () => {
  const socket = new Socket();
  native.socket.mockReturnValue(socket);
  native.interfaces.mockReturnValue({});
  const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
  const record = vi.fn();
  const discovery = createLanBotDiscovery({
    identity: async () => {
      clock.mockReturnValue(117);
      return { hostId: 'local', publicKey: '11'.repeat(32), name: 'Local' };
    },
    record,
  });
  try {
    await discovery.start(17001);
    expect(discovery.status()).toBe('error');
    expect(record).toHaveBeenCalledWith({
      phase: 'lan-discovery-failed',
      durationMs: 17,
      code: 'lan-interface-unavailable',
    });
    expect(socket.close).toHaveBeenCalledTimes(1);
  } finally {
    discovery.close();
  }
});
