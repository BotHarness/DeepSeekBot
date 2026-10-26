// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ChevronRightIcon: () => null,
}));

import type { HostClient } from '../src/host/client';
import type { BotInboxItem } from '../src/host/wire';
import { BotInboxScreen } from '../src/ui/chat/bot-inbox-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

const item = (id: string, extra: Partial<BotInboxItem> = {}): BotInboxItem => ({
  id,
  botSlug: 'ada',
  reason: 'group-mention',
  state: 'handled',
  createdAt: '2026-10-26T00:00:00.000Z',
  sourceKind: 'human-message',
  sourceChannelName: 'Team',
  summary: 'Summary ' + id,
  ...extra,
});

const rows = (view: HTMLElement) =>
  [...view.querySelectorAll('[data-testid^="bot-inbox-item-"]')].map((row) =>
    row.getAttribute('data-testid'),
  );

describe('Bot Inbox screen', () => {
  it('tags this message, shows its note first, and loads more history', async () => {
    const call = vi.fn(async (_method: string, args?: Record<string, unknown>) =>
      args?.['cursor'] === undefined
        ? {
            items: [
              item('older', { sourceMessageId: 'm0' }),
              item('this', {
                sourceMessageId: 'm1',
                state: 'ignored',
                resolutionNote: 'Already answered',
              }),
            ],
            nextCursor: 'page-2',
          }
        : { items: [item('oldest')] },
    );
    const view = await render(
      <BotInboxScreen
        client={{ call } as unknown as HostClient}
        slug="ada"
        botName="ADA"
        messageId="m1"
        missing={false}
      />,
    );
    expect(rows(view)).toEqual(['bot-inbox-item-this', 'bot-inbox-item-older']);
    const first = view.querySelector('[data-testid="bot-inbox-item-this"]');
    expect(first?.textContent).toContain(t.delivery.thisMessage);
    expect(first?.textContent).toContain(t.delivery.inboxState.ignored);
    expect(first?.textContent).toContain('Already answered');
    expect(view.textContent).not.toContain(t.delivery.notInInbox('ADA'));
    await act(async () =>
      view.querySelector<HTMLElement>('[data-testid="bot-inbox-load-more"]')?.click(),
    );
    expect(call).toHaveBeenLastCalledWith('botAttention', {
      slug: 'ada',
      limit: 30,
      cursor: 'page-2',
    });
    expect(rows(view)).toEqual([
      'bot-inbox-item-this',
      'bot-inbox-item-older',
      'bot-inbox-item-oldest',
    ]);
    expect(view.querySelector('[data-testid="bot-inbox-load-more"]')).toBeNull();
  });

  it('tags no row when opened without a message', async () => {
    const view = await render(
      <BotInboxScreen
        client={
          {
            call: vi.fn(async () => ({
              items: [item('loose'), item('linked', { sourceMessageId: 'm1' })],
            })),
          } as unknown as HostClient
        }
        slug="ada"
        botName="ADA"
        messageId={undefined}
        missing={false}
      />,
    );
    expect(rows(view)).toEqual(['bot-inbox-item-loose', 'bot-inbox-item-linked']);
    expect(view.textContent).not.toContain(t.delivery.thisMessage);
  });

  it('explains that a not-received Bot never got the message', async () => {
    const view = await render(
      <BotInboxScreen
        client={{ call: vi.fn(async () => ({ items: [] })) } as unknown as HostClient}
        slug="bea"
        botName="BEA"
        messageId="m1"
        missing
      />,
    );
    expect(view.textContent).toContain(t.delivery.notInInbox('BEA'));
    expect(view.textContent).toContain(t.delivery.empty);
  });
});
