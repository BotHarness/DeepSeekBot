import { describe, expect, it, vi } from 'vitest';

import { createDevicesHttp } from '../src/devices/http.js';
import type { DevicePairing } from '../src/devices/pairing.js';
import { publishPhoneRoute, type RunCommand } from '../src/devices/routes.js';
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

  it('does nothing when the route is already published', async () => {
    const { run, calls } = tailscale({ serve: SERVED });
    expect(await publishPhoneRoute({ port: 4100, run })).toMatchObject({
      ok: true,
      changed: false,
    });
    expect(calls).not.toContainEqual(['serve', '--bg', '4100']);
  });

  it('refuses to replace another serve target', async () => {
    const other = JSON.stringify({
      Web: {
        'studio.tail1.ts.net:443': {
          Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } },
        },
      },
    });
    const { run, calls } = tailscale({ serve: other });
    expect(await publishPhoneRoute({ port: 4100, run })).toMatchObject({
      ok: false,
      code: 'serve-other-target',
    });
    expect(calls).not.toContainEqual(['serve', '--bg', '4100']);
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
