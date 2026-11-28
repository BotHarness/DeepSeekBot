export const pairingCapabilities = [
  'approve',
  'reject',
  'answer',
  'save-rules',
  'review-pairing',
] as const;

export type PairingCapability = (typeof pairingCapabilities)[number];

export type ExternalRoleBotScope = { kind: 'all' } | { kind: 'only'; botSlugs: string[] };

export interface ExternalRoleRule {
  topic: string;
  text: string;
  effect: 'allow' | 'ask' | 'deny';
}

export interface HostExternalRole {
  id: string;
  name: string;
  botScope: ExternalRoleBotScope;
  behavior: string;
  policy: ExternalRoleRule[];
  capabilities: PairingCapability[];
  deniedCapabilities: PairingCapability[];
  delegableCapabilities?: PairingCapability[] | undefined;
  revision: number;
  createdAt?: string;
  updatedAt?: string;
}

type ExternalRoleSettings = Pick<
  HostExternalRole,
  | 'name'
  | 'botScope'
  | 'behavior'
  | 'policy'
  | 'capabilities'
  | 'deniedCapabilities'
  | 'delegableCapabilities'
>;

type OptionalRoleSettings = {
  [Key in keyof ExternalRoleSettings]?: ExternalRoleSettings[Key] | undefined;
};

export type HostExternalRoleChange =
  | ({
      kind: 'create';
    } & Pick<ExternalRoleSettings, 'name' | 'botScope'> &
      Omit<OptionalRoleSettings, 'name' | 'botScope'>)
  | ({
      kind: 'update';
      id: string;
      expectedRevision: number;
    } & OptionalRoleSettings);

export interface ExternalContactQuery {
  slug: string;
  bindingId: string;
  actorId: string;
}

export interface ExternalContactAccess {
  status: 'paired' | 'visitor' | 'unpaired' | 'blocked' | 'unavailable';
  canSpeak: boolean;
  roleIds: string[];
  capabilities: PairingCapability[];
  deniedCapabilities: PairingCapability[];
}
