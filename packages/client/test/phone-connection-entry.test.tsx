// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConnectionsDialog } from '../src/client/connections-dialog.js';
import { PairedDevicesSettings } from '../src/client/paired-devices.js';
import { zhTranslate as t } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: 'button',
  Input: 'input',
  Switch: 'input',
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  relativeTime: () => ({ unit: 'minute', n: 1 }),
}));
vi.mock('../src/client/ds/panel-dialog.js', () => ({
  PanelDialog: ({
    children,
    closeLabel,
    onClose,
  }: {
    children: ReactNode;
    closeLabel: string;
    onClose(): void;
  }) => (
    <div role="dialog">
      {children}
      <button onClick={onClose}>{closeLabel}</button>
    </div>
  ),
}));

const lan = { url: 'http://192.168.1.5:14277', kind: 'lan', ready: true };
const tail = { url: 'https://computer.example.ts.net', kind: 'tailscale', ready: true };
const loopback = { url: 'http://127.0.0.1:4100', kind: 'loopback', ready: true };
let routes: (typeof lan)[];
let connect: Record<string, unknown> | undefined;
let privateTunnel: Record<string, unknown> | undefined;
let lanState: 'off' | 'listening' | 'error';
let failEnable: boolean;
let expiresAt: string;
let offerState: string;
let pairedDevices: {
  id: string;
  name: string;
  pairedAt: string;
  feedReadAt?: string;
  revokedAt?: string;
}[];
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let posts: { url: string; body: unknown }[];

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  routes = [loopback];
  connect = undefined;
  privateTunnel = undefined;
  lanState = 'off';
  failEnable = false;
  expiresAt = new Date(Date.now() + 600_000).toISOString();
  posts = [];
  offerState = 'pending';
  pairedDevices = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        if (url.endsWith('/offer-status'))
          return Response.json({ state: offerState, deviceId: 'intended' });
        if (url.endsWith('/lan')) {
          if (failEnable) return Response.json({ code: 'lan-listen-failed' }, { status: 409 });
          lanState = body.action === 'enable' ? 'listening' : 'off';
          routes = body.action === 'enable' ? [lan, loopback] : [loopback];
          return Response.json({ ok: true });
        }
        if (url.endsWith('/offer'))
          return Response.json({
            receipt: 'test-receipt',
            link: 'deepseekbot://pair?p=test',
            qr: { size: 1, path: 'M0 0h1v1h-1z' },
            expiresAt,
            routes: routes.map((route) => route.url),
            reachable: routes.some((route) => route.kind !== 'loopback'),
          });
      }
      return Response.json({
        connect,
        privateTunnel,
        host: { id: 'h', name: 'QA computer' },
        devices: pairedDevices,
        lan: { state: lanState },
        routes: { routes, tailscale: 'missing', serveCommand: 'tailscale serve --bg 4100' },
      });
    }),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const button = (label: string) =>
  [...host.querySelectorAll('button')].find(
    (node) => node.getAttribute('aria-label') === label || node.textContent === label,
  )!;
const click = async (label: string) => act(async () => button(label).click());
const render = async (manage = true) => {
  await act(async () => root.render(<PairedDevicesSettings t={t} />));
  if (manage) await click(t('connections.manage'));
};

it('prepares LAN only after choosing it in Add connection, then shows the invitation', async () => {
  await render(false);
  expect(button(t('devices.lan.enable'))).toBeUndefined();
  await click('添加连接');
  await click(t('connections.invite'));
  await click(t('connections.phoneApp.ready'));
  await click(t('connections.advancedMethods'));
  await click('局域网');
  expect(posts).toEqual([]);
  await click('开启并继续');
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
  expect(posts.map((item) => item.url)).toEqual([
    './api/botharness/devices/lan',
    './api/botharness/devices/offer',
  ]);
});

it('shows independent LAN and Tailscale choices without publishing or offering loopback', async () => {
  await render();
  expect(host.textContent).toContain(t('devices.lan.network'));
  expect(host.textContent).toContain(t('devices.tailscale.notice'));
  expect(button(t('devices.pair.open')).disabled).toBe(true);
  expect(host.querySelector('[data-pair-route-steps]')).toBeNull();
  await click(t('devices.tailscale.setup'));
  expect(host.querySelector('[data-pair-route-steps]')).not.toBeNull();
  expect(posts).toEqual([]);
});

it('enables LAN explicitly, pairs without Tailscale and disables it through the same owner', async () => {
  await render();
  await click(t('devices.lan.enable'));
  expect(posts[0]).toEqual({
    url: './api/botharness/devices/lan',
    body: { action: 'enable', confirm: true },
  });
  expect(button(t('devices.pair.open')).disabled).toBe(false);
  expect(host.querySelector('[data-pair-route-steps]')).toBeNull();
  await click(t('devices.pair.open'));
  await click(t('connections.phoneApp.ready'));
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain(t('devices.lan.title'));
  expect(host.querySelector('[role="dialog"]')?.textContent).not.toContain(
    t('devices.tailscale.title'),
  );
  await click(t('devices.pair.close'));
  await click(t('devices.lan.disable'));
  expect(posts.at(-1)?.body).toEqual({ action: 'disable', confirm: true });
  expect(button(t('devices.pair.open')).disabled).toBe(true);
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
});

it.each([{ available: [tail] }, { available: [lan, tail] }])(
  'describes the actual offered connection types ($available)',
  async ({ available }) => {
    routes = [...available, loopback];
    lanState = available.includes(lan) ? 'listening' : 'off';
    await render();
    await click(t('devices.pair.open'));
    await click(t('connections.phoneApp.ready'));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(t('devices.tailscale.title'));
    expect(dialog.textContent?.includes(t('devices.lan.title'))).toBe(available.includes(lan));
    expect(dialog.textContent).toContain(
      t('devices.connection.available', {
        routes: [
          ...(available.includes(lan) ? [t('devices.lan.title')] : []),
          t('devices.tailscale.title'),
        ].join(' · '),
      }),
    );
  },
);

it('does not treat LAN readiness as completed Tailscale setup', async () => {
  routes = [lan, loopback];
  lanState = 'listening';
  await render();
  await click(t('devices.tailscale.setup'));
  expect(host.querySelector('[data-pair-route-step="install"]')?.getAttribute('data-state')).toBe(
    'current',
  );
  expect(host.querySelector('[data-pair-route-step="publish"]')?.getAttribute('data-state')).toBe(
    'pending',
  );
});

it('keeps a failed enable actionable without offering a code', async () => {
  failEnable = true;
  await render();
  await click(t('devices.lan.enable'));
  expect(host.textContent).toContain(t('devices.error'));
  expect(button(t('devices.lan.enable')).disabled).toBe(false);
  expect(button(t('devices.pair.open')).disabled).toBe(true);
});

it('explains a listener with no usable network address', async () => {
  lanState = 'listening';
  await render();
  expect(host.textContent).toContain(t('devices.lan.noAddress'));
  expect(button(t('devices.pair.open')).disabled).toBe(true);
});

it('replaces an expired code with a fresh offer', async () => {
  routes = [lan, loopback];
  expiresAt = new Date(Date.now() - 1000).toISOString();
  await render();
  await click(t('devices.pair.open'));
  await click(t('connections.phoneApp.ready'));
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
  expect(host.textContent).toContain(t('devices.pair.expired'));
  expiresAt = new Date(Date.now() + 600_000).toISOString();
  await click(t('devices.pair.renew'));
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
  expect(posts.filter((post) => post.url.endsWith('/offer'))).toHaveLength(2);
});

it.each(['refused', 'unknown', 'superseded'])(
  'withdraws an invitation when its owner reports %s',
  async (state) => {
    vi.useFakeTimers();
    routes = [lan, loopback];
    await render();
    await click(t('devices.pair.open'));
    await click(t('connections.phoneApp.ready'));
    expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
    offerState = state;
    await act(async () => vi.advanceTimersByTimeAsync(3100));
    expect(host.querySelector('[data-pair-qr]')).toBeNull();
    expect(host.textContent).toContain(t('connections.invitationInvalid'));
  },
);

it('opens one standalone dialog and reuses an existing route without publishing another', async () => {
  routes = [lan, loopback];
  lanState = 'listening';
  const onClose = vi.fn();
  await act(async () => root.render(<ConnectionsDialog t={t} pairPhone onClose={onClose} />));
  expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(host.textContent).toContain('QA computer');
  expect(host.querySelector('[data-phone-app-guide]')).not.toBeNull();
  expect(posts).toEqual([]);
  await click(t('connections.phoneApp.ready'));
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
  expect(posts.map((post) => post.url)).toEqual(['./api/botharness/devices/offer']);
  await click(t('connections.back'));
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
  expect(button(t('connections.add'))).toBeDefined();
  await click(t('common.close'));
  expect(onClose).toHaveBeenCalledOnce();
  expect(posts.some((post) => post.url.endsWith('/lan'))).toBe(false);
});

it('shows preparation without publishing or creating an offer when no phone route exists', async () => {
  await act(async () => root.render(<ConnectionsDialog t={t} pairPhone onClose={() => {}} />));
  expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
  expect(posts).toEqual([]);
  await click(t('connections.phoneApp.ready'));
  await click(t('connections.advancedMethods'));
  await click('局域网');
  await click('开启并继续');
  expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
});

it('stops connection reads after the standalone dialog is removed', async () => {
  vi.useFakeTimers();
  routes = [lan, loopback];
  await act(async () => root.render(<ConnectionsDialog t={t} pairPhone onClose={() => {}} />));
  await act(async () => vi.advanceTimersByTimeAsync(3100));
  await act(async () => root.render(null));
  const reads = vi.mocked(fetch).mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(vi.mocked(fetch).mock.calls).toHaveLength(reads);
});

it('finishes onboarding only after the intended paired device reads Feed, not after approval or another device', async () => {
  vi.useFakeTimers();
  routes = [tail];
  const onFeedRead = vi.fn();
  const onDevicePaired = vi.fn();
  await act(async () =>
    root.render(
      <ConnectionsDialog
        t={t}
        pairPhone
        onFeedRead={onFeedRead}
        onDevicePaired={onDevicePaired}
        onClose={() => {}}
      />,
    ),
  );
  expect(onFeedRead).not.toHaveBeenCalled();
  await click(t('connections.phoneApp.ready'));
  pairedDevices = [{ id: 'other', name: 'Other', pairedAt: expiresAt, feedReadAt: expiresAt }];
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(onFeedRead).not.toHaveBeenCalled();
  pairedDevices.push({ id: 'intended', name: 'Phone', pairedAt: expiresAt });
  offerState = 'redeemed';
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(onDevicePaired).toHaveBeenCalledWith('intended');
  expect(onFeedRead).not.toHaveBeenCalled();
  pairedDevices[1]!.feedReadAt = expiresAt;
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(onFeedRead).toHaveBeenCalledWith('intended');
});

it('resumes an existing paired device without creating another invitation and rejects revoked completion', async () => {
  vi.useFakeTimers();
  routes = [tail];
  pairedDevices = [
    {
      id: 'intended',
      name: 'Phone',
      pairedAt: expiresAt,
      feedReadAt: expiresAt,
      revokedAt: expiresAt,
    },
  ];
  const onFeedRead = vi.fn();
  await act(async () =>
    root.render(
      <ConnectionsDialog
        t={t}
        pairPhone
        pairedDeviceId="intended"
        onFeedRead={onFeedRead}
        onClose={() => {}}
      />,
    ),
  );
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(posts).toEqual([]);
  expect(onFeedRead).not.toHaveBeenCalled();
});

it.each(['phone-entry', 'settings', 'existing-route'] as const)(
  'keeps installation guidance inside the dialog before any offer or route write: %s',
  async (entry) => {
    if (entry === 'existing-route') routes = [tail];
    if (entry === 'settings') {
      await render(false);
      await click(t('connections.add'));
      await click(t('connections.invite'));
    } else
      await act(async () => root.render(<ConnectionsDialog t={t} pairPhone onClose={() => {}} />));
    expect(host.querySelector('[data-phone-app-guide]')).not.toBeNull();
    expect(host.querySelector('[data-platform="ios"] a')?.getAttribute('href')).toBe(
      'https://testflight.apple.com/join/sA9EznXr',
    );
    expect(host.querySelector('[data-platform="android"] a')).not.toBeNull();
    expect(host.querySelector('[data-pair-qr]')).toBeNull();
    expect(posts).toEqual([]);
    await click(t('connections.phoneApp.ready'));
    expect(host.querySelector('[data-phone-app-guide]')).toBeNull();
    if (entry === 'existing-route')
      expect(posts.filter((post) => post.url.endsWith('/offer'))).toHaveLength(1);
    else {
      expect(posts).toEqual([]);
      expect(button('Tobs Connect')).toBeDefined();
      expect(button('局域网')).toBeUndefined();
    }
  },
);

it('cannot bypass installation confirmation by going Back from the phone guide', async () => {
  await act(async () => root.render(<ConnectionsDialog t={t} pairPhone onClose={() => {}} />));
  await click(t('connections.back'));
  expect(button('局域网')).toBeUndefined();
  await click(t('connections.invite'));
  expect(host.querySelector('[data-phone-app-guide]')).not.toBeNull();
  expect(posts).toEqual([]);
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
});

it('keeps computer link entry inside the shared dialog and returns to both intents without publishing', async () => {
  await act(async () => root.render(<ConnectionsDialog t={t} onClose={() => undefined} />));
  await click(t('connections.add'));
  expect(button(t('connections.invite')).querySelector('svg')).not.toBeNull();
  expect(button(t('connections.join')).querySelector('svg')).not.toBeNull();
  await click(t('connections.join'));
  expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(host.textContent).toContain(t('connections.joinHint'));
  expect(host.querySelector('input')).not.toBeNull();
  expect(host.querySelector('[data-phone-app-guide]')).toBeNull();
  expect(host.querySelector('[data-remote-host-add-submit]')?.hasAttribute('disabled')).toBe(true);
  expect(posts).toEqual([]);
  await click(t('connections.back'));
  expect(button(t('connections.join'))).toBeDefined();
  await click(t('connections.invite'));
  expect(host.querySelector('[data-phone-app-guide]')).not.toBeNull();
  expect(posts).toEqual([]);
});

const openMethods = async () => {
  await render(false);
  await click('添加连接');
  await click(t('connections.invite'));
  await click(t('connections.phoneApp.ready'));
};

it('offers Quick Tunnel and Connect first and requires an explicit sign-in-and-connect action', async () => {
  connect = { state: 'off', account: { state: 'signed-out' } };
  await openMethods();
  expect(button(t('privateTunnel.quickEntry'))).toBeDefined();
  expect(button('Tobs Connect')).toBeDefined();
  expect(button('Tailscale')).toBeUndefined();
  expect(button('局域网')).toBeUndefined();
  await click('Tobs Connect');
  expect(posts).toEqual([]);
  expect(button(t('connections.continue')).disabled).toBe(true);
  await click(t('connections.signInConnect'));
  expect(posts).toEqual([{ url: './api/botharness/devices/connect', body: { action: 'sign-in' } }]);
});

it.each([undefined, 'relay-full', 'relay-unavailable', 'host-limit'])(
  'offers Quick Tunnel without signing out or claiming pairing when Connect is unavailable (%s)',
  async (issue) => {
    connect =
      issue === undefined
        ? undefined
        : {
            state: 'off',
            account: { state: 'error', issue, recovery: 'automatic' },
          };
    await openMethods();
    await click('Tobs Connect');
    expect(button(t('connections.continue')).disabled).toBe(true);
    expect(host.querySelector('[data-pair-qr]')).toBeNull();
    await click(t('connections.useQuickTunnel'));
    expect(button(t('privateTunnel.panel.quickAction'))).toBeDefined();
    expect(posts).toEqual([]);
    await click(t('connections.back'));
    expect(button('Tobs Connect')).toBeDefined();
  },
);

it('opens Named and ingress preparation directly from Advanced without publishing', async () => {
  await act(async () =>
    root.render(<ConnectionsDialog t={t} pairPhone onClose={() => undefined} />),
  );
  expect(host.querySelector('[data-phone-app-guide]')).not.toBeNull();
  await click(t('connections.phoneApp.ready'));
  expect(button(t('privateTunnel.namedTitle'))).toBeUndefined();
  await click(t('connections.advancedMethods'));
  await click(t('privateTunnel.namedTitle'));
  expect(host.querySelector('[data-private-tunnel-setup="named"]')).not.toBeNull();
  expect(host.querySelector('input[type="password"]')).not.toBeNull();
  expect(button(t('connections.deploymentGuide'))).toBeDefined();
  await click(t('connections.back'));
  await click(t('connections.back'));
  await click(t('privateTunnel.ingressTitle'));
  expect(host.querySelector('[data-private-tunnel-setup="ingress"]')).not.toBeNull();
  expect(host.textContent).toContain(t('connections.ingressRequirements'));
  expect(posts).toEqual([]);
});

it('preserves an existing private route instead of silently adding a Docker relay', async () => {
  privateTunnel = { state: 'connected', mode: 'named', origin: 'https://bot.example.com' };
  await act(async () =>
    root.render(<ConnectionsDialog t={t} pairPhone onClose={() => undefined} />),
  );
  await click(t('connections.phoneApp.ready'));
  await click(t('connections.advancedMethods'));
  await click(t('privateRelay.title'));
  expect(host.textContent).toContain(t('connections.privateReplacement'));
  expect(host.querySelector('[data-private-tunnel="connected"]')).not.toBeNull();
  expect(button(t('privateRelay.claim'))).toBeUndefined();
  expect(posts).toEqual([]);
});

it('explains the mobile VPN limit before Tailscale setup without publishing', async () => {
  await act(async () =>
    root.render(<ConnectionsDialog t={t} pairPhone onClose={() => undefined} />),
  );
  await click(t('connections.phoneApp.ready'));
  await click(t('connections.advancedMethods'));
  await click('Tailscale');
  expect(host.textContent).toContain(t('connections.tailscaleVpn'));
  expect(button(t('connections.vpnGuide'))).toBeDefined();
  expect(posts).toEqual([]);
});

it('lets an existing ready route return to advanced methods without replacing it', async () => {
  routes = [tail, loopback];
  await act(async () =>
    root.render(<ConnectionsDialog t={t} pairPhone onClose={() => undefined} />),
  );
  await click(t('connections.phoneApp.ready'));
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
  await click(t('connections.methods'));
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
  await click(t('connections.advancedMethods'));
  await click('Tailscale');
  expect(host.textContent).toContain(t('connections.tailscaleVpn'));
  expect(button(t('connections.continue'))).toBeDefined();
  expect(posts.map((post) => post.url)).toEqual(['./api/botharness/devices/offer']);
});
