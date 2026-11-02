import type { TobService } from '../tob/service.js';
import { randomUUID } from 'node:crypto';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { DEFAULT_ILLUSTRATED_RECIPE, detailedAvatarRecipe } from '../bots/avatar-appearance.js';
import type { ChannelStore } from '../channels/store.js';

import type { TutorialAction, OnboardingSnapshot } from './types.js';
export type { TutorialAction, OnboardingSnapshot } from './types.js';
interface Receipt {
  journey_version: number;
  journey_started_at: string | null;
  journey_bot: string | null;
  journey_group: string | null;
  journey_done: number;
  profile_id: string;
  entered_at: string;
  default_bot_slug: string | null;
  preparation: 'requested' | 'ready';
  tutorial: OnboardingSnapshot['tutorial'];
  completed_channel_id: string | null;
  completed_message_id: string | null;
}
export interface BotOnboarding {
  trackCreation(command: string, operationKey: string, sessionId: string, startedAt: number): void;
  recordCreation(
    command: string,
    operationKey: string,
    result: unknown,
    sessionId: string,
    startedAt: number,
  ): void;
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
        (singleton, profile_id, entered_at, default_bot_slug, preparation, journey_version)
        VALUES (1, ?, ?, ?, ?, 2)`)
          .run(
            randomUUID(),
            now().toISOString(),
            defaultSlug,
            defaultSlug === null ? 'ready' : 'requested',
          ),
      );
      state = receipt()!;
    }
    if (state.journey_version === 1) {
      database.transaction((db) =>
        db
          .prepare(`UPDATE bot_onboarding SET journey_version = 2,
        journey_done = CASE WHEN completed_message_id IS NOT NULL OR tutorial = 'skipped' THEN 1 ELSE 0 END,
        tutorial = CASE WHEN tutorial = 'skipped' THEN 'skipped' ELSE 'paused' END
        WHERE singleton = 1`)
          .run(),
      );
      state = receipt()!;
    }
    if (state.preparation === 'requested' && state.default_bot_slug !== null) {
      const id = state.default_bot_slug;
      let bot = registry.get(id);
      if (bot === undefined && registry.getHistorical(id) === undefined) {
        const created = registry.create({ slug: id, displayName: 'Bot', workspaces: [] });
        if (!created.ok) throw new Error(created.reason);
        bot = created.record;
      }
      if (bot !== undefined && bot.paused !== true && !bot.avatar && bot.appearance === undefined) {
        const appearance = registry.setAppearance(id, DEEPSEEKBOT_RECIPE, 'default');
        if (!appearance.ok) throw new Error('appearance-unavailable');
      }
      database.transaction((db) =>
        db.prepare("UPDATE bot_onboarding SET preparation = 'ready' WHERE singleton = 1").run(),
      );
    }
    if (
      !state.journey_done &&
      state.journey_bot &&
      (!registry.get(state.journey_bot) || registry.get(state.journey_bot)?.paused)
    ) {
      database.transaction((db) =>
        db
          .prepare(
            'UPDATE bot_onboarding SET journey_bot = NULL, journey_group = NULL WHERE singleton = 1',
          )
          .run(),
      );
      state = receipt()!;
    }
    if (
      !state.journey_done &&
      state.journey_group &&
      !channels.get(state.journey_group)?.members.includes(state.journey_bot!)
    ) {
      database.transaction((db) =>
        db.prepare('UPDATE bot_onboarding SET journey_group = NULL WHERE singleton = 1').run(),
      );
      state = receipt()!;
    }
    const operations = database.read((db) =>
      db
        .prepare(`
      SELECT pending.operation_key, pending.kind, pending.session_id, pending.recorded_at,
        CASE WHEN pending.kind = 'create' THEN bot.bot_slug ELSE channel.channel_id END AS target_id
      FROM onboarding_creation_results pending
      LEFT JOIN bot_creation_operations bot ON pending.kind = 'create' AND bot.operation_key = pending.operation_key AND bot.status = 'created'
      LEFT JOIN channel_management_operations channel ON pending.kind = 'group-create' AND channel.operation_key = pending.operation_key AND channel.status = 'completed' AND channel.kind = 'create'
      WHERE pending.target_id IS NULL OR pending.kind = 'create'
      ORDER BY pending.recorded_at, pending.operation_key
    `)
        .all(),
    ) as Array<{
      operation_key: string;
      kind: string;
      session_id: string;
      recorded_at: string;
      target_id: string | null;
    }>;
    for (const operation of operations)
      if (operation.target_id)
        recordCreation(
          operation.kind,
          operation.operation_key,
          operation.kind === 'create'
            ? { bot: { slug: operation.target_id } }
            : { channel: { id: operation.target_id } },
          operation.session_id,
          Date.parse(operation.recorded_at),
        );
    state = receipt()!;
    if (state.journey_bot && !state.journey_group && state.journey_started_at) {
      const groups = database.read((db) =>
        db
          .prepare(
            "SELECT target_id FROM onboarding_creation_results WHERE kind = 'group-create' ORDER BY recorded_at",
          )
          .all(),
      ) as Array<{ target_id: string }>;
      const joined = groups.find(({ target_id }) =>
        channels.get(target_id)?.members.includes(state!.journey_bot!),
      );
      if (joined) {
        database.transaction((db) =>
          db
            .prepare('UPDATE bot_onboarding SET journey_group = ? WHERE singleton = 1')
            .run(joined.target_id),
        );
        state = receipt()!;
      }
    }
    const tobHome = await options.tob?.ensure();
    const active = registry.list().filter((bot) => !bot.paused);
    const selected = tobHome
      ? active.find((bot) => bot.slug === tobHome.botSlug)
      : slug === undefined
        ? (active.find((bot) => bot.slug === state!.default_bot_slug) ??
          (active.length === 1 ? active[0] : undefined))
        : active.find((bot) => bot.slug === slug);
    if (slug !== undefined && selected === undefined) throw new Error('Bot is unavailable');
    const channel =
      selected === undefined
        ? undefined
        : channels.getOrCreateDm(selected.slug, selected.displayName);
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
      if (action === 'restart')
        db.prepare('UPDATE bot_onboarding SET journey_done = 0 WHERE singleton = 1').run();
      if (action === 'start' || action === 'continue' || action === 'restart')
        db.prepare(
          'UPDATE bot_onboarding SET journey_started_at = COALESCE(journey_started_at, ?) WHERE singleton = 1',
        ).run(now().toISOString());
      if (action === 'finish')
        db.prepare('UPDATE bot_onboarding SET journey_done = 1 WHERE singleton = 1').run();
      if (action !== undefined)
        db.prepare('UPDATE bot_onboarding SET tutorial = ? WHERE singleton = 1').run(
          action === 'skip'
            ? 'skipped'
            : action === 'pause' || action === 'finish'
              ? 'paused'
              : 'active',
        );
    });
    state = receipt()!;
    return {
      journey: {
        version: 2,
        done: state.journey_done === 1,
        ...(state.journey_bot ? { botSlug: state.journey_bot } : {}),
        ...(state.journey_group ? { groupChannelId: state.journey_group } : {}),
      },
      profileId: state.profile_id,
      tutorial: state.tutorial,
      completed: state.completed_message_id !== null,
      preparation: state.preparation,
      ...(selected ? { defaultBotSlug: selected.slug } : {}),
      ...(channel === undefined ? {} : { channelId: channel.id }),
    };
  };
  const recordCreation: BotOnboarding['recordCreation'] = (
    command,
    operationKey,
    result,
    sessionId,
    startedAt,
  ) => {
    const state = receipt();
    if (
      !state?.journey_started_at ||
      state.journey_done ||
      !['active', 'paused'].includes(state.tutorial) ||
      !Number.isFinite(startedAt) ||
      !Number.isFinite(Date.parse(state.journey_started_at)) ||
      startedAt < Date.parse(state.journey_started_at)
    )
      return;
    if (!result || typeof result !== 'object') return;
    const value = result as { bot?: { slug?: string }; channel?: { id?: string } };
    const id =
      command === 'create'
        ? value.bot?.slug
        : command === 'group-create'
          ? value.channel?.id
          : undefined;
    if (!id) return;
    const target = command === 'create' ? registry.get(id) : channels.get(id);
    if (
      !target ||
      (command === 'create' && registry.get(id)?.paused === true) ||
      !Number.isFinite(Date.parse(target.createdAt)) ||
      Date.parse(target.createdAt) < Date.parse(state.journey_started_at)
    )
      return;
    database.transaction((db) => {
      db.prepare(
        'INSERT INTO onboarding_creation_results (operation_key,kind,target_id,session_id,recorded_at) VALUES (?,?,?,?,?) ON CONFLICT(operation_key,kind) DO UPDATE SET target_id = excluded.target_id',
      ).run(operationKey, command, id, sessionId, now().toISOString());
      if (command === 'create')
        db.prepare(
          'UPDATE bot_onboarding SET journey_bot = COALESCE(journey_bot, ?) WHERE singleton = 1',
        ).run(id);
      else if (state.journey_bot && channels.get(id)?.members.includes(state.journey_bot))
        db.prepare(
          'UPDATE bot_onboarding SET journey_group = COALESCE(journey_group, ?) WHERE singleton = 1',
        ).run(id);
    });
  };
  return {
    recordCreation,
    trackCreation(command, operationKey, sessionId, startedAt) {
      const state = receipt();
      if (
        !state?.journey_started_at ||
        state.journey_done ||
        !['active', 'paused'].includes(state.tutorial) ||
        !Number.isFinite(startedAt) ||
        startedAt < Date.parse(state.journey_started_at)
      )
        return;
      database.transaction((db) =>
        db
          .prepare(
            'INSERT OR IGNORE INTO onboarding_creation_results (operation_key,kind,session_id,recorded_at) VALUES (?,?,?,?)',
          )
          .run(operationKey, command, sessionId, new Date(startedAt).toISOString()),
      );
    },
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
