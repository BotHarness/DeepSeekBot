import { z } from 'zod';

export const channelVisibilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('public') }),
  z.object({ kind: z.literal('roles'), roleIds: z.array(z.string().min(1)).min(1).max(100) }),
  z.object({ kind: z.literal('private') }),
]);
export type ChannelVisibility = z.infer<typeof channelVisibilitySchema>;
export const channelPolicySchema = z.object({
  addMembers: z.enum(['everyone', 'admins']),
  post: z.enum(['everyone', 'admins']),
  mentionAll: z.enum(['everyone', 'admins']),
  addBots: z.enum(['everyone', 'admins']),
  editDetails: z.enum(['everyone', 'admins']),
});
export const channelPolicyRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export type ChannelPolicy = z.infer<typeof channelPolicySchema>;
export const DEFAULT_CHANNEL_POLICY: ChannelPolicy = {
  addMembers: 'everyone',
  post: 'everyone',
  mentionAll: 'everyone',
  addBots: 'admins',
  editDetails: 'admins',
};

export function channelRoleEligibleSql(channel: string, humanId: string): string {
  return `(json_extract(${channel}.visibility_json, '$.kind') <> 'roles'
    OR EXISTS (SELECT 1 FROM human_roles ar
      JOIN json_each(${channel}.visibility_json, '$.roleIds') vr ON vr.value = ar.role_id
      WHERE ar.human_id = ${humanId})
    OR EXISTS (SELECT 1 FROM channel_human_members cm
      WHERE cm.channel_id = ${channel}.channel_id AND cm.human_id = ${humanId} AND cm.left_at IS NULL
      AND cm.membership_basis = 'invited'))`;
}

export function channelRoleMembershipExitSql(scope: 'human' | 'channel' | 'all'): string {
  const filter =
    scope === 'human' ? 'm.human_id = ? AND' : scope === 'channel' ? 'm.channel_id = ? AND' : '';
  return `UPDATE channel_human_members AS m SET left_at = ?
    WHERE ${filter} left_at IS NULL AND membership_basis = 'role'
      AND EXISTS (SELECT 1 FROM channel_records c WHERE c.channel_id = m.channel_id
        AND NOT ${channelRoleEligibleSql('c', 'm.human_id')})`;
}

export function channelBotDmEligibleSql(channel: string, humanId: string): string {
  return `((json_extract(${channel}.record_json, '$.dmHumanId') = ${humanId})
    OR (json_extract(${channel}.record_json, '$.dmHumanId') IS NULL AND ((json_extract(${channel}.record_json, '$.remoteBot') IS NOT NULL
      AND ${humanId} = (SELECT owner_human_id FROM team_settings))
    OR (json_extract(${channel}.record_json, '$.remoteBot') IS NULL
      AND json_array_length(${channel}.record_json, '$.members') > 0
      AND NOT EXISTS (SELECT 1 FROM json_each(${channel}.record_json, '$.members') mb
        LEFT JOIN persona_bots b ON b.slug = mb.value
        WHERE b.slug IS NULL OR b.owner_human_id <> ${humanId})))))`;
}

export function channelAudienceSql(channel = 'c', membership = 'm'): string {
  return `(
    (json_extract(${channel}.record_json, '$.type') = 'dm' AND (
      (json_extract(${channel}.record_json, '$.humanParticipants') IS NOT NULL AND ${membership}.human_id IS NOT NULL)
      OR (json_extract(${channel}.record_json, '$.humanParticipants') IS NULL
        AND ${channelBotDmEligibleSql(channel, 'viewer.human_id')})))
    OR (json_extract(${channel}.record_json, '$.type') = 'group'
      AND ${channelRoleEligibleSql(channel, 'viewer.human_id')}))`;
}
