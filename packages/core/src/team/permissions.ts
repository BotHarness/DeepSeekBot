import { z } from 'zod';

export const PERMISSION_CATALOG = [
  { id: 'members.manage', group: 'members' },
  { id: 'roles.manage', group: 'members' },
  { id: 'team.settings', group: 'members' },
  { id: 'channels.create', group: 'channels' },
  { id: 'channels.manageAll', group: 'channels' },
  { id: 'dm.humans', group: 'channels' },
  { id: 'bots.create', group: 'bots' },
  { id: 'bots.manageAll', group: 'bots' },
  { id: 'models.use', group: 'compute' },
  { id: 'im.bind', group: 'bots' },
  { id: 'workspaces.manageShared', group: 'compute' },
  { id: 'approvals.opaqueTools', group: 'oversight' },
  { id: 'usage.view', group: 'oversight' },
  { id: 'audit.view', group: 'oversight' },
  { id: 'privateContent.view', group: 'oversight' },
] as const;
export type HostPermission = (typeof PERMISSION_CATALOG)[number]['id'];
export const ALL_PERMISSIONS = PERMISSION_CATALOG.map(({ id }) => id);
export const ADMIN_PERMISSIONS = ALL_PERMISSIONS.filter((id) => id !== 'privateContent.view');
export const MEMBER_PERMISSIONS: HostPermission[] = [
  'channels.create',
  'dm.humans',
  'bots.create',
  'models.use',
];
export const roleSchema = z.object({
  roleId: z.string(),
  name: z.string(),
  builtin: z.enum(['admin', 'member']).nullable(),
  permissions: z.string().transform((value) => z.array(z.string()).parse(JSON.parse(value))),
  memberCount: z.number().int().nonnegative(),
});
export type HostRole = z.infer<typeof roleSchema>;
