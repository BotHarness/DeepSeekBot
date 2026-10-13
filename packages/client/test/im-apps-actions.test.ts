// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  ...(await import('./primitive-mocks.js')).dialogPrimitives(),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  Menu: () => null,
  closeTopModal: () => undefined,
  IconCloseOutlineRegular: () => null,
}));

import type { MessagingApp } from '../../core/src/messaging/outbound.js';
import { createImApps, ImAppsSection, type ImAppsFace } from '../src/client/im-apps-section.js';
import { zhTranslate } from '../src/client/locale.js';
import { BotSettings } from '../src/client/bot-settings.js';
import { createStore } from '../src/client/store.js';
import { chooseOption, comboboxOption, dialog, openCombobox } from './primitive-mocks.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.replaceChildren();
});

const app = (patch: Partial<MessagingApp>): MessagingApp =>
  ({
    providerId: 'dsh-im',
    ref: 'ref',
    platform: 'feishu',
    name: 'App',
    fingerprint: 'fp',
    connected: true,
    ...patch,
  }) as MessagingApp;

function store() {
  const value = createStore();
  value.setRoster(
    [
      { slug: 'ada', displayName: 'Ada', roles: [] },
      { slug: 'bo', displayName: 'Bo', roles: [] },
    ] as never,
    [],
  );
  return value;
}

async function render(face: Partial<ImAppsFace>): Promise<void> {
  const imApps: ImAppsFace = {
    load: async () => ({ apps: [], setups: [] }),
    manage: () => undefined,
    takeNotice: () => undefined,
    bind: async () => undefined,
    unbind: async () => undefined,
    bindCreated: async () => undefined,
    ...face,
  };
  await act(async () => {
    root.render(createElement(ImAppsSection, { imApps, store: store(), t: zhTranslate } as never));
  });
}

function button(label: string, scope: ParentNode = document): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) =>
      candidate.textContent === label || candidate.getAttribute('aria-label') === label,
  );
  if (found === undefined) throw new Error(`No button ${label}`);
  return found;
}

it('binds an unbound App to a chosen PersonaBot and reloads the list', async () => {
  let bound = false;
  const bind = vi.fn(async () => {
    bound = true;
  });
  await render({
    load: async () => ({
      apps: [app({ ref: 'a', name: 'Lark Sales', ...(bound ? { boundBotSlug: 'bo' } : {}) })],
      setups: [],
    }),
    bind,
  });
  await act(async () => {
    button('绑定 Lark Sales').click();
  });
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
  expect(dialog.getAttribute('aria-label')).toBe('绑定 Lark Sales');
  expect(button('绑定', dialog).disabled).toBe(true);
  await openCombobox('Bot', dialog);
  await act(async () => {
    comboboxOption('bo')?.click();
  });
  await act(async () => {
    button('绑定', dialog).click();
  });
  expect(bind).toHaveBeenCalledWith(expect.objectContaining({ ref: 'a' }), 'bo');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('[data-im-app]')?.textContent).toContain('Bo');
});

it('does not offer binding for a bound or disconnected App, and unbinds after confirmation', async () => {
  const unbind = vi.fn(async () => undefined);
  await render({
    load: async () => ({
      apps: [
        app({ ref: 'a', name: 'Lark Sales', boundBotSlug: 'ada', bindingId: 'b1' }),
        app({ ref: 'b', name: 'QQ Group', platform: 'qq', connected: false }),
      ],
      setups: [],
    }),
    unbind,
  });
  expect(() => button('绑定 Lark Sales')).toThrow();
  expect(button('绑定 QQ Group').disabled).toBe(true);
  await act(async () => {
    button('解绑 Lark Sales').click();
  });
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
  expect(dialog.textContent).toContain('Ada 将不再通过 Lark Sales 收发消息');
  expect(unbind).not.toHaveBeenCalled();
  await act(async () => {
    button('解绑', dialog).click();
  });
  expect(unbind).toHaveBeenCalledWith(expect.objectContaining({ ref: 'a' }));
});

it('keeps the dialog open with a readable error when an action fails', async () => {
  await render({
    load: async () => ({
      apps: [app({ ref: 'a', name: 'Lark Sales', boundBotSlug: 'ada', bindingId: 'b1' })],
      setups: [],
    }),
    unbind: async () => {
      throw new Error('stale-revision');
    },
  });
  await act(async () => {
    button('解绑 Lark Sales').click();
  });
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
  await act(async () => {
    button('解绑', dialog).click();
  });
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('操作没有完成，请重试。');
  expect(host.querySelector('[data-im-app]')?.textContent).toContain('Ada');
});

it('submits the bind dialog with Enter and closes it with Cancel without binding', async () => {
  const bind = vi.fn(async () => undefined);
  await render({
    load: async () => ({ apps: [app({ ref: 'a', name: 'Lark Sales' })], setups: [] }),
    bind,
  });
  await act(async () => {
    button('绑定 Lark Sales').click();
  });
  await act(async () => {
    button('取消', dialog()).click();
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(bind).not.toHaveBeenCalled();
  await act(async () => {
    button('绑定 Lark Sales').click();
  });
  await act(async () => dialog().querySelector('form')!.requestSubmit());
  expect(bind).not.toHaveBeenCalled();
  await chooseOption('Bot', 'ada', dialog());
  await act(async () => dialog().querySelector('form')!.requestSubmit());
  expect(bind).toHaveBeenCalledWith(expect.objectContaining({ ref: 'a' }), 'ada');
});

it('walks Create app from choosing a PersonaBot to the setup form and back', async () => {
  await render({
    load: async () => ({
      apps: [],
      setups: [
        {
          version: 1,
          providerId: 'dsh-im/feishu',
          platform: 'feishu',
          kind: 'credentials',
          endpoint: 'dsh-im/app-setup',
        } as never,
      ],
    }),
    appSetup: { descriptor: () => undefined, current: () => undefined } as never,
  });
  await act(async () => {
    button('创建应用').click();
  });
  expect(dialog().getAttribute('aria-label')).toBe('创建应用');
  expect(dialog().textContent).toContain(zhTranslate('imApps.createHint'));
  expect(button(zhTranslate('imApps.next'), dialog()).disabled).toBe(true);
  await chooseOption('Bot', 'bo', dialog());
  await act(async () => {
    button(zhTranslate('imApps.next'), dialog()).click();
  });
  expect(dialog().getAttribute('aria-label')).toBe('创建应用');
  expect(dialog().querySelector('input[role="combobox"][aria-label="平台"]')).not.toBeNull();
  expect(button('创建并绑定', dialog()).disabled).toBe(false);
  await act(async () => {
    button(zhTranslate('appSetup.back'), dialog()).click();
  });
  expect(button(zhTranslate('imApps.next'), dialog()).disabled).toBe(false);
  await act(async () => {
    button('取消', dialog()).click();
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('offers Create app only when the Host advertises setup', async () => {
  await render({ load: async () => ({ apps: [], setups: [] }) });
  expect(() => button('创建应用')).toThrow();
  act(() => {
    root.unmount();
  });
  root = createRoot(host);
  await render({
    load: async () => ({
      apps: [],
      setups: [{ providerId: 'dsh-im', platform: 'feishu' } as never],
    }),
    appSetup: {} as never,
  });
  expect(button('创建应用')).toBeDefined();
});

it('binds through the identity command and unbinds at the current revision', async () => {
  const messagingIdentity = vi.fn(async () => ({}) as never);
  const imApps = createImApps({
    call: async () => ({ ok: true, value: { apps: [], setups: [] } }) as never,
    botSettings: new BotSettings(),
    actions: {
      messagingIdentity,
      messagingSnapshot: async () =>
        ({
          identities: [{ id: 'b1', revision: 4 }],
          accounts: [],
          grants: [],
          intents: [],
        }) as never,
    },
  });
  await imApps.bind(app({ providerId: 'dsh-im', ref: 'a', fingerprint: 'fa' }), 'bo');
  expect(messagingIdentity).toHaveBeenLastCalledWith('bo', {
    kind: 'bind',
    providerId: 'dsh-im',
    accountRef: 'a',
    fingerprint: 'fa',
  });
  await imApps.unbind(app({ ref: 'a', boundBotSlug: 'ada', bindingId: 'b1' }));
  expect(messagingIdentity).toHaveBeenLastCalledWith('ada', {
    kind: 'unbind',
    id: 'b1',
    expectedRevision: 4,
  });
  await expect(
    imApps.unbind(app({ ref: 'x', boundBotSlug: 'ada', bindingId: 'gone' })),
  ).rejects.toThrow();
});
