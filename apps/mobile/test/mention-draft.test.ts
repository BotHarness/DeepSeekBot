import { describe, expect, it } from 'vitest';

import type { RosterBot } from '../src/host/client';
import {
  activeMentionQuery,
  chooseMention,
  mentionCandidates,
  submittedMessage,
  type SelectedMention,
} from '../src/ui/chat/mention-draft';

const bot = (slug: string, displayName: string, paused = false): RosterBot => ({
  slug,
  displayName,
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused,
});

const members = [bot('ada', 'Ada'), bot('xiaoming', '小明'), bot('grace', 'Grace', true)];
const preview = {
  revision: 'a'.repeat(64),
  recipients: [
    { botSlug: 'ada', label: 'Ada' },
    { botSlug: 'xiaoming', label: '小明' },
  ],
};
const all = { label: 'All Bots', preview };

describe('group Channel mentions', () => {
  it('offers active member Bots and All Bots while the Human types after @', () => {
    const query = activeMentionQuery('hi @', 4, []);
    const names = mentionCandidates(members, query, [], all).map((item) =>
      item.kind === 'bot' ? item.bot.slug : item.label,
    );
    expect(names).toEqual(['All Bots', 'ada', 'xiaoming']);
    const narrowed = mentionCandidates(members, activeMentionQuery('hi @小', 5, []), [], all);
    expect(narrowed.map((item) => (item.kind === 'bot' ? item.bot.slug : 'all'))).toEqual([
      'xiaoming',
    ]);
    expect(mentionCandidates(members, activeMentionQuery('mail a@b', 8, []), [], all)).toEqual([]);
  });

  it('inserts the chosen Bot as a token and sends it with offsets in the trimmed body', () => {
    const query = activeMentionQuery('  hey @a', 8, [])!;
    const chosen = chooseMention('  hey @a', [], query, { kind: 'bot', bot: members[0]! });
    expect(chosen.value).toBe('  hey @Ada ');
    expect(chosen.caret).toBe(11);
    const sent = submittedMessage(chosen.value + 'look', chosen.mentions);
    expect(sent.body).toBe('hey @Ada look');
    expect(sent.tags).toEqual({ mentions: [{ botSlug: 'ada', label: 'Ada', start: 4, end: 8 }] });
  });

  it('sends All Bots as its own selection with the previewed recipients', () => {
    const query = activeMentionQuery('@', 1, [])!;
    const chosen = chooseMention('@', [], query, { kind: 'all', label: 'All Bots', preview });
    expect(chosen.value).toBe('@All Bots ');
    const sent = submittedMessage(chosen.value + 'standup', chosen.mentions);
    expect(sent.tags).toEqual({
      allBotMention: { start: 0, end: 9, label: 'All Bots', preview },
    });
    expect(
      mentionCandidates(
        members,
        activeMentionQuery('@All Bots @', 11, chosen.mentions),
        chosen.mentions,
        all,
      ).some((item) => item.kind === 'all'),
    ).toBe(false);
  });

  it('drops a token the Human edited away', () => {
    const stale: SelectedMention[] = [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }];
    expect(submittedMessage('@Ad hi', stale).tags).toEqual({});
  });
});
