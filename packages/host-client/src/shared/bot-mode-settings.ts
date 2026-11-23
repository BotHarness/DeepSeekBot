export const BOT_MODE_ASSIGNMENT_LIMIT_FIELD = 'assignmentConcurrencyLimit';
export const DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT = 8;
export function isAssignmentConcurrencyLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 32;
}

export const BOT_MODE_HOP_LIMIT_FIELD = 'botHopLimit';
export const DEFAULT_BOT_HOP_LIMIT = 128;
export const MAX_BOT_HOP_LIMIT = 1000;
export function isBotHopLimit(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_BOT_HOP_LIMIT
  );
}

export const BOT_MODE_NAMESPACE = 'botharness-client';

export const BOT_MODE_SORT_FIELD = 'sortMode';

export const BOT_MODE_SORT_MODES_FIELD = 'sortModes';
export const BOT_MODE_SETTINGS_PINS_FIELD = 'settingsPins';
export const DEFAULT_SETTINGS_PINS: readonly string[] = [
  'models',
  'appearance',
  'pair-phone',
  'auto-approval',
  'notifications',
  'im-apps',
];

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

export const BOT_MODE_AUTO_COLLAPSE_MESSAGES_FIELD = 'autoCollapseMessages';
export const BOT_MODE_SHOW_DELIVERY_RECEIPTS_FIELD = 'showDeliveryReceipts';
export const BOT_MODE_SHOW_DM_AVATAR_FIELD = 'showDmAvatar';
export const BOT_MODE_SHOW_OWN_AVATAR_FIELD = 'showOwnAvatar';
export const BOT_MODE_STREAM_REPLIES_FIELD = 'streamReplies';
export const BOT_MODE_SESSION_DETAIL_LEVEL_FIELD = 'sessionDetailLevel';
export const BOT_MODE_SESSION_COLLAPSE_FIELD = 'sessionCollapse';
export const BOT_MODE_SESSION_FOLDED_REPLIES_FIELD = 'sessionFoldedReplies';

export const SESSION_DETAIL_LEVELS = ['compact', 'standard', 'detailed', 'verbose'] as const;
export const SESSION_COLLAPSE_MODES = ['completion', 'nextInput'] as const;
export const SESSION_FOLDED_REPLIES = ['all', 'final'] as const;

export type SessionDetailLevel = (typeof SESSION_DETAIL_LEVELS)[number];
export type SessionCollapseMode = (typeof SESSION_COLLAPSE_MODES)[number];
export type SessionFoldedReplies = (typeof SESSION_FOLDED_REPLIES)[number];

export const DEFAULT_SESSION_DETAIL_LEVEL: SessionDetailLevel = 'standard';
export const DEFAULT_SESSION_COLLAPSE: SessionCollapseMode = 'completion';
export const DEFAULT_SESSION_FOLDED_REPLIES: SessionFoldedReplies = 'all';

export function isSessionDetailLevel(value: unknown): value is SessionDetailLevel {
  return (SESSION_DETAIL_LEVELS as readonly unknown[]).includes(value);
}

export function isSessionCollapseMode(value: unknown): value is SessionCollapseMode {
  return (SESSION_COLLAPSE_MODES as readonly unknown[]).includes(value);
}

export function isSessionFoldedReplies(value: unknown): value is SessionFoldedReplies {
  return (SESSION_FOLDED_REPLIES as readonly unknown[]).includes(value);
}

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
  botHopLimit?: number;
  autoAcceptGroupInvites?: boolean;
  developerMode: boolean;
  showBotSessions?: boolean;
  showApprovalReviewSessions?: boolean;
  motionPreference: BotModeMotionPreference;
  botIcon: BotModeIcon;
  sendKey?: BotModeSendKey;
  autoCollapseMessages?: boolean;
  showDeliveryReceipts?: boolean;
  showDmAvatar?: boolean;
  showOwnAvatar?: boolean;
  streamReplies?: boolean;
  sessionDetailLevel?: SessionDetailLevel;
  sessionCollapse?: SessionCollapseMode;
  sessionFoldedReplies?: SessionFoldedReplies;
  sortMode: BotModeSortMode;
  sortModes: Record<string, BotModeSortMode>;
  settingsPins?: string[];
}
