import { describe, expect, it } from 'vitest';

import { parseChannelMessage } from '../src/client/bridge.js';
import { groupChannelMessages } from '../src/client/message-groups.js';
import {
  newerSubagentDispatch,
  parseSubagentDispatch,
  preserveSubagentDispatches,
} from '../src/client/subagent-dispatch.js';
import type { ChannelMessage } from '../src/client/store.js';

const projection = {
  dispatchId: 'call-1',
  kind: 'subagent',
  description: 'Read the changelog',
  status: 'running',
  revision: 2,
  updatedAt: '2026-10-15T06:00:00.000Z',
  parentSessionId: 'session-parent',
  resolvedRoute: { provider: 'opencode-go', model: 'gpt-6.1-sol' },
};

describe('client subagent dispatch parsing', () => {
  it('parses a well-formed projection and ignores a malformed one', () => {
    expect(parseSubagentDispatch(projection)).toMatchObject({ status: 'running', revision: 2 });
    expect(parseSubagentDispatch(undefined)).toBeUndefined();
    expect(parseSubagentDispatch({ ...projection, status: 'invented' })).toBeUndefined();
    expect(parseSubagentDispatch({ ...projection, kind: 'other' })).toBeUndefined();
  });

  it('preserves a system message while omitting malformed dispatch metadata', () => {
    const anchor = {
      id: 'message-1',
      at: '2026-10-15T06:00:00.000Z',
      author: { kind: 'system' },
      body: 'Subagent: Read the changelog',
      subagentDispatch: { ...projection, status: 'invented' },
    };
    const message = { id: anchor.id, at: anchor.at, author: anchor.author, body: anchor.body };
    expect(parseChannelMessage(anchor)).toEqual(message);
    expect(parseChannelMessage({ ...anchor, subagentDispatch: null })).toEqual(message);
    expect(parseChannelMessage({ ...anchor, onboardingWelcome: { version: 1 } })).toEqual({
      ...message,
      onboardingWelcome: { version: 1 },
    });
    expect(
      parseChannelMessage({ ...anchor, subagentDispatch: projection })?.subagentDispatch,
    ).toMatchObject({ status: 'running' });
    expect(parseChannelMessage({ ...anchor, subagentDispatch: undefined })).toBeUndefined();
  });
});

describe('client subagent dispatch overlays', () => {
  it('keeps the newest non-terminal revision', () => {
    const running = parseSubagentDispatch(projection)!;
    const completed = parseSubagentDispatch({
      ...projection,
      status: 'completed',
      revision: 3,
    })!;
    expect(newerSubagentDispatch(running, completed)).toBe(completed);
    expect(newerSubagentDispatch(completed, running)).toBe(completed);
    expect(newerSubagentDispatch(undefined, running)).toBe(running);
  });

  it('restores a known projection onto a message that lost it', () => {
    const message: ChannelMessage = {
      id: 'message-1',
      at: '2026-10-15T06:00:00.000Z',
      author: { kind: 'system' },
      body: '',
    };
    const dispatch = parseSubagentDispatch(projection)!;
    const withDispatch: ChannelMessage = { ...message, subagentDispatch: dispatch };
    expect(preserveSubagentDispatches([withDispatch], [message])[0]?.subagentDispatch).toBe(
      dispatch,
    );
    expect(preserveSubagentDispatches([], [message])[0]).toBe(message);
  });
});

describe('client subagent dispatch groups', () => {
  it('folds consecutive subagent dispatch system messages into one group', () => {
    const dispatch = (id: string, seconds: number): ChannelMessage => ({
      id,
      at: new Date(Date.UTC(2026, 8, 22, 0, 0, seconds)).toISOString(),
      author: { kind: 'system' },
      body: id,
      subagentDispatch: {
        dispatchId: id,
        kind: 'subagent',
        description: id,
        status: 'running',
        revision: 1,
        updatedAt: new Date(Date.UTC(2026, 8, 22, 0, 0, seconds)).toISOString(),
        parentSessionId: 'session-parent',
      },
    });
    const other: ChannelMessage = {
      id: 'other',
      at: '2026-09-22T00:00:15.000Z',
      author: { kind: 'system' },
      body: 'note',
    };
    expect(
      groupChannelMessages([
        dispatch('a', 0),
        dispatch('b', 5),
        dispatch('c', 10),
        other,
        dispatch('d', 20),
      ]).map((group) => group.messages.map((item) => item.id)),
    ).toEqual([['a', 'b', 'c'], ['other'], ['d']]);
    expect(
      groupChannelMessages([dispatch('a', 0), dispatch('b', 300)]).map((group) =>
        group.messages.map((item) => item.id),
      ),
    ).toEqual([['a'], ['b']]);
    expect(
      groupChannelMessages([dispatch('a', 0), dispatch('b', 5)], 'a').map((group) =>
        group.messages.map((item) => item.id),
      ),
    ).toEqual([['a'], ['b']]);
  });
});
