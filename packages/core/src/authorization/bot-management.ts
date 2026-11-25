import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { resolveGrants } from './grants.js';

export const managementCapability = z.enum(['manage-app', 'manage-bots']);
export type ManagementCapability = z.infer<typeof managementCapability>;
export const managementGrantChangeSchema = z.object({
  capability: managementCapability,
  enabled: z.boolean(),
});
export type ManagementGrantChange = z.infer<typeof managementGrantChangeSchema>;

export function botManagementGrants(
  database: OperationalDatabaseModulePort,
  slug: string,
): ManagementCapability[] {
  return database.read((db) => {
    const grants = db
      .prepare(`
      SELECT g.capability
      FROM bot_management_grants g
      JOIN persona_bots b ON b.slug = g.bot_slug
      JOIN team_settings s ON s.owner_human_id = b.owner_human_id
      WHERE g.bot_slug = ?
        AND COALESCE(json_extract(b.body, '$.paused'), 0) = 0
        AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug = b.slug)
    `)
      .all(slug);
    return resolveGrants(
      [{ allow: grants.map((row) => managementCapability.parse(row.capability)), deny: [] }],
      managementCapability.options,
    ).granted;
  });
}

export function updateManagementGrantsForNewOwner(
  db: DatabaseSync,
  previousOwner: string,
  nextOwner: string,
): void {
  db.prepare(
    'DELETE FROM bot_management_grants WHERE bot_slug IN (SELECT slug FROM persona_bots WHERE owner_human_id = ? UNION SELECT bot_slug FROM tob_identity WHERE human_id = ?)',
  ).run(previousOwner, previousOwner);
  db.prepare(`
    DELETE FROM tob_identity WHERE human_id = ? AND EXISTS
      (SELECT 1 FROM persona_bot_deletions d WHERE d.slug = tob_identity.bot_slug)
  `).run(nextOwner);
  db.prepare(`
    INSERT OR IGNORE INTO bot_management_grants (bot_slug, capability)
    SELECT t.bot_slug, capability FROM tob_identity t
    JOIN persona_bots b ON b.slug = t.bot_slug AND b.owner_human_id = t.human_id
    CROSS JOIN (SELECT 'manage-app' AS capability UNION ALL SELECT 'manage-bots')
    WHERE t.human_id = ?
  `).run(nextOwner);
}
