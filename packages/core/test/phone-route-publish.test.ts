import { describe, expect, it, vi } from 'vitest';

import { createDevicesHttp } from '../src/devices/http.js';
import type { DevicePairing } from '../src/devices/pairing.js';
import {
  createManagedPhoneRoute,
  publishPhoneRoute,
  type ManagedPhoneRouteState,
  type RunCommand,
} from '../src/devices/routes.js';
import { runPhoneRouteCommand } from '../src/bots/cli-phone-route.js';

const RUNNING = JSON.stringify({
  BackendState: 'Running',
  Self: { DNSName: 'studio.tail1.ts.net.' },
});
const SERVED = JSON.stringify({
  Web: {
    'studio.tail1.ts.net:443': {
      Handlers: { '/': { Proxy: 'http://127.0.0.1:4100' } },
    },
  },
});

function tailscale(options: { serve?: string; fail?: unknown } = {}) {
  let served = options.serve ?? '{}';
  const calls: string[][] = [];
  const run: RunCommand = async (_file, args) => {
    calls.push([...args]);
    if (args[0] === 'status') return RUNNING;
    if (args[1] === 'status') return served;
    if (options.fail !== undefined) throw options.fail;
    served = SERVED;
    return '';
  };
  return { run, calls };
}

describe('publishing the phone route', () => {
  it('does not publish after the lifecycle closes during persistence', async () => {
    const fake = tailscale();
    let release: (() => void) | undefined;
    const owner = createManagedPhoneRoute({
      port: 4100,
      run: fake.run,
      read: async () => undefined,
      write: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    const pending = owner.enable();
    await vi.waitFor(() => expect(release).toBeDefined());
    owner.close();
    release?.();
    expect((await pending).ok).toBe(false);
    expect(fake.calls.some((args) => args.includes('--bg'))).toBe(false);
  });
  it('restores its own publication after restart and removes only its own mapping', async () => {
    let state: ManagedPhoneRouteState | undefined;
    let served = '{}';
    const calls: string[][] = [];
    const run: RunCommand = async (_file, args) => {
      calls.push([...args]);
      if (args[0] === 'status') return RUNNING;
      if (args[1] === 'status') return served;
      served = args.includes('off') ? '{}' : SERVED;
      return '';
    };
    const create = () =>
      createManagedPhoneRoute({
        port: 4100,
        run,
        read: async () => state,
        write: async (next) => {
          state = next;
        },
      });
    const first = create();
    expect((await first.enable()).ok).toBe(true);
    expect(state?.enabled).toBe(true);
    served = '{}';
    const restored = create();
    await restored.start();
    expect((await restored.status()).routes[0]?.ready).toBe(true);
    expect((await restored.disable()).ok).toBe(true);
    expect(calls).toContainEqual(['serve', '--https=443', 'off']);
    expect(state?.enabled).toBe(false);
  });

  it('runs tailscale serve for this port and reports the published route', async () => {
    const { run, calls } = tailscale();
    const result = await publishPhoneRoute({ port: 4100, run });
    expect(calls).toContainEqual(['serve', '--bg', '4100']);
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(result.status.routes[0]).toMatchObject({
      kind: 'tailscale',
      ready: true,
    });
  });

  it('does not remove a publishing entry changed by another service', async () => {
    let state: ManagedPhoneRouteState = {
      enabled: false,
      mapping: { hostname: 'studio.tail1.ts.net', port: 443, target: 4100 },
    };
    const { run, calls } = tailscale({ serve: SERVED.replace('4100', '3000') });
    const manager = createManagedPhoneRoute({
      port: 4100,
      run,
      read: async () => state,
      write: async (next) => {
        state = next;
      },
    });
    await manager.start();
    expect((await manager.disable()).ok).toBe(true);
    expect(calls.some((args) => args.includes('off'))).toBe(false);
    expect(state).toEqual({ enabled: false });
  });

  it('does not claim an existing publication or remove it on disable', async () => {
    const { run, calls } = tailscale({ serve: SERVED });
    let state: ManagedPhoneRouteState | undefined;
    const manager = createManagedPhoneRoute({
      port: 4100,
      run,
      read: async () => state,
      write: async (next) => {
        state = next;
      },
    });
    await manager.start();
    expect((await manager.enable()).ok).toBe(true);
    expect(state).toEqual({ enabled: true });
    await manager.disable();
    expect(calls.some((args) => args.includes('off'))).toBe(false);
  });

  it('does nothing when the route is already published', async () => {
    const { run, calls } = tailscale({ serve: SERVED });
    expect(await publishPhoneRoute({ port: 4100, run })).toMatchObject({
      ok: true,
      changed: false,
    });
    expect(calls).not.toContainEqual(['serve', '--bg', '4100']);
  });

  it('publishes on another HTTPS port without replacing an occupied entry', async () => {
    const other = JSON.stringify({
      Web: {
        'studio.tail1.ts.net:443': {
          Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } },
        },
      },
    });
    let served = other;
    const calls: string[][] = [];
    const run: RunCommand = async (_file, args) => {
      calls.push([...args]);
      if (args[0] === 'status') return RUNNING;
      if (args[1] === 'status') return served;
      if (args.includes('--https=8443')) {
        served = JSON.stringify({
          Web: {
            'studio.tail1.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } } },
            'studio.tail1.ts.net:8443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:4100' } } },
          },
        });
      }
      return '';
    };
    expect(await publishPhoneRoute({ port: 4100, run })).toMatchObject({
      ok: true,
      status: {
        routes: expect.arrayContaining([
          { url: 'https://studio.tail1.ts.net:8443', kind: 'tailscale', ready: true },
        ]),
      },
    });
    expect(calls).not.toContainEqual(['serve', '--bg', '4100']);
    expect(calls).toContainEqual(['serve', '--bg', '--https=8443', '4100']);
  });

  it('refuses when Tailscale is missing or stopped', async () => {
    const missing: RunCommand = () =>
      Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    expect(await publishPhoneRoute({ port: 4100, run: missing })).toMatchObject({
      code: 'tailscale-missing',
    });
    const stopped: RunCommand = async () => JSON.stringify({ BackendState: 'Stopped' });
    expect(await publishPhoneRoute({ port: 4100, run: stopped })).toMatchObject({
      code: 'tailscale-stopped',
    });
  });

  it('returns the enable link when Serve is off for the tailnet', async () => {
    const fail = Object.assign(new Error('killed'), {
      stdout:
        'Serve is not enabled on your tailnet.\nTo enable, visit:\n\n https://login.tailscale.com/f/serve?node=abc\n',
    });
    const { run } = tailscale({ fail });
    expect(await publishPhoneRoute({ port: 4100, run })).toMatchObject({
      ok: false,
      code: 'serve-needs-enable',
      enableUrl: 'https://login.tailscale.com/f/serve?node=abc',
    });
  });

  it('classifies a permission refusal', async () => {
    const fail = Object.assign(new Error('exit 1'), {
      stderr: 'Access denied: serve config denied',
    });
    const { run } = tailscale({ fail });
    expect(await publishPhoneRoute({ port: 4100, run })).toMatchObject({
      code: 'serve-denied',
    });
  });

  it('serves the publish route only with confirm and returns refusals as 409', async () => {
    const pairing = {} as DevicePairing;
    const publish = vi.fn(async () => publishPhoneRoute({ port: 4100, run: tailscale().run }));
    const http = createDevicesHttp({ pairing, routes: vi.fn(), publish });
    const post = (body: unknown) =>
      http(
        new Request('http://h/api/botharness/devices/serve', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    const refused = await post({});
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: 'confirm-required' });
    expect(publish).not.toHaveBeenCalled();
    const ok = await post({ confirm: true });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ published: true, changed: true });

    const blocked = createDevicesHttp({
      pairing,
      routes: vi.fn(),
      publish: async () => ({
        ok: false,
        code: 'serve-denied',
        message: 'no',
        status: {
          routes: [],
          tailscale: 'running',
          serveCommand: 'tailscale serve --bg 4100',
        },
      }),
    });
    const denied = await blocked(
      new Request('http://h/api/botharness/devices/serve', {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      }),
    );
    expect(denied.status).toBe(409);
    expect(await denied.json()).toMatchObject({
      code: 'serve-denied',
      error: 'no',
    });
  });
});

describe('phone-route CLI', () => {
  const reply = (value: unknown) => ({
    bytes: new TextEncoder().encode(JSON.stringify(value)),
  });

  it('disables publishing through the same confirmed Host owner', async () => {
    const connect = vi.fn();
    await expect(
      runPhoneRouteCommand('phone-route-disable', [], {}, connect),
    ).rejects.toMatchObject({ code: 'confirm-required' });
    expect(connect).not.toHaveBeenCalled();
    const http = vi.fn(async () => reply({ published: false }));
    expect(
      await runPhoneRouteCommand('phone-route-disable', [], { confirm: true }, async () => ({
        http,
      })),
    ).toEqual({ published: false });
    expect(http).toHaveBeenCalledWith('/api/botharness/devices/serve', {
      action: 'disable',
      confirm: true,
    });
  });

  it('reads the route status from the devices snapshot', async () => {
    const http = vi.fn(async () =>
      reply({ devices: [{ id: 'd' }], routes: { tailscale: 'running' } }),
    );
    expect(await runPhoneRouteCommand('phone-route', [], {}, async () => ({ http }))).toEqual({
      routes: { tailscale: 'running' },
    });
    expect(http).toHaveBeenCalledWith('/api/botharness/devices');
  });

  it('publishes only with --confirm', async () => {
    const connect = vi.fn();
    await expect(
      runPhoneRouteCommand('phone-route-publish', [], {}, connect),
    ).rejects.toMatchObject({ code: 'confirm-required' });
    expect(connect).not.toHaveBeenCalled();
    const http = vi.fn(async () => reply({ published: true }));
    expect(
      await runPhoneRouteCommand('phone-route-publish', [], { confirm: true }, async () => ({
        http,
      })),
    ).toEqual({ published: true });
    expect(http).toHaveBeenCalledWith('/api/botharness/devices/serve', {
      confirm: true,
    });
  });
});
