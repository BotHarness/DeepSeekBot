// @vitest-environment jsdom
import { type MessagingSnapshot } from '../../core/src/messaging/outbound.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ExternalIdentityList } from '../src/client/external-identity-list.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  buttonNamed,
  chooseOption,
  dialog,
  fieldNamed,
  openCombobox,
  typeInto,
} from './primitive-mocks.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/settings-dialog-primitives.js')).mockSettingsDialogPrimitives(),
);

it.each(['feishu', 'qq', 'discord'] as const)(
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
        kind: platform === 'feishu' ? ('dm' as const) : ('group' as const),
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
      const bind = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes('绑定应用'),
      )!;
      await act(async () => bind.click());
      const tutorial = document.body.querySelector<HTMLAnchorElement>(
        'a[href="https://botharness.ai/zh/docs/lark-connection/"]',
      );
      expect(tutorial?.textContent).toBe('Lark / 飞书');
      expect(tutorial?.target).toBe('_blank');
      expect(tutorial?.rel).toBe('noopener noreferrer');
      expect(document.body.textContent).toContain('接收与配对设置');
      await chooseOption('应用', `dsh-im/${platform}:lark-app`, document.body);
      if (platform === 'discord') {
        const hint = document.body.querySelector('[role="dialog"]')!.textContent;
        expect(hint).toContain('服务器频道或公开帖子');
        expect(hint).not.toContain('私聊和群里 @');
      }
      const confirm = [
        ...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
      ].find((b) => b.textContent === '绑定应用')!;
      await act(async () => confirm.click());
      expect(mutate).toHaveBeenCalledWith({
        kind: 'bind',
        providerId: `dsh-im/${platform}`,
        accountRef: 'lark-app',
        fingerprint: 'a'.repeat(64),
      });
      expect(
        Array.from(document.body.querySelectorAll('[role="status"]'), (node) => node.textContent),
      ).toContain('正在连接 Support app…');
      snapshot = {
        ...snapshot,
        identities: [{ ...identity, reception: 'receiving' }],
        grants: [entry],
      };
      await act(async () => render());
      expect(document.body.textContent).toContain(
        platform === 'qq'
          ? '已就绪：群里 @ Support app 的消息'
          : platform === 'discord'
            ? '已就绪：服务器频道或公开帖子里 @ Support app 的消息'
            : '已就绪：发给 Support app 的私聊和群里 @ 它的消息',
      );
      expect(() => buttonNamed('取消', dialog())).toThrow();
      const done = buttonNamed('完成', dialog());
      await act(async () => done.click());
      expect(document.body.textContent).toContain(
        `${platform === 'qq' ? 'QQ' : platform === 'discord' ? 'Discord' : '飞书'} · 1 个会话`,
      );
      const edit = document.body.querySelector<HTMLButtonElement>(
        '[title="编辑身份：Support app"]',
      )!;
      await act(async () => edit.click());
      const list = document.body.querySelector('[role="dialog"] section[aria-label="活跃"]')!;
      expect(list.textContent).toContain('Owner');
      expect(list.textContent).toContain(platform === 'feishu' ? '私聊' : '群聊');
      expect(list.textContent).toContain('最近消息');
      expect([...list.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
        '静音',
        '屏蔽',
      ]);
      snapshot = { ...snapshot, grants: [] };
      await act(async () => render());
      const empty = document.body.querySelector('[role="dialog"]')!.textContent;
      if (platform === 'qq') {
        expect(empty).toContain('在已加入的 QQ 群里 @ 这个应用');
        expect(empty).not.toContain('私聊这个应用');
      } else if (platform === 'discord') {
        expect(empty).toContain('服务器频道或公开帖子里 @ 这个应用');
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
    const bind = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('绑定应用'),
    )!;
    await act(async () => bind.click());
    await openCombobox('应用', document.body);
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
    const create = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '创建应用',
    );
    expect(create).toBeDefined();
    await act(async () => create!.click());
    expect(dialog().getAttribute('aria-label')).toBe('绑定应用');
    await typeInto(fieldNamed('App ID'), 'cli_created');
    await typeInto(fieldNamed('App Secret'), 'private-ui-sentinel');
    expect(fieldNamed('App Secret').type).toBe('password');
    await act(async () => buttonNamed('创建并绑定', dialog()).click());
    expect(fieldNamed('App ID').disabled).toBe(true);
    expect(buttonNamed('正在处理…', dialog()).getAttribute('aria-busy')).toBe('true');
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
      const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
        (entry) => entry.textContent === text,
      );
      expect(button).toBeDefined();
      button!.click();
    });
  try {
    await act(async () => root.render(view()));
    await click('创建应用');
    await click('生成微信绑定二维码');
    expect(document.body.querySelector('img[alt="微信绑定二维码"]')).not.toBeNull();
    expect(mutate).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(methods).toEqual(['setup.start']);
    await act(async () => root.render(view()));
    await click('创建应用');
    expect(methods.filter((method) => method === 'setup.start')).toHaveLength(1);
    expect(document.body.textContent).toContain('请输入微信显示的配对码');
    expect(buttonNamed('提交配对码', dialog()).disabled).toBe(true);
    await typeInto(fieldNamed('配对码'), '12');
    expect(buttonNamed('提交配对码', dialog()).disabled).toBe(true);
    await typeInto(fieldNamed('配对码'), '123456');
    expect(buttonNamed('提交配对码', dialog()).disabled).toBe(false);
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
          title: '创建应用',
          labels: { close: '关闭', cancel: '取消' },
          onCancel: vi.fn(),
          onCreated: vi.fn(async () => undefined),
          onBack: vi.fn(),
        }),
      ),
    );
    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '取消创建')!
        .click(),
    );
    expect(cancelSent).toBe(true);
    await act(async () => release());
    expect(client.current('ada')).toBeUndefined();
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.querySelector('img')).toBeNull();
  } finally {
    release();
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  }
});

it('returns from the create-app form to the bind dialog and dismisses with the caller label', async () => {
  const { ProviderAppSetup } = await import('../src/client/provider-app-setup.js');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const onClose = vi.fn();
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
          mutate: vi.fn(),
          conversation: vi.fn(),
          rules: vi.fn(),
          appSetup: {
            client: new ProviderAppSetup({ call: vi.fn() as never }),
            botSlug: 'ada',
          },
          bindDialog: { onClose, dismissLabel: '稍后', description: '先绑定一个应用' },
        }),
      ),
    );
    expect(dialog().textContent).toContain('先绑定一个应用');
    expect(buttonNamed('绑定应用', dialog()).disabled).toBe(true);
    await act(async () => buttonNamed('创建应用', dialog()).click());
    expect(fieldNamed('App ID')).toBeDefined();
    await act(async () => buttonNamed(zhTranslate('appSetup.back'), dialog()).click());
    expect(() => fieldNamed('App ID')).toThrow();
    expect(buttonNamed('绑定应用', dialog())).toBeDefined();
    await act(async () => buttonNamed('稍后', dialog()).click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
