/**
 * Bot settings sections a Host Member sees. The rest configure the Host and stay with the Owner;
 * the Host refuses their methods to members regardless.
 */
export const MEMBER_SETTINGS_SECTIONS: ReadonlySet<string> = new Set([
  'account',
  'general',
  'appearance',
  'notifications',
  'shortcuts',
  'team',
]);
