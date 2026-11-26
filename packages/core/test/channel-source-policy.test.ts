import { describe, expect, it } from 'vitest';
import type { ChannelMessage } from '../src/channels/channel.js';
import { type ChannelSourcePolicy, type ChannelSourceRule } from '../src/channels/source-policy.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTempRoot, FIXED_NOW, trackTestOwner } from './helpers.js';

describe('Channel SQLite source policy', () => {
  it('commits policy snapshots with messages and filters departure Admissions by current membership', async () => {
    const rootDir = createTempRoot();
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: rootDir, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const database = attachOperationalModule(owner, 'messaging');
    const digest: ChannelSourceRule = {
      sourceClass: 'group-ordinary',
      wake: 'digest',
      revision: 4,
      digestCount: 3,
      digestIntervalSeconds: 45,
    };
    const silent: ChannelSourceRule = {
      sourceClass: 'group-ordinary',
      wake: 'silent',
      revision: 8,
    };
    const groupRule = (botSlug: string) => (botSlug === 'ada' ? digest : silent);
    let failPolicy = false;
    const sourcePolicy: ChannelSourcePolicy = {
      resolveIn(_db, botSlug, sourceClass) {
        if (failPolicy) throw new Error('Could not resolve source policy');
        return sourceClass === 'group-ordinary'
          ? groupRule(botSlug)
          : { sourceClass, wake: 'immediate', revision: 11 };
      },
      readGroupOrdinary: groupRule,
    };
    const admissionsFor = (messageId: string) =>
      database.read((db) =>
        db
          .prepare(`SELECT a.bot_slug, a.reason, a.wake_mode, a.wake_count, a.wake_interval_ms,
                           a.wake_policy_revision, a.source_policy_revision, a.source_policy_wake_mode
                     FROM channel_placements p
                     JOIN inbox_admissions a ON p.source_event_id = a.source_event_id
                    WHERE p.message_id = ? ORDER BY a.bot_slug`)
          .all(messageId),
      );
    const committed = new Map<string, ReturnType<typeof admissionsFor>>();
    const store = createSqliteChannelStore({
      rootDir,
      database,
      databaseOwnerReady: true,
      now: FIXED_NOW,
      sourcePolicy,
      onCommitted: ({ message }) => committed.set(message.id, admissionsFor(message.id)),
    });
    const group = store.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Policy Group',
      members: ['ada', 'bea'],
    });
    const message: ChannelMessage = {
      id: 'policy-message',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: 'Group update',
    };
    expect(store.getGroupWakePolicy(group.id, 'ada')).toMatchObject({
      mode: 'digest',
      count: 3,
      intervalSeconds: 45,
      revision: 0,
    });
    expect(store.getGroupWakePolicy(group.id, 'bea')).toMatchObject({ mode: 'silent' });

    failPolicy = true;
    await expect(store.appendMessage(OWNER_HUMAN_CONTEXT, group.id, message)).rejects.toMatchObject(
      {
        code: 'transaction-failed',
        cause: expect.objectContaining({ message: 'Could not resolve source policy' }),
      },
    );
    expect(store.message(group.id, message.id)).toBeUndefined();
    expect(admissionsFor(message.id)).toEqual([]);
    expect(committed.has(message.id)).toBe(false);

    failPolicy = false;
    await expect(
      store.appendMessage(OWNER_HUMAN_CONTEXT, group.id, message),
    ).resolves.toMatchObject({
      id: message.id,
      body: message.body,
    });
    expect(committed.get(message.id)).toEqual([
      {
        bot_slug: 'ada',
        reason: 'group-ordinary',
        wake_mode: 'digest',
        wake_count: 3,
        wake_interval_ms: 45000,
        wake_policy_revision: 0,
        source_policy_revision: 4,
        source_policy_wake_mode: 'digest',
      },
      {
        bot_slug: 'bea',
        reason: 'group-ordinary',
        wake_mode: 'silent',
        wake_count: null,
        wake_interval_ms: null,
        wake_policy_revision: 0,
        source_policy_revision: 8,
        source_policy_wake_mode: 'silent',
      },
    ]);

    store.setGroupWakePolicy(group.id, 'ada', { mode: 'all', count: 3, intervalSeconds: 45 });
    expect(store.removeGroupMember(group.id, 'bea', 'left').members).toEqual(['ada']);
    const departure = store.readMessages(group.id).find((row) => row.memberDeparture !== undefined);
    expect(committed.get(departure?.id ?? '')).toEqual([
      {
        bot_slug: 'ada',
        reason: 'group-ordinary',
        wake_mode: 'all',
        wake_count: 1,
        wake_interval_ms: 0,
        wake_policy_revision: 1,
        source_policy_revision: 4,
        source_policy_wake_mode: 'digest',
      },
    ]);
  });
});
