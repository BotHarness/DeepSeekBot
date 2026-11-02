import { describe, expect, it } from 'vitest';

import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';

describe('Human Inbox reply actions', () => {
  it('loads bounded concrete context and sends a canonical reply while keeping Inbox selected', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    const call: BridgeCall = async (endpoint, payload) => {
      calls.push({ endpoint, payload });
      if (endpoint === 'channelTimeline')
        return {
          ok: true,
          value: {
            revision: 1,
            page: {
              entries: [
                {
                  id: 'source',
                  at: '2026-09-30T12:00:00Z',
                  author: { kind: 'bot', slug: 'ada' },
                  body: 'Launch plan',
                },
              ],
              olderCursor: null,
              newerCursor: null,
              hasOlder: false,
              hasNewer: false,
            },
          },
        };
      return {
        ok: true,
        value: {
          message: {
            id: payload['messageId'],
            at: '2026-09-30T12:01:00Z',
            author: { kind: 'human' },
            body: payload['body'],
            replyTo: payload['replyTo'],
          },
        },
      };
    };
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const actions = createActions(call, clientStore);
    expect(await actions.humanInboxContext('group-team', 'source')).toMatchObject([
      { id: 'source' },
    ]);
    const sent = await actions.replyFromHumanInbox(
      'group-team',
      'source',
      'Launch Friday.',
      'human-00000000-0000-4000-8000-000000000000',
    );
    expect(sent).toMatchObject({
      author: { kind: 'human' },
      replyTo: 'source',
      body: 'Launch Friday.',
    });
    expect(calls).toEqual([
      {
        endpoint: 'channelTimeline',
        payload: {
          channelId: 'group-team',
          direction: 'around',
          around: 'source',
          olderLimit: 2,
          newerLimit: 2,
        },
      },
      {
        endpoint: 'channelSend',
        payload: {
          channelId: 'group-team',
          body: 'Launch Friday.',
          replyTo: 'source',
          messageId: 'human-00000000-0000-4000-8000-000000000000',
        },
      },
      {
        endpoint: 'telemetryEvent',
        payload: {
          event: 'activity:inbox_reply_send',
          properties: { target: 'message', surface: 'browser' },
        },
      },
    ]);
    expect(clientStore.getSnapshot().selection).toEqual({ kind: 'inbox' });
    expect(clientStore.getSnapshot().conversation.messages).toEqual([]);
  });
});
