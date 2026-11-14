// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostClient } from '../../../apps/mobile/src/host/client.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { ConnectionHosts, HostDetails } from '../src/client/connection-hosts.js';
import {
  createRemoteHosts,
  REMOTE_HOSTS_STORAGE_KEY,
  type HostStorage,
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
let values: Map<string, string>;
let storage: HostStorage;
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
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: '11'.repeat(32),
        deviceKey: '22'.repeat(32),
      },
    },
  ]);
  values = new Map([[REMOTE_HOSTS_STORAGE_KEY, stored]]);
  storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  sources = createRemoteHosts({
    connectionOperationLock: async (_name, run) => run(),
    carrier: fake.carrier,
    storage,
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
  const client = sources.client('target')!;
  const snapshot = client.getSnapshot();
  vi.spyOn(client, 'getSnapshot').mockImplementation(() => ({
    ...snapshot,
    connection: { status: 'connected', route: 'http://127.0.0.1:47001' },
  }));
  sources.setPendingConnection('target', client, undefined);
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
const notifyStoredHosts = () => {
  const event = new Event('storage');
  Object.defineProperties(event, {
    storageArea: { value: storage },
    key: { value: REMOTE_HOSTS_STORAGE_KEY },
  });
  globalThis.dispatchEvent(event);
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

it('allows confirmed local removal while retaining an uncertain Host operation for later readback', async () => {
  const client = sources.client('target')!;
  sources.setPendingConnection('target', client, {
    generation: crypto.randomUUID(),
    hostKey: '11'.repeat(32),
    deviceId: 'browser',
    operation: { action: 'revoke-device', deviceId: 'browser' },
  });
  const journal = [...values].filter(([key]) => key.startsWith('botharness.remoteHosts.operation'));
  await open();
  await click(t('connections.hosts.remove'));
  expect(host.textContent).toContain(t('connections.hosts.removeHint'));
  await click(t('common.cancel'));
  expect(sources.getSnapshot().hosts).toHaveLength(1);
  await click(t('connections.hosts.remove'));
  await click(t('connections.hosts.remove'));
  expect(sources.getSnapshot().hosts).toHaveLength(0);
  expect([...values].filter(([key]) => key.startsWith('botharness.remoteHosts.operation'))).toEqual(
    journal,
  );
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
  expect(api.mock.calls).toHaveLength(2);
  await click(t('connections.hosts.stop'));
  expect(api).toHaveBeenCalledWith(
    '/api/botharness/devices/lan',
    expect.objectContaining({ body: { action: 'disable', confirm: true } }),
  );
  expect(sources.getSnapshot().hosts).toHaveLength(1);
});

it('gives an actionable secure-page or owning-CLI path when safe cross-tab execution is unavailable', async () => {
  await open();
  vi.spyOn(sources, 'withConnectionOperation').mockRejectedValue(
    Error('connection-operation-lock-unavailable'),
  );
  const stop = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === t('connections.hosts.stop'),
  )!;
  await act(async () => stop.click());
  await click(t('connections.hosts.stop'));
  expect(host.textContent).toContain(t('connections.remote.lockUnavailable'));
  expect(api.mock.calls.every(([path]) => path === '/api/botharness/devices')).toBe(true);
});

it('keeps new-grant management disabled until the previous result is checked', async () => {
  const remote = sources.getSnapshot().hosts[0]!;
  await act(async () =>
    root.render(
      <HostDetails
        remote={{ ...remote, host: { ...remote.host, connectionOwnerChanged: true } }}
        t={t}
      />,
    ),
  );
  const stop = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === t('connections.hosts.stop'),
  )!;
  const revoke = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === t('connections.hosts.revoke'),
  )!;
  const readback = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === t('connections.remote.readPrevious'),
  )!;
  expect(stop.disabled).toBe(true);
  expect(revoke.disabled).toBe(true);
  expect(readback.disabled).toBe(false);
});

it.each(['prepared', 'preparing'])(
  'discards a %s confirmation when the same pinned Host receives a new Client grant',
  async (phase) => {
    await open();
    let finishPlan: (() => void) | undefined;
    if (phase === 'preparing') {
      const pending = new Promise<void>((resolve) => {
        finishPlan = resolve;
      });
      api.mockImplementationOnce(async () => {
        await pending;
        return {
          status: 200,
          body: {
            host: { id: 'target', name: 'Studio' },
            devices: [],
            lan: { state: 'listening' },
          },
        };
      });
    }
    await click(t('connections.hosts.stop'));
    if (phase === 'prepared') expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    const previousApi = api;
    const previousSources = sources;
    const previousClient = sources.client('target');
    if (phase === 'prepared') {
      await act(async () => notifyStoredHosts());
      expect(sources.client('target')).toBe(previousClient);
      expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    }
    const previousHost = sources.getSnapshot().hosts[0]!.host;
    const fake = new FakeHost();
    values.set(
      REMOTE_HOSTS_STORAGE_KEY,
      JSON.stringify([{ ...previousHost, deviceId: 'new-browser', credential: fake.credential }]),
    );
    const replacementApi = vi.fn<HostClient['api']>(async () => ({
      status: 200,
      body: {
        host: { id: 'target', name: 'Studio' },
        devices: [{ id: 'phone', name: 'Test phone' }],
        lan: { state: 'listening' },
      },
    }));
    await act(async () => {
      notifyStoredHosts();
      const client = sources.client('target')!;
      expect(sources).toBe(previousSources);
      expect(client).not.toBe(previousClient);
      const snapshot = client.getSnapshot();
      vi.spyOn(client, 'api').mockImplementation(replacementApi);
      vi.spyOn(client, 'getSnapshot').mockImplementation(() => ({
        ...snapshot,
        connection: { status: 'connected', route: 'http://127.0.0.1:47001' },
      }));
      sources.setPendingConnection('target', client, undefined);
    });
    await act(async () => finishPlan?.());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(previousApi.mock.calls.every(([path]) => path === '/api/botharness/devices')).toBe(true);
    expect(replacementApi.mock.calls.every(([path]) => path === '/api/botharness/devices')).toBe(
      true,
    );
    await click(t('connections.hosts.stop'));
    await click(t('connections.hosts.stop'));
    expect(replacementApi).toHaveBeenCalledWith(
      '/api/botharness/devices/lan',
      expect.objectContaining({ body: { action: 'disable', confirm: true } }),
    );
    expect(previousApi.mock.calls.every(([path]) => path === '/api/botharness/devices')).toBe(true);
  },
);
