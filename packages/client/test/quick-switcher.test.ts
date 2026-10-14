import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconSearchOutlineRegular: () => null,
  Input: (props: Record<string, unknown>) =>
    createElement('input', {
      role: props['role'],
      placeholder: props['placeholder'],
      value: props['value'],
      readOnly: true,
    }),
  ShortcutKeys: (props: { keys: readonly string[] }) =>
    createElement('kbd', null, props.keys.join(' ')),
  Modal: (props: Record<string, unknown>) =>
    createElement('section', { 'aria-label': props['title'] }, props['children'] as ReactNode),
}));

vi.mock('../src/client/avatar.js', () => ({
  PersonaBotAvatar: (props: { name: string }) =>
    createElement('span', { 'data-avatar': props.name }, props.name),
}));

import { QuickSwitcher } from '../src/client/quick-switcher.js';
import {
  quickSwitcherEntries,
  rankQuickSwitcher,
  type QuickSwitcherEntry,
} from '../src/client/quick-switcher-rank.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import type { BotSummary, ChannelSummary } from '../src/client/store.js';

function channel(
  id: string,
  options: Partial<ChannelSummary> & { at?: string } = {},
): ChannelSummary {
  const { at = '2026-10-01T00:00:00.000Z', ...rest } = options;
  return {
    id,
    type: 'group',
    name: id,
    members: [],
    createdAt: at,
    updatedAt: at,
    ...rest,
  };
}

function bot(slug: string, displayName: string, roles: string[] = []): BotSummary {
  return {
    slug,
    displayName,
    roles,
    aggregateState: 'idle',
    workspaces: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const bots = [bot('ada', 'Ada', ['reviewer']), bot('xiaoming', '小明助手', ['研究'])];
const channels = [
  channel('dm-ada', { type: 'dm', botSlug: 'ada', at: '2026-10-03T00:00:00.000Z' }),
  channel('dm-xiaoming', { type: 'dm', botSlug: 'xiaoming', at: '2026-10-01T00:00:00.000Z' }),
  channel('dm-ghost', { type: 'dm', botSlug: 'ghost' }),
  channel('g-launch', { name: 'Launch Plan', at: '2026-10-05T00:00:00.000Z' }),
  channel('g-design', { name: '设计 评审', at: '2026-10-02T00:00:00.000Z' }),
  channel('g-archive', { name: 'Old launch notes', at: '2026-10-09T00:00:00.000Z' }),
  channel('bot-dm', {
    type: 'dm',
    name: 'ada ↔ xiaoming',
    members: ['ada', 'xiaoming'],
    at: '2026-10-10T00:00:00.000Z',
  }),
  channel('human-dm', { type: 'dm', name: 'Human DM', members: ['me'] }),
];
const enTranslate = ((key: keyof typeof en) => en[key]) as BotHarnessTranslate;
const entries = quickSwitcherEntries(channels, bots, ['g-archive']);
const ids = (list: readonly QuickSwitcherEntry[]): string[] => list.map((e) => e.channel.id);

describe('quick switcher entries', () => {
  it('lists every sidebar row plus hidden channels and Bot-to-Bot DMs', () => {
    expect(ids(entries).sort()).toEqual(
      ['bot-dm', 'dm-ada', 'dm-xiaoming', 'g-archive', 'g-design', 'g-launch'].sort(),
    );
    const byId = new Map(entries.map((entry) => [entry.channel.id, entry]));
    expect(byId.get('dm-ada')?.name).toBe('Ada');
    expect(byId.get('g-archive')?.hidden).toBe(true);
    expect(byId.get('bot-dm')?.hidden).toBe(true);
    expect(byId.get('g-launch')?.hidden).toBe(false);
  });
});

describe('quick switcher ranking', () => {
  it('shows visible conversations by latest activity for an empty query', () => {
    expect(ids(rankQuickSwitcher(entries, '  '))).toEqual([
      'g-launch',
      'dm-ada',
      'g-design',
      'dm-xiaoming',
    ]);
    expect(ids(rankQuickSwitcher(entries, '', { recent: 2 }))).toEqual(['g-launch', 'dm-ada']);
  });

  it('uses latest message time ahead of the channel update time', () => {
    const withMessage = quickSwitcherEntries(
      [
        ...channels,
        channel('g-quiet', {
          at: '2026-01-01T00:00:00.000Z',
          latestMessage: { at: '2026-10-20T00:00:00.000Z' } as NonNullable<
            ChannelSummary['latestMessage']
          >,
        }),
      ],
      bots,
      [],
    );
    expect(ids(rankQuickSwitcher(withMessage, ''))[0]).toBe('g-quiet');
  });

  it('matches case-insensitive substrings and ranks prefix before inner matches', () => {
    expect(ids(rankQuickSwitcher(entries, 'LAUNCH'))).toEqual(['g-launch', 'g-archive']);
    expect(ids(rankQuickSwitcher(entries, 'plan'))).toEqual(['g-launch']);
    expect(ids(rankQuickSwitcher(entries, 'zzz'))).toEqual([]);
  });

  it('matches Chinese names and roles', () => {
    expect(ids(rankQuickSwitcher(entries, '小明'))).toEqual(['dm-xiaoming']);
    expect(ids(rankQuickSwitcher(entries, '评审'))).toEqual(['g-design']);
    expect(ids(rankQuickSwitcher(entries, '研究'))).toEqual(['dm-xiaoming']);
    expect(ids(rankQuickSwitcher(entries, 'review'))).toEqual(['dm-ada']);
  });

  it('ranks hidden conversations after every visible match', () => {
    expect(ids(rankQuickSwitcher(entries, 'ada'))).toEqual(['dm-ada', 'bot-dm']);
    const tied = quickSwitcherEntries(
      [
        channel('old', { name: 'Ops', at: '2026-01-01T00:00:00.000Z' }),
        channel('new', { name: 'Ops', at: '2026-10-01T00:00:00.000Z' }),
        channel('hidden-exact', { name: 'ops', at: '2026-12-01T00:00:00.000Z' }),
        channel('word', { name: 'Team ops', at: '2026-12-01T00:00:00.000Z' }),
        channel('inner', { name: 'Devops', at: '2026-12-01T00:00:00.000Z' }),
      ],
      [],
      ['hidden-exact'],
    );
    expect(ids(rankQuickSwitcher(tied, 'ops'))).toEqual([
      'new',
      'old',
      'word',
      'inner',
      'hidden-exact',
    ]);
  });
});

describe('quick switcher dialog', () => {
  const render = (list: readonly QuickSwitcherEntry[], mac = false, t = enTranslate): string =>
    renderToStaticMarkup(
      createElement(QuickSwitcher, {
        entries: list,
        bots: new Map(bots.map((value) => [value.slug, value])),
        activityOf: () => 'idle' as const,
        mac,
        t,
        onOpen: () => {},
        onClose: () => {},
      }),
    );

  it('lists recent conversations with avatars and highlights the first', () => {
    const html = render(entries);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('Recent');
    expect(html).toContain('data-avatar="Ada"');
    expect(html.indexOf('Launch Plan')).toBeLessThan(html.indexOf('Ada'));
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('Ctrl+K');
    expect(html).not.toContain('Old launch notes');
  });

  it('shows the platform shortcut and Chinese copy', () => {
    const html = render([], true, zhTranslate);
    expect(html).toContain('⌘K');
    expect(html).toContain('还没有会话');
  });
});
