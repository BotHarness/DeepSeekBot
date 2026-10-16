import { describe, expect, it } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';
import { chatRows, messageGroups, separatorLabel } from '../src/ui/chat/message-groups';

const message = (
  id: string,
  at: string,
  author: ConversationMessage['author'] = 'bot',
): ConversationMessage => ({
  id,
  at: `2026-10-14T${at}:00.000Z`,
  author,
  body: id,
  attachments: [],
  delivery: 'committed',
});

const shape = (rows: ReturnType<typeof chatRows>) =>
  rows.map((row) =>
    row.kind === 'separator' ? '|' : `${row.key}${row.first ? '^' : ''}${row.last ? '$' : ''}`,
  );

describe('chat message groups', () => {
  it('folds consecutive same-day posts to one destination and keeps activity out of bubbles', () => {
    const post = (
      id: string,
      at: string,
      bot = 'ada',
      channelId = 'research',
    ): ConversationMessage => ({
      ...message(id, at),
      bot,
      activity: { kind: 'channel-post', channelId, messageId: `target-${id}`, preview: id },
    });
    const rows = chatRows([
      { ...message('reply', '09:00'), bot: 'ada' },
      post('a', '09:01'),
      post('b', '10:00'),
      post('c', '10:01', 'bob'),
      post('d', '10:02', 'bob', 'launch'),
      message('human', '10:03', 'human'),
      post('e', '10:04'),
      { ...post('next-day', '10:05'), at: '2026-10-16T10:05:00.000Z' },
    ]);
    expect(shape(rows)).toEqual([
      '|',
      'reply^$',
      'b^$',
      'c^$',
      'd^$',
      'human^$',
      'e^$',
      '|',
      'next-day^$',
    ]);
    expect(rows[2]).toMatchObject({
      key: 'b',
      activityCount: 2,
      message: { activity: { messageId: 'target-b', preview: 'b' } },
    });
  });
  it('starts a new group when another Bot speaks in a group Channel', () => {
    const by = (id: string, at: string, bot: string): ConversationMessage => ({
      ...message(id, at),
      bot,
    });
    expect(
      shape(
        chatRows([by('a', '09:00', 'ada'), by('b', '09:01', 'ada'), by('c', '09:02', 'grace')]),
      ),
    ).toEqual(['|', 'a^', 'b$', 'c^$']);
  });

  it('keys every message row by the first message of its group', () => {
    const by = (id: string, at: string, bot: string): ConversationMessage => ({
      ...message(id, at),
      bot,
    });
    expect(
      messageGroups(
        chatRows([by('a', '09:00', 'ada'), by('b', '09:01', 'ada'), by('c', '09:02', 'grace')]),
      ),
    ).toEqual([
      { key: 'a', group: 'a' },
      { key: 'b', group: 'a' },
      { key: 'c', group: 'c' },
    ]);
  });

  it('groups one author within 5 minutes and starts with a time separator', () => {
    expect(
      shape(
        chatRows([
          message('a', '09:00'),
          message('b', '09:04'),
          message('c', '09:10'),
          message('d', '09:11', 'human'),
          message('e', '09:12', 'human'),
        ]),
      ),
    ).toEqual(['|', 'a^', 'b$', 'c^$', 'd^', 'e$']);
  });

  it('puts a separator after a 30-minute gap and never groups system notes', () => {
    expect(
      shape(
        chatRows([
          message('a', '09:00'),
          message('b', '09:30'),
          message('s', '09:31', 'system'),
          message('c', '09:31'),
        ]),
      ),
    ).toEqual(['|', 'a^$', '|', 'b^$', 's^$', 'c^$']);
  });

  it('keeps a standalone row, such as an open request card, out of the groups around it', () => {
    expect(
      shape(
        chatRows(
          [
            message('a', '09:00'),
            message('card', '09:01'),
            message('b', '09:02'),
            message('c', '09:03'),
          ],
          (row) => row.id === 'card',
        ),
      ),
    ).toEqual(['|', 'a^$', 'card^$', 'b^', 'c$']);
  });

  it('labels a separator with the time today, "yesterday", or the date', () => {
    const now = new Date('2026-10-14T12:00:00');
    const at = (day: number) => new Date(`2026-10-${day}T09:05:00`).toISOString();
    expect(separatorLabel(at(14), now, 'Yesterday', 'en-GB')).toMatch(/^0?9:05$/);
    expect(separatorLabel(at(13), now, 'Yesterday', 'en-GB')).toMatch(/^Yesterday 0?9:05$/);
    expect(separatorLabel(at(10), now, 'Yesterday', 'en-GB')).toMatch(/^10 Oct 0?9:05$/);
  });
});
