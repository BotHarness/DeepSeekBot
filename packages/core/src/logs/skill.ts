export const LOGS_SKILL_NAME = 'reading-operational-logs';

export const LOGS_SKILL_DESCRIPTION =
  'Read BotHarness operational logs (logs.db) directly: file location, read-only open, query shapes, result caps.';

export const LOGS_SKILL_WHEN_TO_USE =
  'When debugging why something happened, inspecting recent plugin or Computer activity, or answering what-failed questions in-harness.';

export const LOGS_SKILL_INVOCATION = {
  modelInvocable: true,
  userInvocable: true,
} as const;

export const LOGS_SKILL_SOURCE = 'runtime';

export const LOGS_SKILL_PROVIDER = 'botharness-core';

export interface SkillRegistrar {
  register(definition: {
    readonly name: string;
    readonly description: string;
    readonly whenToUse: string;
    readonly content: string;
    readonly invocation: { readonly modelInvocable: boolean; readonly userInvocable: boolean };
    readonly source: string;
    readonly provider: string;
  }): () => void;
}

export class DeveloperModeSkillGate {
  private disposeRegistration: (() => void) | undefined;
  private enabled = false;

  constructor(private readonly skills: SkillRegistrar) {}

  set(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.disposeRegistration = this.skills.register({
        name: LOGS_SKILL_NAME,
        description: LOGS_SKILL_DESCRIPTION,
        whenToUse: LOGS_SKILL_WHEN_TO_USE,
        content: LOGS_SKILL_CONTENT,
        invocation: LOGS_SKILL_INVOCATION,
        source: LOGS_SKILL_SOURCE,
        provider: LOGS_SKILL_PROVIDER,
      });
    } else {
      this.disposeRegistration?.();
      this.disposeRegistration = undefined;
    }
  }

  get active(): boolean {
    return this.enabled;
  }
}

export const LOGS_SKILL_CONTENT = `# Reading operational logs as an agent

Product meaning: [ADR-0063](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/decisions/persistence.md#adr-0063) (topology),
[ADR-0064](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/decisions/release.md#adr-0064) (why there is no
tool). Code facts: \`packages/core/src/logs/log-db.ts\` (schema, \`LogQuery\`).

There is no log-reading tool and there will not be one: you already have
everything needed. This guide is the whole contract — read it when you need
logs, never assume it is in context otherwise.

## Locate the file

Every shell call receives \`DSH_HOME\` in its environment. The database is:

\`\`\`
$DSH_HOME/botharness/logs.db
\`\`\`

## Open read-only, never write

- Prefer a read-only open (e.g. Node \`new DatabaseSync(path, { readOnly: true })\`,
  or SQLite URI \`file:<path>?mode=ro\`). This reads the \`-wal\` normally and
  never takes a write lock.
- Do NOT use \`immutable=1\` on the live file: it tells SQLite to ignore the
  \`-wal\`, which yields a stale or even table-less view (verified live: the
  schema itself can live in the WAL). Immutable opens are only for
  fully-checkpointed copies.
- Never write, checkpoint, or migrate from an agent session. The Host owns the
  single write connection.
- Never copy \`logs.db\` alone for offline analysis: without its \`-wal\` sidecar
  the copy is stale or corrupt. Copy the \`-wal\` (and \`-shm\`) with it, or query
  the live file read-only.

## Query shapes (mirroring \`LogQuery\`)

Newest-first, bounded — the same vocabulary as \`GET /api/computer/logs\`:

\`\`\`sql
SELECT id, ts, plugin, owner, kind, detail, principal, bot,
       orchestrator_session, assignment_session, trace_id, payload
  FROM log_entries
 WHERE (plugin = :plugin)            -- optional exact match
   AND (owner = :owner)              -- optional; a filter dimension, not a gate:
                                     -- Developer Mode reads see every owner
   AND (:entity IN (principal, bot, orchestrator_session,
                    assignment_session, trace_id))  -- optional causation match
   AND (ts >= :since)                -- optional epoch milliseconds
 ORDER BY ts DESC, id DESC
 LIMIT 100;                          -- default 100, never above 1000
\`\`\`

- Full-text needs (\`detail\` / \`payload\` substring search) scan by construction;
  bound them with a time range first.
- Keep result sets small: select the columns you need, not \`SELECT *\` over
  wide ranges — wide payload reads land in session history until compaction.

## Rules that are not negotiable

- **No secrets, ever.** Log rows follow the existing no-secrets rule; your
  queries must not try to route around it.
- **Developer Mode gates Humans, not you.** Its on/off state changes nothing
  about your ability to read. Do not treat it as permission or refusal.
- **Schema drifts by generation.** If a column from this guide is missing,
  check \`log_schema.version\` and \`packages/core/src/logs/log-db.ts\` — update
  this guide when you learn something new about the schema.
`;
