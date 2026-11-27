export type ChannelBotAudience =
  | { kind: 'everyone' }
  | { kind: 'roles'; roleIds: string[] }
  | { kind: 'admins' };

export type ChannelBotChange =
  | { kind: 'audience'; audience: ChannelBotAudience }
  | { kind: 'block'; humanId: string; blocked: boolean };

export interface ChannelBotSettings {
  botSlug: string;
  name: string;
  audience: ChannelBotAudience;
  canSetAudience: boolean;
  blockedHumanIds: string[];
}

export interface ChannelBotsView {
  bots: ChannelBotSettings[];
  roles: { roleId: string; name: string }[];
  members: { humanId: string; displayName: string }[];
}
