import { rolePolicySchema } from './bot-contract.js';
import { z } from 'zod';

export const PERMISSION_CATALOG = [
  { id: 'members.manage', group: 'members' },
  { id: 'roles.manage', group: 'members' },
  { id: 'team.settings', group: 'members' },
  { id: 'channels.create', group: 'channels' },
  { id: 'channels.manageAll', group: 'channels' },
  { id: 'dm.humans', group: 'channels' },
  { id: 'bots.createPrivate', group: 'bots' },
  { id: 'bots.createPublic', group: 'bots' },
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
export const MEMBER_PERMISSIONS: HostPermission[] = ['dm.humans'];
export const roleModelsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({
    kind: z.literal('only'),
    routes: z
      .array(z.string().regex(/^[^/\s]+\/[^\s]+$/u))
      .max(10000)
      .transform((routes) => [...new Set(routes)].sort()),
  }),
]);
export type RoleModels = z.infer<typeof roleModelsSchema>;
export type ModelsAllowed = { all: true } | { all: false; routes: string[] };
export const roleSchema = z.object({
  roleId: z.string(),
  name: z.string(),
  builtin: z.enum(['admin', 'member']).nullable(),
  permissions: z.string().transform((value) => z.array(z.string()).parse(JSON.parse(value))),
  models: z.string().transform((value) => roleModelsSchema.parse(JSON.parse(value))),
  policy: z.string().transform((v) => rolePolicySchema.parse(JSON.parse(v))),
  policyRevision: z.number().int().positive(),
  memberCount: z.number().int().nonnegative(),
});
export type HostRole = z.infer<typeof roleSchema>;
