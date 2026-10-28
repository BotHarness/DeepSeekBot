import { describe, expect, it } from 'vitest';

import { searchHostMessages } from '../src/host/message-search';

const hit = (channelId: string, id: string, at: string) => ({
  channelId,
  snippet: `about ${id}`,
  message: { id, at, author: { kind: 'human' }, body: `about ${id}` },
});

describe('searchHostMessages', () => {
  it('merges every Host newest first and skips a Host that fails', async () => {
    const calls: unknown[] = [];
    const found = await searchHostMessages(
      [
        {
          hostId: 'home',
          client: {
            call: async <T>(method: string, args?: Record<string, unknown>) => {
              calls.push([method, args]);
              return {
                hits: [hit('dm-ada', 'a1', '2026-10-01T00:00:00.000Z'), { channelId: 7 }],
              } as T;
            },
          },
        },
        {
          hostId: 'work',
          client: {
            call: async <T>() => ({ hits: [hit('grp-1', 'w1', '2026-10-02T00:00:00.000Z')] }) as T,
          },
        },
        {
          hostId: 'old',
          client: {
            call: async () => {
              throw new Error('unknown method');
            },
          },
        },
      ],
      '发布',
    );
    expect(calls).toEqual([['messageSearch', { text: '发布', limit: 20 }]]);
    expect(found.map((item) => [item.hostId, item.channelId, item.messageId])).toEqual([
      ['work', 'grp-1', 'w1'],
      ['home', 'dm-ada', 'a1'],
    ]);
    expect(found[0]).toMatchObject({ snippet: 'about w1', author: { kind: 'human' } });
  });
});
