import { describe, expect, it } from 'vitest';

import { parseChannelMessage } from '../src/client/bridge.js';
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

  it('rejects a system message whose dispatch field is malformed', () => {
    const anchor = {
      id: 'message-1',
      at: '2026-10-15T06:00:00.000Z',
      author: { kind: 'system' },
      body: 'Subagent: Read the changelog',
      subagentDispatch: { ...projection, status: 'invented' },
    };
    expect(parseChannelMessage(anchor)).toBeUndefined();
    expect(parseChannelMessage({ ...anchor, subagentDispatch: null })).toBeUndefined();
    expect(parseChannelMessage({ ...anchor, onboardingWelcome: { version: 1 } })).toBeUndefined();
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
