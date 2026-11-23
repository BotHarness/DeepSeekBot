// @vitest-environment jsdom
import { type ReactNode } from 'react';
import { type ClientRelationship } from '../../core/src/devices/relationship-contract.js';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import type { BridgeCall } from '../src/client/bridge-transport.js';
import { ConnectionsDialog, ConnectionsPage } from '../src/client/connections-dialog.js';
import { EnvironmentAddAction } from '../src/client/environment-panel.js';
import { PairedDevicesSettings } from '../src/client/paired-devices.js';
import { zhTranslate as t } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),

  relativeTime: () => ({ unit: 'minute', n: 1 }),
}));
vi.mock('../src/client/ds/panel-dialog.js', () => ({
  PanelDialog: ({
    children,
    secondary,
    actions,
    closeLabel,
    onClose,
  }: {
    children: ReactNode;
    secondary?: ReactNode;
    actions?: ReactNode;
    closeLabel: string;
    onClose(): void;
  }) => (
    <div role="dialog">
      {children}
      <footer>
        {secondary}
        {actions}
      </footer>
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
let relationships: ClientRelationship[];

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
  relationships = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/relationships')) return Response.json({ relationships });
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        if (url.endsWith('/offer-status'))
          return Response.json({ state: offerState, deviceId: 'intended' });
        if (url.endsWith('/private-tunnel')) {
          privateTunnel = { state: 'starting', mode: 'quick' };
          return Response.json({ ok: true });
        }
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
  await click(t('connections.lan'));
  expect(posts).toEqual([]);
  await click('开启并继续');
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
  expect(posts.map((item) => item.url)).toEqual([
    './api/botharness/devices/lan',
    './api/botharness/devices/offer',
  ]);
});

it('prepares an approved relationship return route without phone onboarding or another invitation', async () => {
  relationships = [
    {
      id: 'r'.repeat(32),
      accountOrigin: null,
      peer: { id: 'peer', name: 'Peer', publicKey: 'ab'.repeat(32), routes: [tail.url] },
      direction: 'outgoing',
      state: 'active',
      expiresAt: Date.now() + 60_000,
      peerRevocationPending: false,
    },
  ];
  await render(false);
  await click(t('relationships.prepareRoute'));
  await click(t('connections.lan'));
  await click(t('connections.enableContinue'));
  expect(posts.map((item) => item.url)).toEqual(['./api/botharness/devices/lan']);
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
  expect(button(t('relationships.check'))).toBeDefined();
  await click(t('relationships.prepareRoute'));
  await click(t('connections.lan'));
  expect(posts.map((item) => item.url)).toEqual(['./api/botharness/devices/lan']);
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
  await click(t('connections.add'));
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
  expect(posts.map((item) => item.url)).toEqual([
    './api/botharness/devices/lan',
    './api/botharness/devices/offer',
  ]);
  await click(t('relationships.prepareRoute'));
  await click(t('connections.lan'));
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
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
  expect(host.textContent).not.toContain('QA computer');
  expect(host.querySelector('[data-phone-app-guide]')).not.toBeNull();
  expect(posts).toEqual([]);
  await click(t('connections.phoneApp.ready'));
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
  expect(posts.map((post) => post.url)).toEqual(['./api/botharness/devices/offer']);
  await click(t('connections.back'));
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
  expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  await click(t('common.close'));
  expect(onClose).toHaveBeenCalledOnce();
  expect(posts.some((post) => post.url.endsWith('/lan'))).toBe(false);
});

it.each(['off', 'on', 'no-address'])(
  'opens the QR directly during onboarding and shows the eligible address and Owner status (%s)',
  async (state) => {
    routes = [tail, loopback];
    const call = vi.fn<BridgeCall>(async (method) => ({
      ok: true,
      value:
        method === 'teamMode'
          ? {
              ...fakeTeamMode(),
              enabled: false,
              ownerPasswordSet: false,
              memberUrls: [
                'https://127.0.0.1',
                lan.url,
                ...(state === 'no-address'
                  ? []
                  : [tail.url + '/botharness-device/team/', tail.url]),
              ],
            }
          : state === 'on'
            ? { enabled: true, username: 'owner' }
            : { enabled: false },
    }));
    await act(async () =>
      root.render(<ConnectionsDialog t={t} pairPhone call={call} onClose={() => {}} />),
    );
    await click(t('connections.phoneApp.ready'));
    const qr = host.querySelector('[data-pair-qr]');
    expect(qr).not.toBeNull();
    expect(button(t('connections.join'))).toBeUndefined();
    expect(posts.map(({ url }) => url)).toEqual(['./api/botharness/devices/offer']);
    const section = host.querySelector('[data-phone-address]');
    if (state === 'no-address') {
      expect(section).toBeNull();
      expect(call.mock.calls.some(([method]) => method === 'ownerPasswordSignIn')).toBe(false);
      return;
    }
    expect(qr?.compareDocumentPosition(section!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(section?.textContent).toContain(t('connections.phone.address'));
    expect(section?.textContent).toContain(tail.url);
    expect(section?.querySelectorAll('[data-copy-chip]')).toHaveLength(1);
    expect(button(t('connections.phone.copyAddress'))).toBeDefined();
    expect(section?.textContent).toContain(
      t(state === 'on' ? 'connections.phone.ownerOn' : 'connections.phone.ownerOff'),
    );
    if (state === 'off') {
      await click(t('connections.phone.enableOwner'));
      expect(document.body.textContent).toContain(t('connections.ownerSignIn.setupTitle'));
      expect(host.querySelector('[data-pair-qr]')).toBe(qr);
    } else {
      expect(button(t('connections.phone.enableOwner'))).toBeUndefined();
      expect(section?.querySelector('[role="switch"]')).toBeNull();
    }
  },
);

it('shows preparation without publishing or creating an offer when no phone route exists', async () => {
  await act(async () => root.render(<ConnectionsDialog t={t} pairPhone onClose={() => {}} />));
  expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
  expect(posts).toEqual([]);
  await click(t('connections.phoneApp.ready'));
  await click(t('connections.lan'));
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
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
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
      await act(async () =>
        root.render(<ConnectionsPage t={t} call={vi.fn<BridgeCall>()} pairPhone />),
      );
    } else
      await act(async () => root.render(<ConnectionsDialog t={t} pairPhone onClose={() => {}} />));
    expect(host.querySelector('[data-phone-app-guide]')).not.toBeNull();
    expect(host.querySelector('[data-platform="ios"] a')?.getAttribute('href')).toBe(
      'https://testflight.apple.com/join/sA9EznXr',
    );
    expect(host.querySelector('[data-platform="android"] a')?.getAttribute('href')).toBe(
      'https://play.google.com/store/apps/details?id=app.deepseekbot.mobile',
    );
    expect(host.querySelector('[data-pair-qr]')).toBeNull();
    expect(posts).toEqual([]);
    await click(t('connections.phoneApp.ready'));
    expect(host.querySelector('[data-phone-app-guide]')).toBeNull();
    if (entry === 'existing-route') {
      expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
      expect(posts.map(({ url }) => url)).toEqual(['./api/botharness/devices/offer']);
    } else {
      expect(posts).toEqual([]);
      expect(button('Tobs Connect')).toBeDefined();
      expect(button(t('connections.lan'))).toBeDefined();
    }
  },
);

it('can return from the installation guide without creating an offer', async () => {
  await act(async () =>
    root.render(<ConnectionsPage t={t} call={vi.fn<BridgeCall>()} pairPhone />),
  );
  expect(host.querySelector('[data-phone-app-guide]')).not.toBeNull();
  await click(t('connections.back'));
  expect(host.querySelector('[data-phone-app-guide]')).toBeNull();
  expect(button(t('connections.quick'))).toBeDefined();
  expect(posts).toEqual([]);
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
});

it('opens the shared join field from the environment panel plus', async () => {
  await act(async () => root.render(<EnvironmentAddAction t={t} />));
  await click(t('remoteHosts.add'));
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain(t('connections.joinHint'));
  expect(
    [...(dialog?.querySelectorAll('button') ?? [])].some(
      (control) =>
        control.textContent === t('remoteHosts.add.image') ||
        control.getAttribute('aria-label') === t('remoteHosts.add.image'),
    ),
  ).toBe(true);
  expect(dialog?.querySelector('input')).not.toBeNull();
  expect(dialog?.querySelector('[data-remote-host-add-submit]')?.hasAttribute('disabled')).toBe(
    true,
  );
  expect(posts).toEqual([]);
  await act(async () => {
    [...(dialog?.querySelectorAll('button') ?? [])]
      .find((control) => control.textContent === t('common.cancel'))
      ?.click();
  });
  expect(document.querySelector('[data-remote-host-add-submit]')).toBeNull();
});

it('shows Recommended and Local cards before any setup and opens Advanced on request', async () => {
  const call = vi.fn<BridgeCall>();
  await act(async () => root.render(<ConnectionsPage t={t} call={call} />));
  const card = (key: 'recommended' | 'local') =>
    host.querySelector(`[data-list-card][aria-label="${t(`connections.tier.${key}`)}"]`);
  expect(card('recommended')?.textContent).toContain(t('connections.quick'));
  expect(card('recommended')?.textContent).toContain(t('connections.attribute.changes'));
  expect(card('recommended')?.textContent).toContain(t('connections.attribute.signIn'));
  expect(card('local')?.textContent).toContain(t('connections.attribute.sameWifi'));
  expect(card('local')?.textContent).toContain(t('connections.attribute.noAccount'));
  expect(button(t('connections.advancedMethods')).getAttribute('aria-expanded')).toBe('false');
  await click(t('connections.advancedMethods'));
  expect(host.textContent).toContain(t('connections.attribute.cloudflare'));
  expect(host.textContent).toContain(t('connections.attribute.publicHttps'));
  expect(host.textContent).toContain(t('connections.attribute.server'));
  expect(button(t('connections.join'))).toBeUndefined();
  await click(t('connections.add'));
  expect(button(t('connections.quick'))).toBeDefined();
  expect(host.querySelector('[data-phone-app-guide], [data-remote-host-add-submit]')).toBeNull();
  expect(posts).toEqual([]);
});

it('puts a ready route above the tiers and opens Owner setup from its switch', async () => {
  routes = [tail];
  const call: BridgeCall = async (method) =>
    method === 'ownerPasswordSignIn'
      ? { ok: true, value: { enabled: false } }
      : { ok: true, value: { ...fakeTeamMode(), memberUrls: [tail.url] } };
  await act(async () => root.render(<ConnectionsPage t={t} call={call} />));
  const ready = host.querySelector('[data-pair-dialog]');
  const qr = ready?.querySelector('[data-pair-qr]');
  expect(qr).not.toBeNull();
  expect(ready?.textContent).toContain(tail.url);
  expect(button(t('connections.phone.copyAddress'))).toBeDefined();
  expect(
    (ready?.compareDocumentPosition(host.querySelector('[data-connection-methods]')!) ?? 0) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(button(t('connections.advancedMethods')).getAttribute('aria-expanded')).toBe('true');
  expect(host.textContent).toContain(t('connections.methodStatus.ready'));
  const control = button(t('connections.phone.ownerSignIn'));
  expect(control.getAttribute('role')).toBe('switch');
  expect(control.getAttribute('aria-checked')).toBe('false');
  await click(t('connections.phone.ownerSignIn'));
  expect(document.querySelector('input[type="password"]')).not.toBeNull();
  expect(ready?.querySelector('[data-pair-qr]')).toBe(qr);
});

it('starts Quick connect and shows a QR when the route is ready', async () => {
  vi.useFakeTimers();
  await act(async () => root.render(<ConnectionsDialog t={t} quickConnect onClose={() => {}} />));
  expect(posts).toEqual([
    {
      url: './api/botharness/devices/private-tunnel',
      body: { action: 'add', routeId: 'quick', mode: 'quick', confirm: true },
    },
  ]);
  expect(
    host.querySelector('[data-phone-app-guide], [data-connection-methods], [data-pair-qr]'),
  ).toBeNull();
  privateTunnel = { state: 'connected', mode: 'quick', origin: 'https://qa.example.com' };
  routes = [{ kind: 'private', url: 'https://qa.example.com', ready: true }, loopback];
  await act(async () => vi.advanceTimersByTimeAsync(3100));
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
  expect(posts.map(({ url }) => url)).toEqual([
    './api/botharness/devices/private-tunnel',
    './api/botharness/devices/offer',
  ]);
});

const openMethods = async () => {
  await render(false);
  await click('添加连接');
};

it('offers Quick Tunnel and Connect first and requires an explicit sign-in-and-connect action', async () => {
  connect = { state: 'off', account: { state: 'signed-out' } };
  await openMethods();
  expect(button(t('connections.quick'))).toBeDefined();
  expect(button('Tobs Connect')).toBeDefined();
  expect(button('Tailscale')).toBeUndefined();
  expect(button(t('connections.lan'))).toBeDefined();
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
  expect(button(t('connections.method.domain'))).toBeUndefined();
  await click(t('connections.advancedMethods'));
  await click(t('connections.method.domain'));
  expect(host.querySelector('[data-private-tunnel-setup="named"]')).not.toBeNull();
  expect(host.querySelector('input[type="password"]')).not.toBeNull();
  expect(button(t('connections.deploymentGuide'))).toBeDefined();
  await click(t('connections.back'));
  await click(t('connections.back'));
  await click(t('connections.method.proxy'));
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
  expect(button(t('connections.advancedMethods')).getAttribute('aria-expanded')).toBe('true');
  await click(t('connections.method.relay'));
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
  expect(button(t('connections.advancedMethods')).getAttribute('aria-expanded')).toBe('true');
  await click('Tailscale');
  expect(host.textContent).toContain(t('connections.tailscaleVpn'));
  expect(button(t('connections.continue'))).toBeDefined();
  expect(posts.map((post) => post.url)).toEqual(['./api/botharness/devices/offer']);
});
