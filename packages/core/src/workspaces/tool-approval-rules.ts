import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  matchesShellPrefix,
  MAX_SHELL_PREFIX_PATTERNS,
  parseShellApprovalCommand,
  parseShellPrefix,
  shellApprovalInput,
  shellExactOptions,
  shellPrefixScope,
} from './shell-approval-prefix.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { parseToolApprovalActor, type ToolApprovalActor } from './tool-approval-actor.js';

export type ToolRuleKind = 'exact' | 'tool' | 'all-opaque' | 'secret-cli' | 'prefix';

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
  autoApprovedCount: number;
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
  auto_approved_count: number;
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
    autoApprovedCount: row.auto_approved_count,
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
    ...(externalCreator ? { externalCreator } : {}),
  };
}
type RuleMatch = Pick<ToolApprovalRule, 'botSlug' | 'role' | 'scopeKey' | 'toolName' | 'input'> & {
  externalDecision?: 'operation' | 'web-only' | 'each-use';
  explicitOnly?: boolean;
};
type RuleInput = Pick<
  ToolApprovalRule,
  'botSlug' | 'role' | 'scopeKey' | 'kind' | 'toolName' | 'input' | 'externalCreator'
>;

function insertRule(db: DatabaseSync, row: ToolApprovalRule, active: boolean): void {
  db.prepare(
    `INSERT INTO tool_approval_rules
       (id, bot_slug, role, scope_key, kind, tool_name, input, created_at, active, external_creator)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.botSlug,
    row.role,
    row.scopeKey,
    row.kind,
    row.toolName,
    row.input,
    row.createdAt,
    active ? 1 : 0,
    row.externalCreator ? JSON.stringify(row.externalCreator) : null,
  );
}

function newRule(input: RuleInput): ToolApprovalRule {
  return { ...input, id: randomUUID(), createdAt: new Date().toISOString(), autoApprovedCount: 0 };
}

export interface ToolApprovalRuleStore {
  list(botSlug: string): ToolApprovalRule[];
  match(input: RuleMatch): ToolApprovalRule | undefined;
  matchPrefix(input: RuleMatch & { cwd: string }): ToolApprovalRule[] | undefined;
  recordAutoApproval(botSlug: string, id: string): void;
  createPending(input: RuleInput): ToolApprovalRule;
  preparePrefixes(
    input: Pick<RuleInput, 'botSlug' | 'role' | 'scopeKey' | 'toolName'> & { patterns: string[] },
  ): { rules: ToolApprovalRule[]; commit(connection: DatabaseSync): void };
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
           AND ((kind = 'exact' AND tool_name = ? AND input = ?)
             OR (kind = 'tool' AND tool_name = ?) OR kind = 'all-opaque')
         ORDER BY CASE kind WHEN 'exact' THEN 0 ELSE 1 END, created_at DESC`,
              )
              .all(
                input.botSlug,
                input.role,
                input.scopeKey,
                input.toolName,
                input.input,
                input.toolName,
              ),
      ) as unknown as RuleRow[];
      for (const row of rows) {
        const rule = record(row);
        if (input.explicitOnly && rule.kind === 'all-opaque') continue;
        if (!authorized(rule)) {
          store.revoke(rule.botSlug, rule.id);
          continue;
        }
        if (rule.externalCreator && input.externalDecision === 'web-only') continue;
        return rule;
      }
      return undefined;
    },
    matchPrefix(input) {
      if (input.explicitOnly || input.externalDecision === 'each-use') return undefined;
      const args = shellApprovalInput(input.toolName, input.input);
      const scope = shellPrefixScope(input.scopeKey, input.cwd, args);
      if (!args || !scope) return undefined;
      const rows = database.read((connection) =>
        connection
          .prepare(
            `SELECT * FROM tool_approval_rules
           WHERE bot_slug = ? AND role = ? AND tool_name = ? AND active = 1 AND revoked_at IS NULL
             AND ((scope_key = ? AND kind = 'prefix') OR (scope_key = ? AND kind = 'exact'))
           ORDER BY created_at DESC, id`,
          )
          .all(input.botSlug, input.role, input.toolName, scope, input.scopeKey),
      ) as unknown as RuleRow[];
      if (!rows.some((row) => row.kind === 'prefix')) return undefined;
      const parts = parseShellApprovalCommand(args.command);
      if (!parts) return undefined;
      const options = shellExactOptions(args);
      const prefixes: { rule: ToolApprovalRule; pattern: ReturnType<typeof parseShellPrefix> }[] =
        [];
      const exact = new Map<string, ToolApprovalRule>();
      for (const row of rows) {
        const rule = record(row);
        if (!authorized(rule)) {
          store.revoke(rule.botSlug, rule.id);
          continue;
        }
        if (rule.externalCreator && input.externalDecision === 'web-only') continue;
        if (rule.kind === 'prefix') {
          prefixes.push({ rule, pattern: parseShellPrefix(rule.input) });
        } else {
          const saved = shellApprovalInput(rule.toolName, rule.input);
          if (saved && shellExactOptions(saved) === options && !exact.has(saved.command.trim()))
            exact.set(saved.command.trim(), rule);
        }
      }
      const matched = new Map<string, ToolApprovalRule>();
      for (const part of parts) {
        const rule =
          prefixes.find(({ pattern }) => matchesShellPrefix(part, pattern))?.rule ??
          exact.get(part.text);
        if (!rule) return undefined;
        matched.set(rule.id, rule);
      }
      const rules = [...matched.values()];
      return rules.some((rule) => rule.kind === 'prefix') ? rules : undefined;
    },
    recordAutoApproval(botSlug, id) {
      database.transaction(
        (connection) => {
          connection
            .prepare(
              'UPDATE tool_approval_rules SET auto_approved_count = auto_approved_count + 1 WHERE bot_slug = ? AND id = ?',
            )
            .run(botSlug, id);
        },
        ['tool-approval-rules'],
      );
    },
    createPending(input) {
      if (input.externalCreator && !parseToolApprovalActor(input.externalCreator))
        throw new Error('External tool approval rule creator is invalid');
      if (input.kind === 'prefix')
        throw new Error('Shell prefixes require a pending Shell decision');
      const row = newRule(input);
      if (!authorized(row)) throw new Error('External tool approval rule creator is unavailable');
      database.transaction(
        (connection) => insertRule(connection, row, false),
        ['tool-approval-rules'],
      );
      return row;
    },
    preparePrefixes({ patterns, ...scope }) {
      if (
        patterns.length === 0 ||
        patterns.length > MAX_SHELL_PREFIX_PATTERNS ||
        patterns.some((pattern) => !parseShellPrefix(pattern).ok)
      )
        throw new Error('Invalid Shell prefix rules');
      const rules = [...new Set(patterns)].map((input) =>
        newRule({ ...scope, kind: 'prefix', input }),
      );
      return {
        rules,
        commit(connection) {
          for (const rule of rules) insertRule(connection, rule, true);
        },
      };
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
