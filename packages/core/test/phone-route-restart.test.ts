import { describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import {
  createManagedPhoneRoute,
  type ManagedPhoneRouteState,
  type RunCommand,
} from '../src/devices/routes.js';
import { probeLoopbackPort, stalePhoneRoutes } from '../src/devices/route-targets.js';

const hostname = 'studio.tail1.ts.net';
function fixture(fail = false) {
  let state: ManagedPhoneRouteState = {
    enabled: true,
    mapping: { hostname, port: 8443, target: 4100 },
  };
  const web: Record<string, { Handlers: Record<string, { Proxy: string }> }> = {
    [`${hostname}:8443`]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:4100' } } },
  };
  const commands: string[][] = [];
  const logs: unknown[] = [];
  const run: RunCommand = async (_file, args) => {
    if (args[0] === 'status')
      return JSON.stringify({ BackendState: 'Running', Self: { DNSName: `${hostname}.` } });
    if (args[1] === 'status') return JSON.stringify({ Web: web });
    commands.push([...args]);
    const port = Number(args.find((arg) => arg.startsWith('--https='))?.split('=')[1] ?? 443);
    if (args.includes('off')) delete web[`${hostname}:${port}`];
    else {
      if (fail) throw new Error('permission denied');
      web[`${hostname}:${port}`] = {
        Handlers: { '/': { Proxy: `http://127.0.0.1:${args.at(-1)}` } },
      };
    }
    return '';
  };
  const owner = createManagedPhoneRoute({
    port: 4200,
    run,
    read: async () => state,
    write: async (next) => {
      state = next;
    },
    probe: async () => false,
    log: (event) => logs.push(event),
  });
  return { owner, web, commands, logs, state: () => state };
}

describe('managed route restart', () => {
  it('distinguishes a listening local service from its closed port', async () => {
    const server = createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('missing test port');
    try {
      expect(await probeLoopbackPort(address.port, '127.0.0.1')).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    expect(await probeLoopbackPort(address.port, '127.0.0.1')).toBe(false);
  });
  it.each(['unreadable', 'malformed'])(
    'keeps retryable ownership when verification is %s',
    async (failure) => {
      let state: ManagedPhoneRouteState = {
        enabled: true,
        mapping: { hostname, port: 8443, target: 4100 },
      };
      let target = 4100;
      let failVerification = true;
      const owner = createManagedPhoneRoute({
        port: 4200,
        read: async () => state,
        write: async (next) => {
          state = next;
        },
        probe: async () => true,
        run: async (_file, args) => {
          if (args[0] === 'status')
            return JSON.stringify({ BackendState: 'Running', Self: { DNSName: hostname } });
          if (args[1] === 'status') {
            if (target === 4200 && failVerification) {
              if (failure === 'unreadable') throw new Error('cannot read status');
              return '{';
            }
            return JSON.stringify({
              Web: {
                [`${hostname}:8443`]: {
                  Handlers: { '/': { Proxy: `http://127.0.0.1:${target}` } },
                },
              },
            });
          }
          target = Number(args.at(-1));
          return '';
        },
      });
      expect(await owner.start()).toMatchObject({ ok: false, code: 'serve-failed' });
      expect(state.mapping?.target).toBe(4100);
      failVerification = false;
      expect(await owner.enable()).toMatchObject({ ok: true });
      expect(state.mapping?.target).toBe(4200);
    },
  );
  it('keeps the published URL when the Host port changes without switching Serve off', async () => {
    const f = fixture();
    expect(await f.owner.start()).toMatchObject({ ok: true });
    expect(f.commands).toEqual([['serve', '--bg', '--https=8443', '4200']]);
    expect(f.web[`${hostname}:8443`]?.Handlers['/']?.Proxy).toBe('http://127.0.0.1:4200');
    expect(f.state().mapping).toEqual({ hostname, port: 8443, target: 4200 });
  });

  it('preserves the original route and ownership when replacement is refused', async () => {
    const f = fixture(true);
    expect(await f.owner.start()).toMatchObject({ ok: false, code: 'serve-denied' });
    expect(f.web[`${hostname}:8443`]?.Handlers['/']?.Proxy).toBe('http://127.0.0.1:4100');
    expect(f.state().mapping?.target).toBe(4100);
    expect(f.commands.some((args) => args.includes('off'))).toBe(false);
    expect(f.logs.at(-1)).toMatchObject({
      refusal: 'serve-denied',
      commands: [{ command: 'tailscale serve --bg --https=8443 4200', outcome: 'failed' }],
    });
  });

  it('does not repeat a prior operation command in a no-op enable log', async () => {
    const f = fixture();
    await f.owner.start();
    await f.owner.enable();
    expect(f.logs.at(-1)).toMatchObject({ phase: 'enable', command: 'none' });
  });

  it('preserves a route edited externally and refuses replacement', async () => {
    const f = fixture();
    f.web[`${hostname}:8443`] = { Handlers: { '/': { Proxy: 'http://127.0.0.1:9000' } } };
    expect(await f.owner.start()).toMatchObject({ ok: false, code: 'serve-other-target' });
    expect(f.commands).toEqual([]);
    expect(f.state().mapping?.target).toBe(4100);
  });

  it('reports unavailable routes without deleting or adopting them', async () => {
    const f = fixture();
    f.web[`${hostname}:443`] = { Handlers: { '/': { Proxy: 'http://127.0.0.1:4000' } } };
    expect(await f.owner.start()).toMatchObject({
      ok: true,
      status: {
        staleRoutes: [{ url: `https://${hostname}`, targetPort: 4000 }],
      },
    });
    expect(f.web[`${hostname}:443`]?.Handlers['/']?.Proxy).toBe('http://127.0.0.1:4000');
    expect(f.state().mapping?.port).toBe(8443);
  });

  it('checks only loopback proxies and omits live services and the current Host', async () => {
    const ports: number[] = [];
    const web = Object.fromEntries(
      [4000, 4100, 4200].map((port, index) => [
        `${hostname}:${8443 + index}`,
        { Handlers: { '/': { Proxy: `http://127.0.0.1:${port}` } } },
      ]),
    );
    web[`${hostname}:9000`] = { Handlers: { '/': { Proxy: 'http://example.com:4000' } } };
    expect(
      await stalePhoneRoutes({ Web: web }, hostname, 4200, async (port) => {
        ports.push(port);
        return port === 4100;
      }),
    ).toEqual([{ url: `https://${hostname}:8443`, targetPort: 4000 }]);
    expect(ports).toEqual([4000, 4100]);
  });
});
