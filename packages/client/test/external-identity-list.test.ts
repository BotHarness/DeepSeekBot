// @vitest-environment jsdom
import { type MessagingSnapshot } from '../../core/src/messaging/outbound.js';
import { type MessagingIdentityInput } from '../../core/src/messaging/identity.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ExternalIdentityList } from '../src/client/external-identity-list.js';
import { zhTranslate } from '../src/client/locale.js';
import { buttonNamed, chooseOption, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/settings-dialog-primitives.js')).mockSettingsDialogPrimitives(),
);

it('shows only the selected Lark identity feedback and keeps unknown distinct from platform acceptance', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const identity: NonNullable<MessagingSnapshot['identities']>[number] = {
    id: 'lark',
    botSlug: 'ada',
    providerId: 'dsh-im/feishu',
    platform: 'feishu',
    accountRef: 'app',
    fingerprint: 'a'.repeat(64),
    name: 'QA Lark',
    enabled: true,
    revision: 1,
    createdAt: '2026-10-08T00:00:00Z',
    availability: 'available',
    newConversations: 'auto',
    grantCount: 0,
    scopes: [],
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const snapshot: MessagingSnapshot = {
    accounts: [],
    identities: [identity],
    grants: [],
    intents: [],
    feedback: [
      {
        bindingId: 'other',
        sourceEventId: 'wrong-source',
        attempts: { answered: { state: 'accepted', at: '' } },
      },
      {
        bindingId: 'lark',
        sourceEventId: 'selected-source-12345678',
        attempts: {
          received: { state: 'accepted', at: '' },
          answered: { state: 'unknown', at: '' },
        },
      },
    ],
  };
  try {
    await act(async () =>
      root.render(
        createElement(ExternalIdentityList, {
          snapshot,
          t: zhTranslate,
          refresh: vi.fn(),
          mutate: vi.fn(),
          conversation: vi.fn(),
          rules: vi.fn(),
        }),
      ),
    );
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[title="编辑身份：QA Lark"]')!.click(),
    );
    const content = document.body.querySelector('[role="dialog"]')!.textContent;
    expect(content).toContain('消息反馈不可用；正常接收和回复不受影响');
    expect(content).toContain('12345678 · 接收: 平台已接受 · 回答: 结果未知');
    expect(content).not.toContain('wrong-source');
    expect(document.body.querySelectorAll('[title="selected-source-12345678"]')).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('edits WeChat typing in the current identity modal and keeps native request acceptance distinct from display', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const identity = {
    id: 'wechat',
    botSlug: 'ada',
    providerId: 'dsh-im/weixin',
    platform: 'weixin',
    accountRef: 'paired',
    fingerprint: 'a'.repeat(64),
    name: 'QA WeChat',
    enabled: true,
    revision: 7,
    createdAt: '2026-10-08T00:00:00Z',
    availability: 'available' as const,
    newConversations: 'auto' as const,
    grantCount: 0,
    scopes: [],
    typingEnabled: true,
    typing: { supported: true, phase: 'accepted' as const },
  };
  const mutate = vi.fn(async () => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(ExternalIdentityList, {
          snapshot: { accounts: [], identities: [identity], grants: [], intents: [] },
          t: zhTranslate,
          refresh: vi.fn(async () => undefined),
          mutate,
          conversation: vi.fn(),
          rules: vi.fn(),
        }),
      ),
    );
    expect(
      Array.from(document.body.querySelectorAll('[role="status"]'), (node) => node.textContent),
    ).toContain(zhTranslate('identity.typing.accepted'));
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[title="编辑身份：QA WeChat"]')!.click(),
    );
    const toggle = document.body.querySelector<HTMLButtonElement>(
      `[aria-label="${zhTranslate('identity.typing.label')}"]`,
    )!;
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      zhTranslate('identity.typing.label'),
    );
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    const updateTyping = async (supported: boolean) =>
      act(async () =>
        root.render(
          createElement(ExternalIdentityList, {
            snapshot: {
              accounts: [],
              identities: [{ ...identity, typing: { ...identity.typing, supported } }],
              grants: [],
              intents: [],
              checks: 'complete',
            },
            t: zhTranslate,
            refresh: vi.fn(async () => undefined),
            mutate,
            conversation: vi.fn(),
            rules: vi.fn(),
          }),
        ),
      );
    await updateTyping(false);
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      zhTranslate('identity.typing.unavailable'),
    );
    await updateTyping(true);
    expect(document.body.querySelector('[role="dialog"]')?.textContent).not.toContain(
      zhTranslate('identity.typing.unavailable'),
    );
    await act(async () => toggle.click());
    const save = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === '保存身份',
    )!;
    await act(async () => save.click());
    expect(mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'wechat',
        expectedRevision: 7,
        typingEnabled: false,
        newConversations: 'inherit',
      }),
    );
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[title="编辑身份：QA WeChat"]')!.click(),
    );
    await chooseOption(zhTranslate('defaults.typingOrigin'), 'inherit', document.body);
    expect(
      document.body.querySelector(`[aria-label="${zhTranslate('identity.typing.label')}"]`),
    ).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      zhTranslate('defaults.typingInheritHint'),
    );
    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.textContent === '保存身份')!
        .click(),
    );
    expect(mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'wechat', inheritTyping: true }),
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('failed Switch writes retain the committed preference; stale Modal edits retain input rather than overwrite', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const identity = {
    id: 'binding',
    botSlug: 'ada',
    providerId: 'lark',
    platform: 'feishu',
    accountRef: 'app',
    fingerprint: 'a'.repeat(64),
    name: 'QA Bot',
    enabled: true,
    revision: 7,
    createdAt: '2026-10-02T00:00:00Z',
    availability: 'available' as const,
    newConversations: 'auto' as const,
    grantCount: 1,
    scopes: ['QA group'],
  };
  const snapshot: MessagingSnapshot = {
    accounts: [],
    identities: [identity],
    grants: [],
    intents: [],
  };
  const mutate = vi.fn(async () => {
    throw Object.assign(new Error('stale'), { code: 'identity-stale' });
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(ExternalIdentityList, {
          snapshot,
          t: zhTranslate,
          refresh: vi.fn(async () => undefined),
          mutate,
          conversation: vi.fn(),
          rules: vi.fn(),
        }),
      ),
    );
    const toggle = document.body.querySelector<HTMLButtonElement>('[role="switch"]')!;
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(mutate).toHaveBeenLastCalledWith({
      kind: 'update',
      id: 'binding',
      expectedRevision: 7,
      name: 'QA Bot',
      enabled: false,
    });
    const edit = document.body.querySelector<HTMLButtonElement>('[title="编辑身份：QA Bot"]')!;
    await act(async () => edit.click());
    const input = document.body.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Retained edit',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === '保存身份',
    )!;
    await act(async () => save.click());
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(input.value).toBe('Retained edit');
    expect(document.body.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
      '配置已在另一处更改',
    );
    expect(mutate).toHaveBeenLastCalledWith({
      kind: 'update',
      id: 'binding',
      expectedRevision: 7,
      name: 'Retained edit',
      inheritEnabled: false,
      newConversations: 'inherit',
      enabled: true,
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('saves the edit dialog with Enter and moves Reconnect and Unbind into their own confirmations', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const identity = {
    id: 'binding',
    botSlug: 'ada',
    providerId: 'dsh-im/feishu',
    platform: 'feishu',
    accountRef: 'app',
    fingerprint: 'a'.repeat(64),
    name: 'QA Bot',
    enabled: true,
    revision: 4,
    createdAt: '2026-10-02T00:00:00Z',
    availability: 'available' as const,
    newConversations: 'auto' as const,
    grantCount: 2,
    scopes: ['QA group'],
  };
  const mutate = vi.fn(async () => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const edit = () =>
    act(async () =>
      document.body.querySelector<HTMLButtonElement>('[title="编辑身份：QA Bot"]')!.click(),
    );
  try {
    await act(async () =>
      root.render(
        createElement(ExternalIdentityList, {
          snapshot: { accounts: [], identities: [identity], grants: [], intents: [] },
          t: zhTranslate,
          refresh: vi.fn(async () => undefined),
          mutate,
          conversation: vi.fn(),
          rules: vi.fn(),
        }),
      ),
    );
    await edit();
    expect(dialog().getAttribute('aria-label')).toBe(zhTranslate('identity.editTitle'));
    await typeInto(fieldNamed(zhTranslate('identity.displayName')), '  ');
    expect(buttonNamed('保存身份', dialog()).disabled).toBe(true);
    await typeInto(fieldNamed(zhTranslate('identity.displayName')), 'Renamed');
    await act(async () => dialog().querySelector('form')!.requestSubmit());
    expect(mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'update', id: 'binding', name: 'Renamed' }),
    );
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    await edit();
    await act(async () => buttonNamed('重新连接身份：QA Bot', dialog()).click());
    expect(dialog().getAttribute('aria-label')).toBe(zhTranslate('identity.reconnect'));
    expect(dialog().textContent).toContain(zhTranslate('identity.reconnectHint'));
    await act(async () => buttonNamed(zhTranslate('identity.reconnect'), dialog()).click());
    expect(mutate).toHaveBeenLastCalledWith({
      kind: 'reconnect',
      id: 'binding',
      expectedRevision: 4,
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    await edit();
    await act(async () => buttonNamed('解绑身份：QA Bot', dialog()).click());
    expect(dialog().getAttribute('aria-label')).toBe(zhTranslate('identity.unbind'));
    expect(dialog().textContent).toContain(zhTranslate('identity.impact', { count: 2 }));
    expect(dialog().textContent).toContain('QA group');
    await act(async () => buttonNamed('取消', dialog()).click());
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(mutate).toHaveBeenCalledTimes(2);

    await edit();
    await act(async () => buttonNamed('解绑身份：QA Bot', dialog()).click());
    await act(async () => buttonNamed(zhTranslate('identity.confirmUnbind'), dialog()).click());
    expect(mutate).toHaveBeenLastCalledWith({ kind: 'unbind', id: 'binding', expectedRevision: 4 });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('reconnects once, shows pending and errors, and accepts live reception updates', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const identity: NonNullable<MessagingSnapshot['identities']>[number] = {
    id: 'qq',
    botSlug: 'ada',
    providerId: 'dsh-im/qq',
    platform: 'qq',
    accountRef: 'qq-app',
    fingerprint: 'a'.repeat(64),
    name: 'QQ QA',
    enabled: true,
    revision: 7,
    createdAt: '2026-11-15T00:00:00Z',
    availability: 'available',
    newConversations: 'auto',
    grantCount: 0,
    scopes: [],
    reception: 'unavailable',
    recovery: {
      kind: 'retrying',
      reason: 'provider-unavailable',
      attempt: 5,
      nextRetryAt: '2026-11-15T01:00:00Z',
    },
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let reject: (error: Error) => void = () => {};
  const mutate = vi.fn(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  const render = () =>
    root.render(
      createElement(ExternalIdentityList, {
        snapshot: { accounts: [], identities: [identity], grants: [], intents: [] },
        t: zhTranslate,
        refresh: vi.fn(),
        mutate,
        conversation: vi.fn(),
        rules: vi.fn(),
      }),
    );
  try {
    await act(async () => render());
    expect(document.body.textContent).toContain('正在重连');
    const reconnect = buttonNamed(
      zhTranslate('identity.reconnectFor', { name: identity.name }),
      document.body,
    );
    await act(async () => reconnect.click());
    expect(reconnect.disabled).toBe(true);
    reconnect.click();
    expect(mutate).toHaveBeenCalledExactlyOnceWith({
      kind: 'reconnect',
      id: 'qq',
      expectedRevision: 7,
    });
    await act(async () => reject(new Error('offline')));
    expect(document.body.textContent).toContain(zhTranslate('identity.failed'));
    expect(reconnect.disabled).toBe(false);
    identity.reception = 'receiving';
    delete identity.recovery;
    await act(async () => render());
    expect(document.body.textContent).toContain('消息接收: 接收中');
    expect(document.body.textContent).not.toContain('正在重连');
    expect(
      document.body.querySelector(
        `[aria-label="${zhTranslate('identity.reconnectFor', { name: identity.name })}"]`,
      ),
    ).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it.each(['disabled', 'removed', 'reconnected', 'remote-change'] as const)(
  'keeps conversation reconnect safe when the live identity is %s',
  async (state) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const identity: NonNullable<MessagingSnapshot['identities']>[number] = {
      id: 'qq-safe',
      botSlug: 'ada',
      providerId: 'dsh-im/qq',
      platform: 'qq',
      accountRef: 'app',
      fingerprint: 'a'.repeat(64),
      name: 'QA reconnect',
      enabled: true,
      revision: 4,
      createdAt: '2026-11-15T00:00:00Z',
      availability: 'available',
      newConversations: 'auto',
      newConversationsInheritance: 'custom',
      grantCount: 1,
      scopes: ['Group'],
      reception: 'unavailable',
    };
    let snapshot: MessagingSnapshot = {
      accounts: [],
      identities: [identity],
      intents: [],
      grants: [
        {
          id: 'grant-safe',
          bindingId: identity.id,
          botSlug: 'ada',
          providerId: identity.providerId,
          platform: 'qq',
          accountRef: 'app',
          accountName: identity.name,
          fingerprint: identity.fingerprint,
          targetRef: 'group',
          targetName: 'Group',
          targetDigest: 'digest',
          revision: 1,
          createdAt: identity.createdAt,
          origin: 'implicit',
          receiveScope: { kind: 'group', conversationId: 'group' },
          availability: 'available',
          reception: 'unavailable',
        },
      ],
    };
    const mutate = vi.fn(async (input: MessagingIdentityInput) => {
      if (state === 'remote-change' && input.kind === 'update')
        throw Object.assign(new Error('Revision changed'), { code: 'identity-stale' });
    });
    const container = document.createElement('div');
    const root = createRoot(container);
    document.body.append(container);
    const render = () =>
      root.render(
        createElement(ExternalIdentityList, {
          snapshot,
          t: zhTranslate,
          mutate,
          refresh: vi.fn(),
          conversation: vi.fn(),
          rules: vi.fn(),
        }),
      );
    try {
      await act(async () => render());
      await act(async () =>
        document.body.querySelector<HTMLButtonElement>('[title="编辑身份：QA reconnect"]')!.click(),
      );
      await act(async () =>
        typeInto(fieldNamed(zhTranslate('identity.displayName')), 'Unsaved draft'),
      );
      if (state !== 'reconnected' && state !== 'remote-change') {
        snapshot = {
          ...snapshot,
          identities: state === 'removed' ? [] : [{ ...identity, enabled: false, revision: 5 }],
        };
        await act(async () => render());
      }
      if (state === 'remote-change') {
        snapshot = {
          ...snapshot,
          identities: [{ ...identity, revision: 5, newConversations: 'ask' }],
        };
        await act(async () => render());
      }
      await act(async () => buttonNamed(zhTranslate('reception.reconnectNow'), dialog()).click());
      if (state === 'reconnected' || state === 'remote-change') {
        expect(mutate).toHaveBeenCalledWith({
          kind: 'reconnect',
          id: identity.id,
          expectedRevision: state === 'remote-change' ? 5 : 4,
        });
        expect(fieldNamed(zhTranslate('identity.displayName')).value).toBe('Unsaved draft');
        await act(async () => buttonNamed(zhTranslate('identity.save'), dialog()).click());
        expect(mutate).toHaveBeenLastCalledWith(
          expect.objectContaining({
            kind: 'update',
            expectedRevision: state === 'remote-change' ? 4 : 5,
            name: 'Unsaved draft',
          }),
        );
        if (state === 'remote-change') {
          expect(dialog().textContent).toContain(zhTranslate('identity.stale'));
          expect(fieldNamed(zhTranslate('identity.displayName')).value).toBe('Unsaved draft');
        }
      } else expect(mutate).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  },
);
