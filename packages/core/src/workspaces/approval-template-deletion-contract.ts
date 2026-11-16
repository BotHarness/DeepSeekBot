import { z } from 'zod';

export const approvalTemplateDeletionPreviewSchema = z.object({
  name: z.string().min(1),
  revision: z.string().regex(/^[a-f0-9]{64}$/u),
  globalDefaultBefore: z.string().nullable(),
  globalDefaultAfter: z.string().nullable(),
  globalDefaultAvailable: z.boolean(),
  contentUnavailable: z.boolean().optional(),
  hiddenBotCount: z.number().int().nonnegative(),
  affectedBots: z.array(
    z.object({ slug: z.string().min(1), source: z.enum(['specific', 'global']) }),
  ),
});

export type ApprovalTemplateDeletionPreview = z.infer<typeof approvalTemplateDeletionPreviewSchema>;
