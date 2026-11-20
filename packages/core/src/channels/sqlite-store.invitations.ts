import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { isValidSlug } from '../bots/slug.js';
import type { ChannelRecord, GroupInvitation, GroupJoinRequest } from './channel.js';
import type { ChannelStore } from './store.js';
import type { createChannelRecords } from './sqlite-store.records.js';
import type { SqliteChannelAccess, SqliteChannelStoreOptions } from './sqlite-store.types.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { createChannelAdmissions } from './sqlite-store.admissions.js';

export function createGroupInvitations({
  readRecord,
  isBotActive,
  humanAccess,
  options,
  now,
  database,
  insertSourceAdmission,
  publishRecordChanged,
  sql,
}: {
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
  isBotActive: (slug: string) => boolean;
  humanAccess: SqliteChannelAccess;
  options: SqliteChannelStoreOptions;
  now: () => Date;
  database: OperationalDatabaseModulePort;
  insertSourceAdmission: ReturnType<typeof createChannelAdmissions>['insertSourceAdmission'];
  publishRecordChanged: ReturnType<typeof createChannelRecords>['publishRecordChanged'];
  sql: {
    settleInvitation: string;
    insertInvitationSourceEvent: string;
    insertJoinRequestSourceEvent: string;
    insertJoinDecisionSourceEvent: string;
    settleJoinRequest: string;
    settleCanceledInvitation: string;
    settleArchivedBotJoinRequests: string;
    settleArchivedBotJoinDecisions: string;
  };
}) {
  const settleInvitation = (db: DatabaseSync, invitationId: string, timestamp: string): void => {
    db.prepare(sql.settleInvitation).run(timestamp, invitationId);
  };

  const settleDecidedInvitations = (): void => {
    if (options.databaseOwnerReady !== false)
      database.transaction(
        (db) => {
          const decisions = db
            .prepare(`
          SELECT json_extract(invitation.value, '$.id') AS id,
                 COALESCE(json_extract(invitation.value, '$.respondedAt'),
                          json_extract(invitation.value, '$.createdAt')) AS responded_at
            FROM channel_records c, json_each(c.record_json, '$.invitations') invitation
            JOIN source_events e ON e.message_id = json_extract(invitation.value, '$.id')
            JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
           WHERE json_extract(invitation.value, '$.status') IN ('accepted', 'declined')
             AND a.reason = 'group-invite' AND a.attempt_state <> 'handled'
        `)
            .all() as Array<{ id: string; responded_at: string }>;
          for (const decision of decisions)
            settleInvitation(db, decision.id, decision.responded_at);
        },
        ['bot-inbox'],
      );
  };

  const methods = {
    inviteGroupBot(input) {
      const channel = readRecord(input.channelId);
      const targetDm = readRecord(input.targetDmChannelId);
      const invitedByHuman = input.inviterHuman === true && input.inviterBotSlug === undefined;
      const invitedByOwner =
        input.inviterHuman === undefined &&
        input.inviterBotSlug !== undefined &&
        channel?.ownerBotSlug === input.inviterBotSlug &&
        channel.members.includes(input.inviterBotSlug);
      if (channel?.type !== 'group' || (!invitedByHuman && !invitedByOwner))
        throw new Error('Only the Human or Bot Group owner may invite');
      if (
        !isValidSlug(input.targetBotSlug) ||
        input.targetBotSlug === input.inviterBotSlug ||
        !isBotActive(input.targetBotSlug) ||
        targetDm?.type !== 'dm' ||
        targetDm.botSlug !== input.targetBotSlug
      )
        throw new Error('Group invite target is unavailable or already a member');
      const existing = channel.invitations?.findLast(
        (item) =>
          item.targetBotSlug === input.targetBotSlug &&
          item.targetBotCreatedAt === input.targetBotCreatedAt &&
          (item.status === 'pending' ||
            (item.status === 'accepted' && channel.members.includes(input.targetBotSlug))),
      );
      if (existing !== undefined) return existing;
      if (channel.members.includes(input.targetBotSlug))
        throw new Error('Invitee is already a Group member');
      if (
        input.invitationId !== undefined &&
        (!/^group-invite-[a-f0-9-]+$/u.test(input.invitationId) ||
          channel.invitations?.some((item) => item.id === input.invitationId))
      )
        throw new Error('Group invitation identity is unavailable');
      humanAccess.current?.requireBotJoin?.(input.targetBotSlug, channel.id);
      const autoAccept = options.autoAcceptGroupInvitations?.() === true;
      const timestamp = now().toISOString();
      const invitation: GroupInvitation = {
        id: input.invitationId ?? 'group-invite-' + randomUUID(),
        targetBotSlug: input.targetBotSlug,
        targetBotCreatedAt: input.targetBotCreatedAt,
        ...(invitedByHuman
          ? { inviterHuman: true as const }
          : { inviterBotSlug: input.inviterBotSlug! }),
        status: autoAccept ? 'accepted' : 'pending',
        createdAt: timestamp,
        ...(autoAccept ? { respondedAt: timestamp, respondedBy: 'profile-policy' as const } : {}),
      };
      const next = {
        ...channel,
        invitations: [...(channel.invitations ?? []), invitation],
        members: autoAccept ? [...channel.members, input.targetBotSlug] : channel.members,
        updatedAt: timestamp,
      };
      const body =
        (invitedByHuman ? 'Human' : 'PersonaBot ' + input.inviterBotSlug) +
        ' invites you to Group Channel ' +
        channel.name +
        ' (' +
        channel.id +
        '). Invitation ID: ' +
        invitation.id +
        (autoAccept
          ? ". Accepted by the Human's Group invitation policy without waking the Bot."
          : '. Call group_invite_respond with this ID and accept true or false. ' +
            'You cannot read or send in the Group until you accept.');
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(next),
            channel.id,
          );
          const sourceEventId = randomUUID();
          db.prepare(sql.insertInvitationSourceEvent).run(
            sourceEventId,
            input.targetBotSlug,
            targetDm.id,
            invitation.id,
            body,
            timestamp,
            JSON.stringify({
              groupInvitation: { channelId: channel.id, invitationId: invitation.id },
              ...(input.botCausation === undefined ? {} : { botCausation: input.botCausation }),
            }),
          );
          insertSourceAdmission(db, sourceEventId, input.targetBotSlug, 'group-invite');
          if (autoAccept) settleInvitation(db, invitation.id, timestamp);
        },
        ['channel', 'source-event', 'bot-inbox'],
      );
      publishRecordChanged();
      return invitation;
    },
    respondToGroupInvite(input) {
      const channel = this.list().find(
        (candidate) =>
          candidate.type === 'group' &&
          candidate.invitations?.some((item) => item.id === input.invitationId),
      );
      const invitation = channel?.invitations?.find((item) => item.id === input.invitationId);
      if (
        channel?.type !== 'group' ||
        invitation === undefined ||
        invitation.targetBotSlug !== input.targetBotSlug ||
        invitation.targetBotCreatedAt !== input.targetBotCreatedAt
      )
        throw new Error('Group invitation is unavailable to this PersonaBot');
      if (input.accept) humanAccess.current?.requireBotJoin?.(input.targetBotSlug, channel.id);
      const expectedStatus = input.accept ? 'accepted' : 'declined';
      if (invitation.status === expectedStatus) {
        if (!input.accept || channel.members.includes(input.targetBotSlug))
          return { channel, invitation };
      }
      if (
        invitation.status !== 'pending' ||
        (invitation.inviterHuman !== true &&
          (channel.ownerBotSlug !== invitation.inviterBotSlug ||
            !channel.members.includes(invitation.inviterBotSlug!))) ||
        channel.members.includes(input.targetBotSlug)
      )
        throw new Error('Group invitation is no longer pending');
      const decided: GroupInvitation = {
        ...invitation,
        status: expectedStatus,
        respondedAt: now().toISOString(),
        respondedBy: 'bot',
      };
      const updated: ChannelRecord = {
        ...channel,
        members: input.accept ? [...channel.members, input.targetBotSlug] : channel.members,
        invitations: (channel.invitations ?? []).map((item) =>
          item.id === input.invitationId ? decided : item,
        ),
        updatedAt: decided.respondedAt!,
      };
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            updated.id,
          );
          settleInvitation(db, invitation.id, decided.respondedAt!);
        },
        ['channel', 'bot-inbox'],
      );
      publishRecordChanged();
      return { channel: updated, invitation: decided };
    },
    requestGroupJoin(input) {
      const channel = readRecord(input.channelId);
      const ownerDm =
        input.ownerDmChannelId === undefined ? undefined : readRecord(input.ownerDmChannelId);
      if (
        channel?.type !== 'group' ||
        channel.members.includes(input.requesterBotSlug) ||
        (input.ownerDmChannelId !== undefined &&
          (ownerDm?.type !== 'dm' || ownerDm.botSlug !== channel.ownerBotSlug))
      )
        throw new Error('Group join target is unavailable or requester is already a member');
      const pending = channel.joinRequests?.find(
        (item) =>
          item.requesterBotSlug === input.requesterBotSlug &&
          item.requesterBotCreatedAt === input.requesterBotCreatedAt &&
          item.status === 'pending',
      );
      if (pending !== undefined) return pending;
      const timestamp = now().toISOString();
      const request: GroupJoinRequest = {
        id: 'group-join-' + randomUUID(),
        requesterBotSlug: input.requesterBotSlug,
        requesterBotCreatedAt: input.requesterBotCreatedAt,
        status: 'pending',
        createdAt: timestamp,
      };
      const updated: ChannelRecord = {
        ...channel,
        joinRequests: [...(channel.joinRequests ?? []), request],
        updatedAt: timestamp,
      };
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channel.id,
          );
          if (ownerDm !== undefined && channel.ownerBotSlug !== undefined) {
            const body =
              'PersonaBot ' +
              input.requesterBotSlug +
              ' requests to join your Group Channel ' +
              channel.name +
              ' (' +
              channel.id +
              '). Request ID: ' +
              request.id +
              '. Use group_join_decide with the request ID and accept true or false.';
            const sourceEventId = randomUUID();
            db.prepare(sql.insertJoinRequestSourceEvent).run(
              sourceEventId,
              channel.ownerBotSlug,
              ownerDm.id,
              request.id,
              body,
              timestamp,
              JSON.stringify({
                groupJoinRequest: { channelId: channel.id, requestId: request.id },
                ...(input.botCausation === undefined ? {} : { botCausation: input.botCausation }),
              }),
            );
            insertSourceAdmission(db, sourceEventId, channel.ownerBotSlug, 'group-join-request');
          }
        },
        ['channel', 'source-event', 'bot-inbox'],
      );
      publishRecordChanged();
      return request;
    },
    decideGroupJoin(input) {
      const channel = readRecord(input.channelId);
      const request = channel?.joinRequests?.find((item) => item.id === input.requestId);
      const dm = readRecord(input.requesterDmChannelId);
      if (
        channel?.type !== 'group' ||
        request === undefined ||
        request.requesterBotCreatedAt !== input.requesterBotCreatedAt ||
        dm?.type !== 'dm' ||
        dm.botSlug !== request.requesterBotSlug ||
        (input.decidedBy !== 'human' &&
          (channel.ownerBotSlug !== input.decidedBy || !channel.members.includes(input.decidedBy)))
      )
        throw new Error('Group join request is unavailable to this actor');
      const status = input.accept ? 'accepted' : 'declined';
      if (request.status === status) return { channel, request, notified: false };
      if (request.status !== 'pending' || channel.members.includes(request.requesterBotSlug))
        throw new Error('Group join request is no longer pending');
      if (input.accept) humanAccess.current?.requireBotJoin?.(request.requesterBotSlug, channel.id);
      const timestamp = now().toISOString();
      const decided: GroupJoinRequest = {
        ...request,
        status,
        decidedAt: timestamp,
        decidedBy: input.decidedBy,
      };
      const updated: ChannelRecord = {
        ...channel,
        members: input.accept ? [...channel.members, request.requesterBotSlug] : channel.members,
        joinRequests: (channel.joinRequests ?? []).map((item) =>
          item.id === request.id ? decided : item,
        ),
        updatedAt: timestamp,
      };
      const body =
        'Your request to join Group Channel ' +
        channel.name +
        ' (' +
        channel.id +
        ') was ' +
        status +
        '. ' +
        (input.accept
          ? 'You may now use channel_read and bot_send_message there.'
          : 'You are not a member of that Group.');
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channel.id,
          );
          const sourceEventId = randomUUID();
          db.prepare(sql.insertJoinDecisionSourceEvent).run(
            sourceEventId,
            request.requesterBotSlug,
            dm.id,
            'group-join-decision-' + request.id,
            body,
            timestamp,
            JSON.stringify({
              groupJoinDecision: { channelId: channel.id, requestId: request.id, status },
              ...(input.botCausation === undefined ? {} : { botCausation: input.botCausation }),
            }),
          );
          insertSourceAdmission(db, sourceEventId, request.requesterBotSlug, 'group-join-decision');
          db.prepare(sql.settleJoinRequest).run(timestamp, request.id);
        },
        ['channel', 'source-event', 'bot-inbox'],
      );
      publishRecordChanged();
      return { channel: updated, request: decided, notified: true };
    },
    cancelGroupInvite(channelId, invitationId) {
      const channel = readRecord(channelId);
      const invitation = channel?.invitations?.find((item) => item.id === invitationId);
      if (channel?.type !== 'group' || invitation === undefined || invitation.status !== 'pending')
        throw new Error('Pending Group invitation not found');
      const updated: ChannelRecord = {
        ...channel,
        invitations: (channel.invitations ?? []).map((item) =>
          item.id === invitationId
            ? { ...item, status: 'cancelled', respondedAt: now().toISOString() }
            : item,
        ),
        updatedAt: now().toISOString(),
      };
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channelId,
          );
          db.prepare(sql.settleCanceledInvitation).run(now().toISOString(), invitationId);
        },
        ['channel', 'bot-inbox'],
      );
      publishRecordChanged();
      return updated;
    },
    cancelInvitationsForBot(botSlug) {
      for (const channel of this.list()) {
        if (channel.type !== 'group') continue;
        for (const invitation of channel.invitations ?? []) {
          if (invitation.targetBotSlug === botSlug && invitation.status === 'pending')
            this.cancelGroupInvite(channel.id, invitation.id);
        }
        const current = readRecord(channel.id);
        const pending = (current?.joinRequests ?? []).filter(
          (request) => request.requesterBotSlug === botSlug && request.status === 'pending',
        );
        if (pending.length > 0 && current?.type === 'group') {
          const timestamp = now().toISOString();
          const updated: ChannelRecord = {
            ...current,
            joinRequests: (current.joinRequests ?? []).map((request) =>
              pending.some((item) => item.id === request.id)
                ? { ...request, status: 'cancelled', decidedAt: timestamp }
                : request,
            ),
            updatedAt: timestamp,
          };
          database.transaction(
            (db) => {
              db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
                JSON.stringify(updated),
                channel.id,
              );
              for (const request of pending)
                db.prepare(sql.settleArchivedBotJoinRequests).run(timestamp, request.id);
            },
            ['channel', 'bot-inbox'],
          );
          publishRecordChanged();
        }
      }
      database.transaction(
        (db) => db.prepare(sql.settleArchivedBotJoinDecisions).run(now().toISOString(), botSlug),
        ['bot-inbox'],
      );
    },
  } satisfies Pick<
    ChannelStore,
    | 'inviteGroupBot'
    | 'respondToGroupInvite'
    | 'requestGroupJoin'
    | 'decideGroupJoin'
    | 'cancelGroupInvite'
    | 'cancelInvitationsForBot'
  > &
    ThisType<ChannelStore>;

  return { settleDecidedInvitations, methods };
}
