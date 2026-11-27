import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { resolveGrants } from '../kernel/grants.js';
import { hostPermissionHolderSql } from '../team-policy/host-access.js';
import type { HostPermission } from '../team-policy/permissions.js';

export const MANAGEMENT_CAPABILITIES = ['manage-app', 'manage-bots'] as const;
export type ManagementCapability = (typeof MANAGEMENT_CAPABILITIES)[number];

export function isManagementCapability(value: unknown): value is ManagementCapability {
  return MANAGEMENT_CAPABILITIES.includes(value as ManagementCapability);
}

const GrantRow = z.object({ botSlug: z.string().min(1), capability: z.string() });

export const MANAGE_GRANTS_PERMISSION = 'bots.manageGrants' satisfies HostPermission;

const GRANT_HOLDERS_SQL = `
  SELECT g.bot_slug AS botSlug, g.capability FROM bot_management_grants g
  JOIN persona_bots b ON b.slug = g.bot_slug
  WHERE ${hostPermissionHolderSql('b.owner_human_id', MANAGE_GRANTS_PERMISSION)}
    AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug = g.bot_slug)
    AND COALESCE(json_extract(b.body, '$.paused'), 0) = 0`;

function rows(
  db: DatabaseSync,
  filter: { slug?: string; ownerHumanId?: string } = {},
): { botSlug: string; capability: string }[] {
  const where = [
    ...(filter.slug === undefined ? [] : ['g.bot_slug = ?']),
    ...(filter.ownerHumanId === undefined ? [] : ['b.owner_human_id = ?']),
  ];
  const statement = db.prepare(
    `${GRANT_HOLDERS_SQL}${where.map((clause) => ` AND ${clause}`).join('')} ORDER BY g.bot_slug`,
  );
  const params = [filter.slug, filter.ownerHumanId].filter(
    (value): value is string => value !== undefined,
  );
  return z.array(GrantRow).parse(statement.all(...params));
}

export function canManageGrants(database: OperationalDatabaseModulePort, humanId: string): boolean {
  return database.read(
    (db) =>
      db
        .prepare(`SELECT ${hostPermissionHolderSql('$humanId', MANAGE_GRANTS_PERMISSION)} AS ok`)
        .get({ $humanId: humanId })?.['ok'] === 1,
  );
}

export function managementGrants(
  database: OperationalDatabaseModulePort,
  slug: string,
): ManagementCapability[] {
  const granted = database.read((db) => rows(db, { slug }));
  return resolveGrants(
    [{ allow: granted.map((row) => row.capability as ManagementCapability), deny: [] }],
    MANAGEMENT_CAPABILITIES,
  ).granted;
}

export function holdsManagementGrant(
  database: OperationalDatabaseModulePort,
  slug: string,
  capability?: ManagementCapability,
): boolean {
  const granted = managementGrants(database, slug);
  return capability === undefined ? granted.length > 0 : granted.includes(capability);
}

export function managementGrantHolders(
  database: OperationalDatabaseModulePort,
  ownerHumanId?: string,
): { botSlug: string; capabilities: ManagementCapability[] }[] {
  const byBot = new Map<string, ManagementCapability[]>();
  for (const row of database.read((db) =>
    rows(db, ownerHumanId === undefined ? {} : { ownerHumanId }),
  )) {
    if (!isManagementCapability(row.capability)) continue;
    byBot.set(row.botSlug, [...(byBot.get(row.botSlug) ?? []), row.capability]);
  }
  return [...byBot].map(([botSlug, capabilities]) => ({
    botSlug,
    capabilities: MANAGEMENT_CAPABILITIES.filter((c) => capabilities.includes(c)),
  }));
}

export function grantAllManagement(db: DatabaseSync, botSlug: string, at: string): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO bot_management_grants (bot_slug, capability, granted_at) VALUES (?, ?, ?)',
  );
  for (const capability of MANAGEMENT_CAPABILITIES) insert.run(botSlug, capability, at);
}

export function writeManagementGrant(
  db: DatabaseSync,
  botSlug: string,
  capability: ManagementCapability,
  enabled: boolean,
  at: string,
): boolean {
  return (
    (enabled
      ? db
          .prepare(
            'INSERT OR IGNORE INTO bot_management_grants (bot_slug, capability, granted_at) VALUES (?, ?, ?)',
          )
          .run(botSlug, capability, at)
      : db
          .prepare('DELETE FROM bot_management_grants WHERE bot_slug = ? AND capability = ?')
          .run(botSlug, capability)
    ).changes === 1
  );
}
