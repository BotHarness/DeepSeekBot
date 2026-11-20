import { randomUUID } from 'node:crypto';
import { defaultGroupWakePolicy, type BotSourcePolicyStore } from '../runtime/source-policy.js';
import type {
  ChannelMessage,
  ChannelRecord,
  GroupWakePolicyActor,
  GroupWakePolicyView,
} from './channel.js';
import type { ChannelStore } from './store.js';
import { parseRecord, type createChannelRecords } from './sqlite-store.records.js';
import { eventPayload } from './sqlite-store.message-payload.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SqliteChannelStoreOptions } from './sqlite-store.types.js';
import type { createChannelAdmissions } from './sqlite-store.admissions.js';

export function createGroupMembership({
  database,
  now,
  publishRecordChanged,
  readRecord,
  sourcePolicy,
  options,
  isBotActive,
  admissionStatuses,
  sql,
}: {
  database: OperationalDatabaseModulePort;
  now: () => Date;
  publishRecordChanged: ReturnType<typeof createChannelRecords>['publishRecordChanged'];
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
  sourcePolicy: BotSourcePolicyStore;
  options: SqliteChannelStoreOptions;
  isBotActive: (slug: string) => boolean;
  admissionStatuses: ReturnType<typeof createChannelAdmissions>['admissionStatuses'];
  sql: {
    settleRetiredBotAdmissions: string;
    markRetiredBotAdmissionsForRepair: string;
    insertDepartureSourceEvent: string;
    insertDeparturePlacement: string;
    insertDepartureAdmission: string;
    settleDepartingBotInvitations: string;
    settleDepartingBotRequests: string;
    settleRevokedMembershipAdmissions: string;
    markDisbandedGroupAdmissionsForRepair: string;
    settleDisbandedGroupInvitations: string;
    settleDisbandedGroupRequests: string;
  };
}) {
  return {
    removeBotFromGroups(botSlug, commit) {
      const changed = database.transaction(
        (db) => {
          const rows = db
            .prepare(`SELECT channel_id, record_json FROM channel_records
            WHERE json_extract(record_json, '$.type') = 'group'
              AND json_extract(record_json, '$.deletedAt') IS NULL
              AND (json_extract(record_json, '$.ownerBotSlug') = ?
                OR EXISTS (SELECT 1 FROM json_each(record_json, '$.members') WHERE value = ?))
          `)
            .all(botSlug, botSlug) as {
            channel_id: string;
            record_json: string;
          }[];
          const timestamp = now().toISOString();
          let changed = false;
          for (const row of rows) {
            const channel = parseRecord(row.record_json, row.channel_id);
            if (
              channel?.type !== 'group' ||
              channel.deletedAt !== undefined ||
              (!channel.members.includes(botSlug) && channel.ownerBotSlug !== botSlug)
            )
              continue;
            const updated: ChannelRecord = {
              ...channel,
              members: channel.members.filter((member) => member !== botSlug),
              invitations: (channel.invitations ?? []).map((invitation) =>
                invitation.status === 'pending' &&
                (invitation.inviterBotSlug === botSlug || invitation.targetBotSlug === botSlug)
                  ? { ...invitation, status: 'cancelled', respondedAt: timestamp }
                  : invitation,
              ),
              updatedAt: timestamp,
            };
            if (updated.ownerBotSlug === botSlug) delete updated.ownerBotSlug;
            if (updated.wakePolicies !== undefined) {
              updated.wakePolicies = { ...updated.wakePolicies };
              delete updated.wakePolicies[botSlug];
            }
            db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
              JSON.stringify(updated),
              channel.id,
            );
            for (const invitation of channel.invitations ?? []) {
              if (
                invitation.status !== 'pending' ||
                (invitation.inviterBotSlug !== botSlug && invitation.targetBotSlug !== botSlug)
              )
                continue;
              db.prepare(sql.settleRetiredBotAdmissions).run(timestamp, invitation.id);
            }
            db.prepare(sql.markRetiredBotAdmissionsForRepair).run(timestamp, botSlug, channel.id);
            changed = true;
          }
          commit?.(db);
          return changed;
        },
        ['channel', 'bot-inbox', 'bot-registry'],
      );
      if (changed) publishRecordChanged();
    },
    getGroupWakePolicy(channelId, botSlug): GroupWakePolicyView {
      const channel = readRecord(channelId);
      if (channel?.type !== 'group' || !channel.members.includes(botSlug))
        throw new Error('Group member not found');
      const policy =
        channel.wakePolicies?.[botSlug] ??
        defaultGroupWakePolicy(sourcePolicy.readGroupOrdinary(botSlug));
      const audit = database.read((db) =>
        db
          .prepare(`
            SELECT actor_kind, actor_bot_slug, changed_at
              FROM group_wake_policy_audit
             WHERE channel_id = ? AND bot_slug = ? AND revision = ?
          `)
          .get(channelId, botSlug, policy.revision),
      ) as
        | { actor_kind: 'human' | 'bot'; actor_bot_slug: string | null; changed_at: string }
        | undefined;
      const lastActor: GroupWakePolicyActor | null =
        audit === undefined
          ? null
          : audit.actor_kind === 'human'
            ? { kind: 'human' }
            : { kind: 'bot', botSlug: audit.actor_bot_slug! };
      return { ...policy, lastActor, changedAt: audit?.changed_at ?? null };
    },
    setGroupWakePolicy(channelId, botSlug, policy, actor = { kind: 'human' }) {
      const channel = readRecord(channelId);
      if (channel?.type !== 'group' || !channel.members.includes(botSlug))
        throw new Error('Group member not found');
      if (actor.kind === 'bot' && actor.botSlug !== botSlug)
        throw new Error('Bot can only change its own Group wake policy');
      if (
        (policy.mode !== 'all' &&
          policy.mode !== 'mentions' &&
          policy.mode !== 'digest' &&
          policy.mode !== 'silent') ||
        !Number.isSafeInteger(policy.count) ||
        policy.count < 1 ||
        policy.count > 100 ||
        !Number.isSafeInteger(policy.intervalSeconds) ||
        policy.intervalSeconds < 1 ||
        policy.intervalSeconds > 3600
      )
        throw new Error('Invalid Group wake policy');
      const previous = channel.wakePolicies?.[botSlug];
      const effective =
        previous ??
        database.transaction((db) =>
          defaultGroupWakePolicy(sourcePolicy.resolveIn(db, botSlug, 'group-ordinary')),
        );
      if (
        !policy.inherit &&
        effective.mode === policy.mode &&
        effective.count === policy.count &&
        effective.intervalSeconds === policy.intervalSeconds
      )
        return channel;
      const changedAt = now().toISOString();
      const recorded = database.read((db) =>
        db
          .prepare(
            'SELECT MAX(revision) AS revision FROM group_wake_policy_audit WHERE channel_id = ? AND bot_slug = ?',
          )
          .get(channelId, botSlug),
      ) as { revision: number | null };
      const revision = Math.max(effective.revision, recorded.revision ?? 0) + 1;
      const { inherit: _inherit, ...custom } = policy;
      const policies = { ...channel.wakePolicies, [botSlug]: { ...custom, revision } };
      if (policy.inherit) delete policies[botSlug];
      const updated: ChannelRecord = {
        ...channel,
        wakePolicies: policies,
        updatedAt: changedAt,
      };
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channelId,
          );
          db.prepare(`
            INSERT INTO group_wake_policy_audit
              (channel_id, bot_slug, revision, actor_kind, actor_bot_slug, changed_at,
               mode, count, interval_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            channelId,
            botSlug,
            revision,
            actor.kind,
            actor.kind === 'bot' ? actor.botSlug : null,
            changedAt,
            policy.mode,
            policy.count,
            policy.intervalSeconds,
          );
        },
        ['channel'],
      );
      publishRecordChanged();
      return updated;
    },
    removeGroupMember(channelId, botSlug, departureType: 'left' | 'removed' = 'removed') {
      const { updated, departure, sourceEventId, revision } = database.transaction(
        (db) => {
          const recordRow = db
            .prepare('SELECT record_json FROM channel_records WHERE channel_id = ?')
            .get(channelId) as { record_json: string } | undefined;
          const channel =
            recordRow === undefined ? undefined : parseRecord(recordRow.record_json, channelId);
          if (
            channel?.type !== 'group' ||
            channel.deletedAt !== undefined ||
            !channel.members.includes(botSlug)
          )
            throw new Error('Group member not found');
          const timestamp = now().toISOString();
          const updated: ChannelRecord = {
            ...channel,
            members: channel.members.filter((item) => item !== botSlug),
            invitations: (channel.invitations ?? []).map((item) =>
              item.status === 'pending' && item.inviterBotSlug === botSlug
                ? { ...item, status: 'cancelled', respondedAt: timestamp }
                : item,
            ),
            updatedAt: timestamp,
          };
          if (channel.ownerBotSlug === botSlug) delete updated.ownerBotSlug;
          if (updated.wakePolicies !== undefined) {
            updated.wakePolicies = { ...updated.wakePolicies };
            delete updated.wakePolicies[botSlug];
          }
          const cancelled = (channel.invitations ?? []).filter(
            (item) => item.status === 'pending' && item.inviterBotSlug === botSlug,
          );
          const displayName = options.botDisplayName?.(botSlug) ?? botSlug;
          const departure: ChannelMessage = {
            id: 'member-left-' + randomUUID(),
            at: timestamp,
            author: { kind: 'system' },
            body:
              displayName +
              (departureType === 'left' ? ' left the Channel.' : ' was removed from the Channel.'),
            memberDeparture: {
              memberKind: 'bot',
              memberId: botSlug,
              displayName,
              departureType,
            },
            format: 'text',
          };
          const sourceEventId = randomUUID();
          const revisionRow = db
            .prepare(
              'SELECT COALESCE(MAX(revision), 0) AS revision FROM channel_placements WHERE channel_id = ?',
            )
            .get(channelId) as { revision: number };
          const revision = revisionRow.revision + 1;
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channelId,
          );
          db.prepare(sql.insertDepartureSourceEvent).run(
            sourceEventId,
            channelId,
            departure.id,
            departure.body,
            timestamp,
            eventPayload(departure),
          );
          db.prepare(sql.insertDeparturePlacement).run(
            channelId,
            revision,
            sourceEventId,
            departure.id,
          );
          for (const recipientSlug of updated.members) {
            if (!isBotActive(recipientSlug)) continue;
            const sourceRule = sourcePolicy.resolveIn(db, recipientSlug, 'group-ordinary');
            const policy =
              updated.wakePolicies?.[recipientSlug] ?? defaultGroupWakePolicy(sourceRule);
            db.prepare(sql.insertDepartureAdmission).run(
              sourceEventId,
              recipientSlug,
              policy.mode === 'all' ? 1 : policy.mode === 'digest' ? policy.count : null,
              policy.mode === 'all'
                ? 0
                : policy.mode === 'digest'
                  ? policy.intervalSeconds * 1000
                  : null,
              policy.revision,
              policy.mode,
              sourceRule.revision,
              sourceRule.wake,
            );
          }
          for (const invitation of cancelled)
            db.prepare(sql.settleDepartingBotInvitations).run(timestamp, invitation.id);
          if (channel.ownerBotSlug === botSlug) {
            for (const request of channel.joinRequests ?? []) {
              if (request.status !== 'pending') continue;
              db.prepare(sql.settleDepartingBotRequests).run(timestamp, botSlug, request.id);
            }
          }
          db.prepare(sql.settleRevokedMembershipAdmissions).run(timestamp, botSlug, channelId);
          return { updated, departure, sourceEventId, revision };
        },
        ['channel', 'bot-inbox'],
      );
      publishRecordChanged();
      const deliveries = admissionStatuses(sourceEventId);
      try {
        options.onCommitted?.({
          channelId,
          message: {
            ...departure,
            channelRevision: revision,
            ...(deliveries === undefined ? {} : { deliveries }),
          },
          revision,
        });
      } catch (error) {
        options.warn?.('Channel post-commit notification failed: ' + String(error));
      }
      return updated;
    },
    deleteGroup(channelId) {
      const channel = readRecord(channelId);
      if (channel?.type !== 'group') throw new Error('Group Channel not found');
      const timestamp = now().toISOString();
      const deleted: ChannelRecord = {
        id: channel.id,
        type: channel.type,
        name: channel.name,
        members: [],
        deletedAt: timestamp,
        createdAt: channel.createdAt,
        updatedAt: timestamp,
      };
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(deleted),
            channelId,
          );
          db.prepare(sql.markDisbandedGroupAdmissionsForRepair).run(channelId);
          for (const invitation of channel.invitations ?? [])
            db.prepare(sql.settleDisbandedGroupInvitations).run(timestamp, invitation.id);
          for (const request of channel.joinRequests ?? [])
            db.prepare(sql.settleDisbandedGroupRequests).run(timestamp, request.id);
        },
        ['channel', 'bot-inbox'],
      );
      publishRecordChanged();
    },
  } satisfies Pick<
    ChannelStore,
    | 'removeBotFromGroups'
    | 'getGroupWakePolicy'
    | 'setGroupWakePolicy'
    | 'removeGroupMember'
    | 'deleteGroup'
  >;
}
