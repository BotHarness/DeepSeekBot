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
  const call = vi.fn<BridgeCall>(async (method, args) => {
    switch (method) {
      case 'modelProviderAdd':
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
    const receipt = document.querySelector('[role="dialog"]')?.textContent;
    expect(receipt).toContain('API key 已保存');
    expect(receipt).toContain('已列出 1 个模型');
    expect(receipt).toContain('测试回复成功');
    expect(document.body.textContent).not.toContain('unpublished-key-1234');
    await click('关闭', true);
    await click('编辑 Backup Go');
    expect(document.querySelector('input[type="password"]')).toHaveProperty('value', '');
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
