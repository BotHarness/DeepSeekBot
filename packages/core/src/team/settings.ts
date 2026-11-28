import type {
  TeamMemberSettings,
  TeamMemberSettingsPatch,
} from '@botharness/host-protocol/team-member-settings';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

const defaults: TeamMemberSettings = { inviteLifetimeMinutes: 10, defaultRoleId: 'member' };
const settingsSchema = z.object({
  enabled: z.coerce.boolean(),
  insecure_http_allowed: z.coerce.boolean(),
  invite_lifetime_minutes: z.number().nullable(),
  default_member_role_id: z.string().nullable(),
});

export function readTeamSettings(database: OperationalDatabaseModulePort) {
  const settings = settingsSchema.parse(
    database.read((db) =>
      db
        .prepare(`SELECT enabled, insecure_http_allowed, invite_lifetime_minutes,
          default_member_role_id FROM team_settings WHERE singleton = 1`)
        .get(),
    ),
  );
  return {
    enabled: settings.enabled,
    insecureHttpAllowed: settings.insecure_http_allowed,
    memberSettings: {
      inviteLifetimeMinutes: settings.invite_lifetime_minutes ?? defaults.inviteLifetimeMinutes,
      defaultRoleId: settings.default_member_role_id ?? defaults.defaultRoleId,
    },
  };
}

export function writeTeamMemberSettings(
  database: OperationalDatabaseModulePort,
  { inviteLifetimeMinutes, defaultRoleId }: TeamMemberSettingsPatch,
): TeamMemberSettings {
  database.transaction(
    (db) =>
      db
        .prepare(`UPDATE team_settings
          SET invite_lifetime_minutes = COALESCE(?, invite_lifetime_minutes),
            default_member_role_id = COALESCE(?, default_member_role_id)
          WHERE singleton = 1`)
        .run(inviteLifetimeMinutes ?? null, defaultRoleId ?? null),
    ['team'],
  );
  return readTeamSettings(database).memberSettings;
}
