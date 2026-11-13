import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
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
  const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  const other = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bea', 'Bea')!;
  for (const call of [CALLS[2], CALLS[0], CALLS[1]])
    for (const message of callMessages(call))
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, message);
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: 'between',
    at: '2026-11-01T00:00:00.000Z',
    author: { kind: 'human' },
    body: 'typed between calls',
  });
  for (const message of callMessages(
    { id: OTHER_CALL, label: 'other', startedAt: '2026-11-05T00:00:00.000Z', ended: true },
    'bea',
  ))
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, other.id, message);
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
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry: core.registry,
    states: core.states,
    channels: core.channels,
    ownership: core.ownership,
    roster: core.roster,
    runtime: core.runtime,
  });
  return { core, dm, other, read, methods, close };
}

export const PICTURE_CALLS = [
  { id: 'call-1111111111111111', label: 'first', startedAt: '2026-11-07T06:00:00.000Z' },
  { id: 'call-2222222222222222', label: 'second', startedAt: '2026-11-07T07:00:00.000Z' },
] as const;

export function pictureMessages(
  call: (typeof PICTURE_CALLS)[number],
  slug = 'ada',
): ChannelMessage[] {
  const { id: callId, label, startedAt } = call;
  const frames = (fromMs: number, toMs: number) =>
    notice(
      {
        callId,
        botSlug: slug,
        state: 'frames',
        startedAt,
        source: 'screen',
        frames: 3,
        layout: '3',
        fromMs,
        toMs,
      },
      `voice-call-frames-${callId}-${toMs}`,
      at(startedAt, toMs),
    );
  const human = (id: string, ms: number, voiceCall: ChannelMessage['voiceCall'] = { callId }) => ({
    id: `${label}-${id}`,
    at: at(startedAt, ms),
    author: { kind: 'human' as const },
    body: `${label}: ${id}`,
    voiceCall,
  });
  const visual = (fromMs: number, toMs: number) => ({
    source: 'screen' as const,
    frames: 2,
    layout: '2' as const,
    fromMs,
    toMs,
  });
  return [
    notice(
      { callId, botSlug: slug, state: 'started', startedAt },
      `voice-call-started-${callId}`,
      startedAt,
    ),
    human('early', 3_000),
    human('same-picture', 6_000, {
      callId,
      visual: { source: 'screen', sameAs: `voice-call-frames-${callId}-13000` },
    }),
    human('old-picture', 7_500, { callId, visual: visual(0, 4_000) }),
    {
      id: `${label}-reply`,
      at: at(startedAt, 8_000),
      author: { kind: 'bot', slug },
      body: `${label}: reply`,
    },
    human('edge', 9_000),
    human('said', 11_000, {
      callId,
      speechFromMs: 10_000,
      speechToMs: 11_000,
      visual: visual(2_000, 8_000),
    }),
    {
      id: `${label}-late-reply`,
      at: at(startedAt, 12_000),
      author: { kind: 'bot', slug },
      body: `${label}: late reply`,
    },
    frames(0, 13_000),
    frames(14_000, 20_000),
    notice(
      {
        callId,
        botSlug: slug,
        state: 'ended',
        startedAt,
        endedAt: at(startedAt, 30_000),
        durationMs: 30_000,
        reason: 'hangup',
        heard: 5,
        startMessageId: `voice-call-started-${callId}`,
      },
      `voice-call-ended-${callId}`,
      at(startedAt, 30_000),
    ),
  ];
}

export const pictureWindowIds = (call: (typeof PICTURE_CALLS)[number]) => [
  `${call.label}-same-picture`,
  `${call.label}-reply`,
  `${call.label}-edge`,
  `${call.label}-said`,
  `voice-call-frames-${call.id}-13000`,
];
