// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { buttonNamed } from './primitive-mocks.js';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

vi.mock('../src/client/avatar.js', () => ({
  PersonaBotAvatar: (props: { name: string }) =>
    createElement('span', { 'data-avatar': props.name }, props.name),
}));

import {
  HIDDEN_CHANNEL_SEARCH_DEBOUNCE_MS,
  HiddenChannelsModal,
  deletedBotDmIds,
  hiddenChannelSequence,
} from '../src/client/hidden-channels.js';
import { zhTranslate } from '../src/client/locale.js';

const t = zhTranslate;
const AT = '2026-09-21T00:00:00.000Z';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function renderOverlayMarkup(node: ReactNode): string {
  act(() => root.render(node));
  return document.body.innerHTML;
}
function buttons(label: string): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].filter(
    (button) => button.textContent === label,
  );
}

it('debounces filtering without delaying the controlled input', () => {
  expect(HIDDEN_CHANNEL_SEARCH_DEBOUNCE_MS).toBe(180);
});

it('preserves explicit hide order when Channel updates reorder the live list', () => {
  const channel = (id: string, botSlug?: string) => ({
    id,
    type: (botSlug === undefined ? 'group' : 'dm') as 'group' | 'dm',
    name: id,
    members: [],
    ...(botSlug === undefined ? {} : { botSlug }),
    createdAt: AT,
    updatedAt: AT,
  });
  const hidden = [channel('hidden-first'), channel('hidden-second')];
  const botDm = {
    ...channel('dm-bots-ada-bea'),
    type: 'dm' as const,
    members: ['ada', 'bea'],
  };
  const latestFirst = [botDm, hidden[1]!, hidden[0]!];
  expect(
    hiddenChannelSequence(latestFirst, ['hidden-first', 'hidden-second', botDm.id]).map(
      (item) => item.id,
    ),
  ).toEqual(['hidden-first', 'hidden-second', botDm.id]);
  expect(
    hiddenChannelSequence(latestFirst, ['hidden-first', 'hidden-second']).map((item) => item.id),
  ).toEqual(['hidden-first', 'hidden-second', botDm.id]);
});

it('shows the newest implicit Bot DM first after the modal reverses its items', () => {
  const botDm = (id: string) => ({
    id,
    type: 'dm' as const,
    name: id,
    members: ['ada', 'bea'],
    createdAt: AT,
    updatedAt: AT,
  });
  const newest = botDm('dm-bots-new');
  const oldest = botDm('dm-bots-old');
  const sequence = hiddenChannelSequence([newest, oldest], []);
  expect(sequence.map((channel) => channel.id)).toEqual([oldest.id, newest.id]);
  expect([...sequence].reverse().map((channel) => channel.id)).toEqual([newest.id, oldest.id]);
});

it('does not classify malformed persisted DMs as Bot DMs', () => {
  const malformed = [[], ['ada'], ['ada', 'bea', 'cora']].map((members, index) => ({
    id: `malformed-${index}`,
    type: 'dm' as const,
    name: `Malformed ${index}`,
    members,
    createdAt: AT,
    updatedAt: AT,
  }));
  expect(hiddenChannelSequence(malformed, [])).toEqual([]);
  const markup = renderOverlayMarkup(
    createElement(HiddenChannelsModal, {
      t: t as never,
      onRestore: vi.fn(),
      onOpen: vi.fn(),
      onClose: vi.fn(),
      items: malformed.map((channel) => ({ channel })),
    }),
  );
  expect(markup).not.toContain('Bot 私聊 · 只读');
  expect(buttons('查看')).toHaveLength(0);
  expect(buttons('恢复')).toHaveLength(3);
});

describe('hidden Channels modal', () => {
  it('lists hidden DM and group Channels and restores the selected id', () => {
    const onRestore = vi.fn();
    const markup = renderOverlayMarkup(
      createElement(HiddenChannelsModal, {
        t: t as never,
        onRestore,
        onOpen: vi.fn(),
        onClose: vi.fn(),
        items: [
          {
            channel: {
              id: 'dm-ada',
              type: 'dm',
              name: 'Ada',
              members: ['ada'],
              botSlug: 'ada',
              createdAt: AT,
              updatedAt: AT,
            },
            bot: {
              slug: 'ada',
              displayName: 'Ada',
              roles: ['研究'],
              aggregateState: 'idle',
              workspaces: [],
              createdAt: AT,
            },
            activity: 'idle',
          },
          {
            channel: {
              id: 'group-team',
              type: 'group',
              name: 'Team',
              members: [],
              createdAt: AT,
              updatedAt: AT,
            },
          },
        ],
      }),
    );

    expect(markup).toContain('Ada');
    expect(markup).toContain('私聊 · 研究');
    expect(markup).toContain('Team');
    expect(markup).toContain('群聊');
    expect(document.querySelector('input')?.getAttribute('placeholder')).toBe('搜索隐藏的频道');
    const restore = buttonNamed('恢复');
    act(() => restore.click());
    expect(onRestore).toHaveBeenCalledWith('group-team');
  });

  it('offers a read-only view action for a Bot-to-Bot DM', () => {
    const onOpen = vi.fn();
    const onRestore = vi.fn();
    const markup = renderOverlayMarkup(
      createElement(HiddenChannelsModal, {
        t: t as never,
        onRestore,
        onOpen,
        onClose: vi.fn(),
        items: [
          {
            channel: {
              id: 'dm-bots-ada-bea',
              type: 'dm',
              name: 'Ada · Bea',
              members: ['ada', 'bea'],
              createdAt: AT,
              updatedAt: AT,
            },
          },
        ],
      }),
    );
    expect(markup).toContain('Bot 私聊 · 只读');
    const view = buttonNamed('查看');
    act(() => view.click());
    expect(onOpen).toHaveBeenCalledWith('dm-bots-ada-bea');
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('shows the most recently hidden Channel first', () => {
    const markup = renderOverlayMarkup(
      createElement(HiddenChannelsModal, {
        t: t as never,
        onRestore: vi.fn(),
        onOpen: vi.fn(),
        onClose: vi.fn(),
        items: [
          {
            channel: {
              id: 'group-older',
              type: 'group',
              name: 'Earlier hidden',
              members: [],
              createdAt: AT,
              updatedAt: AT,
            },
          },
          {
            channel: {
              id: 'group-newer',
              type: 'group',
              name: 'Recently hidden',
              members: [],
              createdAt: AT,
              updatedAt: AT,
            },
          },
        ],
      }),
    );

    expect(markup.indexOf('Recently hidden')).toBeLessThan(markup.indexOf('Earlier hidden'));
  });

  it('explains that there are no hidden Channels', () => {
    const markup = renderOverlayMarkup(
      createElement(HiddenChannelsModal, {
        items: [],
        t: t as never,
        onRestore: vi.fn(),
        onOpen: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    expect(markup).toContain('没有隐藏的频道');
    expect(markup).toContain('只读查看 Bot 之间的私聊');
  });
});

it('lists a deleted Bot DM as read-only history instead of a restorable Channel', () => {
  const bot = (slug: string, deleted?: boolean) => ({
    slug,
    displayName: slug,
    roles: [],
    aggregateState: 'idle' as const,
    workspaces: [],
    createdAt: AT,
    ...(deleted === true ? { deleted, paused: true } : {}),
  });
  const dm = (slug: string) => ({
    id: `dm-${slug}`,
    type: 'dm' as const,
    name: slug,
    members: [slug],
    botSlug: slug,
    createdAt: AT,
    updatedAt: AT,
  });
  const gone = bot('gone', true);
  const live = bot('live');
  const channels = [dm('live'), dm('gone')];
  expect(deletedBotDmIds(channels, [live, gone])).toEqual(['dm-gone']);
  expect(hiddenChannelSequence(channels, [], [live, gone]).map((item) => item.id)).toEqual([
    'dm-gone',
  ]);
  expect(hiddenChannelSequence(channels, ['dm-gone'], [live, gone]).map((item) => item.id)).toEqual(
    ['dm-gone'],
  );

  const onOpen = vi.fn();
  const markup = renderOverlayMarkup(
    createElement(HiddenChannelsModal, {
      t: t as never,
      onRestore: vi.fn(),
      onOpen,
      onClose: vi.fn(),
      items: [{ channel: dm('gone'), bot: gone }],
    }),
  );
  expect(markup).toContain('已删除的 Bot');
  expect(buttons('恢复')).toHaveLength(0);
  const view = buttonNamed('查看');
  act(() => view.click());
  expect(onOpen).toHaveBeenCalledWith('dm-gone');
});
