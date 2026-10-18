export const BOT_MODE_ASSIGNMENT_LIMIT_FIELD = 'assignmentConcurrencyLimit';
export const DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT = 8;
export function isAssignmentConcurrencyLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 32;
}

export const BOT_MODE_NAMESPACE = 'botharness-client';

export const BOT_MODE_SORT_FIELD = 'sortMode';

export const BOT_MODE_SORT_MODES_FIELD = 'sortModes';

export const PINNED_SORT_SCOPE_ID = 'pinned';

export const BOT_MODE_MOTION_FIELD = 'motionPreference';

export const BOT_MODE_ICON_FIELD = 'botIcon';

export const BOT_MODE_DEVELOPER_FIELD = 'developerMode';

export const BOT_MODE_GROUP_AUTO_ACCEPT_FIELD = 'autoAcceptGroupInvites';

export const DEFAULT_BOT_MODE_GROUP_AUTO_ACCEPT = true;

export const BOT_MODE_SHOW_BOT_SESSIONS_FIELD = 'showBotSessions';

export const DEFAULT_BOT_MODE_SHOW_BOT_SESSIONS = true;

export const BOT_MODE_SHOW_APPROVAL_REVIEW_SESSIONS_FIELD = 'showApprovalReviewSessions';

export const DEFAULT_BOT_MODE_SHOW_APPROVAL_REVIEW_SESSIONS = false;

export const BOT_MODE_SEND_KEY_FIELD = 'sendKey';

export const BOT_MODE_SORT_MODES = ['updated', 'manual'] as const;

export const BOT_MODE_SEND_KEYS = ['enter', 'shift-enter', 'mod-enter'] as const;

export const BOT_MODE_MOTION_PREFERENCES = ['system', 'reduce', 'full'] as const;

export const BOT_MODE_ICONS = ['mascot', 'simple', 'blob', 'bot'] as const;

export type BotModeSortMode = (typeof BOT_MODE_SORT_MODES)[number];

export type BotModeMotionPreference = (typeof BOT_MODE_MOTION_PREFERENCES)[number];

export type BotModeIcon = (typeof BOT_MODE_ICONS)[number];

export type BotModeSendKey = (typeof BOT_MODE_SEND_KEYS)[number];

export const DEFAULT_BOT_MODE_SORT: BotModeSortMode = 'updated';

export const DEFAULT_BOT_MODE_MOTION: BotModeMotionPreference = 'system';

export const DEFAULT_BOT_MODE_ICON: BotModeIcon = 'mascot';

export const DEFAULT_BOT_MODE_DEVELOPER = false;

export const DEFAULT_BOT_MODE_SEND_KEY: BotModeSendKey = 'enter';

export function isBotModeSortMode(value: unknown): value is BotModeSortMode {
  return value === 'updated' || value === 'manual';
}

export function isBotModeMotionPreference(value: unknown): value is BotModeMotionPreference {
  return value === 'system' || value === 'reduce' || value === 'full';
}

export function isBotModeIcon(value: unknown): value is BotModeIcon {
  return value === 'mascot' || value === 'simple' || value === 'blob' || value === 'bot';
}

export function isBotModeSendKey(value: unknown): value is BotModeSendKey {
  return value === 'enter' || value === 'shift-enter' || value === 'mod-enter';
}

export interface BotModeSettings {
  assignmentConcurrencyLimit?: number;
  autoAcceptGroupInvites?: boolean;
  developerMode: boolean;
  showBotSessions?: boolean;
  showApprovalReviewSessions?: boolean;
  motionPreference: BotModeMotionPreference;
  botIcon: BotModeIcon;
  sendKey?: BotModeSendKey;
  sortMode: BotModeSortMode;
  sortModes: Record<string, BotModeSortMode>;
}
