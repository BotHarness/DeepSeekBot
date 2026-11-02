import { describe, expect, it } from 'vitest';

import { sameBotsBesidesActivity, sameConversationBots } from '../src/client/conversation-bots.js';
import type { BotSummary, ChannelSummary, ClientState } from '../src/client/store.js';

const AT = '2026-10-21T00:00:00Z';
const bot = (slug: string, patch: Partial<BotSummary> = {}): BotSummary => ({
  slug,
  displayName: slug.toUpperCase(),
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: AT,
  ...patch,
});
const working = (item: BotSummary): BotSummary => ({
  ...item,
  aggregateState: 'working',
  activity: {
    effect: 'executing',
    toolKind: 'execute',
    publicDetail: 'step',
    startedAt: 1,
    activeToolCount: 1,
  } as never,
});
const channel = (patch: Partial<ChannelSummary>): ChannelSummary => ({
  id: 'c',
  type: 'group',
  name: 'Crew',
  members: [],
  createdAt: AT,
  updatedAt: AT,
  ...patch,
});
const shown = (
  selection: ClientState['selection'],
  open: ChannelSummary | undefined,
  authors: string[] = [],
  drafts: string[] = [],
): Pick<ClientState, 'selection' | 'conversation'> => ({
  selection,
  conversation: {
    channel: open,
    messages: authors.map((slug, index) => ({
      id: 'm' + index,
      at: AT,
      author: { kind: 'bot', slug },
      body: 'hi',
    })),
    drafts: drafts.map((slug) => ({
      channelId: 'c',
      draftId: 'd' + slug,
      attemptId: 'a',
      revision: 1,
      botSlug: slug,
      body: '',
    })),
  } as unknown as ClientState['conversation'],
});
const roster = [bot('ada'), bot('bob'), bot('cy'), bot('dee')];
const withChange = (slug: string, change: (item: BotSummary) => BotSummary) =>
  roster.map((item) => (item.slug === slug ? change(item) : item));

describe('sameConversationBots', () => {
  const group = shown({ kind: 'channel', channelId: 'c' }, channel({ members: ['ada', 'bob'] }));

  it('ignores Activity from a Bot outside the open Channel', () => {
    expect(sameConversationBots(roster, withChange('cy', working), group)).toBe(true);
  });

  it('updates for a group member, the DM Bot, a selected Bot, an author and a streaming Bot', () => {
    expect(sameConversationBots(roster, withChange('bob', working), group)).toBe(false);
    const dm = shown(
      { kind: 'channel', channelId: 'c' },
      channel({ type: 'dm', members: [], botSlug: 'cy' }),
    );
    expect(sameConversationBots(roster, withChange('cy', working), dm)).toBe(false);
    const profile = shown({ kind: 'bot', slug: 'dee' }, undefined);
    expect(sameConversationBots(roster, withChange('dee', working), profile)).toBe(false);
    const authored = shown(
      { kind: 'channel', channelId: 'c' },
      channel({ members: ['ada'] }),
      ['cy'],
      ['dee'],
    );
    expect(sameConversationBots(roster, withChange('cy', working), authored)).toBe(false);
    expect(sameConversationBots(roster, withChange('dee', working), authored)).toBe(false);
  });

  it('updates for any Bot name or avatar change, and for roster changes', () => {
    const renamed = withChange('cy', (item) => ({
      ...item,
      displayName: 'Cyrus',
    }));
    expect(sameConversationBots(roster, renamed, group)).toBe(false);
    const avatar = withChange('cy', (item) => ({ ...item, avatar: 'cy.png' }));
    expect(sameConversationBots(roster, avatar, group)).toBe(false);
    expect(sameConversationBots(roster, roster.slice(1), group)).toBe(false);
    expect(sameConversationBots(roster, [...roster].reverse(), group)).toBe(false);
  });
});

describe('sameBotsBesidesActivity', () => {
  it('ignores every Activity change but keeps names and avatars', () => {
    expect(sameBotsBesidesActivity(roster, withChange('ada', working))).toBe(true);
    expect(
      sameBotsBesidesActivity(
        roster,
        withChange('ada', (item) => ({ ...item, displayName: 'Ava' })),
      ),
    ).toBe(false);
  });
});
