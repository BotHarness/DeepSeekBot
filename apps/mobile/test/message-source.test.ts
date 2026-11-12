import { describe, expect, it } from 'vitest';
import type { ConversationMessage } from '../src/host/conversation';
import { messageSource } from '../src/ui/chat/message-source';
import { messageMenuActions, runAction } from '../src/ui/chat/message-sheet';

const message: ConversationMessage = {
  id: 'synthetic-source',
  at: '2026-11-12T00:00:00Z',
  author: 'bot',
  delivery: 'committed',
  attachments: [],
  body: '  # Heading\n\n```js\nconst answer = 42;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n',
};
const html = '<!doctype html><html><body><script>window.test = true;</script></body></html>';
const document = {
  version: 2,
  snapshotId: 'source-test',
  observedAt: message.at,
  title: 'Synthetic document',
  html,
} satisfies NonNullable<ConversationMessage['genuiDocument']>;

describe('message source copying', () => {
  it('preserves Markdown, code, tables and whitespace exactly', () => {
    expect(messageSource(message)).toBe(message.body);
  });
  it('exposes GenUI HTML as literal source alongside the original body', () => {
    expect(messageSource({ ...message, genuiDocument: document })).toBe(
      message.body + '\n\n' + html,
    );
    expect(messageSource({ ...message, body: '', genuiDocument: document })).toBe(html);
  });
  it('offers select-and-copy only for a supported message source', () => {
    const keys = (value: ConversationMessage, enabled: boolean) =>
      messageMenuActions(value, undefined, false, enabled).map((action) => action.key);
    expect(keys(message, true)).toEqual(['copy', 'select-copy', 'share']);
    expect(keys(message, false)).toEqual(['copy', 'share']);
    expect(keys({ ...message, body: '' }, true)).toEqual([]);
    expect(keys({ ...message, body: '', genuiDocument: document }, true)).toEqual(['select-copy']);
    expect(
      messageMenuActions(message, { label: 'Open', onOpen() {} }, false, true).some(
        (action) => action.key === 'select-copy',
      ),
    ).toBe(false);
  });
  it('opens the selected message without copying or sharing it', () => {
    const opened: ConversationMessage[] = [];
    runAction({ key: 'select-copy', label: 'Select and copy' }, message, {
      onSelectCopy: (value) => opened.push(value),
      onCopy: () => {
        throw Error('Unexpected clipboard write');
      },
      onShareText: () => {
        throw Error('Unexpected share');
      },
      onOpen() {},
    });
    expect(opened).toEqual([message]);
  });
});
