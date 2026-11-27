import { z } from 'zod';
import { privateKindSchema } from '../team-policy/private-content.js';

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
  'modelPlanSubSet',
  'modelPresetApply',
  'modelPlanCustomize',
  'modelPlanAssignmentsSet',
  'standingLimitsSet',
  'modelPlanInherit',
  'modelPlanReset',
  'transfer',
  'memberPurgeConfirm',
]);
export type BotAdminAction = z.infer<typeof botAdminActionSchema>;
export const privateListSchema = z.object({
  humanId: z.string().min(1).optional(),
  username: z.string().min(1).max(128).optional(),
  kind: privateKindSchema.optional(),
});
export const privateOpenSchema = z.object({
  kind: privateKindSchema,
  objectId: z.string().min(1).max(1024),
  reason: z.string().trim().max(1024).optional(),
});
export const privatePageSchema = z.object({
  viewId: z.string().min(1),
  before: z.string().min(1),
});
export const auditListSchema = z.object({
  after: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export const privateObjectSchema = z.object({
  objectId: z.string(),
  kind: privateKindSchema,
  name: z.string(),
  ownerHumanIds: z.array(z.string()),
});
export const privateObjectListingSchema = privateObjectSchema.extend({
  ownerNames: z.array(z.string()),
});
export const auditRecordSchema = z
  .object({
    auditId: z.string(),
    at: z.string(),
    viewerHumanId: z.string(),
    viewerName: z.string(),
    kind: privateKindSchema,
    objectId: z.string(),
    objectName: z.string(),
    ownerHumanIds: z.array(z.string()),
    reason: z.string().optional(),
    action: botAdminActionSchema.optional(),
    prevHash: z.string(),
    hash: z.string(),
  })
  .strict();
export type PrivateObject = z.infer<typeof privateObjectSchema>;
export type AuditRecord = z.infer<typeof auditRecordSchema>;

export type PrivateObjectListing = z.infer<typeof privateObjectListingSchema>;
