import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { isChannelMessage } from '../src/channels/channel.js';
import {
  voiceCallRecordBody,
  type ChannelVoiceCallRecord,
} from '../src/channels/voice-call-record.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const CALL = 'call-0123456789abcdef';

function setup() {
  const runs: OrchestratorAgentRun[] = [];
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
    },
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
  const core = createCore({ dshHome: createTempRoot('botharness-call-record-'), agents });
  core.registry.create({ slug: 'mira', displayName: 'Mira' });
  const dm = core.channels.getOrCreateDm('mira', 'Mira')!;
  const methods = createBridgeMethods({
    registry: core.registry,
    states: core.states,
    channels: core.channels,
    ownership: core.ownership,
    roster: core.roster,
    runtime: core.runtime,
  });
  const notice = (record: ChannelVoiceCallRecord) =>
    core.channels.appendMessage(dm.id, {
      id: `voice-call-${record.state}-${record.callId}`,
      at: record.state === 'started' ? record.startedAt : record.endedAt,
      author: { kind: 'system' },
      body: voiceCallRecordBody(record),
      voiceCallRecord: record,
    });
  return { core, dm, methods, runs, notice };
}

describe('voice call records in the Bot DM (#3483)', () => {
  it('stores start and end notices as system messages and never wakes the Bot for them', async () => {
    const { core, dm, notice, runs } = setup();
    try {
      const startedAt = new Date().toISOString();
      expect(
        await notice({ callId: CALL, botSlug: 'mira', state: 'started', startedAt }),
      ).toMatchObject({ voiceCallRecord: { state: 'started' } });
      const endedAt = new Date(Date.parse(startedAt) + 1_000).toISOString();
      await notice({
        callId: CALL,
        botSlug: 'mira',
        state: 'ended',
        startedAt,
        endedAt,
        durationMs: 1_000,
        reason: 'hangup',
        heard: 0,
        startMessageId: `voice-call-started-${CALL}`,
      });
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(0);
      const page = core.channels.queryMessages(dm.id, {
        text: 'voice call',
        authorKind: 'system',
      });
      expect(page.messages.map((message) => message.voiceCallRecord?.state)).toEqual([
        'ended',
        'started',
      ]);
      const record = { callId: CALL, botSlug: 'mira', state: 'started', startedAt };
      const base = { id: 'x', at: endedAt, body: 'x', voiceCallRecord: record };
      expect(isChannelMessage({ ...base, author: { kind: 'system' } })).toBe(true);
      expect(isChannelMessage({ ...base, author: { kind: 'human' } })).toBe(false);
      expect(
        isChannelMessage({
          ...base,
          author: { kind: 'system' },
          voiceCallRecord: { ...record, state: 'ended' },
        }),
      ).toBe(false);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('tells the Bot about the last call on the first typed message after it, and only then', async () => {
    const { core, dm, methods, notice, runs } = setup();
    try {
      const startedAt = new Date(Date.now() - 60_000).toISOString();
      await notice({ callId: CALL, botSlug: 'mira', state: 'started', startedAt });
      expect(
        await methods.channelSend({
          channelId: dm.id,
          body: '明天的天气怎么样',
          voiceCall: { callId: CALL },
        }),
      ).toMatchObject({ ok: true });
      await core.runtime.whenIdle();
      expect(runs.at(-1)!.message).toContain(`[Voice call ${CALL}]`);
      expect(runs.at(-1)!.message).not.toContain('Last voice call');

      const endedAt = new Date(Date.parse(startedAt) + 59_000).toISOString();
      await notice({
        callId: CALL,
        botSlug: 'mira',
        state: 'ended',
        startedAt,
        endedAt,
        durationMs: Date.parse(endedAt) - Date.parse(startedAt),
        reason: 'hangup',
        heard: 1,
      });
      expect(await methods.channelSend({ channelId: dm.id, body: '刚才说到哪了' })).toMatchObject({
        ok: true,
      });
      await core.runtime.whenIdle();
      const first = runs.at(-1)!.message;
      expect(first).toContain(`[Last voice call with the Human in this DM: ${CALL}`);
      expect(first).toContain(`from=${startedAt} to=${endedAt}`);
      expect(first).toContain('0:59');
      expect(first).toContain('1 spoken message heard');

      expect(await methods.channelSend({ channelId: dm.id, body: '还有一件事' })).toMatchObject({
        ok: true,
      });
      await core.runtime.whenIdle();
      expect(runs.at(-1)!.message).not.toContain('Last voice call');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
