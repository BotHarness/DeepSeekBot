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
export type ChannelPolicy = z.infer<typeof channelPolicySchema>;
export const DEFAULT_CHANNEL_POLICY: ChannelPolicy = {
  addMembers: 'everyone',
  post: 'everyone',
  mentionAll: 'everyone',
  addBots: 'admins',
  editDetails: 'admins',
};

export function channelAudienceSql(channel = 'c', membership = 'm'): string {
  return `(
    (json_extract(${channel}.record_json, '$.humanParticipants') IS NULL OR ${membership}.human_id IS NOT NULL)
    AND (json_extract(${channel}.record_json, '$.type') <> 'group'
      OR json_extract(${channel}.visibility_json, '$.kind') <> 'roles'
      OR EXISTS (SELECT 1 FROM human_roles ar
        JOIN json_each(${channel}.visibility_json, '$.roleIds') vr ON vr.value = ar.role_id
        WHERE ar.human_id = ${membership}.human_id)))`;
}
