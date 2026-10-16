// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  ...(await import('./primitive-mocks.js')).dialogPrimitives(),
  IconInfoOutlineRegular: () => createElement('span'),
  Tooltip: ({ children, label }: PropsWithChildren<{ label: string }>) =>
    createElement('span', { title: label }, children),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  Switch: ({
    checked,
    label,
    disabled,
    onChange,
  }: {
    checked: boolean;
    label: string;
    disabled?: boolean;
    onChange(value: boolean): void;
  }) =>
    createElement('button', {
      type: 'button',
      role: 'switch',
      'aria-checked': checked,
      'aria-label': label,
      disabled,
      onClick: () => onChange(!checked),
    }),
}));
import { ChannelBridgeList } from '../src/client/channel-bridge-list.js';
import {
  buttonNamed,
  comboboxOption,
  dialog,
  fieldNamed,
  openCombobox,
} from './primitive-mocks.js';
import { zhTranslate } from '../src/client/locale.js';
import type { ChannelBridgeSnapshot } from '../../core/src/messaging/channel-bridge.js';
it('Bridge Switch failures refresh committed state and stale edits preserve the draft with exact authority revisions', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const snapshot: ChannelBridgeSnapshot = {
    channelId: 'group',
    sources: [],
    bridges: [
      {
        grantId: 'grant',
        grantRevision: 9,
        botSlug: 'ada',
        platform: 'feishu',
        accountName: 'QA receiving account',
        conversationName: 'QA group',
        ordinaryDelivery: 'unverified',
        name: 'QA intake',
        enabled: true,
        collection: 'mentions',
        revision: 3,
        availability: 'available',
        reception: 'receiving',
      },
    ],
  };
  const actions = {
    channelBridges: vi.fn(async () => snapshot),
    channelBridge: vi.fn(async () => {
      throw Object.assign(new Error('stale'), { code: 'bridge-stale' });
    }),
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(ChannelBridgeList, {
          channelId: 'group',
          channelName: 'Shared work',
          botNames: new Map([['ada', 'Ada']]),
          actions,
          t: zhTranslate,
        }),
      ),
    );
    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(actions.channelBridges).toHaveBeenCalledTimes(2);
    expect(actions.channelBridge).toHaveBeenLastCalledWith('group', {
      kind: 'update',
      grantId: 'grant',
      expectedGrantRevision: 9,
      expectedRevision: 3,
      name: 'QA intake',
      enabled: false,
      collection: 'mentions',
    });
    const edit = container.querySelector<HTMLButtonElement>('[title="编辑外部连接器：QA intake"]')!;
    await act(async () => edit.click());
    const input = container.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Retained draft',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === zhTranslate('bridge.save'),
    )!;
    await act(async () => save.click());
    expect(input.value).toBe('Retained draft');
    expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
      '配置已',
    );
    await openCombobox(zhTranslate('bridge.condition'));
    expect(comboboxOption('all')?.disabled).toBe(true);
    expect(actions.channelBridge).toHaveBeenLastCalledWith('group', {
      kind: 'update',
      grantId: 'grant',
      expectedGrantRevision: 9,
      expectedRevision: 3,
      name: 'Retained draft',
      collectionInheritance: 'custom',
      enabled: true,
      collection: 'mentions',
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('WeChat DM connector edits expose only supported paired-owner intake', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const snapshot: ChannelBridgeSnapshot = {
    channelId: 'group',
    sources: [],
    bridges: [
      {
        grantId: 'wechat',
        grantRevision: 2,
        botSlug: 'ada',
        platform: 'weixin',
        accountName: 'WeChat QA',
        conversationName: 'Paired owner',
        ordinaryDelivery: 'unverified',
        name: 'Owner intake',
        enabled: true,
        collection: 'all',
        collectionInheritance: 'custom',
        revision: 1,
        availability: 'available',
        reception: 'receiving',
      },
    ],
  };
  const actions = {
    channelBridges: vi.fn(async () => snapshot),
    channelBridge: vi.fn(async () => {}),
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(ChannelBridgeList, {
          channelId: 'group',
          channelName: 'Shared work',
          botNames: new Map([['ada', 'Ada']]),
          actions,
          t: zhTranslate,
        }),
      ),
    );
    expect(container.textContent).toContain('扫码绑定者私聊消息');
    expect(container.textContent).not.toContain(zhTranslate('bridge.unverified'));
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[title="编辑外部连接器：Owner intake"]')!.click(),
    );
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(zhTranslate('bridge.wechatDMHint'));
    expect(
      dialog.querySelector(`input[aria-label="${zhTranslate('bridge.condition')}"]`),
    ).toBeNull();
    expect(
      dialog
        .querySelector('[aria-label="' + zhTranslate('bridge.dmMirror') + '"]')
        ?.getAttribute('aria-checked'),
    ).toBe('false');
    expect(
      dialog
        .querySelector('[aria-label="' + zhTranslate('bridge.dmForward') + '"]')
        ?.getAttribute('aria-checked'),
    ).toBe('false');
    for (const key of ['bridge.dmMirror', 'bridge.dmForward'] as const) {
      expect(
        dialog.querySelector(
          '[aria-label="' + zhTranslate('im.infoFor', { title: zhTranslate(key) }) + '"]',
        ),
      ).not.toBeNull();
    }
    const save = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === zhTranslate('bridge.save'),
    )!;
    await act(async () => save.click());
    expect(actions.channelBridge).toHaveBeenLastCalledWith('group', {
      kind: 'update',
      grantId: 'wechat',
      expectedGrantRevision: 2,
      expectedRevision: 1,
      name: 'Owner intake',
      enabled: true,
      collection: 'all',
      collectionInheritance: 'custom',
      dmMirror: false,
      dmForward: false,
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('deletes a connector from the edit dialog only after a separate confirmation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const snapshot: ChannelBridgeSnapshot = {
    channelId: 'group',
    sources: [],
    bridges: [
      {
        routeId: 'route',
        grantId: 'grant',
        grantRevision: 9,
        botSlug: 'ada',
        platform: 'feishu',
        accountName: 'QA receiving account',
        conversationName: 'QA group',
        ordinaryDelivery: 'verified',
        name: 'QA intake',
        enabled: true,
        collection: 'mentions',
        revision: 3,
        availability: 'available',
        reception: 'receiving',
      },
    ],
  };
  const actions = {
    channelBridges: vi.fn(async () => snapshot),
    channelBridge: vi.fn(async () => {}),
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const edit = () =>
    act(async () =>
      container.querySelector<HTMLButtonElement>('[title="编辑外部连接器：QA intake"]')!.click(),
    );
  try {
    await act(async () =>
      root.render(
        createElement(ChannelBridgeList, {
          channelId: 'group',
          channelName: 'Shared work',
          botNames: new Map([['ada', 'Ada']]),
          actions,
          t: zhTranslate,
        }),
      ),
    );
    await edit();
    expect(fieldNamed(zhTranslate('bridge.name')).value).toBe('QA intake');
    expect(dialog().textContent).toContain('QA receiving account');
    await act(async () => buttonNamed('删除外部连接器：QA intake', dialog()).click());
    expect(dialog().getAttribute('aria-label')).toBe(zhTranslate('bridge.delete'));
    expect(dialog().textContent).toContain(zhTranslate('bridge.deleteImpact'));
    await act(async () => buttonNamed(zhTranslate('common.cancel'), dialog()).click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(actions.channelBridge).not.toHaveBeenCalled();
    await edit();
    await act(async () => buttonNamed('删除外部连接器：QA intake', dialog()).click());
    await act(async () => buttonNamed(zhTranslate('bridge.confirmDelete'), dialog()).click());
    expect(actions.channelBridge).toHaveBeenCalledExactlyOnceWith('group', {
      kind: 'delete',
      grantId: 'grant',
      expectedGrantRevision: 9,
      routeId: 'route',
      expectedRevision: 3,
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
