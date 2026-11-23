// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PairedDevicesSettings } from '../src/client/paired-devices.js';
import { zhTranslate } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),

  relativeTime: () => ({ unit: 'minute', n: 1 }),
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let snapshot: Record<string, unknown>;
const posts: unknown[] = [];

function devices(connect?: Record<string, unknown>) {
  return {
    host: { id: 'h', name: 'Studio' },
    devices: [],
    routes: {
      routes: [
        { url: 'http://127.0.0.1:4100', kind: 'loopback', ready: true },
        ...(connect?.['state'] === 'connected'
          ? [{ url: `https://${String(connect['hostname'])}`, kind: 'connect', ready: true }]
          : []),
      ],
      tailscale: 'missing',
      serveCommand: 'tailscale serve --bg 4100',
    },
    ...(connect === undefined ? {} : { connect }),
  };
}

const button = (label: string) =>
  [...document.body.querySelectorAll('button')].find(
    (node) => node.getAttribute('aria-label') === label || node.textContent === label,
  );

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  posts.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/relationships')) return Response.json({ relationships: [] });
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return Response.json({ state: 'signing-in' });
      }
      return Response.json(snapshot);
    }),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function tailnet(state: 'running' | 'stopped', ready = state === 'running') {
  return {
    ...devices(),
    routes: {
      tailscale: state,
      serveCommand: 'tailscale serve --bg 4100',
      routes: [
        { url: 'http://127.0.0.1:4100', kind: 'loopback', ready: true },
        ...(state === 'running'
          ? [{ url: 'https://studio.tail1.ts.net', kind: 'tailscale', ready }]
          : []),
      ],
    },
  };
}

async function mountWithTimers() {
  vi.useFakeTimers();
  await act(async () => root.render(<PairedDevicesSettings t={zhTranslate} />));
  await act(async () => button(zhTranslate('connections.manage'))?.click());
}

async function poll() {
  await act(async () => vi.advanceTimersByTimeAsync(3_100));
}

it('shows unavailable Serve addresses even when the current phone route is ready', async () => {
  const current = tailnet('running');
  snapshot = {
    ...current,
    routes: {
      ...current.routes,
      staleRoutes: [{ url: 'https://studio.tail1.ts.net:8443', targetPort: 4000 }],
    },
  };
  await mountWithTimers();
  const warning = document.body.querySelector('[data-tailscale-stale]');
  expect(warning?.textContent).toContain(zhTranslate('devices.tailscale.stale'));
  expect(warning?.textContent).toContain('https://studio.tail1.ts.net:8443');
  expect(warning?.textContent).toContain('4000');
  expect(posts).toEqual([]);
  snapshot = tailnet('running');
  await poll();
  expect(document.body.querySelector('[data-tailscale-stale]')).toBeNull();
});

it('shows retry instead of indefinite loading when the first status check fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('offline');
    }),
  );
  await mountWithTimers();
  expect(document.body.querySelector('[data-device-status="stale"]')).not.toBeNull();
  expect(document.body.textContent).not.toContain(zhTranslate('devices.list.loading'));
  expect(button(zhTranslate('devices.connection.retry'))?.disabled).toBe(false);
});

it('accepts a slow check without overlapping polling requests', async () => {
  snapshot = tailnet('running');
  let finish: ((value: Response) => void) | undefined;
  const request = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', (url: string) =>
    url.endsWith('/relationships')
      ? Promise.resolve(Response.json({ relationships: [] }))
      : request(),
  );
  await mountWithTimers();
  await poll();
  await poll();
  expect(request).toHaveBeenCalledOnce();
  await act(async () => finish?.(Response.json(snapshot)));
  expect(
    document.body.querySelector('[data-device-tailscale]')?.getAttribute('data-device-tailscale'),
  ).toBe('ready');
});

it('live Tailscale loss and recovery update the page without remounting', async () => {
  snapshot = tailnet('running');
  await mountWithTimers();
  expect(
    document.body.querySelector('[data-device-tailscale]')?.getAttribute('data-device-tailscale'),
  ).toBe('ready');
  snapshot = tailnet('stopped');
  await poll();
  expect(
    document.body.querySelector('[data-device-tailscale]')?.getAttribute('data-device-tailscale'),
  ).toBe('unprepared');
  await act(async () => button(zhTranslate('devices.tailscale.setup'))?.click());
  expect(
    document.body.querySelector('[data-pair-route-step="signIn"]')?.getAttribute('data-state'),
  ).toBe('current');
  expect(document.body.textContent).toContain('4100');
  snapshot = tailnet('running', false);
  await poll();
  expect(document.body.querySelector('[data-pair-route-command="publish"]')?.textContent).toContain(
    'tailscale serve --bg 4100',
  );
  snapshot = tailnet('running');
  await poll();
  expect(
    document.body.querySelector('[data-pair-route-steps]')?.getAttribute('data-pair-route-steps'),
  ).toBe('done');
});

it('invalidates the old QR and offers regeneration when its address changes', async () => {
  snapshot = tailnet('running');
  let address = 'https://studio.tail1.ts.net';
  const offerRequests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/offer')) {
        offerRequests.push(url);
        return Response.json({
          link: 'deepseekbot://pair?p=old',
          qr: { size: 1, path: 'M0 0h1v1z' },
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          routes: [address],
          reachable: true,
        });
      }
      return Response.json(snapshot);
    }),
  );
  await mountWithTimers();
  await act(async () => button(zhTranslate('devices.pair.open'))?.click());
  await act(async () => button(zhTranslate('connections.phoneApp.ready'))?.click());
  expect(offerRequests).toHaveLength(1);
  expect(document.body.querySelector('[data-pair-qr]')).not.toBeNull();
  snapshot = {
    ...tailnet('running'),
    routes: {
      tailscale: 'running',
      serveCommand: 'tailscale serve --bg 4100',
      routes: [{ url: 'https://new.tail2.ts.net', kind: 'tailscale', ready: true }],
    },
  };
  await poll();
  expect(document.body.querySelector('[data-pair-qr]')).toBeNull();
  expect(document.body.textContent).toContain(zhTranslate('devices.pair.routeChanged'));
  expect(button(zhTranslate('devices.pair.copy'))).toBeUndefined();
  expect(button(zhTranslate('devices.pair.renew'))).toBeDefined();
  address = 'https://new.tail2.ts.net';
  await act(async () => button(zhTranslate('devices.pair.renew'))?.click());
  expect(offerRequests).toHaveLength(2);
  expect(document.body.querySelector('[data-pair-qr]')).not.toBeNull();
});

it('recovers a stale snapshot on retry and enables pairing again', async () => {
  snapshot = tailnet('running');
  await mountWithTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Network error');
    }),
  );
  await poll();
  expect(document.body.querySelector('[data-device-status="stale"]')).not.toBeNull();
  expect(button(zhTranslate('devices.pair.open'))?.disabled).toBe(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(snapshot)),
  );
  await act(async () => button(zhTranslate('devices.connection.retry'))?.click());
  expect(document.body.querySelector('[data-device-status="stale"]')).toBeNull();
  expect(button(zhTranslate('devices.pair.open'))?.disabled).toBe(false);
});

it('retries QR creation after a temporary failure without closing the dialog', async () => {
  snapshot = tailnet('running');
  let fail = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return fail
          ? Response.json({}, { status: 503 })
          : Response.json({
              link: 'deepseekbot://pair?p=fresh',
              qr: { size: 1, path: 'M0 0h1v1z' },
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
              routes: ['https://studio.tail1.ts.net'],
              reachable: true,
            });
      return Response.json(snapshot);
    }),
  );
  await mountWithTimers();
  await act(async () => button(zhTranslate('devices.pair.open'))?.click());
  await act(async () => button(zhTranslate('connections.phoneApp.ready'))?.click());
  expect(document.body.querySelector('[data-pair-qr]')).toBeNull();
  expect(document.body.querySelector('[data-pair-dialog]')?.textContent).not.toContain(
    zhTranslate('devices.list.loading'),
  );
  fail = false;
  await act(async () => button(zhTranslate('devices.connection.retry'))?.click());
  expect(document.body.querySelector('[data-pair-qr]')).not.toBeNull();
});

it('does not treat working Connect as working Tailscale', async () => {
  snapshot = devices({ state: 'connected', hostname: 'studio.deepseekbot.dev' });
  await mountWithTimers();
  expect(button(zhTranslate('devices.pair.open'))?.disabled).toBe(false);
  await act(async () => button(zhTranslate('devices.tailscale.setup'))?.click());
  expect(
    document.body.querySelector('[data-pair-route-step="install"]')?.getAttribute('data-state'),
  ).toBe('current');
});

it('a network failure invalidates the published status instead of leaving it ready', async () => {
  snapshot = tailnet('running');
  await mountWithTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Network error');
    }),
  );
  await poll();
  await poll();
  expect(
    document.body.querySelector('[data-device-tailscale]')?.getAttribute('data-device-tailscale'),
  ).not.toBe('ready');
});

it('failed QR creation gives an in-dialog retry action', async () => {
  snapshot = tailnet('running');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json({ code: 'temporary' }, { status: 503 })
        : Response.json(snapshot),
    ),
  );
  await mountWithTimers();
  await act(async () => button(zhTranslate('devices.pair.open'))?.click());
  await act(async () => button(zhTranslate('connections.phoneApp.ready'))?.click());
  const dialog = document.body.querySelector('[data-pair-dialog]');
  expect(dialog?.textContent).toContain(zhTranslate('devices.error'));
  const actions = [...(dialog?.querySelectorAll('button') ?? [])].map((node) => node.textContent);
  expect(
    actions.some((label) => /重试|换一个|重新/u.test(label ?? '')),
    'No retry action in the error dialog',
  ).toBe(true);
});

async function openTailscaleSetup() {
  vi.useFakeTimers();
  await act(async () => root.render(<PairedDevicesSettings t={zhTranslate} standalone page />));
  await act(async () => button('Tailscale')?.click());
}

function managedIngress(memberSignIn: 'managed-tls' | 'untrusted', ready = true) {
  return {
    ...devices(),
    routes: {
      tailscale: 'running',
      serveCommand: 'tailscale serve --bg --https=8443 51442',
      managed: { enabled: true, owned: true, trustedIngress: memberSignIn === 'managed-tls' },
      routes: [
        { url: 'https://studio.tail1.ts.net:8443', kind: 'tailscale', ready, memberSignIn },
        { url: 'http://127.0.0.1:4100', kind: 'loopback', ready: true },
      ],
    },
  };
}

it.each(['managed-tls', 'untrusted'] as const)(
  'shows whether Team members can sign in through the %s Tailscale route',
  async (memberSignIn) => {
    snapshot = managedIngress(memberSignIn);
    await openTailscaleSetup();
    const trusted = zhTranslate('devices.tailscale.memberSignIn.trusted');
    const untrusted = zhTranslate('devices.tailscale.memberSignIn.untrusted');
    const content = document.body.textContent;
    expect(content).toContain(memberSignIn === 'managed-tls' ? trusted : untrusted);
    expect(content).not.toContain(memberSignIn === 'managed-tls' ? untrusted : trusted);
  },
);

it('labels the Host port from the loopback route, not the managed ingress port', async () => {
  snapshot = managedIngress('untrusted', false);
  await openTailscaleSetup();
  const label = zhTranslate('devices.route.step.publish.title', { port: '4100' });
  expect(document.body.textContent).toContain(label);
  expect(document.body.textContent).not.toContain(
    zhTranslate('devices.route.step.publish.title', { port: '51442' }),
  );
});

it('shows a newly paired phone as soon as the Host announces it, without route polling while live', async () => {
  const streams: Array<EventTarget & { readyState: number; close(): void }> = [];
  vi.stubGlobal(
    'EventSource',
    class extends EventTarget {
      readyState = 0;
      constructor() {
        super();
        streams.push(this);
      }
      close() {
        this.readyState = 2;
      }
    },
  );
  snapshot = tailnet('running');
  await mountWithTimers();
  const stream = streams.at(-1)!;
  stream.readyState = 1;
  await act(async () => {
    stream.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(30);
  });
  const reads = () =>
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/devices')).length;
  const before = reads();
  await poll();
  await poll();
  expect(reads()).toBe(before);
  snapshot = {
    ...tailnet('running'),
    devices: [{ id: 'd1', name: 'Pixel Live', pairedAt: '2026-11-18T00:00:00.000Z' }],
  };
  await act(async () => {
    stream.dispatchEvent(
      new MessageEvent('resource/changed', {
        data: JSON.stringify({ resource: 'devices', revision: 1 }),
      }),
    );
    await vi.advanceTimersByTimeAsync(30);
  });
  expect(reads()).toBe(before + 1);
  expect(host.textContent).toContain('Pixel Live');
});

it('reads again after a slow read when the Host announced a change during it', async () => {
  const streams: Array<EventTarget & { readyState: number; close(): void }> = [];
  vi.stubGlobal(
    'EventSource',
    class extends EventTarget {
      readyState = 0;
      constructor() {
        super();
        streams.push(this);
      }
      close() {
        this.readyState = 2;
      }
    },
  );
  const finishes: Array<(value: Response) => void> = [];
  const request = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finishes.push(resolve);
      }),
  );
  vi.stubGlobal('fetch', (url: string) =>
    url.endsWith('/relationships')
      ? Promise.resolve(Response.json({ relationships: [] }))
      : request(),
  );
  snapshot = tailnet('running');
  await mountWithTimers();
  expect(request).toHaveBeenCalledOnce();
  const stream = streams.at(-1)!;
  stream.readyState = 1;
  const notice = (revision: number) =>
    act(async () => {
      stream.dispatchEvent(
        new MessageEvent('resource/changed', {
          data: JSON.stringify({ resource: 'devices', revision }),
        }),
      );
      await vi.advanceTimersByTimeAsync(30);
    });
  const settle = (index: number) =>
    act(async () => {
      finishes[index]!(Response.json(snapshot));
      await vi.advanceTimersByTimeAsync(0);
    });
  await act(async () => {
    stream.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(30);
  });
  await settle(0);
  await settle(1);
  const settled = request.mock.calls.length;
  await notice(1);
  expect(request).toHaveBeenCalledTimes(settled + 1);
  await notice(2);
  expect(request).toHaveBeenCalledTimes(settled + 1);
  await settle(settled);
  expect(request).toHaveBeenCalledTimes(settled + 2);
});
