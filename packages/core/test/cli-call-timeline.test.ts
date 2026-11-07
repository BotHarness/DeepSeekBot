import { describe, expect, it } from 'vitest';

import { runCallTimelineCommand } from '../src/bots/cli-call-timeline.js';
import { CliLiveError } from '../src/bots/cli-live-error.js';
import { LIVE_COMMANDS } from '../src/bots/cli-live.js';
import { at, CALLS, OTHER_CALL, setup } from './channel-call-fixture.js';

function connectTo(methods: Awaited<ReturnType<typeof setup>>['methods'], seen: unknown[] = []) {
  return async () => ({
    rpc: async <T>(method: string, args: Record<string, unknown>): Promise<T> => {
      seen.push({ method, args });
      if (method !== 'botToolRun') throw new Error(`unexpected ${method}`);
      const result = await methods.botToolRun(args);
      if (!result.ok) throw new CliLiveError(result.error.code, result.error.message);
      return result.value as T;
    },
  });
}

describe('deepseekbot call-list and call-read (#3693)', () => {
  it('is listed as live commands', () => {
    const names = LIVE_COMMANDS.map((entry) => entry.command);
    expect(names).toContain('call-list');
    expect(names).toContain('call-read');
  });

  it('lists the calls in a Bot DM newest first with start, end, duration and state', async () => {
    const { methods, close } = await setup();
    try {
      const seen: unknown[] = [];
      const listed = await runCallTimelineCommand(
        'call-list',
        ['ada'],
        {},
        connectTo(methods, seen),
      );
      expect(listed).toEqual({
        botId: 'ada',
        channelId: expect.any(String),
        calls: [
          { callId: CALLS[2].id, startedAt: CALLS[2].startedAt, state: 'started' },
          {
            callId: CALLS[1].id,
            startedAt: CALLS[1].startedAt,
            state: 'ended',
            endedAt: at(CALLS[1].startedAt, 60_000),
            durationMs: 60_000,
            reason: 'hangup',
            heard: 3,
          },
          {
            callId: CALLS[0].id,
            startedAt: CALLS[0].startedAt,
            state: 'ended',
            endedAt: at(CALLS[0].startedAt, 60_000),
            durationMs: 60_000,
            reason: 'hangup',
            heard: 3,
          },
        ],
      });
      expect(JSON.stringify(listed)).not.toContain(OTHER_CALL);
      expect(seen).toEqual([
        {
          method: 'botToolRun',
          args: {
            slug: 'ada',
            tool: 'channel_read',
            args: expect.objectContaining({ text: 'voice call', author_kind: 'system' }),
          },
        },
      ]);
    } finally {
      await close();
    }
  });

  it('reads a call window with exactly the output of the channel_read tool', async () => {
    const { methods, read, close } = await setup();
    try {
      for (const call of CALLS) {
        const cli = await runCallTimelineCommand(
          'call-read',
          ['ada', call.id],
          { 'from-ms': '13000', 'to-ms': '40000' },
          connectTo(methods),
        );
        expect(cli).toEqual(await read({ call: call.id, from_ms: 13_000, to_ms: 40_000 }));
        expect(
          (cli as { messages: Array<{ message: { id: string } }> }).messages.map(
            (entry) => entry.message.id,
          ),
        ).toEqual([
          `${call.label}-look`,
          `voice-call-frames-${call.id}-20000`,
          `${call.label}-reply`,
        ]);
      }
      const whole = (await runCallTimelineCommand(
        'call-read',
        ['ada', CALLS[0].id],
        { limit: '3' },
        connectTo(methods),
      )) as { messages: unknown[]; nextCursor?: string };
      expect(whole.messages).toHaveLength(3);
      const next = (await runCallTimelineCommand(
        'call-read',
        ['ada', CALLS[0].id],
        { limit: '3', cursor: whole.nextCursor! },
        connectTo(methods),
      )) as { messages: Array<{ message: { id: string } }> };
      expect(next.messages[0]!.message.id).toBe(`voice-call-frames-${CALLS[0].id}-20000`);
    } finally {
      await close();
    }
  });

  it('passes Host refusals through with their codes and refuses bad flags locally', async () => {
    const { methods, close } = await setup();
    try {
      await expect(
        runCallTimelineCommand('call-read', ['ada', OTHER_CALL], {}, connectTo(methods)),
      ).rejects.toMatchObject({ code: 'call-not-found' });
      await expect(
        runCallTimelineCommand(
          'call-read',
          ['ada', CALLS[0].id],
          { 'from-ms': '40000', 'to-ms': '13000' },
          connectTo(methods),
        ),
      ).rejects.toMatchObject({ code: 'invalid-call-window' });
      for (const [rest, values] of [
        [['ada'], {}],
        [['ada', CALLS[0].id], { 'from-ms': '-1' }],
        [['ada', CALLS[0].id], { 'to-ms': '1.5' }],
        [['ada', CALLS[0].id], { limit: '0' }],
      ] as const)
        await expect(
          runCallTimelineCommand('call-read', [...rest], values, connectTo(methods)),
        ).rejects.toMatchObject({ code: 'usage' });
      await expect(
        runCallTimelineCommand('call-list', ['ada'], { 'from-ms': '1' }, connectTo(methods)),
      ).rejects.toMatchObject({ code: 'usage' });
    } finally {
      await close();
    }
  });
});
