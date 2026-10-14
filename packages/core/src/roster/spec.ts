import { z } from 'zod';

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';

export const rosterSectionRecord = z.object({
  name: z.string(),
  channelIds: z.array(z.string()),
});

export type RosterSectionRecord = z.infer<typeof rosterSectionRecord>;

export const topOrderEntry = z.object({
  kind: z.enum(['section', 'channel']),
  id: z.string().min(1),
});

export type TopOrderEntry = z.infer<typeof topOrderEntry>;

export const rosterDomainState = z.object({
  pins: z.array(z.string()),
  hidden: z.array(z.string()).optional(),
  muted: z.array(z.string()).optional(),
  sectionOrder: z.array(z.string()),
  topOrder: z.array(topOrderEntry).optional(),
});

export type RosterDomainState = z.infer<typeof rosterDomainState>;

export const rosterDomainSpec = defineDomain({
  name: 'botharness_roster',
  version: 1,
  layout: 'single',
  global: {
    schema: rosterDomainState,
    initial: { pins: [], hidden: [], sectionOrder: [], topOrder: [] },
  },
  tables: { sections: domainTable<string, RosterSectionRecord>(rosterSectionRecord) },
});
