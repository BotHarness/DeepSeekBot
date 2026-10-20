// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PairedDevicesSettings } from '../src/client/paired-devices.js';
import { zhTranslate } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: 'button' }));

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

const render = async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(<PairedDevicesSettings t={zhTranslate} />));
  await act(async () => new Promise((done) => setTimeout(done, 0)));
};
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((node) => node.textContent === label);

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  posts.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
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
  vi.unstubAllGlobals();
});

it('hides the Connect section when the Host has no account support', async () => {
  snapshot = devices();
  await render();
  expect(host.querySelector('[data-connect]')).toBeNull();
  expect(host.querySelector('[data-pair-route-steps]')).not.toBeNull();
});

it('signs in, shows the code to confirm, then the connected address', async () => {
  snapshot = devices({ state: 'off', account: { state: 'signed-out' } });
  await render();
  expect(host.querySelector('[data-connect-account]')?.getAttribute('data-connect-account')).toBe(
    'signed-out',
  );
  await act(async () => button('登录')?.click());
  expect(posts).toEqual([{ action: 'sign-in' }]);

  snapshot = devices({
    state: 'off',
    account: {
      state: 'signing-in',
      userCode: 'KQXP-7HMD',
      verificationUri: 'https://auth.example/device?code=KQXP-7HMD',
    },
  });
  await render();
  expect(button('登录')).toBeUndefined();
  expect(host.querySelector('[data-connect-code]')?.textContent).toContain('KQXP-7HMD');
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  await act(async () => button('打开登录页')?.click());
  expect(open).toHaveBeenCalledWith(
    'https://auth.example/device?code=KQXP-7HMD',
    '_blank',
    'noopener',
  );

  snapshot = devices({
    state: 'connected',
    hostname: 'hk7q2mstudio3.deepseekbot.dev',
    account: { state: 'signed-in', email: 'vain@example.com' },
  });
  await render();
  expect(host.textContent).toContain('vain@example.com');
  expect(host.querySelector('[data-connect-tunnel]')?.textContent).toContain(
    'hk7q2mstudio3.deepseekbot.dev',
  );
  expect(host.querySelector('[data-connect-tunnel]')?.getAttribute('data-connect-tunnel')).toBe(
    'connected',
  );
  expect(host.querySelector('[data-pair-route-steps]')).toBeNull();
  await act(async () => button('退出登录')?.click());
  expect(posts.at(-1)).toEqual({ action: 'sign-out' });
});

it('explains a refused account', async () => {
  snapshot = devices({ state: 'off', account: { state: 'error', issue: 'account-not-allowed' } });
  await render();
  expect(host.querySelector('[data-connect-issue]')?.textContent).toBe(
    zhTranslate('devices.connect.notAllowed'),
  );
  expect(button('登录')).toBeDefined();
});
