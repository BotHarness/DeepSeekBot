import { expect, it } from 'vitest';

import { replyAuthor } from '../src/ui/chat/reply-author';

const quote = (humanId: string | undefined, displayName: string) => ({
  author: { kind: 'human' as const, ...(humanId === undefined ? {} : { humanId }), displayName },
  body: 'hi',
});

it('names a quoted person by their current Group nickname, falling back to the quoted name', () => {
  const people = [{ humanId: 'mia', displayName: 'Professor' }];
  const name = (id: string) => id;
  expect(replyAuthor(quote('mia', 'Mia'), 'You', name, 'Member', people)).toBe('Professor');
  expect(replyAuthor(quote('leo', 'Leo'), 'You', name, 'Member', people)).toBe('Leo');
  expect(replyAuthor(quote(undefined, 'Mia'), 'You', name, 'Member', people)).toBe('You');
});
