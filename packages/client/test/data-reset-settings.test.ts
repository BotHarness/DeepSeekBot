// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  const { createElement: element } = await import('react');
  return {
    ...dialogPrimitives(),
    Checkbox: (props: {
      checked: boolean;
      disabled?: boolean;
      label: string;
      onChange(next: boolean): void;
    }) =>
      element(
        'label',
        null,
        element('input', {
          type: 'checkbox',
          checked: props.checked,
          disabled: props.disabled,
          onChange: (event: { target: HTMLInputElement }) => props.onChange(event.target.checked),
        }),
        props.label,
      ),
  };
});

import type { BridgeCall } from '../src/client/bridge.js';
import { DataResetSettings } from '../src/client/data-reset-settings.js';
import { zhTranslate } from '../src/client/locale.js';
import { buttonNamed, dialog } from './primitive-mocks.js';

const preview = {
  token: 'reviewed',
  expiresAt: '2026-10-20T18:00:00.000Z',
  bots: 3,
  targets: [
    { kind: 'data', path: '/home/a/.dsh/botharness', bytes: 2 * 1024 * 1024, files: 12 },
    { kind: 'im-settings', path: '/home/a/.dsh/integrations/dsh-feishu', bytes: 512, files: 1 },
    { kind: 'local-tools', path: '/home/a/.botharness', bytes: 4096, files: 2, partial: true },
  ],
  kept: [
    { kind: 'credentials', path: '/home/a/.dsh/.credentials.yaml' },
    { kind: 'memory', path: '/work/ada-memory' },
    { kind: 'exports', path: '/home/a/Desktop/BotHarness Exports' },
  ],
  restartable: true,
};

async function render(call: BridgeCall) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(DataResetSettings, { call, t: zhTranslate } as never));
  });
  const click = async (name: string) => {
    const button = buttonNamed(name, host);
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
  };
  return {
    host,
    click,
    checkbox: () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!,
    submit: () => host.querySelector<HTMLButtonElement>('[data-data-reset-confirm]')!,
    dispose: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('DataResetSettings', () => {
  it('previews what is deleted and kept, then clears only after a second confirmation', async () => {
    const call = vi.fn<BridgeCall>(async (endpoint) =>
      endpoint === 'dataResetPreview'
        ? { ok: true, value: { preview } }
        : { ok: true, value: { reset: { status: 'restarting' } } },
    );
    const view = await render(call);
    try {
      expect(view.host.textContent).toContain('清除全部 BotHarness 数据');
      await view.click('清除…');
      expect(dialog().getAttribute('aria-label')).toBe('清除全部 BotHarness 数据');
      expect(view.host.textContent).toContain('会删除这台 Host 上的 3 个 Bot');
      const removed = view.host.querySelector('section[aria-label="会删除"]')!;
      expect(
        Array.from(removed.querySelectorAll('strong')).map((node) => node.textContent),
      ).toEqual(['BotHarness 数据', 'IM 连接设置', '下载的工具']);
      expect(removed.textContent).toContain('/home/a/.dsh/botharness');
      expect(removed.textContent).toContain('2.0 MB · 12 个文件');
      expect(removed.textContent).toContain('至少 4.0 KB · 2 个文件');
      const kept = view.host.querySelector('section[aria-label="会保留"]')!;
      expect(kept.textContent).toContain('/home/a/.dsh/.credentials.yaml');
      expect(kept.textContent).toContain('/work/ada-memory');
      expect(view.submit().disabled).toBe(true);
      expect(view.submit().textContent).toBe('清除并重启');

      await act(async () => view.checkbox().click());
      expect(view.submit().disabled).toBe(false);
      await act(async () => {
        view.submit().click();
        await Promise.resolve();
      });
      expect(call.mock.calls.map((entry) => entry.slice(0, 2))).toEqual([
        ['dataResetPreview', {}],
        ['dataResetConfirm', { token: 'reviewed' }],
      ]);
      expect(view.host.querySelector('[data-data-reset-result]')?.textContent).toBe(
        '正在清除数据并重启 Host，页面稍后会重新连接。',
      );
    } finally {
      view.dispose();
    }
  });

  it('warns when the Host cannot restart itself and resets the confirmation after a refusal', async () => {
    const call = vi.fn<BridgeCall>(async (endpoint) =>
      endpoint === 'dataResetPreview'
        ? { ok: true as const, value: { preview: { ...preview, restartable: false } } }
        : {
            ok: false as const,
            error: {
              code: 'data-reset-preview-stale',
              message: 'The preview changed',
              details: {},
            },
          },
    );
    const view = await render(call);
    try {
      await view.click('清除…');
      expect(view.host.textContent).toContain('这台 Host 不能自动重启');
      expect(view.submit().textContent).toBe('清除');
      await act(async () => view.checkbox().click());
      await act(async () => {
        view.submit().click();
        await Promise.resolve();
      });
      expect(view.host.textContent).toContain('清除失败，请重试。');
      expect(view.checkbox().checked).toBe(false);
      expect(view.submit().disabled).toBe(true);
    } finally {
      view.dispose();
    }
  });
});
