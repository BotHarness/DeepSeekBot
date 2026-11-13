// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostClient } from '../../../apps/mobile/src/host/client.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { ConnectionHosts } from '../src/client/connection-hosts.js';
import {
  createRemoteHosts,
  REMOTE_HOSTS_STORAGE_KEY,
  type RemoteHosts,
} from '../src/client/remote-hosts.js';
import { zhTranslate as t } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Modal: ({
    title,
    description,
    children,
    footer,
  }: {
    title: string;
    description?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <div role="dialog" aria-label={title}>
      {description}
      {children}
      {footer}
    </div>
  ),
  Button: 'button',
  IconChevronDownOutlineRegular: () => null,
  Input: 'input',
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  relativeTime: () => ({ unit: 'minute', n: 1 }),
}));
vi.mock('../src/client/remote-hosts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/client/remote-hosts.js')>()),
  remoteHosts: () => sources,
}));
vi.mock('../src/client/ds/panel-dialog.js', () => ({
  PanelDialog: ({ title, children }: { title: string; children: ReactNode }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}));
let sources: RemoteHosts;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let api: ReturnType<typeof vi.fn<HostClient['api']>>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const fake = new FakeHost();
  const stored = JSON.stringify([
    {
      hostId: 'target',
      hostName: 'Studio',
      routes: ['http://127.0.0.1:47001'],
      deviceId: 'browser',
      credential: fake.credential,
    },
  ]);
  const values = new Map([[REMOTE_HOSTS_STORAGE_KEY, stored]]);
  sources = createRemoteHosts({
    carrier: fake.carrier,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    },
  });
  api = vi.fn<HostClient['api']>(async () => ({
    status: 200,
    body: {
      host: { id: 'target', name: 'Studio' },
      devices: [{ id: 'phone', name: 'Test phone' }],
      lan: { state: 'listening' },
      privateTunnel: { state: 'connected' },
    },
  }));
  vi.spyOn(sources.client('target')!, 'api').mockImplementation(api);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
const click = async (label: string) =>
  act(async () => {
    const nodes = [...host.querySelectorAll('button')].filter((node) => node.textContent === label);
    expect(nodes.length).toBeGreaterThan(0);
    nodes.at(-1)!.click();
  });
const open = async () => {
  await act(async () => root.render(<ConnectionHosts t={t} accountLinked={false} />));
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-connection-host="target"]')!.click(),
  );
};

it('keeps local removal separate from target device revocation and confirms the target', async () => {
  await open();
  expect(host.textContent).toContain('Test phone');
  await click(t('connections.hosts.remove'));
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
    t('connections.hosts.removeHint'),
  );
  await click(t('common.cancel'));
  expect(sources.getSnapshot().hosts).toHaveLength(1);
  await click(t('connections.hosts.remove'));
  await click(t('connections.hosts.remove'));
  expect(sources.getSnapshot().hosts).toHaveLength(0);
  expect(api.mock.calls.every(([path]) => path === '/api/botharness/devices')).toBe(true);
});

it('warns about the selected Host and connection loss before stopping only its selected route', async () => {
  await open();
  const row = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === t('connections.hosts.stop'),
  )!;
  await act(async () => row.click());
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
    t('connections.hosts.targetHint', { name: 'Studio' }),
  );
  expect(api.mock.calls).toHaveLength(1);
  await click(t('connections.hosts.stop'));
  expect(api).toHaveBeenCalledWith(
    '/api/botharness/devices/lan',
    expect.objectContaining({ body: { action: 'disable', confirm: true } }),
  );
  expect(sources.getSnapshot().hosts).toHaveLength(1);
});
