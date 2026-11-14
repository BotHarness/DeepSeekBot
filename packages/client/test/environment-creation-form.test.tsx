// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostClient } from '../../../apps/mobile/src/host/client.js';

const fixture = vi.hoisted(() => ({
  scope: 'all',
  online: true,
  generation: 0,
  call: vi.fn<HostClient['call']>(),
  refresh: vi.fn(async () => {}),
  open: vi.fn(),
}));
vi.mock('../src/client/host-tabs.js', () => ({
  HostMark: () => null,
  useRemoteHosts: () => ({
    tab: fixture.scope,
    hosts: [
      {
        host: { hostId: 'remote-b', hostName: 'Remote B' },
        snapshot: { connection: { status: fixture.online ? 'connected' : 'disconnected' } },
      },
    ],
  }),
}));
vi.mock('../src/client/this-host.js', () => ({
  useThisHost: () => ({ id: 'local-a', name: 'Local A' }),
}));
vi.mock('../src/client/host-looks.js', () => ({
  hostLooks: () => ({ look: () => ({}) }),
  useHostName: (_id: string, name: string) => name,
}));
vi.mock('../src/client/remote-hosts.js', () => {
  const client = {
    call: fixture.call,
    refresh: fixture.refresh,
    getSnapshot: () => ({ connection: { status: fixture.online ? 'connected' : 'disconnected' } }),
  };
  const replacement = { ...client };
  return {
    remoteHosts: () => ({
      client: () => (fixture.generation === 0 ? client : replacement),
      open: fixture.open,
    }),
  };
});
vi.mock('../src/client/ds/select.js', () => ({
  Select: (props: {
    label: string;
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
    options: { value: string; label: ReactNode }[];
  }) =>
    createElement(
      'select',
      {
        'aria-label': props.label,
        value: props.value,
        disabled: props.disabled,
        onChange: (event: { currentTarget: HTMLSelectElement }) =>
          props.onChange(event.currentTarget.value),
      },
      props.options.map((option) =>
        createElement('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return {
    ...dialogPrimitives(),
    IconCheckOutlineRegular: () => null,
    IconEditOutlineRegular: () => null,
    IconTrashOutlineRegular: () => null,
  };
});

import { EnvironmentCreation } from '../src/client/environment-creation.js';
import { EnvironmentSections } from '../src/client/environment-sections.js';
import { rememberCreationHost } from '../src/client/environment-creation-target.js';
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';
import { zhTranslate } from '../src/client/locale.js';
import { buttonNamed, fieldNamed, typeInto } from './primitive-mocks.js';

const localCall = vi.fn(async () => {
  throw new Error('Local Host must remain unchanged');
});
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const close = vi.fn();
const render = async () =>
  act(async () =>
    root.render(
      createElement(EnvironmentCreation, {
        request: { kind: 'channel' },
        scope: fixture.scope,
        actions: createActions(localCall, createStore()),
        t: zhTranslate,
        onClose: close,
      }),
    ),
  );

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fixture.scope = 'all';
  fixture.online = true;
  fixture.generation = 0;
  vi.clearAllMocks();
  localStorage.clear();
  rememberCreationHost(localStorage, { id: 'remote-b', name: 'Remote B', online: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it.each(['member', 'admin'])(
  'creates a local Channel in the %s page without Owner target state',
  async (role) => {
    vi.stubGlobal('__DSH_REMOTE_ACCESS__', { owner: false, role });
    const storage = vi.spyOn(Storage.prototype, 'getItem');
    const actions = createActions(localCall, createStore());
    const create = vi.spyOn(actions, 'createGroup').mockResolvedValue({
      id: 'member-channel',
      type: 'group',
      name: 'Member local',
      members: [],
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    });
    try {
      await act(async () =>
        root.render(
          createElement(EnvironmentCreation, {
            request: { kind: 'channel' },
            scope: 'all',
            actions,
            t: zhTranslate,
            onClose: close,
          }),
        ),
      );
      expect(document.querySelector('select')).toBeNull();
      expect(storage).not.toHaveBeenCalled();
      await typeInto(fieldNamed('频道名称'), 'Member local');
      await act(async () => buttonNamed('创建').click());
      expect(create).toHaveBeenCalledExactlyOnceWith('Member local', undefined);
      expect(fixture.call).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      storage.mockRestore();
      create.mockRestore();
    }
  },
);

it.each(['member', 'admin'])(
  'retains the authenticated %s Bot creation actions without Owner target state',
  (role) => {
    vi.stubGlobal('__DSH_REMOTE_ACCESS__', { owner: false, role });
    const storage = vi.spyOn(Storage.prototype, 'getItem');
    const actions = createActions(localCall, createStore());
    try {
      expect(
        EnvironmentCreation({
          request: { kind: 'bot', source: 'empty' },
          actions,
          t: zhTranslate,
          scope: 'all',
          onClose: close,
        }),
      ).toMatchObject({ props: { actions, source: 'empty' } });
      expect(storage).not.toHaveBeenCalled();
      expect(fixture.call).not.toHaveBeenCalled();
    } finally {
      storage.mockRestore();
    }
  },
);

it('keeps the offline last Host visible and requires an explicit online choice', async () => {
  fixture.online = false;
  await render();
  await typeInto(fieldNamed('频道名称'), 'Only B');
  const select = document.querySelector('select');
  expect(select?.value).toBe('remote-b');
  expect(buttonNamed('创建').disabled).toBe(true);
  expect(document.body.textContent).toContain('此环境离线');
  await act(async () => buttonNamed('创建').click());
  expect(fixture.call).not.toHaveBeenCalled();
  expect(localCall).not.toHaveBeenCalled();
  await act(async () => {
    if (select) {
      select.value = 'local';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  expect(buttonNamed('创建').disabled).toBe(false);
});

it('keeps a pending create on B when the browsing scope changes to A', async () => {
  let finish: ((value: unknown) => void) | undefined;
  fixture.call.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await render();
  await typeInto(fieldNamed('频道名称'), 'Only B');
  await act(async () => buttonNamed('创建').click());
  fixture.scope = 'local';
  await render();
  expect(document.querySelector('select')?.value).toBe('remote-b');
  expect(document.querySelector('select')?.disabled).toBe(true);
  await act(async () => finish?.({ channel: { id: 'same-id', type: 'group', name: 'Only B' } }));
  expect(fixture.call).toHaveBeenCalledExactlyOnceWith('channelCreate', {
    name: 'Only B',
    members: [],
    operationKey: expect.any(String),
  });
  expect(localCall).not.toHaveBeenCalled();
  expect(fixture.open).toHaveBeenCalledExactlyOnceWith({
    hostId: 'remote-b',
    channelId: 'same-id',
    title: 'Only B',
  });
  expect(close).toHaveBeenCalledOnce();
});

const renderSections = async () =>
  act(async () =>
    root.render(
      createElement(EnvironmentSections, {
        host: { id: 'remote-b', name: 'Remote B' },
        t: zhTranslate,
        onClose: close,
      }),
    ),
  );

it('does not resend an unknown Section creation and refreshes only its original Host', async () => {
  fixture.call.mockRejectedValueOnce(new Error('reply lost after commit'));
  await renderSections();
  await typeInto(fieldNamed('分组名称'), 'Only B');
  await act(async () => buttonNamed(zhTranslate('roster.menu.createSection')).click());
  expect(fixture.call).toHaveBeenCalledExactlyOnceWith('sectionCreate', { name: 'Only B' });
  expect(buttonNamed(zhTranslate('roster.menu.createSection')).disabled).toBe(true);
  await act(async () => buttonNamed(zhTranslate('roster.menu.createSection')).click());
  await act(async () => buttonNamed(zhTranslate('environment.sections.refresh')).click());
  expect(fixture.call).toHaveBeenCalledOnce();
  expect(fixture.refresh).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).toContain(zhTranslate('environment.sections.unknown'));
});

it('refuses an old Section draft after the same Host gets a replacement Client', async () => {
  await renderSections();
  await typeInto(fieldNamed('分组名称'), 'Old draft');
  fixture.generation = 1;
  await renderSections();
  expect(buttonNamed(zhTranslate('roster.menu.createSection')).disabled).toBe(true);
  expect(document.body.textContent).toContain(zhTranslate('environment.create.changed'));
  await act(async () => buttonNamed(zhTranslate('roster.menu.createSection')).click());
  expect(fixture.call).not.toHaveBeenCalled();
});
