// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { WireTeamMode } from '@botharness/host-protocol/wire';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).comboboxPrimitives(),
);
import { ModelProvidersSettings } from '../src/client/model-providers-settings.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { resourceEvents } from './resource-events-fixture.js';
import { menuItem, typeInto } from './primitive-mocks.js';
import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';

it('renders the provider name, masked key and provider brand', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const call = vi.fn<BridgeCall>(async (method) => ({
    ok: true,
    value:
      method === 'modelProviders'
        ? {
            revision: 2,
            providers: [
              {
                id: 'opencode-go-2',
                name: 'Backup Go',
                keyLast4: '1234',
                keyStored: true,
                modelCount: 1,
                availability: 'available',
                canRename: true,
                canRemove: true,
                revision: 2,
              },
            ],
          }
        : {},
  }));
  try {
    await act(async () => root.render(<ModelProvidersSettings call={call} t={zhTranslate} />));
    expect(host.textContent).toContain('Backup Go');
    expect(host.textContent).toContain('••••1234');
    expect(host.querySelector('[data-model-brand="opencode"]')).toBeTruthy();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('saves a key, shows all three outcomes, then edits and removes the provider', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const provider = {
    id: 'opencode-go-2',
    name: 'Backup Go',
    keyLast4: '1234',
    keyStored: true,
    modelCount: 1,
    availability: 'available',
    canRename: true,
    canReplaceKey: true,
    canRemove: true,
    revision: 3,
  };
  let providers: (typeof provider)[] = [];
  let finishSave = () => {};
  const save = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  const call = vi.fn<BridgeCall>(async (method, args) => {
    switch (method) {
      case 'modelProviderAdd':
        await save;
        providers = [provider];
        return {
          ok: true,
          value: { id: provider.id, keyStored: true, modelCount: 1, testReply: 'ok' },
        };
      case 'modelProviderEdit':
        if (typeof args['name'] === 'string') provider.name = args['name'];
        return {
          ok: true,
          value: { id: provider.id, keyStored: true, modelCount: 1, testReply: 'skipped' },
        };
      case 'modelProviderRemove':
        providers = [];
        return { ok: true, value: { id: provider.id } };
      default:
        return { ok: true, value: { revision: 2, providers } };
    }
  });
  const click = async (name: string, inDialog = false) => {
    const scope = inDialog ? document.querySelector('[role="dialog"]') : document.body;
    const button = [...(scope?.querySelectorAll('button') ?? [])].find(
      (element) => (element.getAttribute('aria-label') ?? element.textContent) === name,
    );
    if (button === undefined) throw new Error('No button named ' + name);
    await act(async () => button.click());
  };
  const fill = async (name: string, value: string) => {
    const input = document.querySelector(`input[aria-label="${name}"]`);
    if (!(input instanceof HTMLInputElement)) throw new Error('No field named ' + name);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<ModelProvidersSettings call={call} t={zhTranslate} />));
    await click('添加提供商');
    expect(document.querySelector('input[aria-label="名称"]')).toHaveProperty('required', true);
    expect(document.querySelector('input[type="password"]')).toHaveProperty('required', true);
    await fill('名称', 'Backup Go');
    await fill('API key', 'unpublished-key-1234');
    await click('保存', true);
    expect(call).toHaveBeenCalledWith(
      'modelProviderAdd',
      {
        template: 'opencode-go',
        name: 'Backup Go',
        key: 'unpublished-key-1234',
        expectedRevision: 2,
      },
      undefined,
    );
    await click('关闭', true);
    expect(document.querySelector('input[aria-label="名称"]')).toHaveProperty('value', 'Backup Go');
    await act(async () => finishSave());
    const receipt = document.querySelector('[role="dialog"]')?.textContent;
    expect(receipt).toContain('API key 已保存');
    expect(receipt).toContain('已列出 1 个模型');
    expect(receipt).toContain('测试回复成功');
    expect(document.body.textContent).not.toContain('unpublished-key-1234');
    await click('关闭', true);
    await click('编辑 Backup Go');
    expect(document.querySelector('input[type="password"]')).toHaveProperty('value', '');
    expect(document.querySelector('input[type="password"]')).toHaveProperty('required', false);
    await fill('名称', 'Renamed Go');
    await click('保存', true);
    expect(call).toHaveBeenCalledWith(
      'modelProviderEdit',
      { id: provider.id, expectedRevision: 3, name: 'Renamed Go' },
      undefined,
    );
    await click('编辑 Renamed Go');
    await click('移除', true);
    await click('移除', true);
    expect(call).toHaveBeenCalledWith(
      'modelProviderRemove',
      { id: provider.id, expectedRevision: 3 },
      undefined,
    );
    expect(host.textContent).not.toContain('Renamed Go');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

function subscriptionTestPage(call: BridgeCall) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const buttons = (inDialog: boolean) =>
    Array.from(
      (inDialog ? document.querySelector('[role="dialog"]') : host)?.querySelectorAll('button') ??
        [],
    );
  const button = (name: string, inDialog = false) =>
    buttons(inDialog).find(
      (item) => (item.getAttribute('aria-label') ?? item.textContent) === name,
    );
  return {
    host,
    button,
    render: () =>
      act(async () => root.render(<ModelProvidersSettings call={call} t={zhTranslate} />)),
    async click(name: string, inDialog = false) {
      const target = button(name, inDialog);
      if (target === undefined) throw new Error('No button named ' + name);
      await act(async () => target.click());
    },
    nameField() {
      const input = document.querySelector('input[aria-label="名称"]');
      if (!(input instanceof HTMLInputElement)) throw new Error('No account name field');
      return input;
    },
    async close() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function teamMode(kind: 'owner' | 'member', permissions: string[] = []): WireTeamMode {
  return {
    enabled: true,
    activeMembers: 2,
    ownerPasswordSet: true,
    insecureHttpAllowed: false,
    memberUrls: [],
    isolation: 'trial',
    viewer: {
      kind,
      humanId: kind,
      displayName: kind,
      owner: kind === 'owner',
      mustChangePassword: false,
      roleIds: [],
      permissions,
      models: { all: true },
    },
  };
}

it('lists named subscription accounts and adds, renames and removes one', async () => {
  let revision = 4;
  const accounts = new Map([['codex-personal', 'Personal']]);
  const call = vi.fn<BridgeCall>(async (method, args) => {
    switch (method) {
      case 'teamMode':
        return { ok: true, value: { ...fakeTeamMode(), enabled: true } };
      case 'modelProviders':
        return { ok: true, value: { revision: 1, providers: [] } };
      case 'engineAccounts':
        return {
          ok: true,
          value: {
            revision,
            engines: [...accounts].map(([accountId, accountName]) => ({
              engine: 'codex',
              accountId,
              accountName,
              installed: true,
              available: false,
              reason: 'signed-out',
            })),
            selections: [],
          },
        };
      case 'engineAccountAdd':
        if (typeof args['name'] !== 'string') throw new Error('Missing account name');
        accounts.set('codex-work', args['name']);
        revision += 1;
        return { ok: true, value: { id: 'codex-work' } };
      case 'engineAccountRename':
        if (typeof args['name'] !== 'string') throw new Error('Missing account name');
        accounts.set('codex-work', args['name']);
        revision += 1;
        return { ok: true, value: { id: 'codex-work' } };
      case 'engineAccountRemove':
        accounts.delete('codex-work');
        revision += 1;
        return { ok: true, value: { id: 'codex-work' } };
      default:
        throw new Error('Unexpected bridge method ' + method);
    }
  });
  const page = subscriptionTestPage(call);
  const fillName = (value: string) => typeInto(page.nameField(), value);
  try {
    await page.render();
    expect(page.host.textContent).toContain('Codex · Personal');
    expect(page.host.textContent).toContain(zhTranslate('modelProviders.signedOut'));
    await page.click('添加账号');
    await fillName(' Work ');
    await page.click('保存', true);
    expect(call).toHaveBeenCalledWith(
      'engineAccountAdd',
      { engine: 'codex', name: 'Work', expectedRevision: 4 },
      undefined,
    );
    expect(page.host.textContent).toContain('Codex · Work');
    await page.click('Codex · Work 的操作');
    await act(async () => menuItem('重命名').click());
    expect(page.nameField().value).toBe('Work');
    await fillName('Studio');
    await page.click('保存', true);
    expect(call).toHaveBeenCalledWith(
      'engineAccountRename',
      { id: 'codex-work', name: 'Studio', expectedRevision: 5 },
      undefined,
    );
    expect(page.host.textContent).toContain('Codex · Studio');
    await page.click('Codex · Studio 的操作');
    await act(async () => menuItem('移除').click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      zhTranslate('modelProviders.removeAccountWarning'),
    );
    await page.click('移除', true);
    expect(call).toHaveBeenCalledWith(
      'engineAccountRemove',
      { id: 'codex-work', expectedRevision: 6, confirm: true },
      undefined,
    );
    expect(page.host.textContent).not.toContain('Codex · Studio');
    expect(page.host.textContent).toContain('Codex · Personal');
  } finally {
    await page.close();
  }
});

it('adds a named Claude Code account and submits a manual code from its sign-in row', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const accounts = new Map([['claude', 'Claude Code']]);
  let acceptCode = false;
  const call = vi.fn<BridgeCall>(async (method, args) => {
    switch (method) {
      case 'teamMode':
        return { ok: true, value: teamMode('owner') };
      case 'modelProviders':
        return { ok: true, value: { revision: 1, providers: [] } };
      case 'engineAccounts':
        return {
          ok: true,
          value: {
            revision: accounts.size,
            engines: [...accounts].map(([accountId, accountName]) => ({
              engine: 'claude',
              accountId,
              accountName,
              installed: true,
              available: false,
              reason: 'signed-out',
            })),
            selections: [],
          },
        };
      case 'engineAccountAdd':
        accounts.set('claude-work', String(args['name']));
        return { ok: true, value: { id: 'claude-work' } };
      case 'engineAccountLogin':
        return { ok: true, value: { url: 'https://claude.ai/fixture' } };
      case 'engineAccountSubmitCode':
        return acceptCode
          ? { ok: true, value: { submitted: true } }
          : {
              ok: false,
              error: {
                code: 'engine-code-not-requested',
                message: 'process detail',
                details: {},
              },
            };
      default:
        throw new Error('Unexpected bridge method ' + method);
    }
  });
  const page = subscriptionTestPage(call);
  try {
    await page.render();
    expect(page.host.textContent).not.toContain('Claude Code · Claude Code');
    expect(page.button('登录 Claude Code')?.textContent).toBe('登录');
    await page.click('添加账号');
    const claude = document.querySelector<HTMLButtonElement>('[data-engine-choice="claude"]');
    expect(claude?.getAttribute('aria-checked')).toBe('false');
    await act(async () => claude!.click());
    expect(claude?.getAttribute('aria-checked')).toBe('true');
    await typeInto(page.nameField(), 'Work');
    await page.click('保存', true);
    expect(call).toHaveBeenCalledWith(
      'engineAccountAdd',
      { engine: 'claude', name: 'Work', expectedRevision: 1 },
      undefined,
    );
    const login = page.button('登录 Claude Code · Work');
    expect(login?.textContent).toBe('登录');
    const row = login?.closest('li');
    expect(row?.querySelector('input')).toBeNull();
    await page.click('登录 Claude Code · Work');
    expect(call).toHaveBeenCalledWith('engineAccountLogin', { id: 'claude-work' }, undefined);
    const field = row?.querySelector('input[aria-label="粘贴授权码"]');
    if (!(field instanceof HTMLInputElement)) throw new Error('No authorization code field');
    expect(field.type).toBe('password');
    expect(page.button('登录 Claude Code')?.disabled).toBe(true);
    expect(page.button('提交授权码')?.disabled).toBe(true);
    await typeInto(field, ' fixture#state ');
    await page.click('提交授权码');
    expect(call).toHaveBeenLastCalledWith(
      'engineAccountSubmitCode',
      { id: 'claude-work', code: 'fixture#state' },
      undefined,
    );
    expect(field.value).toBe('');
    expect(row?.querySelector('[role="alert"]')?.textContent).toBe(
      zhTranslate('modelProviders.codeUnavailable'),
    );
    acceptCode = true;
    await typeInto(field, 'new-fixture#state');
    await page.click('提交授权码');
    expect(field.value).toBe('');
    expect(row?.textContent).toContain(zhTranslate('modelProviders.codeSubmitted'));
  } finally {
    await page.close();
    open.mockRestore();
  }
});

it('shows the signing-in state only for the selected subscription account', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  let finishLogin = () => {};
  const login = new Promise<void>((resolve) => {
    finishLogin = resolve;
  });
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'teamMode')
      return {
        ok: true,
        value: {
          ...fakeTeamMode({
            kind: 'member',
            humanId: 'manager',
            permissions: ['modelSources.manage'],
          }),
          enabled: true,
        },
      };
    if (method === 'engineAccountLogin') {
      await login;
      return { ok: true, value: {} };
    }
    if (method === 'modelProviders') return { ok: true, value: { revision: 1, providers: [] } };
    return {
      ok: true,
      value: {
        revision: 1,
        engines: ['Personal', 'Work'].map((accountName) => ({
          engine: 'codex',
          accountId: `codex-${accountName.toLowerCase()}`,
          accountName,
          installed: true,
          available: false,
          reason: 'signed-out',
        })),
        selections: [],
      },
    };
  });
  const page = subscriptionTestPage(call);
  try {
    await page.render();
    await page.click('登录 Codex · Work');
    expect(call).toHaveBeenCalledWith('engineAccountLogin', { id: 'codex-work' }, undefined);
    expect(page.host.textContent).toContain('等待登录…');
    expect(page.button('取消')).toBeDefined();
    expect(page.button('登录 Codex · Personal')?.disabled).toBe(true);
    expect(page.button('登录 Codex · Work')).toBeUndefined();
    await page.click('取消');
    expect(call).toHaveBeenCalledWith('engineAccountLoginCancel', { id: 'codex-work' }, undefined);
    expect(page.button('登录 Codex · Work')?.disabled).toBe(false);
    expect(page.host.textContent).not.toContain('等待登录…');
    await act(async () => finishLogin());
  } finally {
    await page.close();
    open.mockRestore();
  }
});

it('keeps a sign-in pending until cancel settles and offers Cancel again when it fails', async () => {
  let settleCancel: (result: Awaited<ReturnType<BridgeCall>>) => void = () => {};
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'teamMode')
      return {
        ok: true,
        value: {
          ...fakeTeamMode({
            kind: 'member',
            humanId: 'manager',
            permissions: ['modelSources.manage'],
          }),
          enabled: true,
        },
      };
    if (method === 'engineAccountLogin')
      return { ok: true, value: { url: 'https://example.test/sign-in' } };
    if (method === 'engineAccountLoginCancel')
      return new Promise((resolve) => {
        settleCancel = resolve;
      });
    if (method === 'modelProviders') return { ok: true, value: { revision: 1, providers: [] } };
    return {
      ok: true,
      value: {
        revision: 1,
        engines: [
          {
            engine: 'codex',
            accountId: 'codex-work',
            accountName: 'Work',
            installed: true,
            available: false,
            reason: 'signed-out',
          },
        ],
        selections: [],
      },
    };
  });
  const page = subscriptionTestPage(call);
  try {
    await page.render();
    await page.click('登录 Codex · Work');
    expect(page.host.textContent).toContain('等待登录…');
    await page.click('取消');
    expect(page.button('正在取消…')?.disabled).toBe(true);
    expect(page.host.textContent).toContain('等待登录…');
    await act(async () =>
      settleCancel({ ok: false, error: { code: 'unavailable', message: 'down', details: {} } }),
    );
    expect(page.host.textContent).toContain('取消登录失败，再试一次。');
    expect(page.button('取消')?.disabled).toBe(false);
    expect(page.host.textContent).toContain('等待登录…');
    await page.click('取消');
    await act(async () => settleCancel({ ok: true, value: { cancelled: true } }));
    expect(page.host.textContent).not.toContain('等待登录…');
    expect(page.host.textContent).not.toContain('取消登录失败，再试一次。');
    expect(page.button('登录 Codex · Work')?.disabled).toBe(false);
  } finally {
    await page.close();
  }
});

it('omits the subscription write controls for a Team member without modelSources.manage', async () => {
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'teamMode')
      return {
        ok: true,
        value: {
          ...fakeTeamMode({ kind: 'member', humanId: 'member', permissions: ['roles.manage'] }),
          enabled: true,
        },
      };
    if (method === 'modelProviders') return { ok: true, value: { revision: 1, providers: [] } };
    if (method === 'engineAccounts')
      return {
        ok: true,
        value: {
          revision: 1,
          engines: [
            {
              engine: 'codex',
              accountId: 'codex-work',
              accountName: 'Work',
              installed: true,
              available: false,
              reason: 'signed-out',
            },
          ],
          selections: [],
        },
      };
    return { ok: true, value: {} };
  });
  const page = subscriptionTestPage(call);
  try {
    await page.render();
    expect(page.button('添加账号')).toBeUndefined();
    expect(page.button('登录 Codex · Work')).toBeUndefined();
    expect(page.button('重命名 Codex · Work')).toBeUndefined();
    expect(page.button('移除 Codex · Work')).toBeUndefined();
    expect(call.mock.calls.map(([method]) => method)).not.toContain('engineAccounts');
  } finally {
    await page.close();
  }
});

it('masks the bound email until clicked and shows remaining quota per window with refresh', async () => {
  const now = Date.now();
  const hour = 3_600_000;
  const cachedStatus: Record<string, unknown> = {
    usedPercent: 50,
    resetsAt: new Date(now + 2 * hour).toISOString(),
    observedAt: new Date(now - 2 * hour).toISOString(),
    source: 'turn',
    windows: {
      session: { remainingPercent: 50, resetsAt: new Date(now + 2 * hour).toISOString() },
    },
  };
  let quota = cachedStatus;
  let refreshStatus = 'ok';
  const call = vi.fn<BridgeCall>(async (method) => {
    switch (method) {
      case 'teamMode':
        return { ok: true, value: { ...fakeTeamMode(), enabled: true } };
      case 'modelProviders':
        return { ok: true, value: { revision: 1, providers: [] } };
      case 'engineAccounts':
        return {
          ok: true,
          value: {
            revision: 3,
            accounts: [
              {
                id: 'claude-work',
                engine: 'claude',
                name: 'Work',
                email: 'vain.test@example.org',
                quota,
              },
            ],
            engines: [
              {
                engine: 'claude',
                accountId: 'claude-work',
                accountName: 'Work',
                installed: true,
                available: true,
                quota: cachedStatus,
              },
            ],
            selections: [],
          },
        };
      case 'engineAccountQuotaRefresh':
        if (refreshStatus !== 'ok') return { ok: true, value: { status: refreshStatus } };
        quota = {
          observedAt: new Date(now).toISOString(),
          source: 'live',
          windows: {
            session: { remainingPercent: 27, resetsAt: new Date(now + hour).toISOString() },
            weekly: { remainingPercent: 41, resetsAt: new Date(now + 90 * hour).toISOString() },
          },
        };
        return { ok: true, value: { status: 'ok', quota } };
      default:
        throw new Error('Unexpected bridge method ' + method);
    }
  });
  const page = subscriptionTestPage(call);
  try {
    await page.render();
    expect(page.host.textContent).toContain('va•••@e•••.org');
    expect(page.host.textContent).not.toContain('vain.test@example.org');
    await page.click('显示完整邮箱');
    expect(page.host.textContent).toContain('vain.test@example.org');
    expect(page.button('vain.test@example.org，点击隐藏')).toBeDefined();
    await page.click('vain.test@example.org，点击隐藏');
    expect(page.host.textContent).not.toContain('vain.test@example.org');

    expect(page.button('Claude Code · Work 的额度：剩余 50%')).toBeDefined();
    await page.click('Claude Code · Work 的额度：剩余 50%');
    expect(call).toHaveBeenCalledWith(
      'engineAccountQuotaRefresh',
      { id: 'claude-work' },
      undefined,
    );
    const panel = page.host.querySelector('[data-account-quota]');
    const meter = (id: string) =>
      panel?.querySelector(`[data-quota-window="${id}"] [role="meter"]`);
    expect(meter('session')?.getAttribute('aria-valuenow')).toBe('27');
    expect(meter('session')?.getAttribute('aria-valuetext')).toBe('剩余 27%');
    expect(meter('weekly')?.getAttribute('aria-valuenow')).toBe('41');
    expect(meter('session')?.textContent).toContain('1 小时 0 分');
    expect(page.button('刷新')?.getAttribute('title')).toContain('刚刚更新');
    expect(page.host.querySelector('[data-quota-chip="claude-work"]')?.textContent).toBe(
      '剩余 27%',
    );
    expect(page.button('Claude Code · Work 的额度：剩余 27%')).toBeDefined();

    refreshStatus = 'timeout';
    await page.click('刷新');
    expect(page.host.textContent).toContain('读取额度超时，再试一次。');
    expect(
      call.mock.calls.filter(([method]) => method === 'engineAccountQuotaRefresh'),
    ).toHaveLength(2);

    await page.click('Claude Code · Work 的额度：剩余 27%');
    expect(page.host.querySelector('[data-account-quota]')).toBeNull();
  } finally {
    await page.close();
  }
});

it.each([
  ['completed', '已登录'],
  ['expired', '登录码已过期。重新登录。'],
  ['failed', '无法完成 Codex 设备登录。检查 ChatGPT 的设备码授权设置后重试。'],
  ['cancelled', '已取消登录。'],
] as const)('displays Codex device sign-in until it is %s', async (outcome, message) => {
  vi.useFakeTimers();
  const events = resourceEvents();
  const attemptId = '7d38c154-2981-431d-83a1-82c400cf6a11';
  const url = 'https://auth.openai.com/codex/device';
  let status: string = 'pending';
  const call = vi.fn<BridgeCall>(async (method) => {
    switch (method) {
      case 'teamMode':
        return { ok: true, value: teamMode('owner') };
      case 'modelProviders':
        return { ok: true, value: { revision: 1, providers: [] } };
      case 'engineAccounts':
        return {
          ok: true,
          value: {
            revision: 1,
            engines: [
              {
                engine: 'codex',
                accountId: 'codex-work',
                installed: true,
                ...(status === 'completed'
                  ? { available: true }
                  : { available: false, reason: 'signed-out' }),
              },
            ],
            selections: [],
          },
        };
      case 'engineAccountLogin':
        return { ok: true, value: { started: true, engine: 'codex', attemptId } };
      case 'engineAccountLoginStatus':
        return {
          ok: true,
          value:
            status === 'pending'
              ? { status, url, code: '7ABC-92DE', expiresAt: '2026-11-22T01:30:00.000Z' }
              : { status },
        };
      case 'engineAccountLoginCancel':
        status = 'cancelled';
        return { ok: true, value: { cancelled: true } };
      default:
        throw new Error('Unexpected call ' + method);
    }
  });
  const page = subscriptionTestPage(call);
  const writeText = vi.fn(async () => {});
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    await page.render();
    await page.click('在其他设备上登录 Codex');
    expect(call).toHaveBeenCalledWith(
      'engineAccountLogin',
      { id: 'codex-work', mode: 'device-auth' },
      undefined,
    );
    expect(page.host.textContent).toContain('等待登录…');
    expect(page.host.textContent).toContain(url);
    expect(page.host.textContent).toContain('7ABC-92DE');
    expect(page.host.textContent).toContain('有效期至');
    const link = page.host.querySelector(`a[href="${url}"]`);
    expect(link?.textContent).toBe(url);
    await page.click('复制登录链接');
    await page.click('复制登录码');
    expect(writeText.mock.calls).toEqual([[url], ['7ABC-92DE']]);
    if (outcome === 'cancelled') {
      await page.click('取消');
      expect(call).toHaveBeenCalledWith(
        'engineAccountLoginCancel',
        { id: 'codex-work', attemptId },
        undefined,
      );
    } else {
      status = outcome;
      const reads = () =>
        call.mock.calls.filter(([method]) => method === 'engineAccountLoginStatus').length;
      const snapshots = reads();
      await act(async () => vi.advanceTimersByTimeAsync(9_000));
      expect(reads()).toBe(snapshots);
      await act(async () => {
        events.emit('engine-device-login');
        await vi.advanceTimersByTimeAsync(25);
      });
      expect(reads()).toBe(snapshots + 1);
    }
    expect(page.host.textContent).toContain(message);
    expect(page.host.textContent).not.toContain('7ABC-92DE');
  } finally {
    await page.close();
    events.dispose();
    if (clipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard');
    else Object.defineProperty(navigator, 'clipboard', clipboard);
    vi.useRealTimers();
  }
});
