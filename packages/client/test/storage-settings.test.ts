// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  const { createElement: element } = await import('react');
  return {
    ...dialogPrimitives(),
    IconChevronDownOutlineRegular: () => null,
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

vi.mock('../src/client/ds/select.js', async () => {
  const { createElement: element } = await import('react');
  return {
    Select: (props: {
      label: string;
      value: string;
      options: { value: string; label: string }[];
      onChange(next: string): void;
    }) =>
      element(
        'select',
        {
          'aria-label': props.label,
          value: props.value,
          onChange: (event: { target: HTMLSelectElement }) => props.onChange(event.target.value),
        },
        ...props.options.map((option) =>
          element('option', { key: option.value, value: option.value }, option.label),
        ),
      ),
  };
});

import type { BridgeCall } from '../src/client/bridge.js';
import { StorageSettings } from '../src/client/storage-settings.js';
import { zhTranslate } from '../src/client/locale.js';
import { buttonNamed } from './primitive-mocks.js';

const usage = {
  measuredAt: '2026-10-20T00:00:00.000Z',
  totalBytes: 8 * 1024 * 1024,
  parts: [
    { kind: 'media', bytes: 6 * 1024 * 1024 },
    { kind: 'messages', bytes: 1024 * 1024 },
    { kind: 'memory', bytes: 512 * 1024 },
    { kind: 'other', bytes: 512 * 1024 },
  ],
  chats: [
    {
      channelId: 'dm-ada',
      name: 'Ada',
      type: 'dm',
      messages: 40,
      oldestAt: '2026-01-01T00:00:00.000Z',
      mediaBytes: 5 * 1024 * 1024,
      media: [{ kind: 'image', count: 3, bytes: 5 * 1024 * 1024 }],
    },
    {
      channelId: 'group-team',
      name: 'Team',
      type: 'group',
      messages: 9,
      mediaBytes: 1024 * 1024,
      media: [{ kind: 'file', count: 1, bytes: 1024 * 1024 }],
    },
    { channelId: 'dm-text', name: 'Text only', type: 'dm', messages: 3, mediaBytes: 0, media: [] },
  ],
};

function preview(scope: Record<string, unknown>) {
  return {
    token: 'reviewed',
    expiresAt: '2026-10-20T00:10:00.000Z',
    scope: { channelIds: [], kinds: ['image', 'video', 'audio', 'file'], ...scope },
    messages: 2,
    files: 3,
    bytes: 5 * 1024 * 1024,
    freedBytes: 4 * 1024 * 1024,
    kinds: [{ kind: 'image', count: 3, bytes: 5 * 1024 * 1024 }],
    chats: [{ channelId: 'dm-ada', name: 'Ada', files: 3, bytes: 5 * 1024 * 1024 }],
    kept: [{ reason: 'bot-working', files: 1 }],
  };
}

async function render(call: BridgeCall) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(StorageSettings, { call, t: zhTranslate } as never));
  });
  const press = async (button: HTMLButtonElement) => {
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
  };
  const checkbox = (label: string) =>
    Array.from(host.querySelectorAll('label')).find((node) => node.textContent === label)!
      .firstElementChild as HTMLInputElement;
  return {
    host,
    press,
    checkbox,
    open: () => press(buttonNamed('管理…', host)),
    dispose: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('StorageSettings', () => {
  it('shows space used, previews the chosen chat media and clears after confirmation', async () => {
    const call = vi.fn<BridgeCall>(async (endpoint, payload) =>
      endpoint === 'storageUsage'
        ? { ok: true, value: usage }
        : endpoint === 'storageCleanupPreview'
          ? { ok: true, value: preview(payload as Record<string, unknown>) }
          : { ok: true, value: { messages: 2, files: 3, freedBytes: 4 * 1024 * 1024 } },
    );
    const view = await render(call);
    try {
      await view.open();
      expect(view.host.querySelector('[data-storage-total]')?.textContent).toBe('共占用 8.0 MB');
      expect(
        Array.from(view.host.querySelectorAll('[data-storage-part]')).map(
          (node) => node.textContent,
        ),
      ).toEqual(['图片和文件 6.0 MB', '聊天记录 1.0 MB', '记忆 512.0 KB', '其他 512.0 KB']);
      expect(
        Array.from(view.host.querySelectorAll('[data-storage-chat]')).map((node) =>
          node.getAttribute('data-storage-chat'),
        ),
      ).toEqual(['dm-ada', 'group-team']);

      await act(async () => view.checkbox('Team').click());
      await act(async () => view.checkbox('文件').click());
      await view.press(view.host.querySelector<HTMLButtonElement>('[data-storage-review]')!);
      const [endpoint, scope] = call.mock.calls[1]!;
      expect(endpoint).toBe('storageCleanupPreview');
      expect(scope).toMatchObject({ channelIds: ['dm-ada'], kinds: ['image', 'video', 'audio'] });
      expect(Date.parse((scope as { before: string }).before)).toBeLessThan(
        Date.now() - 89 * 24 * 60 * 60 * 1000,
      );

      expect(view.host.textContent).toContain('会从 2 条消息里删除 3 个文件，释放约 4.0 MB。');
      expect(view.host.textContent).toContain('1 个文件 Bot 还在处理，这次先保留。');
      expect(view.host.textContent).toContain('部分文件在别处仍在使用');
      const confirm = view.host.querySelector<HTMLButtonElement>('[data-storage-confirm]')!;
      expect(confirm.disabled).toBe(true);
      await act(async () => view.checkbox('我了解这些文件会被永久删除').click());
      await view.press(confirm);
      expect(call.mock.calls[2]).toEqual([
        'storageCleanupConfirm',
        {
          before: (scope as { before: string }).before,
          channelIds: ['dm-ada'],
          kinds: ['image', 'video', 'audio'],
          token: 'reviewed',
        },
        undefined,
      ]);
      expect(view.host.querySelector('[data-storage-result]')?.textContent).toBe(
        '已清理 3 个文件，释放 4.0 MB。',
      );
    } finally {
      view.dispose();
    }
  });

  it('asks for a new preview when the chats changed after the preview', async () => {
    const call = vi.fn<BridgeCall>(async (endpoint, payload) =>
      endpoint === 'storageUsage'
        ? { ok: true, value: usage }
        : endpoint === 'storageCleanupPreview'
          ? { ok: true, value: preview(payload as Record<string, unknown>) }
          : {
              ok: false,
              error: { code: 'storage-preview-stale', message: 'changed', details: {} },
            },
    );
    const view = await render(call);
    try {
      await view.open();
      await view.press(view.host.querySelector<HTMLButtonElement>('[data-storage-review]')!);
      expect(call.mock.calls[1]![1]).not.toHaveProperty('channelIds');
      await act(async () => view.checkbox('我了解这些文件会被永久删除').click());
      await view.press(view.host.querySelector<HTMLButtonElement>('[data-storage-confirm]')!);
      expect(view.host.textContent).toContain('内容有变化，请重新预览。');
      expect(view.host.querySelector('[data-storage-usage]')).not.toBeNull();
    } finally {
      view.dispose();
    }
  });

  it('previews and deletes whole old messages in the chosen chats', async () => {
    const call = vi.fn<BridgeCall>(async (endpoint, payload) =>
      endpoint === 'storageUsage'
        ? { ok: true, value: usage }
        : endpoint === 'storageMessagesCleanupPreview'
          ? {
              ok: true,
              value: {
                token: 'messages',
                scope: { channelIds: [], ...(payload as Record<string, unknown>) },
                messages: 12,
                bytes: 4096,
                files: 2,
                chats: [{ channelId: 'dm-ada', name: 'Ada', messages: 12 }],
                kept: [{ reason: 'bot-working', messages: 1 }],
                memoryReferences: 3,
                more: true,
              },
            }
          : { ok: true, value: { messages: 12, freedBytes: 8192 } },
    );
    const view = await render(call);
    try {
      await view.open();
      const target = view.host.querySelector<HTMLSelectElement>('select[aria-label="清理内容"]')!;
      await act(async () => {
        target.value = 'messages';
        target.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(view.host.querySelector('[data-storage-target-note]')?.textContent).toContain(
        '删除整条消息',
      );
      expect(view.host.textContent).not.toContain('视频');
      expect(
        Array.from(view.host.querySelectorAll('[data-storage-chat]')).map((node) =>
          node.getAttribute('data-storage-chat'),
        ),
      ).toEqual(['dm-ada', 'group-team', 'dm-text']);
      await act(async () => view.checkbox('Team').click());
      await view.press(view.host.querySelector<HTMLButtonElement>('[data-storage-review]')!);
      const [endpoint, scope] = call.mock.calls[1]!;
      expect(endpoint).toBe('storageMessagesCleanupPreview');
      expect(scope).toMatchObject({ channelIds: ['dm-ada', 'dm-text'] });
      expect(scope).not.toHaveProperty('kinds');

      expect(view.host.textContent).toContain('会删除 1 个聊天里的 12 条消息，约 4.0 KB。');
      expect(view.host.textContent).toContain('其中的 2 个文件也会一起删除。');
      expect(view.host.textContent).toContain('有 3 处 Bot 记忆提到了这些消息');
      expect(view.host.textContent).toContain('1 条消息 Bot 还在处理，这次先保留。');
      expect(view.host.textContent).toContain('还有更多旧消息');
      await act(async () => view.checkbox('我了解这些消息会被永久删除').click());
      await view.press(view.host.querySelector<HTMLButtonElement>('[data-storage-confirm]')!);
      expect(call.mock.calls[2]).toEqual([
        'storageMessagesCleanupConfirm',
        {
          before: (scope as { before: string }).before,
          channelIds: ['dm-ada', 'dm-text'],
          token: 'messages',
        },
        undefined,
      ]);
      expect(view.host.querySelector('[data-storage-result]')?.textContent).toBe(
        '已删除 12 条消息，释放 8.0 KB。',
      );
    } finally {
      view.dispose();
    }
  });
});
