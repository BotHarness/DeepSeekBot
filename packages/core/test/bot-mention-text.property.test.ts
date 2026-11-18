import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  AmbiguousBotMentionError,
  resolveBotMentionText,
  type BotMentionCandidate,
} from '../src/channels/bot-mention-text.js';

const CANDIDATES: BotMentionCandidate[] = [
  { botSlug: 'ada', displayName: 'Ada', eligible: true },
  { botSlug: 'bo-lin', displayName: 'Bo  Lin', eligible: true },
  { botSlug: 'cyd', displayName: 'Cyd', eligible: true },
  { botSlug: 'dee', displayName: 'Dee', eligible: false },
];
const MENTIONS: Record<string, string> = {
  '@Ada': 'ada',
  '@Bo Lin': 'bo-lin',
  '@Cyd': 'cyd',
};

const token = fc.oneof(
  fc.stringMatching(/^[a-z]{1,6}$/u),
  fc.constantFrom('@Ada', '@Bo Lin', '@Cyd', '@Dee', 'mail@Ada', 'x.y@Cyd', '@Adams', '@Cydney'),
);

describe('Bot mentions in a Group message body (ADR-0206)', () => {
  it('resolves each standalone mention of an eligible Bot once, keeps the rest of the text, and drops only leading mentions', () => {
    fc.assert(
      fc.property(fc.array(token, { maxLength: 12 }), (tokens) => {
        const result = resolveBotMentionText(tokens.join(' '), CANDIDATES);
        const mentioned = [
          ...new Set(tokens.flatMap((item) => (MENTIONS[item] ? [MENTIONS[item]] : []))),
        ];
        expect(result.botSlugs).toEqual(mentioned);
        if (mentioned.length === 0) {
          expect(result.body).toBe(tokens.join(' '));
          return;
        }
        let leading = 0;
        while (leading < tokens.length && MENTIONS[tokens[leading]!]) leading += 1;
        expect(result.body).toBe(
          tokens
            .slice(leading)
            .map((item) => (MENTIONS[item] ? item.slice(1) : item))
            .join(' ')
            .trimStart(),
        );
      }),
      { numRuns: 300 },
    );
  });

  it('refuses a mention that two eligible Bots share, and ignores it when only an ineligible Bot shares it', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.stringMatching(/^[a-z]{0,6}$/u), (eligible, tail) => {
        const candidates = [...CANDIDATES, { botSlug: 'ada-2', displayName: 'ada', eligible }];
        const body = `hi @Ada ${tail}`;
        if (eligible)
          expect(() => resolveBotMentionText(body, candidates)).toThrow(AmbiguousBotMentionError);
        else expect(resolveBotMentionText(body, candidates).botSlugs).toEqual(['ada']);
      }),
      { numRuns: 50 },
    );
  });
});
