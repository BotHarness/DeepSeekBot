import { expect, it } from 'vitest';
import type { JournalEntry } from '@botharness/host-protocol/wire';
import { present, shownInChat } from '../src/conversation-timeline';

it('suppresses Session links on a purged Bot message while keeping the tombstone visible', () => {
  const entry: JournalEntry = {
    channelId: 'dm-ada',
    revision: 1,
    message: {
      id: 'message-1',
      author: { kind: 'bot', slug: 'ada' },
      at: '2026-11-22T00:00:00Z',
      body: '',
      sessionLinks: [{ sessionId: 'assignment-1', kind: 'created', title: 'Private task' }],
    },
  };
  const resolve = () => ({ uri: '', headers: {} });
  expect(present(entry, resolve, [], undefined).sessionLinks).toEqual(entry.message.sessionLinks);

  const purged = present(
    { ...entry, message: { ...entry.message, contentPurge: { actor: 'local-human' } } },
    resolve,
    [],
    undefined,
  );
  expect(purged.sessionLinks).toBeUndefined();
  expect(purged.source?.message.sessionLinks).toBeUndefined();
  expect(shownInChat(purged)).toBe(true);
});
