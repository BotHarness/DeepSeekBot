import { z } from 'zod';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { HumanContext } from '../humans/context.js';
import { botOwner } from './bot-access.js';

export const BOT_ADMIN_READS: ReadonlySet<string> = new Set([
  'get',
  'modelPlan',
  'deletionPreview',
  'deletionMemoryFolder',
]);
export const botAdminActionSchema = z.enum([
  'update',
  'botVisibilitySet',
  'pause',
  'resume',
  'deletionConfirm',
  'deletionRetry',
  'botAvatarSet',
  'botAppearanceSet',
  'botBannerSet',
  'botPrimaryColorSet',
  'modelPlanSet',
  'modelPresetApply',
  'modelPlanCustomize',
  'modelPlanAssignmentsSet',
  'standingLimitsSet',
  'modelPlanInherit',
  'transfer',
  'memberPurgeConfirm',
]);
export type BotAdminAction = z.infer<typeof botAdminActionSchema>;
export type BotMetadata = ReturnType<typeof botMetadata>;
export type BotMetadataResult = { metadataOnly: true; bot: BotMetadata };
export function botMetadata(
  human: HumanContext,
  bot: Pick<PersonaBotRecord, 'slug' | 'displayName' | 'ownerHumanId' | 'paused' | 'createdAt'>,
) {
  return {
    slug: bot.slug,
    displayName: bot.displayName,
    ownerHumanId: botOwner(bot),
    owner: botOwner(bot) === human.humanId,
    paused: bot.paused ?? false,
    createdAt: bot.createdAt,
  };
}
const resultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string(), details: z.unknown().optional() }),
  }),
]);
const deletionSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  acceptedAt: z.string(),
  eraseMemory: z.boolean(),
  phase: z.enum(['stopping', 'cleanup', 'complete', 'incomplete']),
  memory: z.enum(['retained', 'pending', 'erased']),
});
const previewSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  token: z.string(),
  eraseAvailable: z.boolean(),
  deletion: deletionSchema.optional(),
});
export type AdminDeletionPreview = z.infer<typeof previewSchema>;
export type AdminDeletion = z.infer<typeof deletionSchema>;

export function administrativeResult(
  human: HumanContext,
  bot: PersonaBotRecord,
  method: string,
  raw: unknown,
) {
  const result = resultSchema.parse(raw);
  if (!result.ok) {
    const route =
      result.error.code === 'model-not-allowed'
        ? z.object({ route: z.string() }).safeParse(result.error.details)
        : undefined;
    const permission =
      result.error.code === 'permission-required'
        ? z.object({ permission: z.string() }).safeParse(result.error.details)
        : undefined;
    const details = route?.success ? route.data : permission?.success ? permission.data : undefined;
    return {
      ok: false,
      error: {
        code: result.error.code,
        message: result.error.code,
        ...(details ? { details } : {}),
      },
    };
  }
  const value = { metadataOnly: true, bot: botMetadata(human, bot) } satisfies BotMetadataResult;
  if (method === 'deletionPreview') {
    const { preview } = z.object({ preview: previewSchema }).parse(result.value);
    return { ok: true, value: { ...value, preview } };
  }
  if (method === 'deletionConfirm' || method === 'deletionRetry') {
    const { deletion } = z.object({ deletion: deletionSchema }).parse(result.value);
    return { ok: true, value: { ...value, deletion } };
  }
  return { ok: true, value };
}
