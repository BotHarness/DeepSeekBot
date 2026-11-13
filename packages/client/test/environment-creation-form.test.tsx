// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostClient } from '../../../apps/mobile/src/host/client.js';

const fixture = vi.hoisted(() => ({
  scope: 'all',
  online: true,
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
  return { remoteHosts: () => ({ client: () => client, open: fixture.open }) };
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
});

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
  });
  expect(localCall).not.toHaveBeenCalled();
  expect(fixture.open).toHaveBeenCalledExactlyOnceWith({
    hostId: 'remote-b',
    channelId: 'same-id',
    title: 'Only B',
  });
  expect(close).toHaveBeenCalledOnce();
});
