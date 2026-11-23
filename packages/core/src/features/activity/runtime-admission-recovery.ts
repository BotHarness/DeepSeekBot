import type { ChannelRecord } from '../../channels/channel.js';
import type { ChannelStore } from '../../channels/store.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { BotSourcePolicyStore } from '../../runtime/source-policy.js';
import type { AssignmentRow } from '../assignments/events-types.js';

interface RuntimeAdmissionRecoveryPorts {
  botNetwork: import('../../runtime/bot-network.js').BotNetworkPort | undefined;
  channels: ChannelStore;
  closed: () => boolean;
  createEventId: () => string;
  database: OperationalDatabaseModulePort;
  isMember: (botSlug: string, channel: ChannelRecord) => boolean;
  now: () => Date;
  sourcePolicy: BotSourcePolicyStore;
}

export function createRuntimeAdmissionRecovery(ports: RuntimeAdmissionRecoveryPorts) {
  function recoverInterruptedAttempts(): Array<{
    channel_id: string;
    message_id: string;
    body: string;
  }> {
    const interruptedDms = ports.database.read((database) =>
      database
        .prepare(
          `
        SELECT e.channel_id, e.message_id, e.body
          FROM source_events e
          JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
         WHERE e.source_kind = 'human-message' AND a.reason = 'human-dm'
           AND e.attempt_state = 'running' AND a.attempt_state = 'running'
           AND e.channel_id IS NOT NULL AND e.message_id IS NOT NULL
         ORDER BY e.created_at, e.message_id
      `,
        )
        .all(),
    ) as Array<{ channel_id: string; message_id: string; body: string }>;
    ports.database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events SET attempt_state = 'needs-repair'
              WHERE attempt_state = 'running' AND side_effect_started_at IS NOT NULL`,
          )
          .run();
        database
          .prepare(
            `UPDATE source_events SET attempt_state = 'retryable'
              WHERE attempt_state = 'running' AND side_effect_started_at IS NULL`,
          )
          .run();
      },
      ['source-event', 'bot-inbox'],
    );
    ports.database.transaction(
      (database) => {
        database
          .prepare(
            "UPDATE assignments SET stop_state = 'stopped', activity = 'idle', continuity_key = NULL, open_ask_source_event_id = NULL, open_ask_at = NULL WHERE stop_state = 'requested'",
          )
          .run();

        const interrupted = database
          .prepare(
            "SELECT bot_slug, session_id FROM assignments WHERE activity = 'working' AND stop_state = 'running'",
          )
          .all() as Array<Pick<AssignmentRow, 'bot_slug' | 'session_id'>>;
        const at = ports.now().toISOString();
        for (const assignment of interrupted) {
          const id = ports.createEventId();
          const rule = ports.sourcePolicy.resolveIn(
            database,
            assignment.bot_slug,
            'assignment-lifecycle',
          );
          database
            .prepare(
              "UPDATE assignments SET activity = 'error', updated_at = ? WHERE bot_slug = ? AND session_id = ? AND activity = 'working' AND stop_state = 'running'",
            )
            .run(at, assignment.bot_slug, assignment.session_id);
          database
            .prepare(
              `
              INSERT INTO source_events (source_event_id, source_kind, bot_slug, assignment_session_id,
                body, created_at, handled_at, attempt_state, expects_reply, payload_json)
              VALUES (?, 'assignment-lifecycle', ?, ?, ?, ?, ?, 'handled', 0, ?)
            `,
            )
            .run(
              id,
              assignment.bot_slug,
              assignment.session_id,
              'Host recovery found this Assignment still marked as executing. Its prior execution outcome is unconfirmed; it was not resumed automatically. Its context is kept: send_assignment_request with this Session id continues it; archive_assignment resolves it.',
              at,
              at,
              JSON.stringify({
                author: { kind: 'system' },
                assignmentLifecycle: {
                  state: 'interrupted',
                  cause: 'host-recovery',
                },
              }),
            );
          database
            .prepare(
              `
              INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode)
              VALUES (?, ?, 'assignment-lifecycle', ?, ?)
            `,
            )
            .run(id, assignment.bot_slug, rule.revision, rule.wake);
        }
      },
      ['assignments', 'source-event', 'bot-inbox'],
    );
    ports.database.transaction(
      (database) => {
        database
          .prepare(
            `
        UPDATE inbox_admissions SET attempt_state =
          CASE WHEN side_effect_started_at IS NULL THEN 'retryable' ELSE 'needs-repair' END
        WHERE attempt_state = 'running'
      `,
          )
          .run();
        database
          .prepare(
            `
            UPDATE inbox_admissions
               SET attempt_state = 'needs-repair',
                   last_error = 'Assignment report observation interrupted'
             WHERE reason IN ('assignment-report', 'assignment-lifecycle')
               AND observed_at IS NOT NULL
               AND attempt_state = 'retryable'
          `,
          )
          .run();
        database
          .prepare(
            `
            UPDATE source_events SET observed_at = NULL
             WHERE source_kind IN ('memory-change', 'schedule', 'bridge-message')
               AND source_event_id IN (
                 SELECT source_event_id FROM inbox_admissions
                  WHERE reason IN ('memory-change', 'schedule', 'group-mention', 'group-ordinary', 'human-dm') AND attempt_state = 'retryable'
                    AND side_effect_started_at IS NULL
               )
          `,
          )
          .run();
        database
          .prepare(
            `
            UPDATE inbox_admissions SET observed_at = NULL
             WHERE (reason IN ('memory-change', 'schedule', 'group-mention', 'group-ordinary') OR
                    (reason = 'human-dm' AND source_event_id IN (
                      SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'
                    ))) AND attempt_state = 'retryable'
               AND side_effect_started_at IS NULL
          `,
          )
          .run();
      },
      ['source-event', 'bot-inbox'],
    );
    return interruptedDms;
  }

  async function retireWithdrawnNetworkAdmissions(
    botSlug: string,
    withdrawnHost?: string,
  ): Promise<void> {
    const membership = ports.botNetwork?.membership;
    if (membership === undefined && withdrawnHost === undefined) return;
    const pending = ports.database.read((database) =>
      database
        .prepare(
          `
        SELECT a.source_event_id, e.channel_id, e.message_id
          FROM inbox_admissions a JOIN source_events e USING (source_event_id)
         WHERE a.bot_slug = ? AND a.reason = 'bot-dm'
           AND a.attempt_state IN ('pending', 'retryable')
           AND a.observed_at IS NULL AND a.side_effect_started_at IS NULL
           AND a.ignored_at IS NULL
      `,
        )
        .all(botSlug),
    ) as Array<{
      source_event_id: string;
      channel_id: string;
      message_id: string;
    }>;
    const hosts = new Map<string, boolean>();
    for (const row of pending) {
      const peer = ports.channels.get(row.channel_id)?.remoteBot;
      if (peer === undefined) continue;
      if (withdrawnHost !== undefined && peer.hostId !== withdrawnHost) continue;
      const unverified = peer.membership === undefined;
      if (!unverified && !hosts.has(peer.hostId)) {
        const state =
          withdrawnHost === peer.hostId
            ? 'withdrawn'
            : await membership!(peer.hostId).catch(() => 'unavailable');
        hosts.set(peer.hostId, state === 'withdrawn');
      }
      if ((!unverified && !hosts.get(peer.hostId)) || ports.closed()) continue;
      const at = ports.now().toISOString();
      ports.database.transaction(
        (database) => {
          database
            .prepare(
              `
          UPDATE inbox_admissions
             SET attempt_state = 'handled', handled_at = ?, ignored_at = ?,
                 snoozed_until = NULL, wake_count = NULL, wake_interval_ms = NULL,
                 last_error = ?
           WHERE source_event_id = ? AND bot_slug = ?
             AND attempt_state IN ('pending', 'retryable')
             AND observed_at IS NULL AND side_effect_started_at IS NULL AND ignored_at IS NULL
        `,
            )
            .run(
              at,
              at,
              unverified
                ? 'Bot collaboration provenance unavailable before execution'
                : 'Bot collaboration membership withdrawn before execution',
              row.source_event_id,
              botSlug,
            );
        },
        ['bot-inbox'],
      );
      ports.channels.admissionChanged?.(row.channel_id, row.message_id);
    }
  }

  function retireRevokedGroupRetries(): void {
    const retries = ports.database.read((database) =>
      database
        .prepare(
          `
        SELECT a.source_event_id, a.bot_slug, e.channel_id
          FROM inbox_admissions a JOIN source_events e USING (source_event_id)
         WHERE a.reason IN ('group-mention', 'group-ordinary')
           AND a.attempt_state IN ('pending', 'retryable')
           AND a.side_effect_started_at IS NULL AND a.ignored_at IS NULL
           AND e.source_kind != 'bridge-message' AND e.channel_id IS NOT NULL
      `,
        )
        .all(),
    ) as Array<{
      source_event_id: string;
      bot_slug: string;
      channel_id: string;
    }>;
    const revoked = retries.filter((row) => {
      const channel = ports.channels.get(row.channel_id);
      return channel === undefined || !ports.isMember(row.bot_slug, channel);
    });
    if (revoked.length === 0) return;
    const at = ports.now().toISOString();
    ports.database.transaction(
      (database) => {
        for (const row of revoked)
          database
            .prepare(
              `
          UPDATE inbox_admissions
             SET attempt_state = 'handled', handled_at = ?, ignored_at = ?,
                 snoozed_until = NULL, wake_count = NULL, wake_interval_ms = NULL,
                 last_error = 'Group membership revoked during recovery'
           WHERE source_event_id = ? AND bot_slug = ?
             AND attempt_state IN ('pending', 'retryable')
             AND side_effect_started_at IS NULL AND ignored_at IS NULL
        `,
            )
            .run(at, at, row.source_event_id, row.bot_slug);
      },
      ['bot-inbox'],
    );
  }

  return {
    recoverInterruptedAttempts,
    retireWithdrawnNetworkAdmissions,
    retireRevokedGroupRetries,
  };
}
