// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConversationMessage } from '@botharness/host-client/conversation';

vi.mock('react-native-svg', () => ({
  default: () => null,
  Path: () => null,
  SvgXml: () => null,
}));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Platform: {
      ...shim.Platform,
      OS: 'android',
      select: (options: Record<string, unknown>) => options['android'] ?? options['default'],
    },
  };
});
vi.mock('react-native-reanimated', async () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('../src/ui/chat/message-bubble', () => ({ BubbleBody: () => null }));
vi.mock('../src/ui/chat/message-attachment-picker', () => ({
  MessageAttachmentPicker: () => null,
}));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('../src/ui/shell/icons', () => ({
  ChevronRightIcon: () => null,
  CopyIcon: () => null,
  ShareIcon: () => null,
}));

const { MessageActions } = await import('../src/ui/chat/message-actions.android');
const { t } = await import('../src/ui/strings');
const { MENU_REACTIONS } = await import('@botharness/host-client/conversation');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const bot: ConversationMessage = {
  id: 'bot-1',
  revision: 3,
  at: '2026-10-14T08:00:00.000Z',
  author: 'bot',
  body: 'Which one first?',
  attachments: [],
  delivery: 'committed',
  reactions: [{ emoji: '🔥', actors: [{ kind: 'human', id: 'local-human' }] }],
};

function mount(
  target: Parameters<typeof MessageActions>[0]['target'],
  catalog?: Parameters<typeof MessageActions>[0]['catalog'],
) {
  const handlers = { onClose: vi.fn(), onReact: vi.fn(), onCopy: vi.fn(), onShareText: vi.fn() };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(MessageActions, { ...handlers, target, catalog })));
  return handlers;
}
const byLabel = (label: string) => host?.querySelector<HTMLElement>(`[aria-label="${label}"]`);

describe('Android message menu', () => {
  const target = {
    message: bot,
    anchor: { x: 16, y: 400, width: 200, height: 60 },
    group: { first: true, last: true },
  };

  it('anchors a reaction island and an action card to the tapped bubble', () => {
    mount(target);
    expect(byLabel(t.reactions)?.querySelectorAll('[role="button"]')).toHaveLength(
      MENU_REACTIONS.length,
    );
    expect(byLabel(t.copy)).not.toBeNull();
    expect(byLabel(t.shareText)).not.toBeNull();
  });

  it('shows a calendar date and time even when there are no action rows', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 13, 15));
    const at = new Date(2026, 10, 12, 9, 30);
    try {
      mount({
        ...target,
        message: { ...bot, at: at.toISOString(), body: '' },
      });
      expect(host?.querySelector('[data-testid="message-menu-time"]')?.textContent).toBe(
        new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(at),
      );
      expect(host?.querySelector('[data-testid="message-menu-turn-targets"]')).toBeNull();
      expect(byLabel(t.copy)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the localized execution path in the same header as the time', async () => {
    const { interfacePreferences } = await import('../src/ui/interface-preferences');
    interfacePreferences.setLanguage('zh');
    try {
      mount(
        {
          ...target,
          message: {
            ...bot,
            turnTargets: [
              { kind: 'engine', engine: 'codex', model: 'gpt-6.2-sol', reasoningEffort: 'low' },
            ],
          },
        },
        {
          engines: [
            {
              engine: 'codex',
              available: true,
              models: [{ id: 'gpt-6.2-sol', name: 'GPT-6.2-Sol', efforts: [] }],
            },
          ],
        },
      );
      const time = host?.querySelector('[data-testid="message-menu-time"]');
      const path = host?.querySelector('[data-testid="message-menu-turn-targets"]');
      expect(time?.textContent).toBeTruthy();
      expect(time?.nextElementSibling).toBe(path);
      expect(path?.textContent).toBe('GPT-6.2-Sol · 低');
      expect(path?.getAttribute('aria-label')).toBe('运行于 GPT-6.2-Sol · Codex · 低, 外部引擎');
    } finally {
      act(() => interfacePreferences.setLanguage('system'));
    }
  });

  it('toggles a reaction and closes', () => {
    const handlers = mount({ ...target, group: { first: true, last: true } });
    act(() => byLabel(t.unreact('🔥'))?.click());
    expect(handlers.onReact).toHaveBeenCalledWith(bot, '🔥', false);
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it('runs an action and closes', () => {
    const handlers = mount({ ...target, group: { first: true, last: true } });
    act(() => byLabel(t.copy)?.click());
    expect(handlers.onCopy).toHaveBeenCalledWith(bot.body);
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });
});
