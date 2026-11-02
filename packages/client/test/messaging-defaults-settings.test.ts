// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MessagingDefaultsSettings } from '../src/client/messaging-defaults-settings.js';
import { en, zhTranslate } from '../src/client/locale.js';
import type { BridgeCall } from '../src/client/bridge.js';

const enTranslate: typeof zhTranslate = (key, params) => {
  let message = Object.entries(en).find(([name]) => name === key)?.[1] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    message = message.replaceAll(`{${name}}`, String(value));
  return message;
};

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  IconChevronDownOutlineRegular: () => null,
  Menu: ({
    open,
    anchor,
    items,
    onSelect,
  }: {
    open: boolean;
    anchor: ReactNode;
    items: readonly { id: string; label: ReactNode }[];
    onSelect(id: string): void;
  }) =>
    createElement(
      'span',
      null,
      anchor,
      open
        ? createElement(
            'span',
            { role: 'menu' },
            items.map((item) =>
              createElement(
                'button',
                { key: item.id, role: 'menuitem', onClick: () => onSelect(item.id) },
                item.label,
              ),
            ),
          )
        : null,
    ),
  Switch: ({
    checked,
    label,
    onChange,
  }: {
    checked: boolean;
    label: string;
    onChange(v: boolean): void;
  }) =>
    createElement('input', {
      type: 'checkbox',
      checked,
      'aria-label': label,
      onChange: () => onChange(!checked),
    }),
}));

type Remote = {
  platform: string;
  collection: 'mentions' | 'all';
  wake: 'digest' | 'immediate' | 'mentions' | 'silent';
  count: number;
  intervalSeconds: number;
  identityEnabled: boolean;
  typingEnabled?: boolean;
  newConversations?: 'auto' | 'ask';
  revision: number;
  changedAt: string;
};

function remoteFor(platform: string, revision = 0): Remote {
  return {
    platform,
    collection: 'mentions',
    wake: 'digest',
    count: 5,
    intervalSeconds: 30,
    identityEnabled: true,
    ...(platform === 'weixin' ? { typingEnabled: true } : {}),
    newConversations: 'auto',
    revision,
    changedAt: '',
  };
}

let stream: EventTarget | undefined;

class Events extends EventTarget {
  constructor() {
    super();
    stream = this;
  }
  close() {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function mount(call: BridgeCall, t = zhTranslate) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('EventSource', Events);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(MessagingDefaultsSettings, { call, t })));
  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  return {
    container,
    button,
    pick: async (label: string, option: string) => {
      await act(async () => button(label)!.click());
      await act(async () =>
        [...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')]
          .find((item) => item.textContent === option)!
          .click(),
      );
    },
    stepperValue: (label: string) =>
      container.querySelector<HTMLInputElement>(`input[role=spinbutton][aria-label="${label}"]`)
        ?.value,
    unmount: async () => {
      await act(async () => root.unmount());
    },
  };
}

it.each([zhTranslate, enTranslate])(
  'shows only the WeChat rows and saves the typing switch as soon as it flips (%#)',
  async (t) => {
    const saves: unknown[] = [];
    const call: BridgeCall = async (method, payload) => {
      if (method === 'messagingDefaults')
        return { ok: true, value: remoteFor(String(payload.platform ?? 'feishu')) };
      if (method === 'messagingDefaultsSet') {
        saves.push(payload);
        return { ok: true, value: { ...remoteFor('weixin', 1), typingEnabled: false } };
      }
      throw new Error(method);
    };
    const ui = await mount(call, t);
    await ui.pick(t('defaults.platform'), 'WeChat / 微信');
    expect(ui.container.textContent).toContain(t('defaults.weixinNote'));
    expect(ui.button(t('defaults.collection'))).toBeNull();
    expect(ui.button(t('defaults.wake'))).toBeNull();
    expect(ui.container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(ui.container.textContent).not.toMatch(/revision|版本/i);
    await act(async () =>
      ui.container
        .querySelector<HTMLInputElement>(`[aria-label="${t('defaults.enableTyping')}"]`)!
        .click(),
    );
    expect(saves).toEqual([
      {
        input: {
          platform: 'weixin',
          expectedRevision: 0,
          collection: 'mentions',
          wake: 'digest',
          count: 5,
          intervalSeconds: 30,
          identityEnabled: true,
          typingEnabled: false,
          newConversations: 'auto',
        },
      },
    ]);
    await ui.unmount();
  },
);

it('applies a choice immediately, and refreshes to the latest values when the save is stale', async () => {
  let remote = remoteFor('feishu', 1);
  const saves: unknown[] = [];
  const call: BridgeCall = async (method, payload) => {
    if (method === 'messagingDefaults') return { ok: true, value: remote };
    if (method === 'messagingDefaultsSet') {
      saves.push(payload);
      remote = { ...remote, count: 2, revision: 2 };
      return { ok: false, error: { code: 'defaults-stale', message: 'stale', details: {} } };
    }
    throw new Error(method);
  };
  const ui = await mount(call);
  await ui.pick('默认收件条件', '所有普通文字消息');
  expect(saves).toEqual([
    {
      input: {
        platform: 'feishu',
        expectedRevision: 1,
        newConversations: 'auto',
        collection: 'all',
        wake: 'digest',
        count: 5,
        intervalSeconds: 30,
        identityEnabled: true,
      },
    },
  ]);
  expect(ui.container.querySelector('[role=alert]')?.textContent).toBe(
    zhTranslate('defaults.stale'),
  );
  expect(ui.button('默认收件条件')?.textContent).toBe('仅收 @ 接收身份');
  expect(ui.stepperValue('默认汇总条数')).toBe('2');
  await ui.unmount();
});

it('follows live changes, saves stepper changes at the latest revision and hides the threshold outside digests', async () => {
  const remote: Record<string, Remote> = {
    feishu: remoteFor('feishu'),
    slack: remoteFor('slack'),
  };
  const saves: Record<string, unknown>[] = [];
  const call: BridgeCall = async (method, payload) => {
    if (method === 'messagingDefaults')
      return { ok: true, value: remote[String(payload.platform ?? 'feishu')] };
    if (method === 'messagingDefaultsSet') {
      const input = payload.input as Record<string, unknown>;
      saves.push(input);
      const platform = String(input.platform);
      remote[platform] = {
        ...remote[platform]!,
        ...(input as Partial<Remote>),
        revision: remote[platform]!.revision + 1,
      };
      return { ok: true, value: remote[platform] };
    }
    throw new Error(method);
  };
  const ui = await mount(call);
  await ui.pick('默认设置的平台', 'Slack');
  remote.slack = { ...remote.slack!, count: 7, revision: 4 };
  await act(async () => stream!.dispatchEvent(new Event('roster/changed')));
  expect(ui.stepperValue('默认汇总条数')).toBe('7');
  const increase = ui.container.querySelector<HTMLElement>(
    '[role=group][aria-label="默认汇总条数"]',
  )!;
  await act(async () =>
    [...increase.querySelectorAll('button')]
      .find((b) => b.getAttribute('aria-label') === '增加')!
      .click(),
  );
  expect(saves.at(-1)).toMatchObject({ platform: 'slack', expectedRevision: 4, count: 8 });
  expect(remote.feishu!.revision).toBe(0);
  await ui.pick('普通消息默认处理方式', '每条消息安排下一轮');
  expect(saves.at(-1)).toMatchObject({ platform: 'slack', expectedRevision: 5, wake: 'immediate' });
  expect(ui.stepperValue('默认汇总条数')).toBeUndefined();
  await ui.unmount();
});

it('queues a change made while a save is in flight and sends it with the returned revision', async () => {
  let remote = remoteFor('feishu', 3);
  const saves: Record<string, unknown>[] = [];
  let release: (() => void) | undefined;
  const call: BridgeCall = async (method, payload) => {
    if (method === 'messagingDefaults') return { ok: true, value: remote };
    if (method === 'messagingDefaultsSet') {
      const input = payload.input as Record<string, unknown>;
      saves.push(input);
      if (saves.length === 1) await new Promise<void>((resolve) => (release = resolve));
      remote = { ...remote, ...(input as Partial<Remote>), revision: remote.revision + 1 };
      return { ok: true, value: remote };
    }
    throw new Error(method);
  };
  const ui = await mount(call);
  await ui.pick('默认收件条件', '所有普通文字消息');
  await ui.pick('新会话', '先问我');
  expect(saves).toHaveLength(1);
  await act(async () => release!());
  expect(saves).toHaveLength(2);
  expect(saves[1]).toMatchObject({
    expectedRevision: 4,
    collection: 'all',
    newConversations: 'ask',
  });
  expect(ui.button('新会话')?.textContent).toBe('先问我');
  await ui.unmount();
});
