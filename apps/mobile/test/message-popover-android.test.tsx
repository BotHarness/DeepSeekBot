// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';

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
const { MENU_REACTIONS } = await import('../src/host/conversation');

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

function mount(target: Parameters<typeof MessageActions>[0]['target']) {
  const handlers = { onClose: vi.fn(), onReact: vi.fn(), onCopy: vi.fn(), onShareText: vi.fn() };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(MessageActions, { ...handlers, target })));
  return handlers;
}
const byLabel = (label: string) => host?.querySelector<HTMLElement>(`[aria-label="${label}"]`);

describe('Android message menu', () => {
  const target = { message: bot, anchor: { x: 16, y: 400, width: 200, height: 60 }, group: {} };

  it('anchors a reaction island and an action card to the tapped bubble', () => {
    mount({ ...target, group: { first: true, last: true } });
    expect(byLabel(t.reactions)?.querySelectorAll('[role="button"]')).toHaveLength(
      MENU_REACTIONS.length,
    );
    expect(byLabel(t.copy)).not.toBeNull();
    expect(byLabel(t.shareText)).not.toBeNull();
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
