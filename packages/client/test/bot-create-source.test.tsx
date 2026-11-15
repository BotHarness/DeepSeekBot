// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return dialogPrimitives();
});

import { BotCreateSourceModal, BotCreateSteps } from '../src/client/bot-create-source.js';
import { zhTranslate as t } from '../src/client/locale.js';

describe('Bot creation method dialog', () => {
  it('offers three cards that continue with the selected source', async () => {
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const onSelect = vi.fn();
    try {
      await act(() =>
        root.render(
          createElement(BotCreateSourceModal, {
            t,
            member: false,
            localImports: true,
            onSelect,
            onClose: vi.fn(),
          }),
        ),
      );
      const cards = node.querySelectorAll<HTMLButtonElement>('.bh-card-list button');
      expect(cards).toHaveLength(3);
      for (const card of cards) await act(() => card.click());
      expect(onSelect.mock.calls).toEqual([['empty'], ['git'], ['zip']]);
      expect(node.querySelector('[aria-current="step"]')?.textContent).toContain('选择方式');
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  });

  it('disables remote zip import and keeps member import restrictions', async () => {
    const node = document.createElement('div');
    const root = createRoot(node);
    const onSelect = vi.fn();
    try {
      const render = (member: boolean) =>
        act(() =>
          root.render(
            createElement(BotCreateSourceModal, {
              t,
              member,
              localImports: false,
              onSelect,
              onClose: vi.fn(),
            }),
          ),
        );
      await render(false);
      const zip = node.querySelectorAll<HTMLButtonElement>('.bh-card-list button')[2]!;
      expect(zip.disabled).toBe(true);
      await act(() => zip.click());
      expect(onSelect).not.toHaveBeenCalled();
      expect(zip.textContent).toContain('切换到本机后使用');
      await render(true);
      expect(node.querySelectorAll('.bh-card-list button')).toHaveLength(1);
    } finally {
      await act(() => root.unmount());
    }
  });

  it('allows going back until submission locks the steps', async () => {
    const node = document.createElement('div');
    const root = createRoot(node);
    const onBack = vi.fn();
    try {
      await act(() => root.render(createElement(BotCreateSteps, { t, onBack })));
      expect(node.querySelector('[aria-current="step"]')?.textContent).toContain('填写信息');
      await act(() => node.querySelector('button')!.click());
      expect(onBack).toHaveBeenCalledOnce();
      await act(() => root.render(createElement(BotCreateSteps, { t, onBack, disabled: true })));
      await act(() => node.querySelector('button')!.click());
      expect(onBack).toHaveBeenCalledOnce();
    } finally {
      await act(() => root.unmount());
    }
  });
});
