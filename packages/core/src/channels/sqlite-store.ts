import { createBotSourcePolicyStore } from '../runtime/source-policy.js';
import type { ChannelStore } from './store.js';
import { DEFAULT_BOT_HOP_LIMIT } from './channel.js';
import type { SqliteChannelAccess, SqliteChannelStoreOptions } from './sqlite-store.types.js';
import { createChannelRecords } from './sqlite-store.records.js';
import { createChannelAdmissions } from './sqlite-store.admissions.js';
import { createChannelAttachments } from './sqlite-store.attachments.js';
import { createChannelHumans } from './sqlite-store.humans.js';
import { createChannelReactions } from './sqlite-store.reactions.js';
import { createChannelPlacements } from './sqlite-store.placements.js';
import { createChannelSearch } from './sqlite-store.search.js';
import { createChannelAppender } from './sqlite-store.append.js';
import { importLegacyChannels } from './sqlite-store.legacy-import.js';
import { createGroupInvitations } from './sqlite-store.invitations.js';
import { createGroupMembership } from './sqlite-store.group-membership.js';
import { createChannelNotices } from './sqlite-store.notices.js';
import { createChannelOutput } from './sqlite-store.output.js';
import { createChannelGenuiViews } from './sqlite-store.genui.js';
import { createChannelChanges } from './sqlite-store.changes.js';
import { createChannelMessageMetadata } from './sqlite-store.message-metadata.js';
import { createChannelActivity } from './sqlite-store.activity.js';

export { searchSnippet } from './sqlite-store.search.js';

const admissionsSql = {
  insertSourceAdmission: `
      INSERT INTO inbox_admissions
        (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode)
      VALUES (?, ?, ?, ?, ?)
    `,
};

const appenderSql = {
  insertSourceEvent: (sourceHumanIdentity: () => boolean) => `
        INSERT INTO source_events (
          source_event_id, source_kind, bot_slug, channel_id, message_id,
          body, created_at, payload_json${sourceHumanIdentity() ? ', human_id' : ''}
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?${sourceHumanIdentity() ? ', ?' : ''})
      `,
  insertPlacement: `
        INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
        VALUES (?, ?, ?, ?)
      `,
  insertOrdinaryAdmission: `
        INSERT INTO inbox_admissions (
          source_event_id, bot_slug, reason, wake_count, wake_interval_ms,
          wake_policy_revision, wake_mode, source_policy_revision, source_policy_wake_mode
        ) VALUES (?, ?, 'group-ordinary', ?, ?, ?, ?, ?, ?)
      `,
  insertActionSourceEvent: `
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
  insertActionPlacement: `
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `,
  insertHandledActionAdmission: `
            INSERT INTO inbox_admissions
              (source_event_id, bot_slug, reason, attempt_state, handled_at)
            VALUES (?, ?, 'bot-action', 'handled', ?)
          `,
  insertTraceSourceEvent: `
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'self-record', ?, ?, ?, '', ?, ?)
          `,
  insertTracePlacement: `
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `,
};

const invitationsSql = {
  settleInvitation: `
      UPDATE inbox_admissions SET attempt_state = 'handled',
        handled_at = COALESCE(handled_at, ?), last_error = NULL
      WHERE reason = 'group-invite' AND source_event_id IN (
        SELECT source_event_id FROM source_events WHERE message_id = ?
      )
    `,
  insertInvitationSourceEvent: `
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'system-message', ?, ?, ?, ?, ?, ?)
          `,
  insertJoinRequestSourceEvent: `
              INSERT INTO source_events (
                source_event_id, source_kind, bot_slug, channel_id, message_id,
                body, created_at, payload_json
              ) VALUES (?, 'system-message', ?, ?, ?, ?, ?, ?)
            `,
  insertJoinDecisionSourceEvent: `
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'system-message', ?, ?, ?, ?, ?, ?)
          `,
  settleJoinRequest: `
            UPDATE inbox_admissions
               SET attempt_state = 'handled', handled_at = ?
             WHERE reason = 'group-join-request'
               AND source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND attempt_state IN ('pending', 'retryable')
          `,
  settleCanceledInvitation: `
            UPDATE inbox_admissions
               SET attempt_state = 'handled', handled_at = ?
             WHERE source_event_id IN (
               SELECT source_event_id FROM source_events WHERE message_id = ?
             ) AND reason = 'group-invite' AND attempt_state IN ('pending', 'retryable')
          `,
  settleArchivedBotJoinRequests: `
                UPDATE inbox_admissions SET attempt_state = 'handled', handled_at = ?
                 WHERE reason = 'group-join-request' AND attempt_state IN ('pending', 'retryable')
                   AND source_event_id IN (
                     SELECT source_event_id FROM source_events WHERE message_id = ?
                   )
              `,
  settleArchivedBotJoinDecisions: `
          UPDATE inbox_admissions
             SET attempt_state = 'handled', handled_at = ?
           WHERE bot_slug = ? AND reason = 'group-join-decision'
             AND attempt_state IN ('pending', 'retryable')
        `,
};

const groupMembershipSql = {
  settleRetiredBotAdmissions: `UPDATE inbox_admissions
                SET attempt_state = 'handled', handled_at = ?
                WHERE reason = 'group-invite' AND attempt_state IN ('pending', 'retryable')
                  AND source_event_id IN (SELECT source_event_id FROM source_events WHERE message_id = ?)
              `,
  markRetiredBotAdmissionsForRepair: `UPDATE inbox_admissions
              SET attempt_state = 'handled', handled_at = ?, last_error = 'Group membership revoked'
              WHERE bot_slug = ? AND attempt_state IN ('pending', 'retryable')
                AND reason IN ('group-ordinary', 'group-mention', 'group-join-request', 'group-invite')
                AND source_event_id IN (SELECT source_event_id FROM source_events WHERE channel_id = ?)
            `,
  insertDepartureSourceEvent: `
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'system-message', NULL, ?, ?, ?, ?, ?)
          `,
  insertDeparturePlacement: `
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `,
  insertDepartureAdmission: `
              INSERT INTO inbox_admissions (
                source_event_id, bot_slug, reason, wake_count, wake_interval_ms,
                wake_policy_revision, wake_mode, source_policy_revision,
                source_policy_wake_mode
              ) VALUES (?, ?, 'group-ordinary', ?, ?, ?, ?, ?, ?)
            `,
  settleDepartingBotInvitations: `
              UPDATE inbox_admissions
                 SET attempt_state = 'handled', handled_at = ?
               WHERE source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND reason = 'group-invite' AND attempt_state IN ('pending', 'retryable')
            `,
  settleDepartingBotRequests: `
                UPDATE inbox_admissions
                   SET attempt_state = 'handled', handled_at = ?
                 WHERE bot_slug = ? AND reason = 'group-join-request'
                   AND attempt_state IN ('pending', 'retryable')
                   AND source_event_id IN (
                     SELECT source_event_id FROM source_events WHERE message_id = ?
                   )
              `,
  settleRevokedMembershipAdmissions: `
            UPDATE inbox_admissions
               SET attempt_state = 'handled', handled_at = ?,
                   last_error = 'Group membership revoked'
             WHERE bot_slug = ? AND reason IN ('group-ordinary', 'group-mention')
               AND attempt_state IN ('pending', 'retryable')
               AND source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE channel_id = ?
               )
          `,
  markDisbandedGroupAdmissionsForRepair: `
            UPDATE inbox_admissions SET attempt_state = 'needs-repair',
              last_error = 'channel-ended'
             WHERE source_event_id IN (
               SELECT source_event_id FROM source_events WHERE channel_id = ? AND source_kind != 'bridge-message'
             ) AND attempt_state IN ('pending', 'retryable', 'running') AND NOT EXISTS (
               SELECT 1 FROM channel_placements p JOIN channel_records c ON c.channel_id = p.channel_id
               JOIN json_each(json_extract(c.record_json, '$.members')) m ON m.value = inbox_admissions.bot_slug
               WHERE p.source_event_id = inbox_admissions.source_event_id
                 AND json_extract(c.record_json, '$.deletedAt') IS NULL
             )
          `,
  settleDisbandedGroupInvitations: `
              UPDATE inbox_admissions
                 SET attempt_state = 'handled', handled_at = ?
               WHERE source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND reason = 'group-invite'
                 AND attempt_state IN ('pending', 'retryable')
            `,
  settleDisbandedGroupRequests: `
              UPDATE inbox_admissions
                 SET attempt_state = 'handled', handled_at = ?
               WHERE source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND reason = 'group-join-request'
                 AND attempt_state IN ('pending', 'retryable')
            `,
};

const noticesSql = {
  insertMemorySourceEvent: `
              INSERT INTO source_events (
                source_event_id, source_kind, bot_slug, channel_id, message_id,
                body, created_at, payload_json
              ) VALUES (?, 'self-record', ?, ?, ?, '', ?, ?)
            `,
  insertMemoryPlacement: `
              INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
              VALUES (?, ?, ?, ?)
            `,
  insertMirroredMemoryPlacement: `
                INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
                VALUES (?, ?, ?, ?)
              `,
  insertHandledMemoryAdmission: `
              INSERT INTO inbox_admissions
                (source_event_id, bot_slug, reason, attempt_state, handled_at)
              VALUES (?, ?, 'memory-commit', 'handled', ?)
            `,
  insertBotCreateSourceEvent: `
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'self-record', ?, ?, ?, '', ?, ?)
          `,
  insertBotCreatePlacement: `
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `,
  insertHandledBotCreateAdmission: `
            INSERT INTO inbox_admissions
              (source_event_id, bot_slug, reason, attempt_state, handled_at)
            VALUES (?, ?, 'bot-action', 'handled', ?)
          `,
};

const messageMetadataSql = {
  updateVoicePayload: 'UPDATE source_events SET payload_json = ? WHERE source_event_id = ?',
  updateSessionLinksPayload: 'UPDATE source_events SET payload_json = ? WHERE source_event_id = ?',
};

const legacyImportSql = {
  insertLegacySourceEvent: (sourceHumanIdentity: () => boolean) => `
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, attempt_state, payload_json${sourceHumanIdentity() ? ', human_id' : ''}
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'handled', ?${sourceHumanIdentity() ? ', ?' : ''})
          `,
  updateLegacyPayload: 'UPDATE source_events SET payload_json = ? WHERE source_event_id = ?',
  restoreHumanDmAdmission: `
              INSERT OR IGNORE INTO inbox_admissions (
                source_event_id, bot_slug, reason, attempt_state, handled_at,
                source_policy_revision, source_policy_wake_mode
              )
              SELECT source_event_id, ?, 'human-dm', attempt_state, handled_at, ?, ?
                FROM source_events WHERE source_event_id = ?
            `,
  insertLegacyPlacement: `
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `,
  backfillForHuman: `
          UPDATE channel_placements SET for_human = coalesce((
            SELECT CASE WHEN json_valid(e.payload_json) AND json_extract(e.payload_json, '$.author.kind') = 'bot'
                   THEN coalesce(json_array_length(e.payload_json, '$.humanMentions') > 0 OR EXISTS (
                     SELECT 1 FROM channel_placements o JOIN source_events t ON t.source_event_id = o.source_event_id
                      WHERE o.channel_id = channel_placements.channel_id
                        AND o.message_id = json_extract(e.payload_json, '$.replyTo')
                        AND json_valid(t.payload_json) AND json_extract(t.payload_json, '$.author.kind') = 'human'), 0)
                   ELSE 0 END
              FROM source_events e WHERE e.source_event_id = channel_placements.source_event_id
          ), 0)
           WHERE channel_id = ?
        `,
};

export function createSqliteChannelStore(options: SqliteChannelStoreOptions): ChannelStore {
  const humanAccess: SqliteChannelAccess = { current: undefined };
  const { database, rootDir } = options;
  const now = options.now ?? (() => new Date());
  const sourcePolicy = options.sourcePolicy ?? createBotSourcePolicyStore(database, now);
  const isBotActive = options.isBotActive ?? (() => true);
  const botHopLimit = options.botHopLimit ?? (() => DEFAULT_BOT_HOP_LIMIT);

  const records = createChannelRecords({
    database,
    options,
    now,
    isBotActive,
    humanAccess,
  });
  const admissions = createChannelAdmissions({
    database,
    sourcePolicy,
    readRecord: records.readRecord,
    options,
    sql: admissionsSql,
  });
  const attachments = createChannelAttachments({
    database,
    options,
    readRecord: records.readRecord,
  });
  const humans = createChannelHumans({
    database,
    sourceHumanIdentity: admissions.sourceHumanIdentity,
    readRecord: records.readRecord,
    humanAccess,
    options,
    now,
  });
  const reactions = createChannelReactions({
    database,
    now,
    options,
    participates: humans.participates,
    readRecord: records.readRecord,
  });
  const placements = createChannelPlacements({
    humanMembers: humans.humanMembers,
    attachmentMigration: attachments.attachmentMigration,
    admissionStatuses: admissions.admissionStatuses,
    humanReceiptsFor: humans.humanReceiptsFor,
    database,
    options,
    channelReactions: reactions.channelReactions,
    humanAccess,
    readRecord: records.readRecord,
  });
  const search = createChannelSearch({
    humanAccess,
    database,
    humanMembers: humans.humanMembers,
    channelReactions: reactions.channelReactions,
    attachmentMigration: attachments.attachmentMigration,
    admissionStatuses: admissions.admissionStatuses,
    humanReceiptsFor: humans.humanReceiptsFor,
    projectPostPreview: placements.projectPostPreview,
    projectReplyThumbnail: placements.projectReplyThumbnail,
    options,
    readRecord: records.readRecord,
    projectMessageAttachments: attachments.methods.projectMessageAttachments,
  });
  const appender = createChannelAppender({
    humanIdentity: humans.methods.humanIdentity,
    sourceHumanIdentity: admissions.sourceHumanIdentity,
    readRecord: records.readRecord,
    humanAccess,
    placementsById: placements.placementsById,
    projectRows: placements.projectRows,
    placementMessages: placements.placementMessages,
    grantResolutions: placements.grantResolutions,
    isBotActive,
    options,
    assertAttachmentRefs: attachments.methods.assertAttachmentRefs,
    humanBotDm: records.humanBotDm,
    causeChannel: admissions.causeChannel,
    revisionOf: placements.revisionOf,
    hasChannelAccessSchema: records.hasChannelAccessSchema,
    database,
    botHopLimit,
    sourcePolicy,
    insertSourceAdmission: admissions.insertSourceAdmission,
    now,
    project: placements.project,
    admissionStatuses: admissions.admissionStatuses,
    humanReceiptsFor: humans.humanReceiptsFor,
    humanMembers: humans.humanMembers,
    projectPostPreview: placements.projectPostPreview,
    sql: appenderSql,
  });
  const invitations = createGroupInvitations({
    readRecord: records.readRecord,
    isBotActive,
    humanAccess,
    options,
    now,
    database,
    insertSourceAdmission: admissions.insertSourceAdmission,
    publishRecordChanged: records.publishRecordChanged,
    sql: invitationsSql,
  });
  const groupMembership = createGroupMembership({
    database,
    now,
    publishRecordChanged: records.publishRecordChanged,
    readRecord: records.readRecord,
    sourcePolicy,
    options,
    isBotActive,
    admissionStatuses: admissions.admissionStatuses,
    sql: groupMembershipSql,
  });
  const notices = createChannelNotices({
    causeChannel: admissions.causeChannel,
    humanBotDm: records.humanBotDm,
    database,
    now,
    revisionOf: placements.revisionOf,
    options,
    sql: noticesSql,
  });
  const output = createChannelOutput({
    database,
    humanAccess,
    readRecord: records.readRecord,
    humanMembers: humans.humanMembers,
    participates: humans.participates,
  });
  const genui = createChannelGenuiViews({
    readRecord: records.readRecord,
    database,
    humanIdentity: humans.methods.humanIdentity,
  });
  const changes = createChannelChanges({
    database,
    humanAccess,
    readRecord: records.readRecord,
    humanMembers: humans.humanMembers,
    placementsById: placements.placementsById,
    projectRows: placements.projectRows,
    options,
    now,
  });
  const messageMetadata = createChannelMessageMetadata({
    assertAttachmentRefs: attachments.methods.assertAttachmentRefs,
    database,
    options,
    sql: messageMetadataSql,
  });
  const activity = createChannelActivity({
    database,
    humanAccess,
  });

  importLegacyChannels({
    options,
    database,
    rootDir,
    sourceHumanIdentity: admissions.sourceHumanIdentity,
    sourcePolicy,
    sql: legacyImportSql,
  });
  changes.pruneChanges();
  invitations.settleDecidedInvitations();

  return {
    requireHumanPolicy(human, id, key) {
      humanAccess.current?.requirePolicy(human, id, key);
    },
    bindHumanAccess(access) {
      humanAccess.current = access;
    },
    getOrCreateHumanDm: records.methods.getOrCreateHumanDm,
    humanIdentity: humans.methods.humanIdentity,
    setHumanDefaultName: humans.methods.setHumanDefaultName,
    humanNickname: humans.methods.humanNickname,
    setHumanAvatar: humans.methods.setHumanAvatar,
    finishHumanProfileSetup: humans.methods.finishHumanProfileSetup,
    humanAvatars: humans.methods.humanAvatars,
    setHumanNickname: humans.methods.setHumanNickname,
    listHumanMembers: humans.methods.listHumanMembers,
    rootDir,
    get: records.methods.get,
    hasHumanMembership: humans.methods.hasHumanMembership,
    list: records.methods.list,
    getOrCreateDm: records.methods.getOrCreateDm,
    remoteHostKey: records.methods.remoteHostKey,
    trustRemoteHostKey: records.methods.trustRemoteHostKey,
    getOrCreateRemoteBotDm: records.methods.getOrCreateRemoteBotDm,
    getOrCreateBotDm: records.methods.getOrCreateBotDm,
    createGroup: records.methods.createGroup,
    inviteGroupBot: invitations.methods.inviteGroupBot,
    respondToGroupInvite: invitations.methods.respondToGroupInvite,
    requestGroupJoin: invitations.methods.requestGroupJoin,
    decideGroupJoin: invitations.methods.decideGroupJoin,
    cancelGroupInvite: invitations.methods.cancelGroupInvite,
    removeBotFromGroups: groupMembership.removeBotFromGroups,
    cancelInvitationsForBot: invitations.methods.cancelInvitationsForBot,
    getGroupWakePolicy: groupMembership.getGroupWakePolicy,
    setGroupWakePolicy: groupMembership.setGroupWakePolicy,
    removeGroupMember: groupMembership.removeGroupMember,
    appendMemoryCommits: notices.appendMemoryCommits,
    appendBotCreateAction: notices.appendBotCreateAction,
    deleteGroup: groupMembership.deleteGroup,
    setGroupAvatar: records.methods.setGroupAvatar,
    rename: records.methods.rename,
    latestHumanMessageId: output.latestHumanMessageId,
    latestMessage: placements.methods.latestMessage,
    hasMessage: placements.methods.hasMessage,
    message: placements.methods.message,
    storedQuotes: placements.methods.storedQuotes,
    humanSendStatus: output.humanSendStatus,
    observeOutput: output.observeOutput,
    outputCheckpoint: output.outputCheckpoint,
    assertAttachmentRefs: attachments.methods.assertAttachmentRefs,
    migrateAttachments: attachments.methods.migrateAttachments,
    projectMessageAttachments: attachments.methods.projectMessageAttachments,
    attachmentReference: attachments.methods.attachmentReference,
    referencedAttachmentHashes: attachments.methods.referencedAttachmentHashes,
    readPosition: humans.methods.readPosition,
    markRead: humans.methods.markRead,
    setHumanReaction: reactions.methods.setHumanReaction,
    setBotReaction: reactions.methods.setBotReaction,
    reconcileQuestionAnswer: appender.reconcileQuestionAnswer,
    appendMessage: appender.appendMessage,
    previewAllBotMention: appender.previewAllBotMention,
    grantRequestResolution: placements.methods.grantRequestResolution,
    genuiView: genui.genuiView,
    saveGenuiView: genui.saveGenuiView,
    appendMessageOnce: appender.appendMessageOnce,
    readMessages: placements.methods.readMessages,
    queryMessages: search.queryMessages,
    readTimeline: placements.methods.readTimeline,
    searchHumanMessages: search.searchHumanMessages,
    searchAllHumanMessages: search.searchAllHumanMessages,
    readHumanTimeline: placements.methods.readHumanTimeline,
    readHumanFilesPage: placements.methods.readHumanFilesPage,
    changeCursor: changes.methods.changeCursor,
    channelChangeHead: changes.methods.channelChangeHead,
    readChangedChannels: changes.methods.readChangedChannels,
    readHumanChanges: changes.methods.readHumanChanges,
    recordAttachmentChange: changes.methods.recordAttachmentChange,
    rotateChangeEpoch: changes.methods.rotateChangeEpoch,
    readHumanJournalPage: placements.methods.readHumanJournalPage,
    revision: placements.methods.revision,
    admissionChanged: admissions.methods.admissionChanged,
    setMessageVoice: messageMetadata.setMessageVoice,
    addMessageSessionLinks: messageMetadata.addMessageSessionLinks,
    privateInputRequests: messageMetadata.privateInputRequests,
    latestBotActivity: activity.latestBotActivity,
    toolApprovalHistory: activity.toolApprovalHistory,
    humanMessageCounts: activity.humanMessageCounts,
    admissionActivity: admissions.methods.admissionActivity,
    messagesAfter: placements.methods.messagesAfter,
  };
}
