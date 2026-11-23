import type { DatabaseSync } from 'node:sqlite';
import { type MemoryChangeDelta } from '../../memory/accepted.js';
import type { ChannelStore } from '../../channels/store.js';
import type { BotRuntimeOptions } from '../../runtime/bot-runtime-types.js';

interface RuntimeMemoryChangesPorts {
  channels: ChannelStore;
  memory: BotRuntimeOptions['memory'];
  now: () => Date;
  warn: BotRuntimeOptions['warn'];
}

export function createRuntimeMemoryChanges(ports: RuntimeMemoryChangesPorts) {
  const { channels, memory, now, warn } = ports;

  async function recordTurnCommits(botSlug: string, causeSourceEventId: string): Promise<void> {
    if (memory?.pendingCommits === undefined || memory.advanceCommitCursor === undefined) return;
    try {
      const pending = await (memory.pendingCommitsAsync ?? memory.pendingCommits)(botSlug);
      if (pending.commits.length > 0)
        channels.appendMemoryCommits({
          botSlug,
          causeSourceEventId,
          commits: pending.commits,
        });
      memory.advanceCommitCursor(botSlug, pending.branch, pending.head);
    } catch (error) {
      warn?.(
        `memory-commit-record-failed bot=${botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
  }

  function insertMemoryChange(
    database: DatabaseSync,
    sourceEventId: string,
    botSlug: string,
    change: MemoryChangeDelta,
  ): void {
    database
      .prepare(
        `
        INSERT INTO source_events (
          source_event_id, source_kind, bot_slug, body, created_at, payload_json
        ) VALUES (?, 'memory-change', ?, ?, ?, ?)
      `,
      )
      .run(
        sourceEventId,
        botSlug,
        change.summary,
        now().toISOString(),
        JSON.stringify({ memoryChange: change }),
      );
    database
      .prepare(
        `
        INSERT INTO inbox_admissions (source_event_id, bot_slug, reason)
        VALUES (?, ?, 'memory-change')
      `,
      )
      .run(sourceEventId, botSlug);
  }

  return { recordTurnCommits, insertMemoryChange };
}
