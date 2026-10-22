// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PairedDevicesSettings } from '../src/client/paired-devices.js';
import { zhTranslate as t } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: 'button',
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
let lanState: 'off' | 'listening' | 'error';
let failEnable: boolean;
let expiresAt: string;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let posts: { url: string; body: unknown }[];

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  routes = [loopback];
  lanState = 'off';
  failEnable = false;
  expiresAt = new Date(Date.now() + 600_000).toISOString();
  posts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        if (url.endsWith('/lan')) {
          if (failEnable) return Response.json({ code: 'lan-listen-failed' }, { status: 409 });
          lanState = body.action === 'enable' ? 'listening' : 'off';
          routes = body.action === 'enable' ? [lan, loopback] : [loopback];
          return Response.json({ ok: true });
        }
        if (url.endsWith('/offer'))
          return Response.json({
            link: 'deepseekbot://pair?p=test',
            qr: { size: 1, path: 'M0 0h1v1h-1z' },
            expiresAt,
            routes: routes.map((route) => route.url),
            reachable: routes.some((route) => route.kind !== 'loopback'),
          });
      }
      return Response.json({
        host: { id: 'h', name: 'QA computer' },
        devices: [],
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
});
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((node) => node.textContent === label)!;
const click = async (label: string) => act(async () => button(label).click());
const render = async () => act(async () => root.render(<PairedDevicesSettings t={t} />));

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
  expect(host.querySelector('[data-pair-qr]')).toBeNull();
  expect(host.textContent).toContain(t('devices.pair.expired'));
  expiresAt = new Date(Date.now() + 600_000).toISOString();
  await click(t('devices.pair.renew'));
  expect(host.querySelector('[data-pair-qr]')).not.toBeNull();
  expect(posts.filter((post) => post.url.endsWith('/offer'))).toHaveLength(2);
});
