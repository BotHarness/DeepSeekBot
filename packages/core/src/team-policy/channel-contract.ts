import { z } from 'zod';
import { CHANNEL_ACTIONS } from '@botharness/host-protocol/channel-policy';
export { CHANNEL_ACTIONS, DEFAULT_CHANNEL_POLICY } from '@botharness/host-protocol/channel-policy';
export type { ChannelAction, ChannelPolicy } from '@botharness/host-protocol/channel-policy';

export const channelVisibilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('public') }),
  z.object({ kind: z.literal('roles'), roleIds: z.array(z.string().min(1)).min(1).max(100) }),
  z.object({ kind: z.literal('private') }),
]);
export type ChannelVisibility = z.infer<typeof channelVisibilitySchema>;
export const channelBotAudienceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('everyone') }),
  z.strictObject({ kind: z.literal('admins') }),
  z.strictObject({
    kind: z.literal('roles'),
    roleIds: z.array(z.string().min(1)).min(1).max(100),
  }),
]);
export const channelBotChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('audience'), audience: channelBotAudienceSchema }),
  z.strictObject({ kind: z.literal('block'), humanId: z.string().min(1), blocked: z.boolean() }),
]);
const action = z.enum(CHANNEL_ACTIONS);
const effect = z.enum(['allow', 'deny', 'inherit']);
export const channelPolicySchema = z.strictObject({
  version: z.literal(1),
  approvalMode: z.enum(['legacy', 'channel']).optional(),
  everyone: z.strictObject({
    addMembers: effect,
    post: effect,
    mentionAll: effect,
    addBots: effect,
    editDetails: effect,
    wakeBot: effect.default('allow'),
    seeApprovals: effect.default('allow'),
    decideApprovals: effect.default('deny'),
  }),
  overrides: z
    .array(
      z.strictObject({
        roleId: z.string().min(1),
        actions: z.partialRecord(action, effect),
      }),
    )
    .max(100)
    .refine((rows) => new Set(rows.map((row) => row.roleId)).size === rows.length),
});
export const channelPolicyRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const channelPolicyWriteSchema = z.unknown().transform((value, context) => {
  const parsed = channelPolicySchema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) context.addIssue(issue);
    return z.NEVER;
  }
  const hasApprovalRules =
    parsed.data.approvalMode !== undefined ||
    parsed.data.overrides.some(
      ({ actions }) => 'seeApprovals' in actions || 'decideApprovals' in actions,
    ) ||
    (typeof value === 'object' &&
      value !== null &&
      'everyone' in value &&
      typeof value.everyone === 'object' &&
      value.everyone !== null &&
      ('seeApprovals' in value.everyone || 'decideApprovals' in value.everyone));
  return { policy: parsed.data, hasApprovalRules };
});

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
        AND (json_extract(c.visibility_json, '$.kind') = 'private'
          OR NOT ${channelRoleEligibleSql('c', 'm.human_id')}))`;
}

export function channelRoleMembershipEntrySql(scope: 'human' | 'channel' | 'all'): string {
  const filter =
    scope === 'human' ? 'h.human_id = ? AND' : scope === 'channel' ? 'c.channel_id = ? AND' : '';
  return `INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at, membership_basis)
    SELECT c.channel_id, h.human_id, h.display_name, 1, ?1, 'role'
    FROM channel_records c JOIN humans h ON h.status = 'active'
    WHERE ${filter.replace('?', '?2')} json_extract(c.record_json, '$.type') = 'group'
      AND json_extract(c.record_json, '$.deletedAt') IS NULL
      AND json_extract(c.visibility_json, '$.kind') IN ('public', 'roles')
      AND ${channelRoleEligibleSql('c', 'h.human_id')}
      AND NOT EXISTS (SELECT 1 FROM channel_human_members x
        WHERE x.channel_id = c.channel_id AND x.human_id = h.human_id AND x.left_at IS NULL)
    ON CONFLICT(channel_id, human_id) DO UPDATE SET left_at = NULL, membership_basis = 'role'`;
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
