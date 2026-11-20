import { z } from 'zod';
import { spaceAudienceSchema } from '../workspaces/space-audience.js';

export const botVisibilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('private') }).strict(),
  z.object({ kind: z.literal('public'), audience: spaceAudienceSchema }).strict(),
]);
export type BotVisibility = z.infer<typeof botVisibilitySchema>;
export const botSwitchesSchema = z
  .object({
    proactiveDms: z.boolean().default(false),
    joinPrincipalChannels: z.boolean().default(true),
    speakerContext: z.boolean().default(true),
  })
  .strict();
export type BotSwitches = z.infer<typeof botSwitchesSchema>;
export const rolePolicySchema = z
  .array(
    z
      .object({
        topic: z.string().trim().min(1).max(80),
        text: z.string().trim().min(1).max(1000),
        effect: z.enum(['allow', 'deny']),
      })
      .strict(),
  )
  .max(100);
export type RolePolicy = z.infer<typeof rolePolicySchema>;

export function audienceContains(next: BotVisibility, previous: BotVisibility): boolean {
  if (previous.kind === 'private') return true;
  if (next.kind === 'private') return false;
  if (next.audience.kind === 'everyone') return true;
  if (previous.audience.kind === 'everyone') return false;
  if (next.audience.kind === 'roles' && previous.audience.kind === 'roles')
    return previous.audience.roleIds.every(
      (id) => next.audience.kind === 'roles' && next.audience.roleIds.includes(id),
    );
  if (next.audience.kind === 'members' && previous.audience.kind === 'members')
    return previous.audience.humanIds.every(
      (id) => next.audience.kind === 'members' && next.audience.humanIds.includes(id),
    );
  return false;
}
