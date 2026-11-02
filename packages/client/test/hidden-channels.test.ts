import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  buttons: [] as Array<Record<string, unknown>>,
  inputs: [] as Array<Record<string, unknown>>,
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: Record<string, unknown>) => {
    captured.buttons.push(props);
    return createElement('button', null, props['children'] as ReactNode);
  },
  Input: (props: Record<string, unknown>) => {
    captured.inputs.push(props);
    return createElement('input', {
      placeholder: props['placeholder'],
      value: props['value'],
      readOnly: true,
    });
  },
  Modal: (props: Record<string, unknown>) =>
    createElement(
      'section',
      null,
      createElement('h1', null, props['title'] as ReactNode),
      createElement('p', null, props['description'] as ReactNode),
      props['children'] as ReactNode,
      props['footer'] as ReactNode,
    ),
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

beforeEach(() => {
  captured.buttons.length = 0;
  captured.inputs.length = 0;
});

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
  const markup = renderToStaticMarkup(
    createElement(HiddenChannelsModal, {
      t: t as never,
      onRestore: vi.fn(),
      onOpen: vi.fn(),
      onClose: vi.fn(),
      items: malformed.map((channel) => ({ channel })),
    }),
  );
  expect(markup).not.toContain('Bot 私聊 · 只读');
  expect(captured.buttons.filter((button) => button['children'] === '查看')).toHaveLength(0);
  expect(captured.buttons.filter((button) => button['children'] === '恢复')).toHaveLength(3);
});

describe('hidden Channels modal', () => {
  it('lists hidden DM and group Channels and restores the selected id', () => {
    const onRestore = vi.fn();
    const markup = renderToStaticMarkup(
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
    expect(captured.inputs.at(-1)?.['placeholder']).toBe('搜索隐藏的频道');
    const restore = captured.buttons.find((button) => button['children'] === '恢复');
    (restore?.['onClick'] as (() => void) | undefined)?.();
    expect(onRestore).toHaveBeenCalledWith('group-team');
  });

  it('offers a read-only view action for a Bot-to-Bot DM', () => {
    const onOpen = vi.fn();
    const onRestore = vi.fn();
    const markup = renderToStaticMarkup(
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
    const view = captured.buttons.find((button) => button['children'] === '查看');
    (view?.['onClick'] as (() => void) | undefined)?.();
    expect(onOpen).toHaveBeenCalledWith('dm-bots-ada-bea');
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('shows the most recently hidden Channel first', () => {
    const markup = renderToStaticMarkup(
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
    const markup = renderToStaticMarkup(
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
  const markup = renderToStaticMarkup(
    createElement(HiddenChannelsModal, {
      t: t as never,
      onRestore: vi.fn(),
      onOpen,
      onClose: vi.fn(),
      items: [{ channel: dm('gone'), bot: gone }],
    }),
  );
  expect(markup).toContain('已删除的 Bot');
  expect(captured.buttons.filter((button) => button['children'] === '恢复')).toHaveLength(0);
  const view = captured.buttons.find((button) => button['children'] === '查看');
  (view!['onClick'] as () => void)();
  expect(onOpen).toHaveBeenCalledWith('dm-gone');
});
