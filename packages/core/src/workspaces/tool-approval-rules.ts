import { randomUUID } from 'node:crypto';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { parseToolApprovalActor, type ToolApprovalActor } from './tool-approval-actor.js';

export type ToolRuleKind = 'exact' | 'all-opaque' | 'secret-cli';

export function secretCliKind(input: string): string | undefined {
  let args: unknown;
  try {
    args = JSON.parse(input);
  } catch {
    return undefined;
  }
  if (typeof args !== 'object' || args === null) return undefined;
  const { program, account, env } = args as { program?: unknown; account?: unknown; env?: unknown };
  if (typeof program !== 'string' || typeof account !== 'string' || !Array.isArray(env))
    return undefined;
  const names: string[] = [];
  for (const entry of env) {
    const name = (entry as { name?: unknown } | null)?.name;
    if (typeof name !== 'string') return undefined;
    names.push(name);
  }
  return JSON.stringify({ program, account, env: [...new Set(names)].sort() });
}
export interface ToolApprovalRule {
  id: string;
  botSlug: string;
  role: 'orchestrator' | 'assignment';
  scopeKey: string;
  kind: ToolRuleKind;
  toolName: string;
  input: string;
  createdAt: string;
  revokedAt?: string;
  externalCreator?: ToolApprovalActor;
}
interface RuleRow {
  id: string;
  bot_slug: string;
  role: ToolApprovalRule['role'];
  scope_key: string;
  kind: ToolRuleKind;
  tool_name: string;
  input: string;
  created_at: string;
  revoked_at: string | null;
  external_creator: string | null;
}
function record(row: RuleRow): ToolApprovalRule {
  const externalCreator =
    row.external_creator === null
      ? undefined
      : parseToolApprovalActor(JSON.parse(row.external_creator));
  if (row.external_creator !== null && !externalCreator)
    throw new Error('External tool approval rule creator is invalid');
  return {
    id: row.id,
    botSlug: row.bot_slug,
    role: row.role,
    scopeKey: row.scope_key,
    kind: row.kind,
    toolName: row.tool_name,
    input: row.input,
    createdAt: row.created_at,
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
    ...(externalCreator ? { externalCreator } : {}),
  };
}
export interface ToolApprovalRuleStore {
  list(botSlug: string): ToolApprovalRule[];
  match(
    input: Pick<ToolApprovalRule, 'botSlug' | 'role' | 'scopeKey' | 'toolName' | 'input'> & {
      externalDecision?: 'operation' | 'web-only' | 'each-use';
    },
  ): ToolApprovalRule | undefined;
  createPending(
    input: Pick<
      ToolApprovalRule,
      'botSlug' | 'role' | 'scopeKey' | 'kind' | 'toolName' | 'input' | 'externalCreator'
    >,
  ): ToolApprovalRule;
  activate(botSlug: string, id: string): void;
  revoke(botSlug: string, id: string): ToolApprovalRule | undefined;
  reconcileExternal(botSlug: string): void;
}
export function createToolApprovalRuleStore(
  database: OperationalDatabaseModulePort,
  authorizeExternal?: (botSlug: string, creator: ToolApprovalActor) => boolean,
): ToolApprovalRuleStore {
  const authorized = (rule: ToolApprovalRule) => {
    if (!rule.externalCreator) return true;
    return authorizeExternal?.(rule.botSlug, rule.externalCreator) === true;
  };
  const store: ToolApprovalRuleStore = {
    list(botSlug) {
      store.reconcileExternal(botSlug);
      const rows = database.read((connection) =>
        connection
          .prepare(
            'SELECT * FROM tool_approval_rules WHERE bot_slug = ? AND active = 1 ORDER BY created_at DESC, id',
          )
          .all(botSlug),
      ) as unknown as RuleRow[];
      return rows.map(record);
    },
    match(input) {
      const kind = input.toolName === 'secret_cli' ? secretCliKind(input.input) : undefined;
      if (input.toolName === 'secret_cli' && kind === undefined) return undefined;
      const rows = database.read((connection) =>
        kind !== undefined
          ? connection
              .prepare(
                `SELECT * FROM tool_approval_rules
         WHERE bot_slug = ? AND role = ? AND scope_key = ? AND active = 1 AND revoked_at IS NULL
           AND kind = 'secret-cli' AND tool_name = 'secret_cli' AND input = ?
         ORDER BY created_at DESC`,
              )
              .all(input.botSlug, input.role, input.scopeKey, kind)
          : connection
              .prepare(
                `SELECT * FROM tool_approval_rules
         WHERE bot_slug = ? AND role = ? AND scope_key = ? AND active = 1 AND revoked_at IS NULL
           AND ((kind = 'exact' AND tool_name = ? AND input = ?) OR kind = 'all-opaque')
         ORDER BY CASE kind WHEN 'exact' THEN 0 ELSE 1 END, created_at DESC`,
              )
              .all(input.botSlug, input.role, input.scopeKey, input.toolName, input.input),
      ) as unknown as RuleRow[];
      for (const row of rows) {
        const rule = record(row);
        if (!authorized(rule)) {
          store.revoke(rule.botSlug, rule.id);
          continue;
        }
        if (rule.externalCreator && input.externalDecision === 'web-only') continue;
        return rule;
      }
      return undefined;
    },
    createPending(input) {
      if (input.externalCreator && !parseToolApprovalActor(input.externalCreator))
        throw new Error('External tool approval rule creator is invalid');
      const row: ToolApprovalRule = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      if (!authorized(row)) throw new Error('External tool approval rule creator is unavailable');
      database.transaction(
        (connection) => {
          connection
            .prepare(
              `INSERT INTO tool_approval_rules
           (id, bot_slug, role, scope_key, kind, tool_name, input, created_at, active, external_creator)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            )
            .run(
              row.id,
              row.botSlug,
              row.role,
              row.scopeKey,
              row.kind,
              row.toolName,
              row.input,
              row.createdAt,
              row.externalCreator ? JSON.stringify(row.externalCreator) : null,
            );
        },
        ['tool-approval-rules'],
      );
      return row;
    },
    activate(botSlug, id) {
      const row = database.read((db) =>
        db
          .prepare('SELECT * FROM tool_approval_rules WHERE bot_slug = ? AND id = ?')
          .get(botSlug, id),
      ) as RuleRow | undefined;
      if (!row || !authorized(record(row))) {
        store.revoke(botSlug, id);
        throw new Error('External tool approval rule creator is unavailable');
      }
      database.transaction(
        (connection) => {
          const result = connection
            .prepare(
              'UPDATE tool_approval_rules SET active = 1 WHERE bot_slug = ? AND id = ? AND revoked_at IS NULL',
            )
            .run(botSlug, id);
          if (result.changes !== 1) throw new Error('Tool approval rule is unavailable');
        },
        ['tool-approval-rules'],
      );
    },
    revoke(botSlug, id) {
      return database.transaction(
        (connection) => {
          connection
            .prepare(
              'UPDATE tool_approval_rules SET revoked_at = COALESCE(revoked_at, ?) WHERE bot_slug = ? AND id = ?',
            )
            .run(new Date().toISOString(), botSlug, id);
          const row = connection
            .prepare('SELECT * FROM tool_approval_rules WHERE bot_slug = ? AND id = ?')
            .get(botSlug, id) as RuleRow | undefined;
          return row === undefined ? undefined : record(row);
        },
        ['tool-approval-rules'],
      );
    },
    reconcileExternal(botSlug) {
      const rows = database.read((db) =>
        db
          .prepare(
            'SELECT * FROM tool_approval_rules WHERE bot_slug = ? AND external_creator IS NOT NULL AND revoked_at IS NULL',
          )
          .all(botSlug),
      ) as unknown as RuleRow[];
      for (const row of rows) if (!authorized(record(row))) store.revoke(botSlug, row.id);
    },
  };
  return store;
}
