import type { ChannelMessage } from '../src/channels/channel.js';
import {
  voiceCallRecordBody,
  type ChannelVoiceCallRecord,
} from '../src/channels/voice-call-record.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

export const CALLS = [
  {
    id: 'call-aaaaaaaaaaaaaaaa',
    label: 'week',
    startedAt: '2026-10-31T10:00:00.000Z',
    ended: true,
  },
  {
    id: 'call-bbbbbbbbbbbbbbbb',
    label: 'yesterday',
    startedAt: '2026-11-06T09:00:00.000Z',
    ended: true,
  },
  {
    id: 'call-cccccccccccccccc',
    label: 'now',
    startedAt: '2026-11-07T08:00:00.000Z',
    ended: false,
  },
] as const;
export const OTHER_CALL = 'call-dddddddddddddddd';

export const at = (startedAt: string, ms: number) =>
  new Date(Date.parse(startedAt) + ms).toISOString();

function notice(record: ChannelVoiceCallRecord, id: string, when: string): ChannelMessage {
  return {
    id,
    at: when,
    author: { kind: 'system' },
    body: voiceCallRecordBody(record),
    voiceCallRecord: record,
  };
}

export function callMessages(
  call: (typeof CALLS)[number] | { id: string; label: string; startedAt: string; ended: boolean },
  slug = 'ada',
): ChannelMessage[] {
  const { id: callId, label, startedAt } = call;
  const messages: ChannelMessage[] = [
    notice(
      { callId, botSlug: slug, state: 'started', startedAt },
      `voice-call-started-${callId}`,
      startedAt,
    ),
    {
      id: `${label}-hello`,
      at: at(startedAt, 5_000),
      author: { kind: 'human' },
      body: `${label}: hello`,
      voiceCall: { callId },
    },
    {
      id: `${label}-look`,
      at: at(startedAt, 15_000),
      author: { kind: 'human' },
      body: `${label}: look at this`,
      voiceCall: { callId },
    },
    notice(
      {
        callId,
        botSlug: slug,
        state: 'frames',
        startedAt,
        source: 'camera',
        frames: 1,
        layout: '1',
        fromMs: 16_000,
        toMs: 20_000,
      },
      `voice-call-frames-${callId}-20000`,
      at(startedAt, 20_000),
    ),
    {
      id: `${label}-reply`,
      at: at(startedAt, 30_000),
      author: { kind: 'bot', slug },
      body: `${label}: I see it`,
    },
    {
      id: `${label}-bye`,
      at: at(startedAt, 50_000),
      author: { kind: 'human' },
      body: `${label}: bye`,
      voiceCall: { callId },
    },
  ];
  if (call.ended)
    messages.push(
      notice(
        {
          callId,
          botSlug: slug,
          state: 'ended',
          startedAt,
          endedAt: at(startedAt, 60_000),
          durationMs: 60_000,
          reason: 'hangup',
          heard: 3,
          startMessageId: `voice-call-started-${callId}`,
        },
        `voice-call-ended-${callId}`,
        at(startedAt, 60_000),
      ),
    );
  return messages;
}

export async function setup() {
  const core = createCore({
    dshHome: createTempRoot('botharness-call-read-'),
    agents: createDshBotAgentAdapter({
      agents: new FakeAgentHost({ kind: 'completed' }),
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.registry.create({ slug: 'bea', displayName: 'Bea' });
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  const other = core.channels.getOrCreateDm('bea', 'Bea')!;
  for (const call of [CALLS[2], CALLS[0], CALLS[1]])
    for (const message of callMessages(call)) await core.channels.appendMessage(dm.id, message);
  await core.channels.appendMessage(dm.id, {
    id: 'between',
    at: '2026-11-01T00:00:00.000Z',
    author: { kind: 'human' },
    body: 'typed between calls',
  });
  for (const message of callMessages(
    { id: OTHER_CALL, label: 'other', startedAt: '2026-11-05T00:00:00.000Z', ended: true },
    'bea',
  ))
    await core.channels.appendMessage(other.id, message);
  const read = async (args: Record<string, unknown>) =>
    (
      await core.runtime.runDirectBotTool!(
        'ada',
        'channel_read',
        args['scope'] === 'joined' ? args : { channel_id: dm.id, ...args },
        new AbortController().signal,
      )
    ).result as {
      messages: Array<{ message: ChannelMessage }>;
      call?: Record<string, unknown>;
      nextCursor?: string;
    };
  const close = async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  const methods = createBridgeMethods({
    registry: core.registry,
    states: core.states,
    channels: core.channels,
    ownership: core.ownership,
    roster: core.roster,
    runtime: core.runtime,
  });
  return { core, dm, other, read, methods, close };
}
