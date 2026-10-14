import { describe, expect, it } from 'vitest';

import {
  activeMentionQuery,
  deleteSelectedMention,
  mentionRuns,
  rebaseMentions,
  selectMention,
  sessionBotReference,
} from '../src/client/mentions.js';

describe('selected Channel mentions', () => {
  it('keeps stable identities through unrelated edits and drops an edited token', () => {
    const first = selectMention('@Al', [], { start: 0, end: 3, query: 'Al' }, 'ada', 'Alex');
    expect(first).toEqual({
      value: '@Alex ',
      mentions: [{ botSlug: 'ada', label: 'Alex', start: 0, end: 5 }],
      caret: 6,
    });
    const second = selectMention(
      '@Alex @Al',
      first.mentions,
      { start: 6, end: 9, query: 'Al' },
      'bea',
      'Alex',
    );
    expect(second.mentions.map((item) => item.botSlug)).toEqual(['ada', 'bea']);
    expect(rebaseMentions(second.value, 'Please ' + second.value, second.mentions)).toEqual(
      second.mentions.map((item) => ({
        ...item,
        start: item.start + 7,
        end: item.end + 7,
      })),
    );
    expect(rebaseMentions(second.value, '@Aex @Alex ', second.mentions)).toEqual([
      { ...second.mentions[1]!, start: 5, end: 10 },
    ]);
  });

  it('renders only selected identities and deletes each token atomically', () => {
    const mentions = [
      { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
      { botSlug: 'bea', label: 'Bea', start: 12, end: 16 },
    ];
    const value = '@Ada please @Bea reply';
    expect(mentionRuns(value, mentions).map((run) => [run.text, run.mention?.botSlug])).toEqual([
      ['@Ada', 'ada'],
      [' please ', undefined],
      ['@Bea', 'bea'],
      [' reply', undefined],
    ]);
    expect(deleteSelectedMention(value, mentions, 5, 5, 'Backspace')).toEqual({
      value: 'please @Bea reply',
      mentions: [{ ...mentions[1]!, start: 7, end: 11 }],
      caret: 0,
    });
    expect(deleteSelectedMention(value, mentions, 12, 12, 'Delete')).toEqual({
      value: '@Ada please reply',
      mentions: [mentions[0]],
      caret: 12,
    });
    expect(deleteSelectedMention(value, mentions, 6, 6, 'Backspace')).toBeUndefined();
    expect(mentionRuns('@Ada plain', [{ ...mentions[0]!, label: 'Bea' }])).toEqual([
      { text: '@Ada plain' },
    ]);
  });

  it('serializes native Session Bot references without the file-mention token shape', () => {
    expect(sessionBotReference('ada')).toBe('\u2060@ada');
  });

  it('opens the picker after CJK text and punctuation but not inside an email address', () => {
    const first = [{ botSlug: 'lead', label: '主管', start: 0, end: 3 }];
    expect(activeMentionQuery('@主管 你吃饭。@', 9, first)).toEqual({
      start: 8,
      end: 9,
      query: '',
    });
    expect(activeMentionQuery('@主管 你吃饭。@画', 10, first)).toEqual({
      start: 8,
      end: 10,
      query: '画',
    });
    expect(activeMentionQuery('请@主管', 4, [])).toEqual({ start: 1, end: 4, query: '主管' });
    expect(activeMentionQuery('mail ada@example', 16, [])).toBeUndefined();
  });

  it('does not turn typed or pasted names into selected identities', () => {
    expect(activeMentionQuery('@Ada', 4, [])).toEqual({ start: 0, end: 4, query: 'Ada' });
    expect(
      activeMentionQuery('@Ada ', 5, [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }]),
    ).toBeUndefined();
    expect(rebaseMentions('', '@Ada', [])).toEqual([]);
  });
});
