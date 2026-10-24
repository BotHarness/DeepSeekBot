// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { ComposerDraftStore } from '../src/client/composer-draft-store.js';
import {
  clearConversationDrafts,
  suggestConversationDraft,
} from '../src/client/conversation-draft.js';
const scope = JSON.stringify(['host', 'profile', 'human', 'tob-dm']);
beforeEach(() => {
  localStorage.clear();
  clearConversationDrafts();
});
it('prefills an empty draft without adding a message or unrelated state', () => {
  expect(suggestConversationDraft(scope, 'Question')).toBe('filled');
  expect(new ComposerDraftStore(localStorage, 'reader').read(scope).draft.text).toBe('Question');
  expect(Object.keys(localStorage).every((key) => key.startsWith('botharness.composer.v1:'))).toBe(
    true,
  );
});
it('preserves existing text and structured content until an explicit append', () => {
  const writer = new ComposerDraftStore(localStorage, 'other');
  writer.update(scope, {
    text: '@Ada draft',
    mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
    reply: { id: 'reply', at: '', author: { kind: 'human' }, body: '' },
  });
  expect(suggestConversationDraft(scope, 'Question')).toBe('preserved');
  let reader = new ComposerDraftStore(localStorage, 'reader');
  expect(reader.read(scope).draft.text).toBe('@Ada draft');
  expect(suggestConversationDraft(scope, 'Question', true)).toBe('filled');
  reader = new ComposerDraftStore(localStorage, 'reader');
  expect(reader.read(scope).draft).toMatchObject({
    text: '@Ada draft\n\nQuestion',
    mentions: [{ botSlug: 'ada', start: 0, end: 4 }],
    reply: { id: 'reply' },
  });
});
it('does not consider a reply-only draft empty', () => {
  new ComposerDraftStore(localStorage, 'other').update(scope, {
    reply: { id: 'reply', at: '', author: { kind: 'human' }, body: '' },
  });
  expect(suggestConversationDraft(scope, 'Question')).toBe('preserved');
});
