import { afterEach, expect, it, vi } from 'vitest';
import { createHostLooks } from '../../../apps/mobile/src/host/host-look.js';
import { createAppearanceControl } from '../../core/src/appearance/control.js';
import { Appearance } from '../src/client/appearance.js';
import { mountAppearanceControl } from '../src/client/appearance-control.js';

const shared = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../src/client/host-looks.js', () => ({ hostLooks: () => shared.get('looks') }));
vi.mock('../src/client/remote-hosts.js', () => ({ remoteHosts: () => shared.get('sources') }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  shared.clear();
});

it.each(['on-time', 'deadline', 'walltime', 'unmount', 'removed'] as const)(
  'checks %s after hydration at the existing relay boundary', async (reason) => {
    vi.useFakeTimers();
    const host = createAppearanceControl();
    let hydrate!: (value: unknown) => void;
    const stored = { name: 'Stored', icon: { kind: 'symbol', id: 'server' }, color: 'teal' };
    const write = vi.fn();
    const read = vi.fn<() => Promise<unknown>>().mockResolvedValue({ b: stored });
    read.mockImplementationOnce(() => new Promise((resolve) => { hydrate = resolve; }));
    const looks = createHostLooks({ read, write });
    shared.set('looks', looks);
    let paired = true;
    shared.set('sources', { getSnapshot: () => ({ hosts: paired ? [{ host: { hostId: 'b' } }] : [] }) });
    const actions: string[] = [];
    vi.stubGlobal('location', { protocol: 'http:' });
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      actions.push(JSON.parse(String(init?.body)).action);
      return host.fetch(new Request('http://localhost/api/botharness/appearance-control', init));
    });
    const release = mountAppearanceControl(new Appearance(undefined, () => 'light'));
    try {
      await vi.waitFor(() => expect(actions).toContain('poll'));
      const { clients } = await (await host.fetch(new Request('http://localhost'))).json();
      const response = host.fetch(new Request('http://localhost/api/botharness/appearance-control', {
        method: 'POST', body: JSON.stringify({
          action: 'request', clientId: clients[0].id, expiresAt: Date.now() + 8000, expectedRevision: JSON.stringify(stored),
          hostLook: { hostId: 'b', patch: { name: 'Studio' } },
        }),
      }));
      await vi.advanceTimersByTimeAsync(0);
      expect(write).not.toHaveBeenCalled();
      if (reason === 'deadline') await vi.advanceTimersByTimeAsync(8000);
      if (reason === 'walltime') vi.setSystemTime(Date.now() + 8001);
      if (reason === 'unmount') release();
      if (reason === 'removed') paired = false;
      hydrate({ b: stored });
      await vi.advanceTimersByTimeAsync(0);
      if (reason === 'walltime') {
        expect(write).not.toHaveBeenCalled();
        expect(actions).not.toContain('reply');
        await vi.advanceTimersByTimeAsync(8000);
      }
      const result = await (await response).json();
      if (reason === 'on-time') {
        expect(result).toMatchObject({ hostId: 'b', look: { name: 'Studio', color: 'teal' } });
        expect(write).toHaveBeenCalledTimes(1);
        expect(looks.look('b').name).toBe('Studio');
      } else {
        expect(result).toMatchObject({ error: { code: reason === 'removed' ? 'host-look-host-unknown' : reason === 'deadline' || reason === 'walltime' ? 'appearance-client-timeout' : 'appearance-client-stale' } });
        expect(write).not.toHaveBeenCalled();
        expect(looks.look('b')).toEqual(stored);
        if (reason !== 'removed') expect(actions).not.toContain('reply');
      }
    } finally {
      release();
      host.dispose();
    }
  },
);

it.each([100, 20000])('caps the Host relay deadline using the caller absolute expiry (%s ms)', async (duration) => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const host = createAppearanceControl();
  const post = (body: unknown) => host.fetch(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));
  try {
    const registration = await (await post({ action: 'register', platform: 'web' })).json();
    const poll = post({ action: 'poll', ...registration });
    await vi.advanceTimersByTimeAsync(0);
    const pending = post({ action: 'request', clientId: registration.clientId, expiresAt: 1000 + duration, hostLook: { hostId: 'b' } });
    const { command } = await (await poll).json();
    expect(command.expiresAt).toBe(1000 + Math.min(duration, 8000));
    await vi.advanceTimersByTimeAsync(Math.min(duration, 8000));
    expect(await (await pending).json()).toMatchObject({ error: { code: 'appearance-client-timeout' } });
  } finally { host.dispose(); }
});

it('refuses a late Host look command before delivering it to the Client', async () => {
  const host = createAppearanceControl(() => 1000);
  const post = (body: unknown) => host.fetch(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));
  try {
    const registration = await (await post({ action: 'register', platform: 'web' })).json();
    const response = await post({ action: 'request', clientId: registration.clientId, expiresAt: 999, hostLook: { hostId: 'b', patch: { name: 'Late' } } });
    expect(await response.json()).toMatchObject({ error: { code: 'appearance-request-stale' } });
  } finally { host.dispose(); }
});
