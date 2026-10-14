import { describe, expect, it } from 'vitest';

import {
  looksLikeMarkdown,
  preserveHumanLineBreaks,
  rendersHumanMarkdown,
} from '../src/client/human-markdown.js';
import type { ChannelMessage } from '../src/client/store.js';

function human(body: string, patch: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'm1',
    at: '2026-10-14T00:00:00.000Z',
    author: { kind: 'human' },
    body,
    ...patch,
  } as ChannelMessage;
}

describe('human Markdown messages', () => {
  it('recognizes clear Markdown and leaves casual text alone', () => {
    expect(looksLikeMarkdown('```ts\nconst a = 1;\n```')).toBe(true);
    expect(looksLikeMarkdown('run `pnpm test` please')).toBe(true);
    expect(looksLikeMarkdown('this is **important**')).toBe(true);
    expect(looksLikeMarkdown('todo:\n- buy milk\n- call mom')).toBe(true);
    expect(looksLikeMarkdown('## Plan')).toBe(true);
    expect(looksLikeMarkdown('see [docs](https://example.com)')).toBe(true);
    expect(looksLikeMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(true);

    expect(looksLikeMarkdown('hello there')).toBe(false);
    expect(looksLikeMarkdown('2*3*4 = 24')).toBe(false);
    expect(looksLikeMarkdown('#hashtag and -1 points')).toBe(false);
  });

  it('keeps typed single line breaks outside code fences', () => {
    expect(preserveHumanLineBreaks('one\ntwo\n\nthree')).toBe('one  \ntwo\n\nthree');
    expect(preserveHumanLineBreaks('```\na\nb\n```\nafter')).toBe('```\na\nb\n```\nafter');
  });

  it('renders only human messages whose badges survive Markdown', () => {
    expect(rendersHumanMarkdown(human('**bold**'))).toBe(true);
    expect(rendersHumanMarkdown(human('plain words'))).toBe(false);
    expect(rendersHumanMarkdown(human('**bold**', { format: 'text' }))).toBe(false);
    expect(
      rendersHumanMarkdown({
        ...human('**bold**'),
        author: { kind: 'bot', botSlug: 'a' },
      } as never),
    ).toBe(false);
    expect(
      rendersHumanMarkdown(
        human('@Ada **look**', {
          mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
        } as never),
      ),
    ).toBe(true);
    expect(
      rendersHumanMarkdown(
        human('**look** @Ada', {
          mentions: [{ botSlug: 'ada', label: 'Ada', start: 9, end: 13 }],
        } as never),
      ),
    ).toBe(false);
    expect(
      rendersHumanMarkdown(
        human('**see** #ops', {
          channelRefs: [{ channelId: 'c', label: 'ops', start: 8, end: 12 }],
        } as never),
      ),
    ).toBe(false);
    expect(rendersHumanMarkdown(human('**see** [a.png](attachment:abc)'))).toBe(false);
  });
});
