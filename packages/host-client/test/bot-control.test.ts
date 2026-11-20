import { describe, expect, it, vi } from 'vitest';
import {
  compactBot,
  newBotSession,
  readBotAttention,
  setBotAvatar,
  stopBot,
  stopSession,
} from '../src/bot-control';
import { HostAnswerInvalid } from '../src/host-answer';

const at = '2026-11-20T00:00:00Z';
const item = {
  id: 'event-1',
  botSlug: 'tea',
  reason: 'human-dm',
  state: 'handled',
  createdAt: at,
  sourceKind: 'channel',
  sourceAvailable: true,
  authorKind: 'human',
  summary: 'Tea',
};
const origin = {
  platform: 'feishu',
  accountName: 'Tea',
  conversationName: 'Tea room',
  conversationId: 'conversation-1',
  senderId: 'sender-1',
};
const bot = {
  slug: 'tea',
  displayName: 'Tea',
  aggregateState: 'idle',
  createdAt: at,
  roles: [],
  workspaces: [],
  standingLimits: { soul: 1500, coreMemory: 2000 },
  sessions: {},
};
const runAttention = (value: unknown) =>
  readBotAttention({ call: vi.fn().mockResolvedValue(value) }, { slug: 'tea' });
const runAvatar = (value: unknown) =>
  setBotAvatar({ call: vi.fn().mockResolvedValue(value) }, { channelId: 'dm-tea', avatar: null });

describe('Bot attention', () => {
  it('preserves an absent cursor and valid optional details', async () => {
    await expect(runAttention({ items: [item] })).resolves.toEqual({ items: [item] });
    const detailed = {
      ...item,
      assignmentTurn: 2,
      resolutionNote: 'done',
      externalOrigin: {
        ...origin,
        senderName: 'Pat',
        voice: { transcript: 'platform', itemId: 'audio', durationMs: 42 },
      },
    };
    await expect(runAttention({ items: [detailed], nextCursor: 'next' })).resolves.toEqual({
      items: [detailed],
      nextCursor: 'next',
    });
  });

  it.each([
    { id: null },
    { state: ['handled'] },
    { authorKind: ['human'] },
    { sourceAvailable: 'no' },
    { assignmentTurn: -1 },
    { assignmentReportState: ['progress'] },
    ...[
      'observedAt',
      'handledAt',
      'ignoredAt',
      'resolutionNote',
      'snoozedUntil',
      'snoozeNote',
      'sourceChannelId',
      'sourceChannelName',
      'sourceMessageId',
      'assignmentSessionId',
      'assignmentTitle',
      'relatedReportSourceEventId',
      'scheduleId',
      'authorBotSlug',
    ].map((key) => ({ [key]: null })),
    { externalOrigin: { ...origin, conversationId: false } },
    { externalOrigin: { ...origin, senderName: null } },
    { externalOrigin: { ...origin, voice: { transcript: 'bad' } } },
    ...['itemId', 'durationMs', 'encodeType', 'sampleRate', 'bitsPerSample'].map((key) => ({
      externalOrigin: { ...origin, voice: { transcript: 'platform', [key]: null } },
    })),
  ])('rejects a malformed inbox row %j', async (change) => {
    await expect(runAttention({ items: [{ ...item, ...change }] })).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
  });

  it('rejects a malformed cursor', async () => {
    await expect(runAttention({ items: [], nextCursor: null })).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
  });
});

describe('Bot avatar', () => {
  it('preserves the Bot detail with and without optional fields', async () => {
    await expect(runAvatar({ bot })).resolves.toEqual({ bot });
    const updated = {
      ...bot,
      avatar: '/api/avatar',
      orchestratorRunner: { engine: 'dsh', displayName: 'DeepSeek Harness' },
    };
    await expect(runAvatar({ bot: updated })).resolves.toEqual({ bot: updated });
  });

  it.each([
    { displayName: undefined },
    { standingLimits: null },
    { sessions: { a: 'idle' } },
    { avatar: null },
    { avatarSeed: 1 },
    { banner: { recipe: { scene: 'city', seed: null } } },
    { appearance: [] },
    { primaryColor: null },
    { tob: { defaultName: true, defaultAvatar: null } },
    { orchestratorRunner: { engine: 'dsh', displayName: 'DSH', account: null } },
    {
      modelPlan: {
        revision: 1,
        appliedAt: at,
        sourcePresetId: 'p',
        sourcePresetName: 'P',
        orchestrator: { provider: 'd', model: 'm' },
        assignmentGroupOptions: [{ group: 'g', note: null }],
      },
    },
  ])('rejects a malformed Bot detail %j', async (change) => {
    await expect(runAvatar({ bot: { ...bot, ...change } })).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
  });
});

describe('Session control', () => {
  it('reads new Session and compaction results', async () => {
    const host = {
      call: vi.fn().mockResolvedValueOnce({ started: true }).mockResolvedValueOnce({
        outcome: 'not-loaded',
        tokensBefore: null,
        tokensAfter: null,
      }),
    };
    await expect(newBotSession(host, 'tea')).resolves.toEqual({ started: true });
    await expect(compactBot(host, 'tea')).resolves.toEqual({
      outcome: 'not-loaded',
      tokensBefore: null,
      tokensAfter: null,
    });
  });

  it('requires explicit new Session confirmation', async () => {
    await expect(
      newBotSession({ call: vi.fn().mockResolvedValue({ started: false }) }, 'tea'),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
  });

  it.each([
    { outcome: 'done', tokensBefore: 10, tokensAfter: 2 },
    { outcome: 'compacted', tokensBefore: '10', tokensAfter: 2 },
    { outcome: 'compacted', tokensBefore: 10 },
    { outcome: 'compacted', tokensBefore: 10, tokensAfter: -1 },
  ])('rejects a malformed compaction result %j', async (value) => {
    await expect(
      compactBot({ call: vi.fn().mockResolvedValue(value) }, 'tea'),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
  });

  it.each([stopBot, stopSession])(
    'requires both stop result lists and validates the optional message',
    async (stop) => {
      const result = {
        stopped: [],
        alreadyIdle: [{ botSlug: 'tea', sessionId: 's', role: 'orchestrator' }],
      };
      const host = { call: vi.fn() };
      for (const value of [result, { ...result, messageId: 'notice' }]) {
        host.call.mockResolvedValueOnce(value);
        await expect(stop(host, { botSlug: 'tea' })).resolves.toEqual(value);
      }
      for (const value of [
        { stopped: [] },
        { alreadyIdle: [] },
        { ...result, messageId: 5 },
        { ...result, stopped: [{ botSlug: 'tea', sessionId: 's', role: 'subagent' }] },
      ]) {
        host.call.mockResolvedValueOnce(value);
        await expect(stop(host, { botSlug: 'tea' })).rejects.toBeInstanceOf(HostAnswerInvalid);
      }
    },
  );
});
