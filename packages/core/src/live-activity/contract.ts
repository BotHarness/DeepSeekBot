export type ActivityState = 'working' | 'completed' | 'failed' | 'unknown';
export interface ActivityContent {
  state: ActivityState;
  terminal: boolean;
  updatedAt: string;
  locale: 'en' | 'zh';
}
export interface ActivityCapability {
  bundleIdentifier: string;
  source?: string;
}
export interface ActivityProvider {
  capability(signal?: AbortSignal): Promise<ActivityCapability | undefined>;
  call(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: Record<string, unknown> }>;
}
export const ACTIVITY_LIFETIME_MS = 8 * 60 * 60 * 1000;
export const ACTIVITY_STALE_SECONDS = 5 * 60;
export const ACTIVITY_TOKEN = /^[a-fA-F0-9]{32,512}$/u;
