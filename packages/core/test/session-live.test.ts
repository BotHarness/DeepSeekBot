import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LIVE_FLUSH_MS, SessionLiveStreams } from '../src/runtime/session-live.js';
import { summarizeSessionToolDetail } from '../src/runtime/session-tool-detail.js';

const frame = (index: number, chunk: unknown, time = 1000 + index): AssistantStreamFrame =>
  ({ type: 'chunk', attemptId: 'a1', revision: 1, index, time, chunk }) as AssistantStreamFrame;

describe('Session live stream', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the attempt reasoning, reply and tool call as they stream', () => {
    const live = new SessionLiveStreams();
    live.accept('s1', {
      type: 'start',
      attemptId: 'a1',
      revision: 1,
      turn: 1,
      step: 1,
    } as AssistantStreamFrame);
    live.accept('s1', frame(0, { type: 'block-start', index: 0, blockType: 'reasoning' }));
    live.accept('s1', frame(1, { type: 'reasoning-delta', index: 0, text: 'Check the ' }));
    live.accept('s1', frame(2, { type: 'reasoning-delta', index: 0, text: 'tests.' }));
    live.accept(
      's1',
      frame(3, {
        type: 'block-end',
        index: 0,
        block: { type: 'reasoning', text: 'Check the tests.' },
      }),
    );
    live.accept('s1', frame(4, { type: 'block-start', index: 1, blockType: 'tool-call' }));
    live.accept(
      's1',
      frame(5, {
        type: 'tool-call-delta',
        index: 1,
        id: 'c1',
        name: 'bash',
        argumentsDelta: '{"command": "pnpm te',
      }),
    );
    expect(live.snapshot('s1').items).toMatchObject([
      { kind: 'reasoning', text: 'Check the tests.', at: new Date(1000).toISOString() },
      { kind: 'tool', id: 'c1', tool: 'bash', command: 'pnpm te' },
    ]);
  });

  it('clears the attempt when it settles and advances the durable cursor', () => {
    const live = new SessionLiveStreams();
    live.accept('s1', frame(0, { type: 'block-start', index: 0, blockType: 'text' }));
    live.accept('s1', frame(1, { type: 'text-delta', index: 0, text: 'Done.' }));
    expect(live.snapshot('s1').items).toHaveLength(1);
    live.accept('s1', {
      type: 'end',
      attemptId: 'a1',
      revision: 1,
      index: 2,
      outcome: { kind: 'committed', eventType: 'assistant/message', seq: 42 },
    } as unknown as AssistantStreamFrame);
    expect(live.snapshot('s1')).toMatchObject({ seq: 42, items: [] });
  });

  it('wakes a waiting reader once per flush window', async () => {
    vi.useFakeTimers();
    const live = new SessionLiveStreams();
    const before = live.snapshot('s1').revision;
    let woke = false;
    const waiting = live.wait('s1', before).then(() => (woke = true));
    live.observe('s1', { type: 'tool/call', seq: 7 });
    live.observe('s1', { type: 'tool/result', seq: 8 });
    await vi.advanceTimersByTimeAsync(LIVE_FLUSH_MS - 1);
    expect(woke).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(live.snapshot('s1')).toMatchObject({ seq: 8, revision: before + 2 });
  });

  it('returns at once when the reader is behind', async () => {
    const live = new SessionLiveStreams();
    live.observe('s1', { type: 'turn/start', seq: 1 });
    await expect(live.wait('s1', 0)).resolves.toBeUndefined();
  });
});

describe('Session tool detail', () => {
  const events = [
    {
      type: 'tool/call',
      seq: 1,
      time: 1,
      data: { callId: 'c1', name: 'bash', arguments: '{"command":"ls"}' },
    },
    {
      type: 'tool/result',
      seq: 2,
      time: 2,
      data: { message: { toolCallId: 'c1', content: [{ type: 'text', text: 'a.ts\nb.ts' }] } },
    },
    {
      type: 'tool/call',
      seq: 3,
      time: 3,
      data: { callId: 'c2', name: 'edit', arguments: '{"file_path":"a.ts"}' },
    },
    {
      type: 'tool/result',
      seq: 4,
      time: 4,
      data: {
        message: { toolCallId: 'c2', content: [{ type: 'text', text: 'Edited' }] },
        meta: { diffs: [{ path: 'a.ts', oldText: 'x', newText: 'y' }] },
      },
    },
  ];

  it('falls back to the command and its output', () => {
    expect(summarizeSessionToolDetail({ sessionId: 's1', callId: 'c1', events })).toEqual({
      card: 'terminal',
      command: 'ls',
      output: 'a.ts\nb.ts',
    });
  });

  it("uses the tool's own result presentation", () => {
    const present = vi.fn((_session: string, _name: string, _args: unknown, result) => ({
      card: 'diff',
      diffs: (result.meta as { diffs: unknown[] }).diffs,
    }));
    expect(summarizeSessionToolDetail({ sessionId: 's1', callId: 'c2', events, present })).toEqual({
      card: 'diff',
      files: [{ path: 'a.ts', oldText: 'x', newText: 'y' }],
    });
    expect(present).toHaveBeenCalledWith(
      's1',
      'edit',
      { file_path: 'a.ts' },
      expect.objectContaining({ isError: false }),
    );
  });

  it('reports an unknown call', () => {
    expect(summarizeSessionToolDetail({ sessionId: 's1', callId: 'zz', events })).toBeUndefined();
  });
});
