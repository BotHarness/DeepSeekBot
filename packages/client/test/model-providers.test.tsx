// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).comboboxPrimitives(),
);
import { ModelProvidersSettings } from '../src/client/model-providers-settings.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';

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

it('lists named subscription accounts and adds, renames and removes one', async () => {
  let revision = 4;
  const accounts = new Map([['codex-personal', 'Personal']]);
  const call = vi.fn<BridgeCall>(async (method, args) => {
    switch (method) {
      case 'teamMode':
        return { ok: true, value: { enabled: true, viewer: { kind: 'owner', humanId: 'owner' } } };
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
  const fillName = async (value: string) => {
    const field = page.nameField();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
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
    await page.click('重命名 Codex · Work');
    expect(page.nameField().value).toBe('Work');
    await fillName('Studio');
    await page.click('保存', true);
    expect(call).toHaveBeenCalledWith(
      'engineAccountRename',
      { id: 'codex-work', name: 'Studio', expectedRevision: 5 },
      undefined,
    );
    expect(page.host.textContent).toContain('Codex · Studio');
    await page.click('移除 Codex · Studio');
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
          enabled: true,
          viewer: { kind: 'member', humanId: 'manager', permissions: ['modelSources.manage'] },
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
    expect(page.button('等待登录…')?.disabled).toBe(true);
    expect(page.button('登录 Codex · Personal')?.disabled).toBe(true);
    expect(page.button('登录 Codex · Work')).toBeUndefined();
    await act(async () => finishLogin());
  } finally {
    await page.close();
    open.mockRestore();
  }
});

it('omits the subscription write controls for a Team member without modelSources.manage', async () => {
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'teamMode')
      return {
        ok: true,
        value: {
          enabled: true,
          viewer: { kind: 'member', humanId: 'member', permissions: ['roles.manage'] },
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
