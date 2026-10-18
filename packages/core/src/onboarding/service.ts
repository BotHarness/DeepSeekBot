import type { TobService } from '../tob/service.js';
import { randomUUID } from 'node:crypto';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { DEFAULT_ILLUSTRATED_RECIPE, detailedAvatarRecipe } from '../bots/avatar-appearance.js';
import type { ChannelStore } from '../channels/store.js';

import type { TutorialAction, OnboardingSnapshot } from './types.js';
export type { TutorialAction, OnboardingSnapshot } from './types.js';
interface Receipt {
  profile_id: string;
  entered_at: string;
  default_bot_slug: string | null;
  preparation: 'requested' | 'ready';
  tutorial: OnboardingSnapshot['tutorial'];
  completed_channel_id: string | null;
  completed_message_id: string | null;
}
export interface BotOnboarding {
  enter(slug?: string, action?: TutorialAction): Promise<OnboardingSnapshot>;
}

export const DEEPSEEKBOT_RECIPE = detailedAvatarRecipe({
  ...DEFAULT_ILLUSTRATED_RECIPE,
  head: 'round',
  pose: 'front',
  hair: 'ahoge',
  eyes: 'sparkle',
  brows: 'soft',
  nose: 'none',
  mouth: 'open',
  cheeks: 'blush',
  glasses: 'none',
  outfit: 'maid',
  backdrop: 'sparkles',
  accessory: 'headband',
  skinColor: '#ffe3cf',
  hairColor: '#4468d0',
  eyeColor: '#3a7ae8',
  shirtColor: '#f4f1ec',
});

export function createBotOnboarding(options: {
  database: OperationalDatabaseModulePort;
  registry: PersonaBotRegistry;
  tob?: TobService;
  channels: ChannelStore;
  now?: () => Date;
}): BotOnboarding {
  const { database, registry, channels } = options;
  const now = options.now ?? (() => new Date());
  const receipt = (): Receipt | undefined =>
    database.read((db) => db.prepare('SELECT * FROM bot_onboarding WHERE singleton = 1').get()) as
      | Receipt
      | undefined;
  let pending: Promise<OnboardingSnapshot> | undefined;
  const enter = async (slug?: string, action?: TutorialAction): Promise<OnboardingSnapshot> => {
    let state = receipt();
    if (state === undefined) {
      const historical = registry.listHistorical();
      const defaultSlug =
        historical.length === 0 ||
        (historical.length === 1 && options.tob?.isTob(historical[0]!.slug))
          ? options.tob
            ? (await options.tob.ensure()).botSlug
            : 'bot-' + randomUUID().replaceAll('-', '')
          : null;
      database.transaction((db) =>
        db
          .prepare(`INSERT INTO bot_onboarding
        (singleton, profile_id, entered_at, default_bot_slug, preparation)
        VALUES (1, ?, ?, ?, ?)`)
          .run(
            randomUUID(),
            now().toISOString(),
            defaultSlug,
            defaultSlug === null ? 'ready' : 'requested',
          ),
      );
      state = receipt()!;
    }
    if (state.preparation === 'requested' && state.default_bot_slug !== null) {
      const id = state.default_bot_slug;
      let bot = registry.get(id);
      if (bot === undefined && registry.getHistorical(id) === undefined) {
        const created = registry.create({ slug: id, displayName: 'DeepSeek Bot', workspaces: [] });
        if (!created.ok) throw new Error(created.reason);
        bot = created.record;
      }
      if (bot !== undefined && bot.paused !== true && bot.appearance === undefined) {
        const appearance = registry.setAppearance(id, DEEPSEEKBOT_RECIPE);
        if (!appearance.ok) throw new Error('appearance-unavailable');
      }
      database.transaction((db) =>
        db.prepare("UPDATE bot_onboarding SET preparation = 'ready' WHERE singleton = 1").run(),
      );
    }
    const active = registry.list().filter((bot) => !bot.paused);
    const selected =
      slug === undefined
        ? (active.find((bot) => bot.slug === state!.default_bot_slug) ??
          (active.length === 1 ? active[0] : undefined))
        : active.find((bot) => bot.slug === slug);
    if (slug !== undefined && selected === undefined) throw new Error('Bot is unavailable');
    const channel =
      selected === undefined
        ? undefined
        : channels.getOrCreateDm(selected.slug, selected.displayName);
    if (channel !== undefined && !options.tob?.isTob(selected!.slug)) {
      const welcomeId = 'onboarding-welcome-v1';
      if (!channels.hasMessage(channel.id, welcomeId)) {
        const appended = await channels.appendMessageOnce(channel.id, {
          id: welcomeId,
          at: now().toISOString(),
          author: { kind: 'system' },
          body: 'Welcome to DeepSeek Bot',
          onboardingWelcome: { version: 1 },
          format: 'text',
        });
        if (appended.status !== 'appended' && appended.status !== 'existing')
          throw new Error('welcome-unavailable');
      }
    }
    database.transaction((db) => {
      const completed =
        state!.completed_message_id === null
          ? (db
              .prepare(`
        SELECT output.channel_id, output.message_id FROM channel_output_origins origin
        JOIN source_events output ON output.source_event_id = origin.source_event_id
        JOIN session_ownership owner ON owner.session_id = origin.session_id
        JOIN source_events request ON request.source_event_id = origin.request_source_event_id
        JOIN channel_records channel ON channel.channel_id = output.channel_id
        WHERE output.source_kind = 'bot-message' AND owner.bot_slug = output.bot_slug
          AND json_extract(channel.record_json, '$.type') = 'dm' AND json_extract(channel.record_json, '$.botSlug') = output.bot_slug
          AND request.source_kind = 'human-message' AND request.channel_id = output.channel_id
          AND output.created_at >= ? AND request.created_at >= ?
          AND json_extract(output.payload_json, '$.sessionFailure') IS NULL
          AND json_extract(output.payload_json, '$.toolApprovalRequest') IS NULL
          AND json_extract(output.payload_json, '$.userQuestionRequest') IS NULL
          AND length(trim(output.body)) > 0
        ORDER BY output.created_at, output.source_event_id LIMIT 1
      `)
              .get(state!.entered_at, state!.entered_at) as
              | { channel_id: string; message_id: string }
              | undefined)
          : undefined;
      if (completed)
        db.prepare(`UPDATE bot_onboarding SET completed_channel_id = ?, completed_message_id = ?
        WHERE singleton = 1 AND completed_message_id IS NULL`).run(
          completed.channel_id,
          completed.message_id,
        );
      if (action !== undefined)
        db.prepare('UPDATE bot_onboarding SET tutorial = ? WHERE singleton = 1').run(
          action === 'skip' ? 'skipped' : action === 'pause' ? 'paused' : 'active',
        );
    });
    state = receipt()!;
    return {
      profileId: state.profile_id,
      tutorial: state.tutorial,
      completed: state.completed_message_id !== null,
      preparation: state.preparation,
      ...(state.default_bot_slug === null ? {} : { defaultBotSlug: state.default_bot_slug }),
      ...(channel === undefined ? {} : { channelId: channel.id }),
    };
  };
  return {
    async enter(slug, action) {
      if (pending) await pending;
      const operation = enter(slug, action);
      pending = operation;
      try {
        return await operation;
      } finally {
        if (pending === operation) pending = undefined;
      }
    },
  };
}
