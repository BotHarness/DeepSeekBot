// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConnectAccountHosts } from '../src/client/connect-account-hosts.js';
import { zhTranslate as t } from '../src/client/locale.js';
import type { ConnectedHost } from '../../core/src/devices/connect-account.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: 'button' }));
vi.mock('../src/client/ds/panel-dialog.js', () => ({
  PanelDialog: ({
    title,
    children,
    actions,
  }: {
    title: string;
    children: ReactNode;
    actions: ReactNode;
  }) => (
    <div role="dialog" aria-label={title}>
      {children}
      {actions}
    </div>
  ),
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let hosts: ConnectedHost[];
let listDown: boolean;
const reloadSnapshot = vi.fn(async () => {});
const current = {
  id: 'hcurrent',
  name: 'Current computer',
  hostname: 'current.test',
  createdAt: '2026-01-01T00:00:00Z',
  current: true,
  sessionKnown: true,
  connected: true,
};
const remote = {
  ...current,
  id: 'hremote',
  name: 'Other computer',
  hostname: 'other.test',
  current: false,
  connected: false,
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  hosts = [current, remote];
  listDown = false;
  reloadSnapshot.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        hosts = hosts.filter((host) => host.id !== body.hostId);
        return Response.json({
          ok: true,
          status: { state: 'signed-in' },
          sessionKnown: true,
          sessionRevoked: false,
        });
      }
      return listDown
        ? Response.json({ code: 'relay-unavailable' }, { status: 503 })
        : Response.json({ hosts });
    }),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(
  account: { state: string; hostId?: string; issue?: string } = {
    state: 'signed-in',
    hostId: current.id,
  },
) {
  await act(async () =>
    root.render(<ConnectAccountHosts t={t} account={account} reloadSnapshot={reloadSnapshot} />),
  );
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === text || node.getAttribute('aria-label') === text,
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  await act(async () => button.click());
}

it('fetches only on entry/identity changes, not repeated snapshots', async () => {
  await render();
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  await render();
  await render();
  await render();
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain(t('devices.connect.thisComputer'));
  expect(container.textContent).toContain(t('devices.connect.computerOnline'));
  expect(container.textContent).toContain(t('devices.connect.computerOffline'));
  const currentRow = container.querySelector('[data-account-host-current="true"]');
  expect(currentRow?.querySelector('button')).toBeNull();
});

it('requires a named confirmation and cancel makes no request', async () => {
  await render();
  await click(t('devices.connect.signOutNamed', { name: remote.name }));
  expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toContain(
    remote.name,
  );
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  await click(t('common.cancel'));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
});

it('confirms through the Host once, then reloads the list and snapshot', async () => {
  await render();
  await click(t('devices.connect.signOutNamed', { name: remote.name }));
  const confirm = container.querySelector('[role="dialog"] button:last-child');
  if (!(confirm instanceof HTMLButtonElement)) throw new Error('Missing confirmation');
  await act(async () => {
    confirm.click();
    confirm.click();
  });
  const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0]?.[1]?.body))).toEqual({ hostId: remote.id, confirm: true });
  expect(reloadSnapshot).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain(remote.name);
});

it('loads at host-limit without a current row and calls out the unlinked computer', async () => {
  hosts = [remote];
  await render({ state: 'error', issue: 'host-limit' });
  expect(container.textContent).toContain(t('devices.connect.notLinked'));
  expect(container.querySelector('[data-account-host-current="true"]')).toBeNull();
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
});

it('never presents legacy removal as sign-out', async () => {
  hosts = [{ ...remote, sessionKnown: false }];
  await render();
  expect(container.textContent).toContain(t('devices.connect.legacyComputer'));
  expect(
    [...container.querySelectorAll('button')].some(
      (button) => button.textContent === t('devices.connect.signOut'),
    ),
  ).toBe(false);
  await click(t('devices.connect.removeNamed', { name: remote.name }));
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
    t('devices.connect.legacyComputer'),
  );
});

it('keeps stale rows visible but prevents actions until refreshed', async () => {
  await render();
  listDown = true;
  await click(t('devices.connect.refreshComputers'));
  expect(container.textContent).toContain(remote.name);
  expect(container.textContent).toContain(t('devices.connect.computersUnavailable'));
  const rowButton = container.querySelector('[data-account-host-current="false"] button');
  expect(rowButton instanceof HTMLButtonElement && rowButton.disabled).toBe(true);
});

it('does not call the relay when signed out', async () => {
  await render({ state: 'signed-out' });
  expect(fetch).not.toHaveBeenCalled();
  expect(container.textContent).toBe('');
});

it('keeps the confirmation open when the revoke receipt is not successful', async () => {
  await render();
  vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ ok: false }));
  await click(t('devices.connect.signOutNamed', { name: remote.name }));
  const confirm = container.querySelector('[role="dialog"] button:last-child');
  if (!(confirm instanceof HTMLButtonElement)) throw new Error('Missing confirmation');
  await act(async () => confirm.click());
  expect(reloadSnapshot).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(container.textContent).toContain(t('devices.connect.computerActionFailed'));
});
