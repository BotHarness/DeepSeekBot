import { describe, expect, it } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';
import { chatRows, separatorLabel } from '../src/ui/chat/message-groups';

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
