import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createChannelStore } from '../src/channels/store.js';
import { readChannelMessagePage } from '../src/channels/read-continuation.js';
import { createTempRoot } from './helpers.js';

describe('Tob read continuation (tob.md §7)', () => {
  it('pages any append-interleaved history to each first-page message exactly once, newest first', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 1, max: 6 }),
        fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 30 }),
        fc.integer({ min: 1, max: 600 }),
        async (initial, limit, appends, maxBytes) => {
          const channels = createChannelStore({
            rootDir: createTempRoot('read-property-'),
          });
          const group = channels.createGroup(OWNER_HUMAN_CONTEXT, {
            name: 'P',
            members: [],
          });
          let next = 0;
          const append = async (count: number) => {
            for (let index = 0; index < count; index += 1) {
              next += 1;
              await channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
                id: `m${next}`,
                at: '2026-11-01T00:00:00.000Z',
                author: { kind: 'human' },
                body: 'x'.repeat(next % 7),
              });
            }
          };
          await append(initial);
          const expected = Array.from({ length: initial }, (_, index) => `m${initial - index}`);
          const seen: string[] = [];
          let cursor: string | undefined;
          for (let page = 0; page <= initial + 1; page += 1) {
            const result = readChannelMessagePage(channels, group.id, {
              limit,
              maxBytes,
              ...(cursor === undefined ? {} : { cursor }),
            })!;
            expect(result.provenance.revision).toBe(initial);
            seen.push(...result.messages.map((message) => message.id));
            cursor = result.nextCursor;
            expect(result.complete).toBe(cursor === undefined);
            if (cursor === undefined) break;
            await append(appends[page] ?? 0);
          }
          expect(cursor).toBeUndefined();
          expect(seen).toEqual(expected);
        },
      ),
      { numRuns: 40 },
    );
  });
});
