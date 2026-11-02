export type TutorialAction = 'start' | 'pause' | 'skip' | 'continue' | 'restart' | 'finish';
export interface OnboardingSnapshot {
  journey?: { version: 2; done: boolean; botSlug?: string; groupChannelId?: string };
  profileId: string;
  tutorial: 'not-started' | 'active' | 'paused' | 'skipped';
  completed: boolean;
  newsAvailable?: boolean;
  defaultBotSlug?: string;
  channelId?: string;
  preparation: 'requested' | 'ready';
}
