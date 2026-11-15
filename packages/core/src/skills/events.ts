import { z } from 'zod';

export const SKILL_CATALOG_CHANGED_EVENT = 'skills/catalog-changed';

export const skillCatalogChangeSchema = z.object({
  botSlugs: z.array(z.string().min(1)),
  channelIds: z.array(z.string().min(1)),
});

export type SkillCatalogChange = z.infer<typeof skillCatalogChangeSchema>;
