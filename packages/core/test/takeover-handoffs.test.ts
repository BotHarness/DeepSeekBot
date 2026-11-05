import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import { isChannelMessage } from '../src/channels/channel.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { TakeoverError, takeoverResolutionId } from '../src/takeover/contracts.js';
import { createTakeoverHandoffs } from '../src/takeover/handoffs.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function fixture(options: { access?: boolean; start?: number } = {}) {
  const root = createTempRoot();
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const database = attachOperationalModule(owner, 'channels');
  const channels = createSqliteChannelStore({
    database,
    rootDir: join(root, 'channels'),
    attachments: createAttachmentStore({ rootDir: join(root, 'attachments') }),
  });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const group = channels.createGroup({ name: 'Team', members: ['ada', 'bob'] });
  let clock = options.start ?? Date.parse('2026-11-03T10:00:00.000Z');
  const events: Array<{ phase: string; fields: Record<string, unknown>; bot?: string }> = [];
  const admitted: string[] = [];
  const handoffs = createTakeoverHandoffs({
    database: attachOperationalModule(owner, 'takeover'),
    channels,
    targetDenial: (_bot, target) =>
      options.access === false ? `${target} access is off` : undefined,
    canPost: (bot, channelId) =>
      channelId === dm.id ? bot === 'ada' : channels.get(channelId)?.members.includes(bot) === true,
    admit: (channelId, messageId) => admitted.push(`${channelId}/${messageId}`),
    events: {
      record: (_source, phase, fields, extra) =>
        events.push({ phase, fields, ...(extra?.bot === undefined ? {} : { bot: extra.bot }) }),
    },
    now: () => clock,
  });
  const admissions = (sourceMessageId: string) =>
    database.read((db) =>
      db
        .prepare(
          `SELECT a.bot_slug, a.reason FROM inbox_admissions a
             JOIN source_events e USING(source_event_id)
            WHERE e.message_id = ? ORDER BY a.bot_slug`,
        )
        .all(sourceMessageId),
    ) as Array<{ bot_slug: string; reason: string }>;
  const sourceOf = (sourceMessageId: string) =>
    database.read((db) =>
      db
        .prepare(
          `SELECT source_kind,
                  json_extract(payload_json, '$.takeoverResolution') IS NOT NULL AS resolution
             FROM source_events WHERE message_id = ?`,
        )
        .get(sourceMessageId),
    ) as { source_kind: string; resolution: number } | undefined;
  return {
    sourceOf,
    channels,
    dm,
    group,
    handoffs,
    events,
    admitted,
    admissions,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const request = {
  botSlug: 'ada',
  target: 'browser',
  title: 'Sign in to Example',
  message: 'Please sign in to example.test in my browser, then press Done.',
  initiator: 'bot' as const,
};

describe('Takeover Handoff', () => {
  afterEach(() => vi.useRealTimers());

  it('posts a card, and a Human Done wakes the requesting Bot in its DM', async () => {
    const f = fixture();
    const handoff = await f.handoffs.request({ ...request, channelId: f.dm.id, sessionId: 's-1' });
    expect(handoff).toMatchObject({
      channelId: f.dm.id,
      botSlug: 'ada',
      target: 'browser',
      title: 'Sign in to Example',
      status: 'pending',
      expiresAt: '2026-11-03T10:30:00.000Z',
    });
    const card = f.channels.message(f.dm.id, handoff.id)!;
    expect(isChannelMessage(card)).toBe(true);
    expect(card.author).toEqual({ kind: 'bot', slug: 'ada' });
    expect(card.body).toBe(request.message);
    expect(card.takeoverRequest).toEqual({
      target: 'browser',
      title: 'Sign in to Example',
      expiresAt: '2026-11-03T10:30:00.000Z',
      sessionId: 's-1',
    });
    expect(f.admissions(handoff.id)).toEqual([]);

    const done = await f.handoffs.complete(f.dm.id, handoff.id, 'done', 'web');
    expect(done).toMatchObject({ status: 'done', resolvedBy: 'human' });
    const resolution = f.channels.message(f.dm.id, takeoverResolutionId(handoff.id))!;
    expect(resolution.author).toEqual({ kind: 'human' });
    expect(resolution.replyTo).toBe(handoff.id);
    expect(resolution.takeoverResolution).toEqual({
      requestMessageId: handoff.id,
      outcome: 'done',
      by: 'human',
    });
    expect(f.admissions(resolution.id)).toEqual([{ bot_slug: 'ada', reason: 'human-dm' }]);
    expect(f.events.map((event) => event.phase)).toEqual(['requested', 'done']);
    expect(f.events[1]).toMatchObject({ bot: 'ada', fields: { by: 'human', wakes: true } });
    await expect(f.handoffs.complete(f.dm.id, handoff.id, 'failed', 'web')).rejects.toMatchObject({
      code: 'not-pending',
    });
  });

  it('wakes only the requester in a Group, and a Bot cancel wakes nobody', async () => {
    const f = fixture();
    const first = await f.handoffs.request({ ...request, channelId: f.group.id });
    const failed = await f.handoffs.complete(f.group.id, first.id, 'failed', 'cli');
    expect(failed.status).toBe('failed');
    expect(f.admissions(takeoverResolutionId(first.id))).toEqual([
      { bot_slug: 'ada', reason: 'group-mention' },
    ]);
    const second = await f.handoffs.request({ ...request, channelId: f.group.id });
    await expect(
      f.handoffs.cancel(f.group.id, second.id, 'bot', 'bot-tool', 'bob'),
    ).rejects.toMatchObject({ code: 'not-found' });
    const cancelled = await f.handoffs.cancel(f.group.id, second.id, 'bot', 'bot-tool', 'ada');
    expect(cancelled).toMatchObject({ status: 'cancelled', resolvedBy: 'bot' });
    expect(f.channels.message(f.group.id, takeoverResolutionId(second.id))?.author).toEqual({
      kind: 'bot',
      slug: 'ada',
    });
    expect(f.admissions(takeoverResolutionId(second.id))).toEqual([]);
    expect(f.admitted).toEqual([`${f.group.id}/${takeoverResolutionId(first.id)}`]);
  });

  it('wakes the Bot when the Human cancels', async () => {
    const f = fixture();
    const handoff = await f.handoffs.request({ ...request, channelId: f.dm.id });
    await f.handoffs.cancel(f.dm.id, handoff.id, 'human', 'web');
    expect(f.admissions(takeoverResolutionId(handoff.id))).toEqual([
      { bot_slug: 'ada', reason: 'human-dm' },
    ]);
    expect(f.handoffs.list({ botSlug: 'ada' })[0]).toMatchObject({
      status: 'cancelled',
      resolvedBy: 'human',
    });
  });

  it('allows one pending request per Bot and refuses targets that are off', async () => {
    const f = fixture();
    await f.handoffs.request({ ...request, channelId: f.dm.id });
    await expect(f.handoffs.request({ ...request, channelId: f.dm.id })).rejects.toMatchObject({
      code: 'already-pending',
    });
    const off = fixture({ access: false });
    await expect(
      off.handoffs.request({ ...request, target: 'computer', channelId: off.dm.id }),
    ).rejects.toBeInstanceOf(TakeoverError);
    expect(off.events.at(-1)).toMatchObject({
      phase: 'request-refused',
      fields: { reason: 'target-off', target: 'computer' },
    });
    await expect(
      off.handoffs.request({ ...request, target: 'phone', channelId: off.dm.id }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(
      f.handoffs.request({ ...request, botSlug: 'bob', channelId: f.dm.id }),
    ).rejects.toMatchObject({ code: 'channel-unavailable' });
  });

  it('expires on its timer, records it as Host, and wakes the Bot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-11-03T10:00:00.000Z'));
    const f = fixture({ start: Date.now() });
    const handoff = await f.handoffs.request({ ...request, channelId: f.dm.id, minutes: 1 });
    f.advance(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() =>
      expect(f.channels.message(f.dm.id, takeoverResolutionId(handoff.id))).toBeDefined(),
    );
    const resolution = f.channels.message(f.dm.id, takeoverResolutionId(handoff.id))!;
    expect(resolution.author).toEqual({ kind: 'system' });
    expect(resolution.takeoverResolution?.outcome).toBe('expired');
    expect(f.admissions(resolution.id)).toEqual([{ bot_slug: 'ada', reason: 'human-dm' }]);
    expect(f.sourceOf(resolution.id)).toEqual({ source_kind: 'system-message', resolution: 1 });
    expect(f.events.at(-1)).toMatchObject({ phase: 'expired', fields: { by: 'host' } });
    f.handoffs.close();
  });

  it('expires overdue requests on recovery and never logs the Bot sentence', async () => {
    const f = fixture();
    const handoff = await f.handoffs.request({ ...request, channelId: f.dm.id, minutes: 5 });
    f.advance(6 * 60_000);
    await f.handoffs.recover();
    expect(f.handoffs.get(f.dm.id, handoff.id)?.status).toBe('expired');
    expect(JSON.stringify(f.events)).not.toContain('example.test');
  });
});
