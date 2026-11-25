// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return { ...(await import('./primitive-mocks.js')).shellPrimitives(), ...dialogPrimitives() };
});

import { BotCreateSourceModal, BotCreateSteps } from '../src/client/bot-create-source.js';
import { zhTranslate as t } from '../src/client/locale.js';

describe('Bot creation method dialog', () => {
  it('offers four cards that continue with the selected source', async () => {
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
      const cards = document.body.querySelectorAll<HTMLButtonElement>(
        '[data-list-card] [data-bot-create-source] button',
      );
      expect(cards).toHaveLength(4);
      for (const card of cards) await act(() => card.click());
      expect(onSelect.mock.calls).toEqual([['empty'], ['sessions'], ['git'], ['zip']]);
      expect(document.body.querySelector('[aria-current="step"]')?.textContent).toContain(
        '选择方式',
      );
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  });

  it('disables remote Session and zip import and keeps member import restrictions', async () => {
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
      const cards = document.body.querySelectorAll<HTMLButtonElement>(
        '[data-bot-create-source] button',
      );
      const sessions = cards[1]!;
      const zip = cards[3]!;
      expect(sessions.disabled).toBe(true);
      expect(zip.disabled).toBe(true);
      await act(() => sessions.click());
      await act(() => zip.click());
      expect(onSelect).not.toHaveBeenCalled();
      expect(zip.closest('li')?.textContent).toContain('切换到本机后使用');
      await render(true);
      expect(document.body.querySelectorAll('[data-bot-create-source] button')).toHaveLength(1);
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
