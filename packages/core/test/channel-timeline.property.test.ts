import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { ChannelMessage } from '../src/channels/channel.js';
import { MAX_MESSAGE_PAGE, pageChannelTimeline } from '../src/channels/timeline.js';

const message = (index: number): ChannelMessage => ({
  id: `m-${index}`,
  at: new Date(Date.UTC(2026, 8, 22) + index * 1000).toISOString(),
  author: { kind: 'human' },
  body: String(index),
});
const history = (length: number) => Array.from({ length }, (_, index) => message(index));

const limit = fc.integer({ min: -5, max: MAX_MESSAGE_PAGE + 20 });
const step = fc.oneof(
  fc.record({ kind: fc.constant('older' as const), limit }),
  fc.record({ kind: fc.constant('newer' as const), limit }),
  fc.record({ kind: fc.constant('append' as const), count: fc.integer({ min: 1, max: 30 }) }),
);
const start = fc.oneof(
  fc.record({ kind: fc.constant('latest' as const), limit }),
  fc.record({
    kind: fc.constant('around' as const),
    at: fc.nat(),
    olderLimit: fc.integer({ min: -5, max: 60 }),
    newerLimit: fc.integer({ min: -5, max: 60 }),
  }),
);
const ids = (entries: readonly ChannelMessage[]) => entries.map((entry) => entry.id);

describe('ADR-0061 Channel timeline pages use Host-owned opaque cursors', () => {
  it('keeps one contiguous window with no gaps or duplicates while paging both ways and appending', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 400 }),
        start,
        fc.array(step, { maxLength: 40 }),
        (length, first, steps) => {
          let messages = history(length);
          const opened =
            first.kind === 'latest'
              ? pageChannelTimeline('dm-ada', messages, { limit: first.limit })!
              : pageChannelTimeline('dm-ada', messages, {
                  direction: 'around',
                  around: `m-${first.at % length}`,
                  olderLimit: first.olderLimit,
                  newerLimit: first.newerLimit,
                })!;
          let window = opened.entries;
          let olderCursor = opened.olderCursor;
          let newerCursor = opened.newerCursor;
          let hasOlder = opened.hasOlder;
          let hasNewer = opened.hasNewer;

          for (const action of steps) {
            if (action.kind === 'append') {
              messages = history(messages.length + action.count);
              hasNewer = true;
              continue;
            }
            const older = action.kind === 'older';
            const cursor = older ? olderCursor : newerCursor;
            if (cursor === null || !(older ? hasOlder : hasNewer)) continue;
            const page = pageChannelTimeline('dm-ada', messages, {
              direction: action.kind,
              cursor,
              limit: action.limit,
            })!;
            expect(page).toBeDefined();
            expect(page.entries.length).toBeGreaterThan(0);
            expect(page.entries.length).toBeLessThanOrEqual(
              Math.max(1, Math.min(action.limit, MAX_MESSAGE_PAGE)),
            );
            if (older) {
              window = [...page.entries, ...window];
              olderCursor = page.olderCursor;
              hasOlder = page.hasOlder;
            } else {
              window = [...window, ...page.entries];
              newerCursor = page.newerCursor;
              hasNewer = page.hasNewer;
            }
          }

          const from = messages.findIndex((entry) => entry.id === window[0]!.id);
          expect(ids(window)).toEqual(ids(messages.slice(from, from + window.length)));
          expect(hasOlder).toBe(from > 0);
          expect(hasNewer).toBe(from + window.length < messages.length);
          for (const cursor of [olderCursor, newerCursor]) {
            expect(cursor).not.toContain('m-');
            expect(
              pageChannelTimeline('group-team', messages, { direction: 'older', cursor: cursor! }),
            ).toBeUndefined();
          }
        },
      ),
    );
  });

  it('walks from the latest page back to the first message exactly once', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 600 }), limit, (length, size) => {
        const messages = history(length);
        let page = pageChannelTimeline('dm-ada', messages, { limit: size })!;
        const seen = [...page.entries];
        let requests = 0;
        while (page.hasOlder) {
          expect(++requests).toBeLessThan(Math.max(1, messages.length));
          page = pageChannelTimeline('dm-ada', messages, {
            direction: 'older',
            cursor: page.olderCursor!,
            limit: size,
          })!;
          seen.unshift(...page.entries);
        }
        expect(ids(seen)).toEqual(ids(messages));
      }),
    );
  });
});
