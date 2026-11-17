import type { Context, Volatile } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-settings';
import Schema from '@deepseek-ai/schemastery';
import { stampReleaseComponent } from '../../core/src/release/component.js';

import {
  BOT_MODE_ICONS,
  DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT,
  DEFAULT_BOT_HOP_LIMIT,
  MAX_BOT_HOP_LIMIT,
  BOT_MODE_MOTION_PREFERENCES,
  BOT_MODE_SEND_KEYS,
  BOT_MODE_SORT_MODES,
  DEFAULT_BOT_MODE_ICON,
  DEFAULT_BOT_MODE_DEVELOPER,
  DEFAULT_BOT_MODE_GROUP_AUTO_ACCEPT,
  DEFAULT_BOT_MODE_MOTION,
  DEFAULT_BOT_MODE_SEND_KEY,
  DEFAULT_BOT_MODE_SHOW_APPROVAL_REVIEW_SESSIONS,
  DEFAULT_BOT_MODE_SHOW_BOT_SESSIONS,
  DEFAULT_BOT_MODE_SORT,
  DEFAULT_SETTINGS_PINS,
  DEFAULT_SESSION_COLLAPSE,
  DEFAULT_SESSION_DETAIL_LEVEL,
  DEFAULT_SESSION_FOLDED_REPLIES,
  SESSION_COLLAPSE_MODES,
  SESSION_DETAIL_LEVELS,
  SESSION_FOLDED_REPLIES,
  type SessionCollapseMode,
  type SessionDetailLevel,
  type SessionFoldedReplies,
  type BotModeIcon,
  type BotModeMotionPreference,
  type BotModeSendKey,
  type BotModeSortMode,
  type BotModeSettings,
} from '@botharness/host-client/shared/bot-mode-settings';

export const name = 'botharness-client';
stampReleaseComponent(apply, import.meta.url);

export interface Config {
  assignmentConcurrencyLimit: Volatile<number>;
  botHopLimit: Volatile<number>;
  autoAcceptGroupInvites: Volatile<boolean>;
  developerMode: Volatile<boolean>;
  showBotSessions: Volatile<boolean>;
  showApprovalReviewSessions: Volatile<boolean>;
  botIcon: Volatile<BotModeIcon>;
  motionPreference: Volatile<BotModeMotionPreference>;
  sendKey: Volatile<BotModeSendKey>;
  autoCollapseMessages: Volatile<boolean>;
  showDeliveryReceipts: Volatile<boolean>;
  showDmAvatar: Volatile<boolean>;
  showOwnAvatar: Volatile<boolean>;
  streamReplies: Volatile<boolean>;
  sessionDetailLevel: Volatile<SessionDetailLevel>;
  sessionCollapse: Volatile<SessionCollapseMode>;
  sessionFoldedReplies: Volatile<SessionFoldedReplies>;
  sortMode: Volatile<BotModeSortMode>;
  sortModes: Volatile<Record<string, BotModeSortMode>>;
  settingsPins: Volatile<string[]>;
}

export const Config: Schema<Partial<BotModeSettings>, Config> = Schema.object({
  assignmentConcurrencyLimit: Schema.number()
    .min(1)
    .max(32)
    .step(1)
    .default(DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT)
    .volatile(),
  botHopLimit: Schema.number()
    .min(1)
    .max(MAX_BOT_HOP_LIMIT)
    .step(1)
    .default(DEFAULT_BOT_HOP_LIMIT)
    .volatile(),
  autoAcceptGroupInvites: Schema.boolean().default(DEFAULT_BOT_MODE_GROUP_AUTO_ACCEPT).volatile(),
  developerMode: Schema.boolean().default(DEFAULT_BOT_MODE_DEVELOPER).volatile(),
  autoCollapseMessages: Schema.boolean().default(false).volatile(),
  showDeliveryReceipts: Schema.boolean().default(false).volatile(),
  showDmAvatar: Schema.boolean().default(false).volatile(),
  showOwnAvatar: Schema.boolean().default(false).volatile(),
  streamReplies: Schema.boolean().default(false).volatile(),
  sessionDetailLevel: Schema.union([...SESSION_DETAIL_LEVELS])
    .default(DEFAULT_SESSION_DETAIL_LEVEL)
    .volatile(),
  sessionCollapse: Schema.union([...SESSION_COLLAPSE_MODES])
    .default(DEFAULT_SESSION_COLLAPSE)
    .volatile(),
  sessionFoldedReplies: Schema.union([...SESSION_FOLDED_REPLIES])
    .default(DEFAULT_SESSION_FOLDED_REPLIES)
    .volatile(),
  showBotSessions: Schema.boolean().default(DEFAULT_BOT_MODE_SHOW_BOT_SESSIONS).volatile(),
  showApprovalReviewSessions: Schema.boolean()
    .default(DEFAULT_BOT_MODE_SHOW_APPROVAL_REVIEW_SESSIONS)
    .volatile(),
  botIcon: Schema.union([...BOT_MODE_ICONS])
    .default(DEFAULT_BOT_MODE_ICON)
    .volatile(),
  motionPreference: Schema.union([...BOT_MODE_MOTION_PREFERENCES])
    .default(DEFAULT_BOT_MODE_MOTION)
    .volatile(),
  sendKey: Schema.union([...BOT_MODE_SEND_KEYS])
    .default(DEFAULT_BOT_MODE_SEND_KEY)
    .volatile(),
  sortMode: Schema.union([...BOT_MODE_SORT_MODES])
    .default(DEFAULT_BOT_MODE_SORT)
    .volatile(),
  sortModes: Schema.dict(Schema.union([...BOT_MODE_SORT_MODES]))
    .default({})
    .volatile(),
  settingsPins: Schema.array(Schema.string())
    .default([...DEFAULT_SETTINGS_PINS])
    .volatile(),
});

export function apply(ctx: Context, config?: Config): void {
  ctx.inject(['botharness'], (child) => {
    const core = (
      child as unknown as {
        botharness?: {
          configureGroupInvitations(autoAccept: () => boolean): () => void;
          configureAssignmentConcurrencyLimit?(read: () => number): () => void;
          configureBotHopLimit?(read: () => number): () => void;
        };
      }
    ).botharness;
    if (core === undefined) return;
    child.effect(() =>
      core.configureGroupInvitations(
        () => config?.autoAcceptGroupInvites.get() ?? DEFAULT_BOT_MODE_GROUP_AUTO_ACCEPT,
      ),
    );
    const configureLimit = core.configureAssignmentConcurrencyLimit;
    if (configureLimit !== undefined)
      child.effect(() =>
        configureLimit(
          () => config?.assignmentConcurrencyLimit.get() ?? DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT,
        ),
      );
    const configureHopLimit = core.configureBotHopLimit;
    if (configureHopLimit !== undefined)
      child.effect(() =>
        configureHopLimit(() => config?.botHopLimit.get() ?? DEFAULT_BOT_HOP_LIMIT),
      );
  });
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
}
