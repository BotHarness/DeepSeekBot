import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { dmChannelId } from '../src/channels/channel.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import type { ClaudeRecordedLine } from './fixtures/claude-replay.js';
import { readCodexRecording } from './fixtures/codex-replay.js';
import { CLAUDE, CLAUDE_REPLY, CODEX, setup, START } from './fixtures/routing-group-engine.js';

const OWNER = OWNER_HUMAN_CONTEXT;
const CODEX_DM = readCodexRecording(join(import.meta.dirname, 'fixtures/codex-dm-turn.jsonl'));
const FIRST_TURN_ID = '019a7f10-0000-7000-8000-000000000002';

function codexReply(id: string, args: Record<string, unknown>) {
  return {
    method: 'item/started',
    params: {
      item: {
        type: 'mcpToolCall',
        id,
        server: 'deepseekbot',
        tool: 'bot_send_message',
        arguments: args,
      },
    },
  };
}

function claudeReply(id: string, input: Record<string, unknown>): ClaudeRecordedLine {
  return {
    kind: 'message',
    msg: {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id, name: 'mcp__deepseekbot__bot_send_message', input }],
      },
    },
  };
}

function codexEnd(id: string) {
  return { method: 'turn/completed', params: { turn: { id, status: 'completed' } } };
}

function sources(fixture: ReturnType<typeof setup>, messageId: string) {
  return attachOperationalModule(fixture.core.operationalDatabase, 'engine-steer-test').read(
    (db) =>
      db.prepare('SELECT source_event_id FROM source_events WHERE message_id = ?').get(messageId)
        ?.source_event_id,
  );
}

async function groupMessage(
  fixture: ReturnType<typeof setup>,
  channelId: string,
  id: string,
  text: string,
  mention = true,
) {
  const body = mention ? '@Ada ' + text : text;
  await fixture.core.channels.appendMessage(OWNER, channelId, {
    id,
    at: new Date(START).toISOString(),
    author: { kind: 'human' },
    body,
    ...(mention ? { mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }] } : {}),
  });
  fixture.core.runtime.admitGroupMessage(channelId, id);
}

function botReplies(fixture: ReturnType<typeof setup>, channelId: string) {
  return fixture.core.channels
    .readMessages(channelId)
    .filter((message) => message.author.kind === 'bot' && message.body !== '')
    .map((message) => message.body);
}

describe('Orchestrator steering through the engine and Channel', () => {
  it('uses the active Codex turn ID for a Group steer and an independent DM reply', async () => {
    const groupArgs = { channel_id: '', body: 'The Group answer is red and blue.' };
    const dmArgs = { source_event_id: '', body: 'The DM answer is green.' };
    const outsideArgs = { channel_id: '', body: 'Out of scope' };
    const fixture = setup({
      members: [CODEX],
      codexRecording: [
        ...CODEX_DM.slice(0, 11),
        { dir: 'out', msg: { id: 5, method: 'turn/steer' } },
        { dir: 'in', msg: { id: 5, result: { turnId: FIRST_TURN_ID } } },
        { dir: 'out', msg: { id: 6, method: 'turn/steer' } },
        { dir: 'in', msg: { id: 6, result: { turnId: FIRST_TURN_ID } } },
        { dir: 'in', msg: codexReply('outside', outsideArgs) },
        { dir: 'in', msg: codexReply('group', groupArgs) },
        { dir: 'in', msg: codexReply('dm', dmArgs) },
        { dir: 'in', msg: codexEnd(FIRST_TURN_ID) },
      ],
    });
    const group = fixture.core.channels.createGroup(OWNER, { name: 'Group', members: ['ada'] });
    const outside = fixture.core.channels.createGroup(OWNER, {
      name: 'Unrelated Group',
      members: ['ada'],
    });
    groupArgs.channel_id = group.id;
    outsideArgs.channel_id = outside.id;
    try {
      await groupMessage(fixture, group.id, 'initial', 'The first color is red.');
      await vi.waitFor(() => expect(fixture.codex[0]?.sent.at(-1)?.['method']).toBe('turn/start'));
      await groupMessage(fixture, group.id, 'ordinary-context', 'The shape is square.', false);
      await groupMessage(fixture, group.id, 'followup', 'The second color is blue.');
      await fixture.message('dm-followup', 'My private color is green.', () => {
        const id = sources(fixture, 'dm-followup');
        if (typeof id !== 'string') throw new Error('DM Source Event is not ready');
        dmArgs.source_event_id = id;
      });
      await fixture.idle();
      const replay = fixture.codex[0]!;
      expect(replay.mismatches).toEqual([]);
      const steers = replay.sent.filter((frame) => frame['method'] === 'turn/steer');
      expect(steers.map((frame) => frame['params'])).toEqual([
        expect.objectContaining({
          expectedTurnId: FIRST_TURN_ID,
          input: [
            expect.objectContaining({
              text: expect.stringMatching(/second color is blue[\s\S]+shape is square/u),
            }),
          ],
        }),
        expect.objectContaining({
          expectedTurnId: FIRST_TURN_ID,
          input: [
            expect.objectContaining({ text: expect.stringContaining('private color is green') }),
          ],
        }),
      ]);
      expect(replay.sent.filter((frame) => frame['method'] === 'turn/start')).toHaveLength(1);
      expect(replay.gatewayCalls.map((call) => call.result)).toEqual([
        expect.objectContaining({
          isError: true,
          content: [{ type: 'text', text: 'refused: channel-out-of-scope' }],
        }),
        expect.objectContaining({ isError: false }),
        expect.objectContaining({ isError: false }),
      ]);
      expect(botReplies(fixture, group.id)).toEqual([groupArgs.body]);
      expect(botReplies(fixture, outside.id)).toEqual([]);
      expect(botReplies(fixture, dmChannelId('ada'))).toEqual([dmArgs.body]);
    } finally {
      await fixture.host.release(fixture.sessionId());
    }
  });

  it('queues a refused Codex steer behind the unmodified active turn', async () => {
    const channel_id = dmChannelId('ada');
    const fixture = setup({
      members: [CODEX],
      codexRecording: [
        ...CODEX_DM.slice(0, 11),
        { dir: 'out', msg: { id: 5, method: 'turn/steer' } },
        { dir: 'in', msg: { id: 5, error: { code: -32601, message: 'Method not found' } } },
        { dir: 'in', msg: codexReply('first', { channel_id, body: 'First answer' }) },
        { dir: 'in', msg: codexEnd(FIRST_TURN_ID) },
        ...CODEX_DM.slice(3, 5),
        { dir: 'out', msg: { id: 7, method: 'turn/start' } },
        { dir: 'in', msg: { id: 7, result: { turn: { id: 'next' } } } },
        { dir: 'in', msg: codexReply('next', { channel_id, body: 'Second answer' }) },
        { dir: 'in', msg: codexEnd('next') },
      ],
    });
    const first = fixture.message('first', 'First task');
    try {
      await vi.waitFor(() => expect(fixture.codex[0]?.sent.at(-1)?.['method']).toBe('turn/start'));
      await fixture.message('next', 'Next task');
      await first;
      const replay = fixture.codex[0]!;
      expect(replay.mismatches).toEqual([]);
      expect(replay.sent.some((frame) => frame['method'] === 'turn/interrupt')).toBe(false);
      const turns = replay.sent.filter((frame) => frame['method'] === 'turn/start');
      expect(turns).toHaveLength(2);
      expect(turns[1]?.['params']).toMatchObject({
        input: [expect.objectContaining({ text: expect.stringContaining('Next task') })],
      });
      expect(botReplies(fixture, channel_id).sort()).toEqual(['First answer', 'Second answer']);
    } finally {
      await fixture.host.release(fixture.sessionId());
    }
  });

  it('continues a Claude Orchestrator in the same Session and refuses to repeat a committed reply', async () => {
    const start = CLAUDE_REPLY.slice(0, -1);
    const firstArgs = { source_event_id: '', body: 'First answer' };
    const nextArgs = { channel_id: '', body: 'Group update' };
    const fixture = setup({
      members: [CLAUDE],
      claudeRecording: [
        ...start,
        claudeReply('first', firstArgs),
        { kind: 'await-interrupt' },
        { kind: 'message', msg: { type: 'result', subtype: 'success' } },
        { kind: 'await-input' },
        claudeReply('repeat', firstArgs),
        claudeReply('followup', nextArgs),
        { kind: 'message', msg: { type: 'result', subtype: 'success' } },
      ],
    });
    const group = fixture.core.channels.createGroup(OWNER, { name: 'Group', members: ['ada'] });
    nextArgs.channel_id = group.id;
    const first = fixture.message('first', 'Answer this first.', () => {
      const id = sources(fixture, 'first');
      if (typeof id !== 'string') throw new Error('First Source Event is not ready');
      firstArgs.source_event_id = id;
    });
    try {
      await vi.waitFor(() => expect(fixture.claude.gatewayCalls).toHaveLength(1));
      const id = fixture.sessionId();
      await groupMessage(fixture, group.id, 'group-update', 'Answer in this Group.');
      await first;
      await fixture.idle();
      expect(fixture.sessionId()).toBe(id);
      expect(fixture.claude.options).toHaveLength(1);
      expect(fixture.claude.interrupts).toBe(1);
      expect(fixture.claude.prompts[1]).toContain('Answer in this Group.');
      expect(fixture.claude.prompts[1]).toContain(firstArgs.source_event_id);
      expect(fixture.claude.gatewayCalls.map((call) => call.result)).toEqual([
        expect.objectContaining({ isError: false }),
        expect.objectContaining({
          isError: true,
          content: [
            { type: 'text', text: 'refused: a reply to this Source Event was already sent' },
          ],
        }),
        expect.objectContaining({ isError: false }),
      ]);
      expect(botReplies(fixture, dmChannelId('ada'))).toEqual([firstArgs.body]);
      expect(botReplies(fixture, group.id)).toEqual([nextArgs.body]);
    } finally {
      await fixture.host.release(fixture.sessionId());
    }
  });
});
