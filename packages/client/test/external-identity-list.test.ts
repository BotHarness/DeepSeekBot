// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { MessagingSnapshot } from '../../core/src/messaging/outbound.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  IconInfoOutlineRegular: () => null,
  Tooltip: ({ children }: PropsWithChildren) => children,
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
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
      role: 'switch',
      'aria-checked': checked,
      'aria-label': label,
      disabled,
      onClick: () => onChange(!checked),
    }),
  Modal: ({
    open,
    children,
    title,
    footer,
  }: PropsWithChildren<{ open: boolean; title: string; footer?: ReactNode }>) =>
    open ? createElement('div', { role: 'dialog', 'aria-label': title }, children, footer) : null,
}));
import { ExternalIdentityList } from '../src/client/external-identity-list.js';
import { zhTranslate } from '../src/client/locale.js';
import { chooseOption, openCombobox } from './primitive-mocks.js';

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
      container.querySelector<HTMLButtonElement>('[title="编辑身份：QA Lark"]')!.click(),
    );
    const content = container.querySelector('[role="dialog"]')!.textContent;
    expect(content).toContain('消息反馈不可用；正常接收和回复不受影响');
    expect(content).toContain('12345678 · 接收: 平台已接受 · 回答: 结果未知');
    expect(content).not.toContain('wrong-source');
    expect(container.querySelectorAll('[title="selected-source-12345678"]')).toHaveLength(1);
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
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      zhTranslate('identity.typing.accepted'),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[title="编辑身份：QA WeChat"]')!.click(),
    );
    const toggle = container.querySelector<HTMLButtonElement>(
      `[aria-label="${zhTranslate('identity.typing.label')}"]`,
    )!;
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      zhTranslate('identity.typing.label'),
    );
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await act(async () => toggle.click());
    const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
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
      container.querySelector<HTMLButtonElement>('[title="编辑身份：QA WeChat"]')!.click(),
    );
    await chooseOption(zhTranslate('defaults.typingOrigin'), 'inherit', container);
    expect(
      container.querySelector(`[aria-label="${zhTranslate('identity.typing.label')}"]`),
    ).toBeNull();
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      zhTranslate('defaults.typingInheritHint'),
    );
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('button')]
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
    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(mutate).toHaveBeenLastCalledWith({
      kind: 'update',
      id: 'binding',
      expectedRevision: 7,
      name: 'QA Bot',
      enabled: false,
    });
    const edit = container.querySelector<HTMLButtonElement>('[title="编辑身份：QA Bot"]')!;
    await act(async () => edit.click());
    const input = container.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Retained edit',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === '保存身份',
    )!;
    await act(async () => save.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(input.value).toBe('Retained edit');
    expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
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

it.each(['feishu', 'qq'] as const)(
  '%s Bind app shows real readiness after the commit and lists its conversations',
  async (platform) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const account = {
      providerId: `dsh-im/${platform}`,
      ref: 'lark-app',
      platform,
      name: 'Support app',
      fingerprint: 'a'.repeat(64),
      connected: true,
    };
    const identity = {
      id: 'binding',
      botSlug: 'ada',
      providerId: `dsh-im/${platform}`,
      platform,
      accountRef: 'lark-app',
      fingerprint: 'a'.repeat(64),
      name: 'Support app',
      enabled: true,
      revision: 1,
      createdAt: '2026-10-07T00:00:00Z',
      availability: 'available' as const,
      newConversations: 'auto' as const,
      grantCount: 1,
      scopes: ['Owner'],
    };
    const entry = {
      id: 'entry',
      bindingId: 'binding',
      botSlug: 'ada',
      providerId: `dsh-im/${platform}`,
      accountRef: 'lark-app',
      accountName: 'Support app',
      fingerprint: 'a'.repeat(64),
      platform,
      targetRef: '',
      targetName: 'Owner',
      targetDigest: '',
      revision: 1,
      createdAt: '2026-10-07T00:00:00Z',
      origin: 'implicit' as const,
      receiveScope: {
        kind: platform === 'qq' ? ('group' as const) : ('dm' as const),
        conversationId: 'oc_owner',
      },
      lastMessageAt: '2026-10-07T01:00:00Z',
      availability: 'available' as const,
      reception: 'receiving' as const,
    };
    let snapshot: MessagingSnapshot = {
      accounts: [account],
      identities: [],
      grants: [],
      intents: [],
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = () =>
      root.render(
        createElement(ExternalIdentityList, {
          snapshot,
          t: zhTranslate,
          refresh: vi.fn(async () => undefined),
          mutate,
          conversation: vi.fn(),
          rules: vi.fn(),
        }),
      );
    const mutate = vi.fn(async () => {
      snapshot = {
        ...snapshot,
        identities: [{ ...identity, reception: 'connecting' as const }],
      };
      render();
    });
    try {
      await act(async () => render());
      const bind = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes('绑定应用'),
      )!;
      await act(async () => bind.click());
      const tutorial = container.querySelector<HTMLAnchorElement>(
        'a[href="https://botharness.ai/zh/docs/lark-connection/"]',
      );
      expect(tutorial?.textContent).toBe('Lark / 飞书');
      expect(tutorial?.target).toBe('_blank');
      expect(tutorial?.rel).toBe('noopener noreferrer');
      expect(container.textContent).toContain('接收与配对设置');
      await chooseOption('应用', `dsh-im/${platform}:lark-app`, container);
      const confirm = [
        ...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
      ].find((b) => b.textContent === '绑定应用')!;
      await act(async () => confirm.click());
      expect(mutate).toHaveBeenCalledWith({
        kind: 'bind',
        providerId: `dsh-im/${platform}`,
        accountRef: 'lark-app',
        fingerprint: 'a'.repeat(64),
      });
      expect(container.querySelector('[role="status"]')?.textContent).toBe('正在连接 Support app…');
      snapshot = {
        ...snapshot,
        identities: [{ ...identity, reception: 'receiving' }],
        grants: [entry],
      };
      await act(async () => render());
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        platform === 'qq'
          ? '已就绪：群里 @ Support app 的消息'
          : '已就绪：发给 Support app 的私聊和群里 @ 它的消息',
      );
      const done = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent === '完成',
      )!;
      await act(async () => done.click());
      expect(container.textContent).toContain(`${platform === 'qq' ? 'QQ' : '飞书'} · 1 个会话`);
      const edit = container.querySelector<HTMLButtonElement>('[title="编辑身份：Support app"]')!;
      await act(async () => edit.click());
      const list = container.querySelector('[role="dialog"] section[aria-label="活跃"]')!;
      expect(list.textContent).toContain('Owner');
      expect(list.textContent).toContain(platform === 'qq' ? '群聊' : '私聊');
      expect(list.textContent).toContain('最近消息');
      expect([...list.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
        '静音',
        '屏蔽',
      ]);
      snapshot = { ...snapshot, grants: [] };
      await act(async () => render());
      const empty = container.querySelector('[role="dialog"]')!.textContent;
      if (platform === 'qq') {
        expect(empty).toContain('在已加入的 QQ 群里 @ 这个应用');
        expect(empty).not.toContain('私聊这个应用');
      } else expect(empty).toContain('私聊这个应用');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  },
);

it('Bind app leaves out this Bot’s own apps, disables the ones another Bot uses with its owner or the Provider cannot serve, and offers a second app of a bound platform', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const app = (ref: string, boundBotSlug?: string) => ({
    providerId: 'dsh-im/feishu',
    ref,
    platform: 'feishu',
    name: `App ${ref}`,
    fingerprint: ref.padEnd(64, '0'),
    connected: true,
    ...(boundBotSlug ? { boundBotSlug } : {}),
  });
  const snapshot: MessagingSnapshot = {
    accounts: [
      app('mine', 'ada'),
      { ...app('theirs', 'bea'), unsupported: 'checked-send' as const },
      { ...app('old'), unsupported: 'checked-send' as const },
      app('free'),
    ],
    identities: [
      {
        id: 'binding',
        botSlug: 'ada',
        providerId: 'dsh-im/feishu',
        platform: 'feishu',
        accountRef: 'mine',
        fingerprint: 'mine'.padEnd(64, '0'),
        name: 'App mine',
        enabled: true,
        revision: 1,
        createdAt: '2026-10-07T00:00:00Z',
        availability: 'available' as const,
        newConversations: 'auto' as const,
        grantCount: 0,
        scopes: [],
      },
    ],
    grants: [],
    intents: [],
  };
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
          mutate: vi.fn(),
          conversation: vi.fn(),
          rules: vi.fn(),
          botName: (slug: string) => (slug === 'bea' ? 'Bea' : slug),
        }),
      ),
    );
    const bind = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('绑定应用'),
    )!;
    await act(async () => bind.click());
    await openCombobox('应用', container);
    const options = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(options.map((o) => [o.dataset.value, o.disabled, o.textContent])).toEqual([
      ['dsh-im/feishu:free', false, expect.stringContaining('App free')],
      ['dsh-im/feishu:old', true, expect.stringContaining('需要更新 IM 插件')],
      ['dsh-im/feishu:theirs', true, expect.stringContaining('已绑定其他 Bot：Bea')],
      [expect.any(String), false, '添加新应用'],
    ]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('creates and binds a Lark app in the current dialog without sending credentials through the BotHarness mutation', async () => {
  const { ProviderAppSetup } = await import('../src/client/provider-app-setup.js');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const providerCalls: string[] = [];
  let releaseStart!: () => void;
  const startGate = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });
  const client = new ProviderAppSetup({
    async call(_channel, endpoint, input) {
      providerCalls.push(endpoint);
      const method = (input as { method: string }).method;
      if (method === 'setup.start') await startGate;
      if (method === 'setup.credentials')
        expect((input as { payload: unknown }).payload).toMatchObject({
          appId: 'cli_created',
          appSecret: 'private-ui-sentinel',
        });
      return {
        ok: true,
        value: {
          version: 1,
          channel: 'feishu',
          attemptId: 'setup-one',
          expiresAt: Date.now() + 60000,
          state: method === 'setup.start' ? 'credentials' : 'ready',
          ...(method === 'setup.start'
            ? {}
            : {
                accountRef: 'created-app',
                description: {
                  version: 1,
                  channel: 'feishu',
                  botId: 'created-app',
                  connected: true,
                  account: { fingerprint: 'b'.repeat(64), name: 'Created app' },
                  capabilities: [],
                },
              }),
        },
      };
    },
  });
  const mutate = vi.fn(async () => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(ExternalIdentityList, {
          snapshot: {
            accounts: [],
            grants: [],
            intents: [],
            appSetups: [
              {
                version: 1,
                providerId: 'dsh-im/feishu',
                platform: 'feishu',
                kind: 'credentials',
                endpoint: 'dsh-im/app-setup',
              },
            ],
          },
          t: zhTranslate,
          refresh: vi.fn(async () => undefined),
          mutate,
          conversation: vi.fn(),
          rules: vi.fn(),
          appSetup: { client, botSlug: 'ada' },
          bindDialog: { onClose: vi.fn(), dismissLabel: '稍后', description: '' },
        }),
      ),
    );
    const create = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '创建应用',
    );
    expect(create).toBeDefined();
    await act(async () => create!.click());
    const fill = async (label: string, value: string) =>
      act(async () => {
        const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await fill('App ID', 'cli_created');
    await fill('App Secret', 'private-ui-sentinel');
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '创建并绑定')!
        .click(),
    );
    expect(container.querySelector<HTMLInputElement>('input[aria-label="App ID"]')?.disabled).toBe(
      true,
    );
    await act(async () => releaseStart());
    expect(providerCalls).toEqual(['dsh-im/app-setup', 'dsh-im/app-setup']);
    expect(mutate).toHaveBeenCalledWith({
      kind: 'bind',
      providerId: 'dsh-im/feishu',
      accountRef: 'created-app',
      fingerprint: 'b'.repeat(64),
    });
    expect(JSON.stringify(mutate.mock.calls)).not.toContain('private-ui-sentinel');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('resumes WeChat QR pairing in the bind dialog and binds only after authenticated completion', async () => {
  const { ProviderAppSetup } = await import('../src/client/provider-app-setup.js');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  let verified = false;
  const methods: string[] = [];
  const client = new ProviderAppSetup({
    async call(_channel, endpoint, input) {
      expect(endpoint).toBe('dsh-im/app-setup');
      const request = input as { method: string; payload: { verifyCode?: string } };
      methods.push(request.method);
      if (request.method === 'setup.verify') {
        expect(request.payload.verifyCode).toBe('123456');
        verified = true;
      }
      const ready = verified && request.method === 'setup.poll';
      return {
        ok: true,
        value: {
          version: 1,
          channel: 'weixin',
          attemptId: 'qr-ui',
          expiresAt: Date.now() + 60000,
          state: ready
            ? 'ready'
            : verified
              ? 'connecting'
              : request.method === 'setup.start'
                ? 'pending'
                : 'needs_verification',
          qrDataUrl: 'data:image/png;base64,aGVsbG8=',
          qrToken: 'private-qr-token',
          ...(ready
            ? {
                accountRef: 'wx_inline',
                description: {
                  version: 1,
                  channel: 'weixin',
                  botId: 'wx_inline',
                  connected: true,
                  account: { fingerprint: 'c'.repeat(64) },
                },
              }
            : {}),
        },
      };
    },
  });
  const mutate = vi.fn(async () => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const view = () =>
    createElement(ExternalIdentityList, {
      snapshot: {
        accounts: [],
        grants: [],
        intents: [],
        appSetups: [
          {
            version: 1,
            providerId: 'dsh-im/weixin',
            platform: 'weixin',
            kind: 'qr',
            endpoint: 'dsh-im/app-setup',
          },
        ],
      },
      t: zhTranslate,
      refresh: vi.fn(async () => undefined),
      mutate,
      conversation: vi.fn(),
      rules: vi.fn(),
      appSetup: { client, botSlug: 'ada' },
      bindDialog: { onClose: vi.fn(), dismissLabel: '稍后', description: '' },
    });
  const click = async (text: string) =>
    act(async () => {
      const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (entry) => entry.textContent === text,
      );
      expect(button).toBeDefined();
      button!.click();
    });
  try {
    await act(async () => root.render(view()));
    await click('创建应用');
    await click('生成微信绑定二维码');
    expect(container.querySelector('img[alt="微信绑定二维码"]')).not.toBeNull();
    expect(mutate).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(methods).toEqual(['setup.start']);
    await act(async () => root.render(view()));
    await click('创建应用');
    expect(methods.filter((method) => method === 'setup.start')).toHaveLength(1);
    expect(container.textContent).toContain('请输入微信显示的配对码');
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>('input[aria-label="配对码"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '123456',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('提交配对码');
    expect(mutate).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(mutate).toHaveBeenCalledExactlyOnceWith({
      kind: 'bind',
      providerId: 'dsh-im/weixin',
      accountRef: 'wx_inline',
      fingerprint: 'c'.repeat(64),
    });
    expect(JSON.stringify(mutate.mock.calls)).not.toContain('private-qr-token');
    expect(client.current('ada')).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  }
});

it('keeps cancellation final when the resumed QR poll returns after the cancel click', async () => {
  const { ProviderAppSetup } = await import('../src/client/provider-app-setup.js');
  const { CreateAppForm } = await import('../src/client/create-app-form.js');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let cancelSent = false;
  const descriptor = {
    version: 1 as const,
    providerId: 'dsh-im/weixin',
    platform: 'weixin' as const,
    kind: 'qr' as const,
    endpoint: 'dsh-im/app-setup' as const,
  };
  const client = new ProviderAppSetup({
    async call(_carrier, _endpoint, input) {
      const method = (input as { method: string }).method;
      if (method === 'setup.poll') await gate;
      if (method === 'setup.cancel') cancelSent = true;
      return {
        ok: true,
        value: {
          version: 1,
          channel: 'weixin',
          attemptId: 'resumed-qr',
          expiresAt: Date.now() + 60000,
          state: method === 'setup.cancel' ? 'cancelled' : 'pending',
          qrDataUrl: 'data:image/png;base64,aGVsbG8=',
        },
      };
    },
  });
  await client.start('ada', descriptor);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(CreateAppForm, {
          client,
          botSlug: 'ada',
          descriptors: [descriptor],
          t: zhTranslate,
          onCreated: vi.fn(async () => undefined),
          onBack: vi.fn(),
        }),
      ),
    );
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '取消创建')!
        .click(),
    );
    expect(cancelSent).toBe(true);
    await act(async () => release());
    expect(client.current('ada')).toBeUndefined();
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  } finally {
    release();
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  }
});
