import { describe, expect, it } from 'vitest';
import {
  mentionMarkdownBody,
  leadingMessageMentions,
  messageMentionRuns,
  mentionIdentity,
} from '../src/ui/chat/message-mentions';

const mention = { botSlug: 'xiaoman-id', label: '小满', start: 0, end: 3 };

describe('native message mentions', () => {
  it('keeps a CRLF first paragraph and its following Markdown without duplicating text', () => {
    const body = 'first\r\ncontinued\r\n\r\nsecond';
    const rendered = mentionMarkdownBody(body, false)!;
    expect(rendered.first.raw + rendered.rest).toBe('first\ncontinued\n\nsecond');
  });
  it('retains strong text and reference links while leaving lists and code blocks on the existing renderer', () => {
    const rendered = mentionMarkdownBody(
      '**Ready** [doc][ref]\n\n- item\n\n```ts\nconst x = 1\n```\n\n[ref]: https://example.com',
      false,
    )!;
    expect(rendered.first.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'strong', text: 'Ready' }),
        expect.objectContaining({ type: 'link', href: 'https://example.com' }),
      ]),
    );
    expect(rendered.rest).toContain('- item\n\n```ts\nconst x = 1\n```');
    expect(mentionMarkdownBody('```ts\nconst x = 1\n```', false)).toBeUndefined();
    expect(mentionMarkdownBody('Hello **there', true)?.first.tokens).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'strong', text: 'there' })]),
    );
  });
  it('keeps Markdown intact after canonical leading mentions, matching Web', () => {
    expect(leadingMessageMentions('@小满 **改一版**\n\n- 先列事实', [mention])).toEqual({
      mentions: [mention],
      text: '**改一版**\n\n- 先列事实',
    });
    const second = { botSlug: 'work-id', label: '阿衡', start: 4, end: 7 };
    expect(leadingMessageMentions('@小满 @阿衡 正文', [second, mention])?.text).toBe('正文');
    expect(leadingMessageMentions('@小满', [mention])?.text).toBe('');
  });

  it('resolves a renamed identity by ID and never retargets an unknown ID by label', () => {
    const sameName = { slug: 'other-id', displayName: '小满' };
    const renamed = { slug: mention.botSlug, displayName: '林小满' };
    expect(mentionIdentity(mention, [sameName, renamed])).toEqual({
      label: '林小满',
      bot: renamed,
    });
    expect(mentionIdentity(mention, [sameName])).toEqual({ label: '小满', bot: undefined });
  });

  it('preserves text around inline mentions and does not infer literal @ text', () => {
    const inline = { ...mention, start: 3, end: 6 };
    expect(messageMentionRuns('请找 @小满 看看', [inline])).toEqual([
      { text: '请找 ' },
      { text: '@小满', mention: inline },
      { text: ' 看看' },
    ]);
    expect(messageMentionRuns('@小满 看看')).toEqual([{ text: '@小满 看看' }]);
    expect(leadingMessageMentions('请找 @小满 看看', [inline])).toBeUndefined();
  });

  it('does not consume text for stale, overlapping, out-of-bounds or fractional ranges', () => {
    const bad = [
      { ...mention, label: '别人' },
      { ...mention, start: -1 },
      { ...mention, end: 300 },
      { ...mention, start: 0.5 },
    ];
    for (const invalid of bad) {
      expect(messageMentionRuns('@小满 hi', [invalid])).toEqual([{ text: '@小满 hi' }]);
      expect(leadingMessageMentions('@小满 hi', [invalid])).toBeUndefined();
    }
    expect(
      messageMentionRuns('@小满 hi', [mention, mention])
        .map((run) => run.text)
        .join(''),
    ).toBe('@小满 hi');
    expect(leadingMessageMentions('@小满 hi', [mention, mention])).toBeUndefined();
    expect(leadingMessageMentions('@小满', [{ ...mention, end: 300 }])).toBeUndefined();
  });
});
