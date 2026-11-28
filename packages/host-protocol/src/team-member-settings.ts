export const TEAM_INVITATION_LIFETIME = { min: 1, max: 43_200 } as const;

export interface TeamMemberSettings {
  inviteLifetimeMinutes: number;
  defaultRoleId: string;
}

export type TeamMemberSettingsPatch = Partial<TeamMemberSettings>;
