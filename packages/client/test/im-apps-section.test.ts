// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', { 'data-tag': '' }, children),
  Modal: () => null,
  closeTopModal: () => undefined,
  Menu: () => null,
  IconCloseOutlineRegular: () => null,
  IconChevronDownOutlineRegular: () => null,
}));

import type { MessagingApp } from '../../core/src/messaging/outbound.js';
import { createImApps, ImAppsSection } from '../src/client/im-apps-section.js';
import { zhTranslate } from '../src/client/locale.js';
import { BotSettings } from '../src/client/bot-settings.js';
import { createStore } from '../src/client/store.js';

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

function storeWithBots() {
  const store = createStore();
  store.setRoster([{ slug: 'ada', displayName: 'Ada', roles: [] } as never], []);
  return store;
}

async function render(
  loadApps: () => Promise<MessagingApp[]>,
  manage: () => void = () => undefined,
  notice?: 'settings-unavailable',
): Promise<void> {
  const imApps = {
    load: async () => ({ apps: await loadApps(), setups: [] }),
    manage,
    takeNotice: () => notice,
  };
  await act(async () => {
    root.render(
      createElement(ImAppsSection, {
        imApps,
        store: storeWithBots(),
        t: zhTranslate,
      } as never),
    );
  });
}

function rows(): string[] {
  return [...host.querySelectorAll('[data-im-app]')].map((row) => row.textContent ?? '');
}

it('lists Apps from every platform with their PersonaBot or an unbound marker', async () => {
  await render(async () => [
    app({ ref: 'a', name: 'Lark Sales', platform: 'feishu', boundBotSlug: 'ada' }),
    app({ ref: 'b', name: 'QQ Group', platform: 'qq', connected: false }),
    app({ ref: 'c', name: 'Old Slack', platform: 'slack', boundBotSlug: 'gone' }),
  ]);
  expect(rows()).toEqual([
    'Lark SalesLark/飞书 · 已连接Ada解绑',
    'QQ GroupQQ · 未连接未绑定绑定',
    'Old SlackSlack · 已连接已移除的 Bot',
  ]);
});

it('shows an empty state when there are no Apps', async () => {
  await render(async () => []);
  expect(host.textContent).toContain('还没有应用');
  expect(rows()).toEqual([]);
});

it('shows a load failure', async () => {
  await render(async () => {
    throw new Error('messaging-unavailable');
  });
  expect(host.textContent).toContain('无法加载应用列表');
});

it('hands off to DSH settings and shows a notice when it could not be opened', async () => {
  const manage = vi.fn();
  await render(async () => [], manage, 'settings-unavailable');
  expect(host.textContent).toContain('无法打开 DSH 设置中的 IM 机器人页面');
  const button = [...host.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === '在 DSH 设置中管理',
  );
  act(() => {
    button?.click();
  });
  expect(manage).toHaveBeenCalledOnce();
});

it('closes Bot Settings for DSH settings and reopens at IM apps when it returns', () => {
  const settings = new BotSettings();
  settings.open('im-apps');
  let returned: (() => void) | undefined;
  let unavailable: (() => void) | undefined;
  const imApps = createImApps({
    call: async () => ({ ok: true, value: { apps: [], setups: [] } }) as never,
    botSettings: settings,
    actions: {} as never,
    openDshSettings: (onReturn, onUnavailable) => {
      returned = onReturn;
      unavailable = onUnavailable;
      return () => undefined;
    },
  });
  imApps.manage();
  expect(settings.getSnapshot().open).toBe(false);
  returned?.();
  expect(settings.getSnapshot()).toEqual({ open: true, sectionId: 'im-apps' });
  expect(imApps.takeNotice()).toBeUndefined();

  imApps.manage();
  unavailable?.();
  expect(settings.getSnapshot()).toEqual({ open: true, sectionId: 'im-apps' });
  expect(imApps.takeNotice()).toBe('settings-unavailable');
  expect(imApps.takeNotice()).toBeUndefined();
});

it('loads the list again each time the section mounts', async () => {
  const load = vi.fn(async () => [app({ ref: 'a', name: 'Lark Sales' })]);
  await render(load);
  act(() => {
    root.unmount();
  });
  root = createRoot(host);
  await render(load);
  expect(load).toHaveBeenCalledTimes(2);
  expect(rows()).toEqual(['Lark SalesLark/飞书 · 已连接未绑定绑定']);
});
