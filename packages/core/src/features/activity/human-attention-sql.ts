import { notChannelNoticeSql } from '../../channels/channel-notice.js';
import { channelRoleEligibleSql } from '../../team/channel-contract.js';

export const attentionBotOwner = (slug: string): string =>
  `coalesce((SELECT b.owner_human_id FROM persona_bots b WHERE b.slug = ${slug}), 'local-human') = $humanId`;
export const attentionDmOwner = (channel: string): string =>
  `(coalesce(json_extract(${channel}.record_json,'$.dmHumanId'), (SELECT b.owner_human_id FROM persona_bots b WHERE b.slug=json_extract(${channel}.record_json,'$.botSlug')), 'local-human') = $humanId)`;
export const assignmentDmRequester = (sessionId: string): string => `EXISTS (
  SELECT 1 FROM assignments requested
    JOIN source_events request ON request.source_event_id = requested.source_event_id
    JOIN channel_records requester_dm ON requester_dm.channel_id = request.channel_id
   WHERE requested.session_id = ${sessionId}
     AND json_extract(requester_dm.record_json, '$.type') = 'dm'
     AND json_extract(requester_dm.record_json, '$.deletedAt') IS NULL
     AND json_extract(requester_dm.record_json, '$.dmHumanId') = $humanId)`;
export const assignmentForeignDm = (sessionId: string): string => `EXISTS (
  SELECT 1 FROM assignments requested
    JOIN source_events request ON request.source_event_id = requested.source_event_id
    JOIN channel_records requester_dm ON requester_dm.channel_id = request.channel_id
   WHERE requested.session_id = ${sessionId}
     AND json_extract(requester_dm.record_json, '$.dmHumanId') IS NOT NULL
     AND json_extract(requester_dm.record_json, '$.dmHumanId') <> $humanId)`;
const assignmentPrincipal = `coalesce((SELECT owner_human_id FROM persona_bots WHERE slug = a.bot_slug), 'local-human')`;
const assignmentRequester = `coalesce(
  (SELECT human_id FROM source_events WHERE source_event_id = a.source_event_id),
  (SELECT human_id FROM usage_turn_humans WHERE session_id = a.session_id AND turn >= 0 ORDER BY turn LIMIT 1),
  ${assignmentPrincipal})`;

const approvalAudience = (channel: string, humanId: string): string => `(
  (json_extract(${channel}.record_json,'$.dmHumanId') IS NULL OR json_extract(${channel}.record_json,'$.dmHumanId')=${humanId})
  AND (json_extract(${channel}.record_json, '$.type') <> 'group' OR ${channelRoleEligibleSql(channel, humanId)})
  AND (json_extract(${channel}.record_json, '$.humanParticipants') IS NULL OR EXISTS (
    SELECT 1 FROM json_each(${channel}.record_json, '$.humanParticipants') participant WHERE participant.value = ${humanId})))`;

export const ACTION_ATTENTION_CTE = `WITH all_attention AS (
          SELECT 'pairing:' || pairing.id AS id,
                 'action' AS category, 'pairing-request' AS kind,
                 json_extract(pairing.body, '$.createdAt') AS created_at,
                 'dm-' || pairing.bot_slug AS channel_id,
                 coalesce((SELECT json_extract(dm.record_json, '$.name') FROM channel_records dm
                            WHERE dm.channel_id = 'dm-' || pairing.bot_slug), '') AS channel_name,
                 pairing.bot_slug,
                 pairing.purpose || ' · ' || coalesce(json_extract(pairing.body, '$.actorName'), '') || ' · '
                   || json_extract(pairing.body, '$.reference') AS summary,
                 pairing.id AS request_id, NULL AS message_id, NULL AS assignment_session_id,
                 NULL AS source_event_id
            FROM messaging_pairings pairing
           WHERE pairing.status = 'pending' AND $humanId IS NOT NULL
             AND json_extract(pairing.body, '$.expiresAt') > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          UNION ALL
          SELECT 'join:' || json_extract(j.value, '$.id') AS id,
                 'action' AS category, 'group-join-request' AS kind,
                 json_extract(j.value, '$.createdAt') AS created_at,
                 c.channel_id, json_extract(c.record_json, '$.name') AS channel_name,
                 json_extract(j.value, '$.requesterBotSlug') AS bot_slug,
                 '' AS summary, json_extract(j.value, '$.id') AS request_id,
                 NULL AS message_id, NULL AS assignment_session_id,
                 NULL AS source_event_id
            FROM channel_records c, json_each(c.record_json, '$.joinRequests') j
           WHERE json_extract(c.record_json, '$.type') = 'group'
             AND json_extract(c.record_json, '$.deletedAt') IS NULL AND (json_extract(c.record_json,'$.dmHumanId') IS NULL OR json_extract(c.record_json,'$.dmHumanId')=$humanId)
             AND json_extract(j.value, '$.status') = 'pending'
          UNION ALL
          SELECT 'question:' || e.source_event_id AS id,
                 'action' AS category, 'user-question' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, e.body, NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE (json_extract(c.record_json, '$.type') = 'group'
               OR (json_extract(c.record_json, '$.type') = 'dm' AND (json_extract(c.record_json, '$.humanParticipants') IS NOT NULL
               OR (json_extract(c.record_json, '$.botSlug') IS NOT NULL AND ${attentionDmOwner('c')}))))
             AND json_extract(c.record_json, '$.deletedAt') IS NULL AND (json_extract(c.record_json,'$.dmHumanId') IS NULL OR json_extract(c.record_json,'$.dmHumanId')=$humanId)
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.userQuestionRequest') IS NOT NULL
             AND e.message_id IN (SELECT value FROM json_each(?))
             AND NOT EXISTS (
               SELECT 1 FROM source_events resolution
                WHERE resolution.channel_id = e.channel_id
                  AND json_extract(resolution.payload_json,
                    '$.userQuestionResolution.requestMessageId') = +e.message_id
             )
          UNION ALL
          SELECT 'approval:' || e.source_event_id AS id,
                 'action' AS category, 'tool-approval' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, e.body, NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE (json_extract(c.record_json, '$.type') = 'group'
               OR (json_extract(c.record_json, '$.type') = 'dm' AND (json_extract(c.record_json, '$.humanParticipants') IS NOT NULL
               OR (json_extract(c.record_json, '$.botSlug') IS NOT NULL AND ${attentionDmOwner('c')}))))
             AND json_extract(c.record_json, '$.deletedAt') IS NULL AND (json_extract(c.record_json,'$.dmHumanId') IS NULL OR json_extract(c.record_json,'$.dmHumanId')=$humanId)
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.toolApprovalRequest') IS NOT NULL
             AND e.message_id IN (SELECT value FROM json_each(?))
             AND NOT EXISTS (
               SELECT 1 FROM source_events decision
                WHERE decision.channel_id = e.channel_id
                  AND json_extract(decision.payload_json,
                    '$.toolApprovalDecision.requestMessageId') = +e.message_id
             )
          UNION ALL
          SELECT 'autoreject:' || e.source_event_id AS id,
                 'action' AS category, 'auto-rejection' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 json_extract(e.payload_json, '$.toolAutoApproval.botSlug') AS bot_slug,
                 e.body, NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE (json_extract(c.record_json, '$.type') = 'group'
               OR (json_extract(c.record_json, '$.type') = 'dm' AND json_extract(c.record_json, '$.botSlug') = json_extract(e.payload_json, '$.toolAutoApproval.botSlug')))
             AND json_extract(c.record_json, '$.deletedAt') IS NULL AND (json_extract(c.record_json,'$.dmHumanId') IS NULL OR json_extract(c.record_json,'$.dmHumanId')=$humanId)
             AND e.source_kind = 'system-message'
             AND json_extract(e.payload_json, '$.toolAutoApproval.outcome') = 'rejected'
             AND NOT EXISTS (
               SELECT 1 FROM source_events override
                WHERE override.channel_id = e.channel_id
                  AND override.source_kind = 'human-message'
                  AND json_extract(override.payload_json,
                    '$.toolAutoApprovalOverride.recordMessageId') = +e.message_id
             )
          UNION ALL
          SELECT 'private:' || e.source_event_id AS id,
                 'action' AS category, 'private-input' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, json_extract(e.payload_json, '$.privateInputRequest.account') || ' · ' || e.body AS summary,
                 NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE (json_extract(c.record_json, '$.type') = 'group'
               OR (json_extract(c.record_json, '$.type') = 'dm' AND (json_extract(c.record_json, '$.humanParticipants') IS NOT NULL OR json_extract(c.record_json, '$.botSlug') = e.bot_slug)))
             AND json_extract(c.record_json, '$.deletedAt') IS NULL AND (json_extract(c.record_json,'$.dmHumanId') IS NULL OR json_extract(c.record_json,'$.dmHumanId')=$humanId)
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.privateInputRequest') IS NOT NULL
             AND e.message_id IN (SELECT value FROM json_each(?))
             AND NOT EXISTS (
               SELECT 1 FROM source_events resolution
                WHERE resolution.channel_id = e.channel_id
                  AND json_extract(resolution.payload_json,
                    '$.privateInputResolution.requestMessageId') = +e.message_id
             )
          UNION ALL
          SELECT 'takeover:' || e.source_event_id AS id,
                 'action' AS category, 'takeover-request' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, json_extract(e.payload_json, '$.takeoverRequest.title') || ' · ' || e.body AS summary,
                 NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE (json_extract(c.record_json, '$.type') = 'group'
               OR (json_extract(c.record_json, '$.type') = 'dm' AND json_extract(c.record_json, '$.botSlug') = e.bot_slug))
             AND json_extract(c.record_json, '$.deletedAt') IS NULL AND (json_extract(c.record_json,'$.dmHumanId') IS NULL OR json_extract(c.record_json,'$.dmHumanId')=$humanId)
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.takeoverRequest') IS NOT NULL
             AND json_extract(e.payload_json, '$.takeoverRequest.expiresAt') > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             AND NOT EXISTS (
               SELECT 1 FROM source_events resolution
                WHERE resolution.channel_id = e.channel_id
                  AND resolution.message_id = 'takeover-resolution-' || e.message_id
             )
          UNION ALL
          SELECT 'grant:' || e.source_event_id AS id,
                 'action' AS category, 'workspace-grant-request' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, e.body, NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE (json_extract(c.record_json, '$.type') = 'group'
               OR (json_extract(c.record_json, '$.type') = 'dm' AND json_extract(c.record_json, '$.botSlug') = e.bot_slug))
             AND json_extract(c.record_json, '$.deletedAt') IS NULL AND (json_extract(c.record_json,'$.dmHumanId') IS NULL OR json_extract(c.record_json,'$.dmHumanId')=$humanId)
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.grantRequest') = 1
             AND NOT EXISTS (
               SELECT 1 FROM source_events resolution
                WHERE resolution.channel_id = e.channel_id
                  AND resolution.source_kind = 'human-message'
                  AND json_extract(resolution.payload_json, '$.author.kind') = 'human'
                  AND json_extract(resolution.payload_json,
                    '$.grantRequestResolution.requestMessageId') = +e.message_id
             )
          UNION ALL
          SELECT 'assignment:' || a.session_id AS id,
                 'action' AS category,
                 CASE coalesce(json_extract(ask.payload_json, '$.assignmentReport.state'), a.latest_report_state)
                   WHEN 'blocked' THEN 'assignment-blocked'
                   ELSE 'assignment-waiting-human'
                 END AS kind,
                 coalesce(ask.created_at, a.latest_report_at) AS created_at,
                 coalesce(assignment_dm.channel_id, 'dm-' || a.bot_slug) AS channel_id,
                 coalesce(json_extract(assignment_dm.record_json, '$.name'), a.bot_slug) AS channel_name, a.bot_slug,
                 coalesce(ask.body, a.latest_report_summary) AS summary, NULL AS request_id,
                 NULL AS message_id, a.session_id AS assignment_session_id,
                 coalesce(a.open_ask_source_event_id, (
                   SELECT latest.source_event_id FROM source_events latest
                    WHERE latest.assignment_session_id = a.session_id
                      AND latest.source_kind = 'assignment-report'
                    ORDER BY latest.rowid DESC LIMIT 1
                 )) AS source_event_id
            FROM assignments a
            LEFT JOIN source_events ask ON ask.source_event_id = a.open_ask_source_event_id
            LEFT JOIN channel_records assignment_dm ON json_extract(assignment_dm.record_json, '$.botSlug') = a.bot_slug
              AND json_extract(assignment_dm.record_json, '$.type') = 'dm'
              AND json_extract(assignment_dm.record_json, '$.deletedAt') IS NULL
              AND coalesce(json_extract(assignment_dm.record_json, '$.dmHumanId'),
                    ${assignmentPrincipal}) = ${assignmentRequester}
           WHERE (assignment_dm.channel_id IS NOT NULL OR (
               ${assignmentRequester} = ${assignmentPrincipal}
               AND NOT EXISTS (SELECT 1 FROM channel_records existing_dm
                 WHERE json_extract(existing_dm.record_json, '$.botSlug') = a.bot_slug
                   AND json_extract(existing_dm.record_json, '$.type') = 'dm'
                   AND coalesce(json_extract(existing_dm.record_json, '$.dmHumanId'),
                         ${assignmentPrincipal}) = ${assignmentRequester})))
             AND ((coalesce(json_extract(ask.payload_json, '$.assignmentReport.state'), a.latest_report_state) = 'waiting-human'
                   AND a.open_ask_source_event_id IS NOT NULL)
               OR (coalesce(json_extract(ask.payload_json, '$.assignmentReport.state'), a.latest_report_state) = 'blocked'
                   AND (a.open_ask_source_event_id IS NOT NULL
                        OR a.activity IN ('idle', 'error'))))
             AND a.stop_state = 'running'
             AND a.latest_report_at IS NOT NULL
             AND (a.open_ask_source_event_id IS NOT NULL OR NOT EXISTS (
               SELECT 1 FROM source_events reply WHERE reply.channel_id = coalesce(assignment_dm.channel_id, 'dm-' || a.bot_slug)
                 AND reply.source_kind = 'human-message' AND json_extract(reply.payload_json, '$.author.kind') = 'human'
                 AND json_extract(reply.payload_json, '$.assignmentReply.sessionId') = +a.session_id
                 AND json_extract(reply.payload_json, '$.assignmentReply.sourceEventId') = coalesce(a.open_ask_source_event_id, (
                   SELECT latest.source_event_id FROM source_events latest WHERE latest.assignment_session_id = a.session_id AND latest.source_kind = 'assignment-report' ORDER BY latest.rowid DESC LIMIT 1
                 ))
             ))
          UNION ALL
          SELECT 'repair:' || a.source_event_id || ':' || a.bot_slug AS id,
                 'action' AS category, 'bot-message-needs-repair' AS kind,
                 e.created_at, e.channel_id,
                 CASE WHEN json_extract(c.record_json, '$.deletedAt') IS NULL AND (json_extract(c.record_json,'$.dmHumanId') IS NULL OR json_extract(c.record_json,'$.dmHumanId')=$humanId)
                      THEN coalesce(json_extract(c.record_json, '$.name'), '')
                      ELSE '' END AS channel_name,
                 a.bot_slug, e.body AS summary, NULL AS request_id,
                 p.message_id, NULL AS assignment_session_id, e.source_event_id
            FROM inbox_admissions a
            JOIN source_events e ON e.source_event_id = a.source_event_id
            LEFT JOIN channel_placements p ON p.source_event_id = e.source_event_id AND p.channel_id = e.channel_id
            LEFT JOIN channel_records c ON c.channel_id = e.channel_id
           WHERE a.attempt_state = 'needs-repair'
             AND e.channel_id IS NOT NULL
          UNION ALL
          SELECT 'report:' || e.source_event_id AS id,
                 'info' AS category, 'assignment-report' AS kind,
                 e.created_at, NULL AS channel_id, NULL AS channel_name,
                 e.bot_slug, e.body AS summary, NULL AS request_id,
                 NULL AS message_id, a.session_id AS assignment_session_id,
                 e.source_event_id
            FROM assignments a
            JOIN source_events e ON e.source_event_id = (
              SELECT latest.source_event_id FROM source_events latest
               WHERE latest.assignment_session_id = a.session_id
                 AND latest.source_kind = 'assignment-report'
               ORDER BY latest.rowid DESC LIMIT 1
            )
            LEFT JOIN human_attention_decisions d ON d.source_event_id = e.source_event_id AND d.human_id = $humanId
           WHERE a.latest_report_state = 'completed'
             AND d.source_event_id IS NULL
        ), attention AS (
          SELECT * FROM all_attention candidate
          WHERE NOT EXISTS (SELECT 1 FROM channel_records privacy WHERE privacy.channel_id=candidate.channel_id
            AND json_extract(privacy.record_json,'$.dmHumanId') IS NOT NULL AND json_extract(privacy.record_json,'$.dmHumanId') <> $humanId)
          AND NOT EXISTS (SELECT 1 FROM assignments private_assignment JOIN source_events origin ON origin.source_event_id=private_assignment.source_event_id
            JOIN channel_records privacy ON privacy.channel_id=origin.channel_id WHERE private_assignment.session_id=candidate.assignment_session_id
            AND json_extract(privacy.record_json,'$.dmHumanId') IS NOT NULL AND json_extract(privacy.record_json,'$.dmHumanId') <> $humanId)
          AND (candidate.kind NOT IN ('tool-approval', 'user-question', 'private-input')
            OR ${attentionBotOwner('candidate.bot_slug')}
            OR EXISTS (SELECT 1 FROM channel_records approval_channel WHERE approval_channel.channel_id = candidate.channel_id
              AND ${approvalAudience('approval_channel', '$humanId')})) AND (
(candidate.kind IN ('tool-approval', 'user-question', 'private-input') AND (
            EXISTS (SELECT 1 FROM channel_human_members m JOIN humans h USING(human_id)
              WHERE m.channel_id = candidate.channel_id AND m.human_id = $humanId AND m.left_at IS NULL AND h.status = 'active'
                AND EXISTS (SELECT 1 FROM channel_records ac WHERE ac.channel_id = candidate.channel_id AND ${approvalAudience('ac', '$humanId')}))
            OR (${attentionBotOwner('candidate.bot_slug')} AND NOT EXISTS (
              SELECT 1 FROM channel_human_members m JOIN humans h USING(human_id)
              WHERE m.channel_id = candidate.channel_id AND m.left_at IS NULL AND h.status = 'active'
                AND EXISTS (SELECT 1 FROM channel_records approval_channel WHERE approval_channel.channel_id = candidate.channel_id
                  AND ${approvalAudience('approval_channel', 'h.human_id')})
                AND (h.human_id = (SELECT owner_human_id FROM persona_bots WHERE slug = candidate.bot_slug)
                  OR h.human_id = (SELECT owner_human_id FROM team_settings)
                  OR EXISTS (SELECT 1 FROM human_roles hr JOIN host_roles r USING(role_id), json_each(r.permissions_json) permission_entry
                    WHERE hr.human_id = h.human_id AND permission_entry.value = 'approvals.opaqueTools'))
                AND (candidate.kind <> 'tool-approval'
                  OR (SELECT owner_human_id FROM persona_bots WHERE slug = candidate.bot_slug) = (SELECT owner_human_id FROM team_settings)
                  OR h.human_id = (SELECT owner_human_id FROM team_settings)
                  OR EXISTS (SELECT 1 FROM human_roles hr JOIN host_roles r USING(role_id), json_each(r.permissions_json) permission_entry
                    WHERE hr.human_id = h.human_id AND permission_entry.value = 'approvals.opaqueTools'))
            ))))
            OR (candidate.kind NOT IN ('tool-approval', 'user-question', 'private-input') AND (
              EXISTS (SELECT 1 FROM channel_records dm WHERE dm.channel_id = candidate.channel_id
                AND json_extract(dm.record_json, '$.type') = 'dm' AND ${attentionDmOwner('dm')})
              OR (candidate.kind = 'assignment-report' AND ${assignmentDmRequester('candidate.assignment_session_id')})
              OR (${attentionBotOwner('candidate.bot_slug')}
              AND NOT EXISTS (SELECT 1 FROM channel_records dm WHERE dm.channel_id = candidate.channel_id
                AND json_extract(dm.record_json, '$.type') = 'dm')
              AND ($humanId = 'local-human' OR candidate.channel_id IS NULL
                OR NOT EXISTS (SELECT 1 FROM channel_records c WHERE c.channel_id = candidate.channel_id AND json_extract(c.record_json, '$.type') = 'group')
                OR EXISTS (SELECT 1 FROM channel_human_members m WHERE m.channel_id = candidate.channel_id AND m.human_id = $humanId AND m.left_at IS NULL)))))

          )
        )`;

const channelAttentionCte = (
  excludeMuted: boolean,
  scope: 'all' | 'unread' | 'replies' | 'unread-replies' = 'all',
): string => `
  WITH visible_messages AS (
    SELECT p.channel_id, p.revision, p.message_id, p.source_event_id,
           e.created_at, e.body, e.bot_slug,
           json_extract(c.record_json, '$.name') AS channel_name,
           coalesce(r.revision, 0) AS read_revision,
           CASE WHEN json_extract(c.record_json, '$.type') = 'group'
                 AND json_extract(e.payload_json, '$.author.kind') = 'bot'
                 AND json_extract(target.payload_json, '$.author.kind') = 'human'
                 AND coalesce(target.human_id, json_extract(target.payload_json, '$.author.humanId'), 'local-human') = $humanId
                 AND original.revision >= m.visible_from_revision
                THEN 1 ELSE 0 END AS is_reply,
           CASE WHEN json_extract(c.record_json, '$.type') = 'group'
                 AND json_extract(e.payload_json, '$.author.kind') = 'bot'
                 AND EXISTS (
                   SELECT 1 FROM json_each(e.payload_json, '$.humanMentions') mention
                    WHERE json_extract(mention.value, '$.humanId') = m.human_id
                 ) THEN 1 ELSE 0 END AS is_mention
      ${
        scope !== 'all'
          ? `FROM channel_records c
      LEFT JOIN channel_read_positions r
        ON r.channel_id = c.channel_id AND r.human_id = $humanId
      LEFT JOIN channel_human_members m
        ON m.channel_id = c.channel_id AND m.human_id = $humanId
      CROSS JOIN channel_placements p
        ON p.channel_id = c.channel_id AND ${
          scope === 'unread'
            ? 'p.revision > coalesce(r.revision, 0) AND p.notice = 0'
            : scope === 'replies'
              ? 'p.for_human = 1'
              : 'p.for_human = 1 AND p.revision > coalesce(r.revision, 0)'
        }
      JOIN source_events e ON e.source_event_id = p.source_event_id
      LEFT JOIN channel_placements original ON original.channel_id = p.channel_id
        AND original.message_id = json_extract(e.payload_json, '$.replyTo')
      LEFT JOIN source_events target ON target.source_event_id = original.source_event_id`
          : `FROM channel_placements p
      JOIN source_events e ON e.source_event_id = p.source_event_id
      JOIN channel_records c ON c.channel_id = p.channel_id
      LEFT JOIN channel_placements original ON original.channel_id = p.channel_id
        AND original.message_id = json_extract(e.payload_json, '$.replyTo')
      LEFT JOIN source_events target ON target.source_event_id = original.source_event_id
      LEFT JOIN channel_read_positions r
        ON r.channel_id = p.channel_id AND r.human_id = $humanId
      LEFT JOIN channel_human_members m
        ON m.channel_id = p.channel_id AND m.human_id = $humanId`
      }
     WHERE json_extract(c.record_json, '$.deletedAt') IS NULL AND (json_extract(c.record_json,'$.dmHumanId') IS NULL OR json_extract(c.record_json,'$.dmHumanId')=$humanId)
       AND ((json_extract(c.record_json, '$.type') = 'dm'
             AND json_extract(c.record_json, '$.botSlug') IS NOT NULL
             AND ${attentionDmOwner('c')})
         OR (json_extract(c.record_json, '$.type') = 'group'
             AND m.left_at IS NULL AND m.visible_from_revision IS NOT NULL
             AND p.revision >= m.visible_from_revision))
       ${excludeMuted ? 'AND p.channel_id NOT IN (SELECT value FROM json_each(?))' : ''}
       AND json_extract(e.payload_json, '$.author.kind') != 'human'
       AND ${notChannelNoticeSql('e.payload_json')}
  ), visible_unread AS (
    SELECT * FROM visible_messages WHERE revision > read_revision
  )`;

export const INBOX_CHANNEL_ATTENTION_CTE = channelAttentionCte(true);
export const INBOX_CHANNEL_UNREAD_CTE = channelAttentionCte(true, 'unread');
export const INBOX_CHANNEL_REPLIES_CTE = channelAttentionCte(true, 'replies');
export const INBOX_CHANNEL_UNREAD_REPLIES_CTE = channelAttentionCte(true, 'unread-replies');
