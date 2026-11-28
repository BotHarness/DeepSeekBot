export const externalContactStatuses = ['all', 'paired', 'blocked', 'requested'] as const;

export type ExternalContactStatusFilter = (typeof externalContactStatuses)[number];

export interface ExternalContactListQuery {
  botSlugs?: string[] | undefined;
  status?: ExternalContactStatusFilter | undefined;
}

export interface ExternalContactBot {
  slug: string;
  status: 'paired' | 'blocked' | 'requested' | 'unpaired';
  roleIds: string[];
  canSpeak: boolean;
  personBlocked: boolean;
  hasLegacyBlock: boolean;
}

export interface ExternalContact {
  id: string;
  platform: string;
  workspaceId: string | null;
  actorId: string;
  name: string | null;
  bots: ExternalContactBot[];
  accessibleBotSlugs: string[];
}

export interface ExternalContactBlockChange {
  slug: string;
  contactId: string;
  blocked: boolean;
}

export interface ExternalContactList {
  contacts: ExternalContact[];
}
