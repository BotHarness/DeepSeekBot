import { BROWSER_TOOLS, browserToolName } from './tool/catalog.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { registerBrowserViewer, type BrowserViewerHost } from './viewer.js';
import { LOCAL_VIEWER_PREFIX, localViewerUrl, registerLocalViewer } from './viewer-local.js';
import { createTakeoverService } from './takeover.js';
import type { ContainerBrowserOptions } from './runtime/container.js';
import { createProfileControl } from './profile-control.js';
import { registerProfileHttp } from './profile-http.js';
import { createDailyControl } from './daily.js';
import { createBorrowService } from './borrow.js';
import { registerBorrowHttp } from './borrow-http.js';

import { createBrowserDiagnostics, toLogEntry } from './diagnostics.js';
import { CHROME_LIB_PACKAGES, toBrowserErrorBody } from './runtime/provision.js';
import {
  createSpawnRunner,
  installSystemPackages,
  systemInstallAccess,
  type SystemInstallAccess,
} from '../../core/src/system/system-packages.js';
import { openLogDatabase, type LogDatabase } from '../../core/src/logs/log-db.js';
import { createBotBrowserRuntimes, listStoredProfileNames } from './runtimes.js';
import {
  browserToolNames,
  createBrowserToolProvider,
  formatAudit,
  ownsBrowserTool,
} from './tool/provider.js';

export const name = 'botharness-browser';

export interface BrowserConfig {
  target?: 'local' | 'container' | 'extension' | 'daily-control' | 'profile-control';
  localDriver?: 'current' | 'agent-browser';
  containerDriver?: 'current' | 'agent-browser';
  enabled: boolean;
  browserPath: string;
  headless: boolean;
  idleStopMinutes: number;
  autoAllowActions: boolean;
}

export const DEFAULT_CONFIG: BrowserConfig = {
  target: 'local',
  localDriver: 'current',
  containerDriver: 'current',
  enabled: true,
  browserPath: '',
  headless: false,
  idleStopMinutes: 30,
  autoAllowActions: false,
};

export const Config = Schema.object({
  target: Schema.union([
    Schema.const('local'),
    Schema.const('container'),
    Schema.const('extension'),
    Schema.const('daily-control'),
    Schema.const('profile-control'),
  ])
    .default('local')
    .volatile(),
  localDriver: Schema.union([Schema.const('current'), Schema.const('agent-browser')])
    .default('current')
    .volatile(),
  containerDriver: Schema.union([Schema.const('current'), Schema.const('agent-browser')])
    .default('current')
    .volatile(),
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 Browser'),
  browserPath: Schema.string()
    .default(DEFAULT_CONFIG.browserPath)
    .description('浏览器可执行文件路径；留空自动探测 Chrome / Edge / Chromium'),
  headless: Schema.boolean()
    .default(DEFAULT_CONFIG.headless)
    .description('无窗口运行；默认关闭，Human 需要在窗口里登录一次'),
  idleStopMinutes: Schema.number().default(DEFAULT_CONFIG.idleStopMinutes),
  autoAllowActions: Schema.boolean().default(DEFAULT_CONFIG.autoAllowActions),
});

interface HostConnectionLike {
  readonly fetch: {
    register(route: {
      readonly path: string;
      readonly methods: readonly string[];
      readonly requestBody: 'buffered';
      readonly fetch: (request: Request) => Promise<Response>;
    }): () => void;
  };
}

export function profileDirectory(): string {
  const home = process.env.DSH_HOME?.trim() ?? '';
  const root = home === '' ? join(homedir(), '.botharness') : join(home, 'botharness');
  return join(root, 'browser');
}

export function pinnedBrowserDirectory(): string {
  const home = process.env.DSH_HOME?.trim() ?? '';
  const root = home === '' ? join(homedir(), '.botharness') : join(home, 'botharness');
  return join(root, 'browser-chromium');
}

export function apply(
  ctx: Context,
  config: Omit<BrowserConfig, 'target' | 'localDriver' | 'containerDriver'> & {
    localDriver?: 'current' | 'agent-browser' | { get(): 'current' | 'agent-browser' };
    containerDriver?: 'current' | 'agent-browser' | { get(): 'current' | 'agent-browser' };
    target?:
      | 'local'
      | 'container'
      | 'extension'
      | 'daily-control'
      | 'profile-control'
      | { get(): 'local' | 'container' | 'extension' | 'daily-control' | 'profile-control' };
  },
): void {
  if (!config.enabled) return;

  let logDb: LogDatabase | undefined;
  try {
    const home = process.env.DSH_HOME?.trim();
    logDb =
      home === undefined || home === ''
        ? undefined
        : openLogDatabase({ dir: join(home, 'botharness') });
  } catch {
    logDb = undefined;
  }
  const diagnostics = createBrowserDiagnostics(undefined, {
    write: (event) => {
      logDb?.write(toLogEntry(event, 'browser', 'profile-shared'));
    },
  });

  const coreLookup = (): { registry?: unknown; ownership?: unknown } | undefined =>
    ctx.get('botharness') as unknown as { registry?: unknown; ownership?: unknown } | undefined;
  const target = (): 'local' | 'container' | 'extension' | 'daily-control' | 'profile-control' =>
    (typeof config.target === 'object' ? config.target.get() : config.target) ?? 'local';
  const localDriver = (): 'current' | 'agent-browser' =>
    (typeof config.localDriver === 'object' ? config.localDriver.get() : config.localDriver) ??
    'current';
  const containerDriver = (): 'current' | 'agent-browser' =>
    (typeof config.containerDriver === 'object'
      ? config.containerDriver.get()
      : config.containerDriver) ?? 'current';
  const driver = (): 'current' | 'agent-browser' =>
    target() === 'container' ? containerDriver() : localDriver();
  let revision = 0;
  const registrationScopes = new WeakMap<AbortSignal, number>();
  let registrationRevision = 0;
  const botRevisions = new Map<string, number>();
  const previewScope = (slug: string): string =>
    `${authorizationScope()}:${botRevisions.get(slug) ?? 0}`;
  const authorizationScope = (sessionId?: string): string => {
    const signal = sessionId === undefined ? undefined : provider.executionSignal(sessionId);
    if (signal !== undefined && !registrationScopes.has(signal))
      registrationScopes.set(signal, ++registrationRevision);
    return `${target()}:${driver()}:${revision}:${borrow.revision}:${daily.revision}:${profile.revision}:${signal === undefined ? '' : registrationScopes.get(signal)}`;
  };
  let switching: Promise<void> = Promise.resolve();
  let registerViewer: ContainerBrowserOptions['onViewer'];
  ctx.inject(['connection', 'webServer'], (viewerCtx) => {
    const services = viewerCtx as unknown as {
      webServer: BrowserViewerHost;
      connection: { requestRejection(request: { headers: Headers }): number | undefined };
    };
    registerViewer = (prefix, upstream) =>
      registerBrowserViewer({
        host: services.webServer,
        prefix,
        upstream,
        rejection: (headers) => services.connection.requestRejection({ headers }),
      });
    return () => {
      registerViewer = undefined;
    };
  });
  const runtimes = createBotBrowserRuntimes({
    browserDir: profileDirectory(),
    target: () => (target() === 'container' ? 'container' : 'local'),
    driver,
    onIdleStop: (profile) => provider.invalidateProfile(profile),
    onViewer: (prefix, upstream) => {
      if (registerViewer === undefined)
        throw new Error('The Container Browser viewer requires the DSH Web Host');
      return registerViewer(prefix, upstream);
    },
    installDir: pinnedBrowserDirectory(),
    ...(config.browserPath.trim() === '' ? {} : { browserPath: config.browserPath.trim() }),
    ...(config.headless ? { headless: true } : {}),
    onEvent: (detail) => diagnostics.record('lifecycle', detail),
    profileOf: (slug) => {
      const registry = coreLookup()?.registry as
        | { get(slug: string): { browserProfile?: string } | undefined }
        | undefined;
      return registry?.get(slug)?.browserProfile ?? '';
    },
  });

  const borrow = createBorrowService({
    enabled: () => target() === 'extension',
    bot: (slug) => {
      const registry = coreLookup()?.registry as
        | { get(slug: string): { browserAccess?: boolean; displayName?: string } | undefined }
        | undefined;
      const bot = registry?.get(slug);
      return bot === undefined
        ? undefined
        : { displayName: bot.displayName ?? slug, browserAccess: bot.browserAccess === true };
    },
    onChange: (slug) => provider.invalidateBot(slug),
    note: (event) => diagnostics.record('lifecycle', event),
  });
  ctx.inject(['webServer'], (borrowCtx) => {
    const host = (borrowCtx as unknown as { webServer: BrowserViewerHost }).webServer;
    return registerBorrowHttp(host, borrow);
  });

  const daily = createDailyControl({
    enabled: () => target() === 'daily-control',
    bot: (slug) => {
      const registry = coreLookup()?.registry as
        | { get(slug: string): { browserAccess?: boolean; displayName?: string } | undefined }
        | undefined;
      const bot = registry?.get(slug);
      return bot === undefined
        ? undefined
        : { displayName: bot.displayName ?? slug, browserAccess: bot.browserAccess === true };
    },
    path: config.browserPath.trim(),
    onChange: (slug) => provider.invalidateBot(slug),
    note: (detail) => diagnostics.record('lifecycle', detail),
  });

  const profile = createProfileControl({
    file: join(profileDirectory(), 'daily-profile-pairing.json'),
    enabled: () => target() === 'profile-control',
    allowed: (slug) =>
      (
        coreLookup()?.registry as
          | { get(slug: string): { browserAccess?: boolean } | undefined }
          | undefined
      )?.get(slug)?.browserAccess === true,
    onChange: () => {
      if (target() !== 'profile-control') return;
      for (const bot of (
        coreLookup()?.registry as { list(): { slug: string }[] } | undefined
      )?.list() ?? [])
        provider.invalidateBot(bot.slug);
    },
    note: (detail) => diagnostics.record('lifecycle', detail),
  });
  ctx.inject(['webServer'], (profileCtx) =>
    registerProfileHttp(
      (profileCtx as unknown as { webServer: BrowserViewerHost }).webServer,
      profile,
    ),
  );

  const takeovers = createTakeoverService();

  const takeoverViewerBase = (slug: string): string | undefined => {
    const runtime = runtimes.for(slug);
    if (!runtime.isRunning()) return undefined;
    return (
      runtime.viewerUrl?.() ??
      (target() === 'local' ? localViewerUrl(slug) : undefined) ??
      undefined
    );
  };

  const provider = createBrowserToolProvider({
    ctx,
    runtimes,
    screenshotDir: join(profileDirectory(), 'screenshots'),
    isAutoAllowed: () => config.autoAllowActions,
    beforeExecution: () =>
      switching.catch(() => {
        throw new Error('Browser cleanup failed; use Stop in the Browser panel to retry');
      }),
    profile: () => (target() === 'profile-control' ? profile : undefined),
    daily: () => (target() === 'daily-control' ? daily : undefined),
    borrowed: () => (target() === 'extension' ? borrow : undefined),
    takeover: () => takeovers,
    takeoverUrlFor: takeoverViewerBase,
    audit: (event) => diagnostics.record('browser-action', formatAudit(event)),
    note: (detail) => diagnostics.record('lifecycle', detail),
    onInvalidate: (slug) => botRevisions.set(slug, (botRevisions.get(slug) ?? 0) + 1),
    onActivity: (slug) => {
      if (target() === 'local' || target() === 'container') runtimes.touch(slug);
    },
    core: () => {
      const core = coreLookup();
      return {
        registry: core?.registry as never,
        ownership: core?.ownership as never,
      };
    },
  });
  ctx.provide('botharnessBrowserTools', {
    reconcileBot: (slug: string) => {
      if (
        !(
          (
            coreLookup()?.registry as
              | { get(slug: string): { browserAccess?: boolean } | undefined }
              | undefined
          )?.get(slug)?.browserAccess === true
        )
      ) {
        borrow.returnBot(slug);
        daily.returnBot(slug);
        profile.returnBot(slug);
      }
      return provider.reconcileBot(slug);
    },
    resetBot: (slug: string) => {
      const started = Date.now();
      daily.returnBot(slug);
      profile.returnBot(slug);
      provider.invalidateBot(slug);
      diagnostics.record(
        'lifecycle',
        `initiator=profile-assignment phase=reset-tabs slug=${slug} durationMs=${Date.now() - started}`,
      );
    },
    ownsTool: (name: string) => ownsBrowserTool(name),
    executionSignal: (sessionId: string) => provider.executionSignal(sessionId),
    needsAuthorization: (sessionId: string) => provider.needsAuthorization(sessionId),
    authorizationScope,
    markAuthorized: (sessionId: string, expectedScope?: string) => {
      if (expectedScope !== undefined && expectedScope !== authorizationScope(sessionId))
        return false;
      provider.markAuthorized(sessionId);
      return true;
    },
  });
  ctx.inject(['connection', 'webServer'], (localViewerCtx) => {
    const services = localViewerCtx as unknown as {
      webServer: BrowserViewerHost;
      connection: { requestRejection(request: { headers: Headers }): number | undefined };
    };
    const release = registerLocalViewer({
      host: services.webServer,
      runtimes,
      currentTab: (slug) => provider.currentTab(slug),
      isTakeover: (slug) => provider.isTakeover(slug),
      touch: (slug) => {
        runtimes.touch(slug);
        provider.touch(slug);
      },
      hasAccess: (slug) =>
        (
          coreLookup()?.registry as
            | { get(slug: string): { browserAccess?: boolean } | undefined }
            | undefined
        )?.get(slug)?.browserAccess === true,
      note: (detail) => diagnostics.record('lifecycle', detail),
      takeover: takeovers,
      rejection: (headers) => services.connection.requestRejection({ headers }),
    });
    diagnostics.record('lifecycle', `local viewer ready prefix=${LOCAL_VIEWER_PREFIX}`);
    return release;
  });
  ctx.on('loader/volatile-update', (paths) => {
    if (
      !paths.some(
        (path) =>
          path[0] === 'target' || path[0] === 'localDriver' || path[0] === 'containerDriver',
      )
    )
      return;
    revision += 1;
    borrow.clear();
    daily.clear();
    profile.clear();
    provider.resetRuntime();
    switching = switching.catch(() => undefined).then(() => runtimes.stopAll());
    void switching
      .then(() => provider.reconcileAll())
      .catch((error: unknown) =>
        diagnostics.record(
          'lifecycle',
          `initiator=target-switch phase=refused detail=${String(error).slice(0, 200)}`,
        ),
      );
  });
  ctx.inject(['botharness'], (coreCtx) => {
    const core = (
      coreCtx as unknown as {
        botharness?: {
          contributeBotAgentSetup?: (
            contribute: (
              agentCtx: import('@deepseek-ai/cordis').Context,
              agent: { id: unknown },
              info: { botSlug: string; rootRole: string },
            ) => void,
          ) => () => void;
          hostTools?: Set<string>;
        };
      }
    ).botharness;
    const remove = core?.contributeBotAgentSetup?.((agentCtx, agent, info) => {
      provider.attachAgent(agentCtx, String(agent.id), info);
    });
    for (const name of browserToolNames()) core?.hostTools?.add(name);
    return () => {
      remove?.();
      for (const name of browserToolNames()) core?.hostTools?.delete(name);
    };
  });
  ctx.effect(
    () => () => {
      borrow.dispose();
      daily.clear();
      profile.dispose();
      void provider.dispose();
    },
    'botharness-browser: tool provider',
  );

  const idleMs = Math.max(1, config.idleStopMinutes) * 60_000;
  ctx.effect(() => {
    const timer = setInterval(() => {
      switching = switching
        .catch(async () => {
          revision += 1;
          provider.resetRuntime();
          await runtimes.stopAll();
          await provider.reconcileAll();
        })
        .then(async () => {
          await provider.closeIdleTabs(idleMs);
          await runtimes.closeIdle(idleMs);
        });
      void switching.catch((error: unknown) =>
        diagnostics.record(
          'lifecycle',
          `initiator=idle phase=refused detail=${String(error).slice(0, 200)}`,
        ),
      );
    }, 30_000);
    return () => clearInterval(timer);
  }, 'botharness-browser: idle stop');

  const packageRunner = createSpawnRunner();
  let installAccess: Promise<SystemInstallAccess> | undefined;
  let packageInstall:
    | {
        state: 'installing' | 'installed' | 'failed';
        packages: readonly string[];
        percent: number;
        text: string;
      }
    | undefined;

  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: HostConnectionLike }).connection;
    const json = (value: unknown, status = 200): Response =>
      Response.json(value as Record<string, unknown>, { status });

    for (const action of ['pair', 'forget'] as const) {
      connectionCtx.effect(
        () =>
          connection.fetch.register({
            path: `/api/browser/profile/${action}`,
            methods: ['POST'],
            requestBody: 'buffered',
            async fetch() {
              try {
                return json({
                  ok: true,
                  ...(action === 'pair' ? await profile.pair() : (await profile.forget(), {})),
                });
              } catch {
                return json({ ok: false, error: 'Chrome Profile pairing unavailable' }, 409);
              }
            },
          }),
        `botharness-browser: profile ${action}`,
      );
    }

    for (const action of ['connect', 'grant', 'return'] as const) {
      connectionCtx.effect(
        () =>
          connection.fetch.register({
            path: `/api/browser/daily/${action}`,
            methods: ['POST'],
            requestBody: 'buffered',
            async fetch(request) {
              try {
                const body = (await request.json()) as { slug?: unknown };
                if (typeof body.slug !== 'string' || body.slug === '')
                  throw new Error('PersonaBot is required');
                await switching;
                if (action === 'connect') daily.connect(body.slug);
                else if (action === 'grant') await daily.grant(body.slug);
                else daily.returnBot(body.slug);
                return json({ ok: true });
              } catch (error) {
                return json(
                  {
                    ok: false,
                    error:
                      error instanceof Error ? error.message : 'Daily Browser operation failed',
                  },
                  409,
                );
              }
            },
          }),
        `botharness-browser: daily ${action}`,
      );
    }

    for (const action of ['pair', 'return'] as const) {
      connectionCtx.effect(
        () =>
          connection.fetch.register({
            path: `/api/browser/borrow/${action}`,
            methods: ['POST'],
            requestBody: 'buffered',
            async fetch(request) {
              try {
                const body = (await request.json()) as { slug?: unknown };
                if (typeof body.slug !== 'string' || body.slug === '')
                  throw new Error('PersonaBot is required');
                await switching;
                if (action === 'return') {
                  borrow.returnBot(body.slug);
                  return json({ ok: true });
                }
                return json({ ok: true, ...borrow.pair(body.slug) });
              } catch (error) {
                return json(
                  { ok: false, error: error instanceof Error ? error.message : 'Pairing failed' },
                  409,
                );
              }
            },
          }),
        `botharness-browser: borrowed ${action}`,
      );
    }

    const openRoute = {
      path: '/api/browser/open',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        if (
          target() === 'extension' ||
          target() === 'daily-control' ||
          target() === 'profile-control'
        )
          return json(
            { ok: false, error: 'Connect a Daily Browser document in the Browser entry' },
            409,
          );
        let body: { slug?: unknown; tab?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          void 0;
        }
        const slug = typeof body.slug === 'string' ? body.slug : '';
        if (slug === '') return json({ ok: false, error: 'slug is required' }, 400);
        diagnostics.record('lifecycle', `open requested (panel) slug=${slug}`);
        runtimes.touch(slug);
        provider.touch(slug);
        try {
          await switching;
          const scope = previewScope(slug);
          const requested = typeof body.tab === 'string' && body.tab !== '' ? body.tab : undefined;
          const tab = await provider.openForHuman(slug, requested);
          if (scope !== previewScope(slug))
            throw new Error('Browser authority changed while opening');
          const opened = runtimes.for(slug);
          return json({
            ok: true,
            tabId: tab.tabId,
            viewerUrl:
              opened.viewerUrl?.() ??
              (target() === 'local' && opened.isRunning() ? localViewerUrl(slug) : null),
          });
        } catch (error) {
          return json(toBrowserErrorBody(error), 500);
        }
      },
    };
    const installRoute = {
      path: '/api/browser/install-packages',
      methods: ['GET', 'POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        if (request.method === 'GET') {
          installAccess ??= systemInstallAccess(packageRunner);
          return json({ ok: true, access: await installAccess, ...(packageInstall ?? {}) });
        }
        let body: { authorize?: unknown; packages?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          void 0;
        }
        if (body.authorize !== true)
          return json(
            { ok: false, code: 'authorize-required', error: 'explicit authorization required' },
            400,
          );
        const packages = Array.isArray(body.packages)
          ? body.packages.filter((name): name is string => typeof name === 'string')
          : [];
        if (packages.length === 0 || packages.some((name) => !CHROME_LIB_PACKAGES.has(name)))
          return json({ ok: false, code: 'packages-invalid', error: 'unknown packages' }, 400);
        if (packageInstall?.state === 'installing')
          return json({ ok: false, code: 'install-running', error: 'an install is running' }, 409);
        installAccess ??= systemInstallAccess(packageRunner);
        const access = await installAccess;
        if (access === 'none')
          return json(
            { ok: false, code: 'needs-administrator', error: 'administrator rights required' },
            403,
          );
        const started = Date.now();
        packageInstall = { state: 'installing', packages, percent: 0, text: '' };
        diagnostics.record(
          'lifecycle',
          `install-packages start packages=${packages.join(',')} access=${access}`,
        );
        void installSystemPackages({
          packages,
          access,
          runner: packageRunner,
          onProgress: (progress) => {
            packageInstall = { state: 'installing', packages, ...progress };
          },
        })
          .then(() => {
            packageInstall = { state: 'installed', packages, percent: 100, text: '' };
            diagnostics.record(
              'lifecycle',
              `install-packages done durationMs=${String(Date.now() - started)}`,
            );
          })
          .catch((error: unknown) => {
            const detail = error instanceof Error ? error.message : String(error);
            packageInstall = {
              state: 'failed',
              packages,
              percent: packageInstall?.percent ?? 0,
              text: detail,
            };
            diagnostics.record('lifecycle', `install-packages refused detail=${detail}`);
          });
        return json({ ok: true, started: true });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(installRoute),
      'botharness-browser: install-packages route',
    );

    connectionCtx.effect(
      () => connection.fetch.register(openRoute),
      'botharness-browser: open route',
    );

    const observationRoute = {
      path: '/api/browser/observation',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const slug = url.searchParams.get('slug') ?? '';
        try {
          await switching;
        } catch {
          return json({
            ok: true,
            target: target(),
            cleanupRequired: true,
            running: false,
            frame: null,
            focused: null,
            takeover: false,
            handoffPending: false,
            tabs: [],
          });
        }
        const scope = previewScope(slug);
        const requested = url.searchParams.get('tab') ?? '';
        if (target() === 'profile-control')
          return json({
            ok: true,
            target: 'profile-control',
            running: false,
            frame: null,
            focused: null,
            takeover: provider.isTakeover(slug),
            handoffPending: provider.takeoverPending(slug),
            tabs: [],
            profile: await profile.view(),
          });
        if (target() === 'daily-control')
          return json({
            ok: true,
            target: 'daily-control',
            running: false,
            frame: null,
            focused: null,
            takeover: provider.isTakeover(slug),
            handoffPending: provider.takeoverPending(slug),
            tabs: [],
            daily: daily.view(slug) ?? null,
          });
        if (target() === 'extension')
          return json({
            ok: true,
            target: 'extension',
            running: false,
            frame: null,
            focused: null,
            takeover: false,
            handoffPending: false,
            tabs: [],
            borrowed: borrow.view(slug) ?? null,
          });
        if (slug === '') {
          return json({
            ok: true,
            running: false,
            frame: null,
            focused: null,
            takeover: false,
            handoffPending: false,
            tabs: [],
          });
        }
        runtimes.touch(slug);
        provider.touch(slug);
        const runtime = runtimes.for(slug);
        const tabId =
          requested !== '' && provider.ownsTab(slug, requested)
            ? requested
            : provider.currentTab(slug);
        let frame: string | null = null;
        if (tabId !== undefined && runtime.isRunning()) {
          const shot = await runtime.captureScreenshot(tabId).catch(() => undefined);
          if (shot !== undefined) frame = `data:${shot.mimeType};base64,${shot.data}`;
        }
        const discoveryStarted = Date.now();
        const profiles = await listStoredProfileNames(profileDirectory()).catch(() => {
          diagnostics.record(
            'lifecycle',
            `initiator=observation phase=profile-discovery outcome=unavailable reason=directory-unavailable durationMs=${Date.now() - discoveryStarted}`,
          );
          return [];
        });
        const tabs = await provider.listTabs(slug);
        if (scope !== previewScope(slug))
          return json({ ok: false, error: 'Browser authority changed during observation' }, 409);
        return json({
          ok: true,
          running: runtime.isRunning(),
          frame,
          focused: tabId ?? null,
          takeover: provider.isTakeover(slug),
          handoffPending: provider.takeoverPending(slug),
          tabs,
          profiles,
          target: target(),
          viewerUrl:
            runtime.viewerUrl?.() ??
            (target() === 'local' && runtime.isRunning() ? localViewerUrl(slug) : null),
          provisioning: runtimes.installProgress(slug) ?? null,
        });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(observationRoute),
      'botharness-browser: observation route',
    );

    const takeoverRoute = {
      path: '/api/browser/takeover',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        if (target() === 'extension')
          return json({ ok: false, error: 'Daily Browser is read-only; use Return tab' }, 409);
        let body: { slug?: unknown; active?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          void 0;
        }
        const slug = typeof body.slug === 'string' ? body.slug : '';
        if (slug === '' || typeof body.active !== 'boolean') {
          return json({ ok: false, error: 'slug and active are required' }, 400);
        }
        runtimes.touch(slug);
        provider.touch(slug);
        await switching;
        const takeover = provider.setTakeover(slug, body.active);
        if (target() === 'daily-control') {
          try {
            await daily.pause(slug, body.active);
          } catch (error) {
            daily.returnBot(slug);
            return json(
              {
                ok: false,
                error: error instanceof Error ? error.message : 'Daily Browser control changed',
              },
              409,
            );
          }
        }
        if (target() === 'profile-control') {
          try {
            await profile.pause(slug, body.active);
          } catch {
            profile.returnBot(slug);
            return json(
              { ok: false, error: 'Chrome Profile disconnected; reconnect and observe again' },
              409,
            );
          }
        }
        return json({ ok: true, takeover });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(takeoverRoute),
      'botharness-browser: takeover route',
    );

    const stopRoute = {
      path: '/api/browser/stop',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        let body: { slug?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          void 0;
        }
        const slug = typeof body.slug === 'string' ? body.slug : '';
        if (slug === '') return json({ ok: false, error: 'slug is required' }, 400);
        diagnostics.record('lifecycle', `stop requested (panel) slug=${slug}`);
        try {
          const pendingSwitch = switching;
          await pendingSwitch.catch(async () => {
            revision += 1;
            provider.resetRuntime();
            await runtimes.stopAll();
            if (switching === pendingSwitch) {
              switching = Promise.resolve();
              await provider.reconcileAll();
            }
          });
          await switching;
          if (target() === 'profile-control') {
            await profile.forget();
            return json({ ok: true });
          }
          if (target() === 'daily-control') {
            daily.returnBot(slug);
            return json({ ok: true });
          }
          if (target() === 'extension') {
            borrow.returnBot(slug);
            return json({ ok: true });
          }
          provider.invalidateProfile(runtimes.profileOf(slug));
          switching = runtimes.stop(slug);
          await switching;
          provider.resetBot(slug);
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(stopRoute),
      'botharness-browser: stop route',
    );

    const toolsRoute = {
      path: '/api/browser/tools',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (): Promise<Response> =>
        json({
          ok: true,
          tools: BROWSER_TOOLS.map((spec) => ({
            name: browserToolName(spec.raw),
            description: spec.description,
            inputSchema: spec.inputSchema,
          })),
        }),
    };
    connectionCtx.effect(
      () => connection.fetch.register(toolsRoute),
      'botharness-browser: tool catalog route',
    );

    const toolRoute = {
      path: '/api/browser/tool',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        let body: { slug?: unknown; tool?: unknown; args?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          void 0;
        }
        const slug = typeof body.slug === 'string' ? body.slug : '';
        const tool = typeof body.tool === 'string' ? body.tool : '';
        const args = body.args ?? {};
        if (
          slug === '' ||
          tool === '' ||
          typeof args !== 'object' ||
          args === null ||
          Array.isArray(args)
        )
          return json({ ok: false, error: 'slug, tool and an args object are required' }, 400);
        diagnostics.record('lifecycle', `direct tool slug=${slug} tool=${tool}`);
        runtimes.touch(slug);
        try {
          await switching;
          const result = await provider.runDirect(slug, tool, args as Record<string, unknown>);
          return json({ ok: true, content: result.content });
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : String(error) },
            409,
          );
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(toolRoute),
      'botharness-browser: direct tool route',
    );

    const takeoverAuditRoute = {
      path: '/api/browser/takeover/audit',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        const slug = new URL(request.url).searchParams.get('slug') ?? '';
        if (slug === '') return json({ ok: false, error: 'slug is required' }, 400);
        return json({ ok: true, events: takeovers.audit(slug) });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(takeoverAuditRoute),
      'botharness-browser: takeover audit route',
    );

    const takeoverRecordingRoute = {
      path: '/api/browser/takeover/recording',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        const token = new URL(request.url).searchParams.get('token') ?? '';
        const record = token === '' ? undefined : takeovers.recording(token);
        if (record === undefined) return json({ ok: false, error: 'unknown token' }, 404);
        return json({
          ok: true,
          slug: record.slug,
          state: record.state,
          ...(record.reason === undefined ? {} : { reason: record.reason }),
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          ...(record.completedAt === undefined ? {} : { completedAt: record.completedAt }),
          events: record.events,
        });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(takeoverRecordingRoute),
      'botharness-browser: takeover recording route',
    );
  });

  ctx.logger.info(`botharness-browser: Bot Browser ready (profile ${profileDirectory()})`);
}
