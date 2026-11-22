import type * as releaseFeature from '../release/plugin.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { createWindowZoomControl, WINDOW_ZOOM_CONTROL_PATH } from '../../window-zoom/control.js';
import { createPresence, PRESENCE_PATH } from '../../push/presence.js';
import { createWindowZoomSetup, WINDOW_ZOOM_SETUP_PATH } from '../../window-zoom/setup.js';
import { APPEARANCE_CONTROL_PATH, createAppearanceControl } from '../../appearance/control.js';
import { DESKTOP_WINDOW_PATH, createDesktopWindowReveal } from '../../desktop-window/reveal.js';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createCompanionFeed, COMPANION_PATH } from '../../companions/feed.js';
import type { Context } from '@deepseek-ai/cordis';
import { botAvatarUrl } from '../../bots/avatar-http.js';
import {
  createBotModeSettings,
  isBotModeId,
  resolveBotMode,
  type BotModeOption,
} from '../../runtime/bot-mode-settings.js';
import type { createDshBotAgentAdapter } from '../../runtime/dsh-bot-agent-adapter.js';
import { personaBotActivitySnapshot } from '../../state/bot-state.js';
import type { BotHarnessCore } from '../../plugin-types.js';
import type { CoreOptions } from '../../plugin-types.js';
import type { HostFetchConnection } from '../../plugin-types.js';

export function createCompanion({
  options,
  dshHome,
  registry,
  states,
  operationalDatabase,
  channels,
}: Pick<BotHarnessCore, 'registry' | 'states' | 'operationalDatabase' | 'channels'> & {
  dshHome: string;
  options: CoreOptions;
}) {
  return createCompanionFeed({
    profileId: createHash('sha256')
      .update(options.companionProfileDir ?? dshHome)
      .digest('hex'),
    bot: (slug) => {
      const bot = registry.get(slug);
      return bot === undefined
        ? undefined
        : {
            slug,
            name: bot.displayName,
            paused: bot.paused === true,
            ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
            ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
            ...(bot.avatar === undefined
              ? {}
              : {
                  avatar: bot.avatar.startsWith('data:image/')
                    ? botAvatarUrl(slug, bot.avatar)
                    : bot.avatar,
                }),
          };
    },
    activity: () =>
      personaBotActivitySnapshot(
        registry.list().map((bot) => bot.slug),
        states,
      ),
    onActivity: (changed) => states.onActivity(() => changed()),
    onIdentity: (changed) =>
      operationalDatabase.subscribe(({ topics }) => {
        if (topics.includes('bot-registry')) changed();
      }),
    observeOutput: (id, messageId) => channels.observeOutput(OWNER_HUMAN_CONTEXT, id, messageId),
    checkpoint: () => channels.outputCheckpoint(),
  });
}

export function createBotModes(
  ctx: Context,
  dshHome: string,
  productDefault: () => string,
  deps: { readonly core: BotHarnessCore },
) {
  const botModeSettings = createBotModeSettings(join(dshHome, 'botharness'));
  const productBotMode = productDefault();
  let installedBotModeIds: ReadonlySet<string> | undefined;
  const globalBotMode = (): string => {
    const saved = botModeSettings.defaultMode();
    return saved !== undefined &&
      (installedBotModeIds === undefined || installedBotModeIds.has(saved))
      ? saved
      : productBotMode;
  };
  const botModeOf = (slug: string | undefined): string =>
    slug === undefined
      ? globalBotMode()
      : resolveBotMode({
          own: deps.core.registry.get(slug)?.preset,
          inherited: globalBotMode(),
          allowed: botModeSettings.allowedModes(slug),
          installed: installedBotModeIds,
        });
  const installedBotModes = async (): Promise<BotModeOption[]> => {
    const presets = ctx.get('agentPresets') as { list(): Promise<BotModeOption[]> } | undefined;
    if (presets === undefined) return [];
    const listed = (await presets.list()).filter((preset) => isBotModeId(preset.id));
    installedBotModeIds = new Set(
      listed.filter((preset) => preset.broken === undefined).map((preset) => preset.id),
    );
    return listed.map((preset) => ({
      id: preset.id,
      ...(preset.name === undefined ? {} : { name: preset.name }),
      ...(preset.description === undefined ? {} : { description: preset.description }),
      ...(preset.order === undefined ? {} : { order: preset.order }),
      ...(preset.broken === undefined ? {} : { broken: preset.broken }),
    }));
  };
  const ensureBotModes = async () => {
    await installedBotModes().catch(() => {
      installedBotModeIds ??= new Set();
    });
  };
  const assignmentModes: NonNullable<
    Parameters<typeof createDshBotAgentAdapter>[0]['assignmentModes']
  > = async (slug) => {
    const installed = await installedBotModes();
    const allowed =
      botModeSettings.readError() === undefined ? botModeSettings.allowedModes(slug) : [];
    return {
      default: botModeOf(slug),
      restricted: allowed !== undefined,
      allowed: installed
        .filter((mode) => mode.broken === undefined)
        .filter((mode) => allowed === undefined || allowed.includes(mode.id))
        .map((mode) => ({
          id: mode.id,
          ...(mode.name === undefined ? {} : { name: mode.name }),
          ...(mode.description === undefined ? {} : { description: mode.description }),
        })),
    };
  };
  return {
    botModeSettings,
    productBotMode,
    globalBotMode,
    botModeOf,
    installedBotModes,
    ensureBotModes,
    assignmentModes,
  };
}

export function mountDesktopRoutes(
  ctx: Context,
  connectionCtx: Context,
  connection: HostFetchConnection,
  {
    team,
    presence,
    dshHome,
    profile,
  }: {
    team: BotHarnessCore['team'];
    presence: ReturnType<typeof createPresence>;
    dshHome: string;
    profile: ReturnType<typeof releaseFeature.resolveProfile>['profile'];
  },
) {
  connectionCtx.effect(
    () =>
      connection.fetch.register({
        path: PRESENCE_PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => presence.fetch(request, team.ownerContext()),
      }),
    'botharness: desktop presence route',
  );
  connectionCtx.effect(() => {
    const control = createWindowZoomControl(Date.now, (phase, detail) =>
      ctx.logger.info('window-zoom-control %j', { phase, ...detail }),
    );
    const off = connection.fetch.register({
      path: WINDOW_ZOOM_CONTROL_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: control.fetch,
    });
    return async () => {
      control.dispose();
      await off();
    };
  }, 'botharness: targeted window zoom delivery');
  connectionCtx.effect(() => {
    const setup = createWindowZoomSetup({
      dshHome,
      profileDir: profile?.dir,
      log: (phase, detail) => ctx.logger.info('window-zoom-setup %j', { phase, ...detail }),
    });
    return connection.fetch.register({
      path: WINDOW_ZOOM_SETUP_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: setup.fetch,
    });
  }, 'botharness: desktop window zoom setup after quit');
  connectionCtx.effect(() => {
    const control = createAppearanceControl();
    const off = connection.fetch.register({
      path: APPEARANCE_CONTROL_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: control.fetch,
    });
    return async () => {
      control.dispose();
      await off();
    };
  }, 'botharness: explicit Client-local appearance control');
  connectionCtx.effect(() => {
    const desktopWindow = createDesktopWindowReveal({
      log: (phase, detail) => ctx.logger.info('desktop-window %j', { phase, ...detail }),
    });
    desktopWindow.prime();
    return connection.fetch.register({
      path: DESKTOP_WINDOW_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: desktopWindow.fetch,
    });
  }, 'botharness: bring the Desktop window back from a notification');
}

export function mountCompanionRoute(
  connectionCtx: Context,
  connection: HostFetchConnection,
  core: Pick<BotHarnessCore, 'companions'>,
) {
  connectionCtx.effect(
    () =>
      connection.fetch.register({
        path: COMPANION_PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) =>
          request.method === 'POST'
            ? core.companions.update(request)
            : core.companions.open(request),
      }),
    'botharness: authenticated Window Companion consumption',
  );
}
