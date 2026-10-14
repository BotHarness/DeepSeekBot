// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return dialogPrimitives();
});
vi.mock('../src/client/messaging-help.js', () => ({
  MessagingHelp: ({ text }: { text: string }) =>
    createElement('button', { type: 'button', title: text }, 'info'),
}));
import { ChannelHistory } from '../src/client/channel-history.js';
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';
import { zhTranslate } from '../src/client/locale.js';
import { buttonNamed, dialog } from './primitive-mocks.js';

async function fixture() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  const actions = {
    ...createActions(async () => ({ ok: true, value: {} }), createStore()),
    channelHistory: vi.fn(async () => [
      { id: 'group-qa', name: 'Synthetic QA', deletedAt: '2026-10-08T00:00:00.000Z' },
    ]),
    channelHistorySources: vi.fn(async () => ({
      sources: [
        {
          sourceEventId: 'source-qa',
          messageId: 'msg-qa',
          at: '2026-10-08T00:00:00.000Z',
          body: 'synthetic-only',
        },
      ],
    })),
    channelPurgePreview: vi.fn(async () => ({
      token: 'reviewed',
      expiresAt: '2026-10-08T00:05:00.000Z',
      channelId: 'group-qa',
      sourceEventIds: ['source-qa'],
      placements: [{ channelId: 'group-qa', name: 'Synthetic QA', messageId: 'msg-qa' }],
      admissions: [],
      files: [],
      effects: [],
      derivatives: [],
    })),
    channelPurgeConfirm: vi.fn(async () => {
      throw new Error('Scope changed; review again');
    }),
  };
  await act(async () =>
    root.render(createElement(ChannelHistory, { actions, t: zhTranslate, onClose })),
  );
  const click = async (label: string) => {
    const button = buttonNamed(label, host);
    await act(async () => button.click());
  };
  const source = () => {
    const input = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (input === null) throw new Error('No source checkbox');
    return input;
  };
  return {
    host,
    actions,
    onClose,
    click,
    source,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
describe('ended Channel history consent', () => {
  it('lists ended Channels and keeps preview unavailable until a source is chosen', async () => {
    const f = await fixture();
    try {
      expect(dialog().getAttribute('aria-label')).toBe('已结束会话的历史');
      expect(f.host.querySelector('[data-history-channel-id="group-qa"]')?.textContent).toContain(
        'Synthetic QA',
      );
      expect(() => buttonNamed('预览内容清除范围')).toThrow();
      await f.click('查看历史');
      expect(f.actions.channelHistorySources).toHaveBeenCalledWith('group-qa', undefined);
      expect(buttonNamed('预览内容清除范围').disabled).toBe(true);
      await f.click('返回已结束会话');
      expect(f.host.querySelector('[data-history-channel-id="group-qa"]')).not.toBeNull();
      await f.click('关闭');
      expect(f.onClose).toHaveBeenCalledTimes(1);
    } finally {
      await f.dispose();
    }
  });
  it('requires separate source selection and preview, and cancelling never confirms', async () => {
    const f = await fixture();
    try {
      await f.click('查看历史');
      expect(f.source().checked).toBe(false);
      await act(async () => f.source().click());
      await f.click('预览内容清除范围');
      expect(f.actions.channelPurgePreview).toHaveBeenCalledWith('group-qa', ['source-qa']);
      expect(f.host.textContent).not.toContain('DSH Session');
      expect(
        [...f.host.querySelectorAll('button')].some((button) =>
          button.title.includes('DSH Session'),
        ),
      ).toBe(true);
      expect(f.host.textContent).toContain('无法撤销');
      expect(f.host.textContent).not.toContain('msg-qa');
      await f.click('取消');
      expect(f.actions.channelPurgeConfirm).not.toHaveBeenCalled();
      expect(f.onClose).not.toHaveBeenCalled();
      expect(f.host.textContent).toContain('synthetic-only');
      await act(async () => f.source().click());
      await f.click('预览内容清除范围');
      const close = f.host.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!;
      await act(async () => close.click());
      expect(f.onClose).toHaveBeenCalledTimes(1);
      expect(f.actions.channelPurgeConfirm).not.toHaveBeenCalled();
    } finally {
      await f.dispose();
    }
  });
  it('submits the reviewed scope and discards a stale preview after Host rejection', async () => {
    const f = await fixture();
    try {
      await f.click('查看历史');
      await act(async () => f.source().click());
      await f.click('预览内容清除范围');
      await f.click('确认永久清除所选正文');
      expect(f.actions.channelPurgeConfirm).toHaveBeenCalledWith(
        'group-qa',
        ['source-qa'],
        'reviewed',
      );
      expect(f.host.querySelector('[role=alert]')?.textContent).toBe('Scope changed; review again');
      expect(f.host.textContent).not.toContain('确认永久清除所选正文');
    } finally {
      await f.dispose();
    }
  });
  it('reports a completed purge after the Host confirms', async () => {
    const f = await fixture();
    f.actions.channelPurgeConfirm.mockImplementationOnce(async () => undefined as never);
    try {
      await f.click('查看历史');
      await act(async () => f.source().click());
      await f.click('预览内容清除范围');
      const form = dialog().querySelector('form');
      await act(async () => form?.requestSubmit());
      expect(f.actions.channelPurgeConfirm).toHaveBeenCalledTimes(1);
      expect(f.host.querySelector('[role=status]')?.textContent).toBe(
        zhTranslate('purge.complete'),
      );
    } finally {
      await f.dispose();
    }
  });
});
