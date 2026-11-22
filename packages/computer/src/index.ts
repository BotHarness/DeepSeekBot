import type {} from '../../core/src/channels/resource-events.js';
import { coalesce } from '../../core/src/runtime/coalesce.js';
import { openComputerPermissionSettings } from './permission-settings.js';
import ComputerUseRegistry from './native-registry.js';
import { createDeviceApprovalScope } from '../../core/src/workspaces/device-approval.js';
import { stampReleaseComponent } from '../../core/src/release/component.js';
import type { IncomingMessage } from 'node:http';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-settings';
import {
  createComputerConfig,
  desktopLocale,
  readLive,
  type ComputerRuntimeConfig,
} from './computer-config.js';

import { DIAGNOSTICS_LIMIT, createComputerDiagnostics, toLogEntry } from './diagnostics.js';
import {
  openLogDatabase,
  type LogDatabase,
  type LogOwnerScope,
  type LogQuery,
} from '../../core/src/logs/log-db.js';
import { createTransferTokens } from './transfer-tokens.js';
import { createArchiveHandlers, defaultExportDir } from './archive-http.js';
import { createProcessRunner } from './process-runner.js';
import { createIdleWatcher } from './idle.js';
import { createDesktopView } from './desktop-view.js';
import { createDesktopHandlers } from './desktop-http.js';
import {
  createDesktopProvisioningHandlers,
  createDesktopProvisioningState,
} from './desktop-provisioning-http.js';
import { createComputerPauseStore, createLocalVideoOwner } from './local-video-owner.js';
import { createMacScroll } from './macos-scroll.js';
import { createLocalVideoHttp } from './local-video-http.js';
import {
  LOCAL_VIDEO_PATH,
  LocalVideoError,
  type LocalDesktopControl,
} from './local-video-contract.js';
import { createCallMedia } from './media/call-supervisor.js';
import { createLocalVideoMedia } from './media/supervisor.js';
import { resolveDshHome } from '../../core/src/im/config-store.js';
import type { ComputerSettings } from './settings.js';
import { createDockerComputerProvider } from './providers/docker.js';
import { createComputerService, type ComputerService } from './service.js';
import { createCuaDriver } from './tool/driver.js';
import { createLocalCuaDriver } from './tool/local-driver.js';
import { detectTailnetAddress } from '../../core/src/devices/routes.js';
import { createSelkiesWebRtc } from '../../core/src/http/selkies-webrtc.js';
import { createLocalComputerProvider } from './providers/local.js';
import { computerTarget, createComputerTargetRuntime, type ComputerTarget } from './target.js';
import { COMPUTER_GUIDANCE, localComputerGuidance } from './tool/catalog.js';
import type {} from '@deepseek-ai/cordis-plugin-loader';
import {
  computerToolNames,
  createComputerToolProvider,
  formatAudit,
  ownsComputerTool,
} from './tool/provider.js';
import { ViewerProxy, proxyUpgrade, viewerUpgradePaths } from './viewer.js';

export const name = 'botharness-computer';
stampReleaseComponent(apply, import.meta.url);

export const { DEFAULT_CONFIG, Config } = createComputerConfig();
export { desktopLocale, type ComputerConfig } from './computer-config.js';

export {
  defaultExportDir,
  isSafeArchiveName,
  receiveUploadBody,
  storeUploadBody,
  streamArchiveResponse,
} from './archive-http.js';
export { createProcessRunner } from './process-runner.js';

interface HostConnectionLike {
  readonly fetch: {
    register(route: {
      readonly path: string;
      readonly methods: readonly string[];
      readonly requestBody: 'buffered' | 'streaming';
      readonly fetch: (request: Request) => Promise<Response>;
    }): () => Promise<void>;
  };
  readonly requestRejection: (request: { readonly headers: Headers }) => number | undefined;
}

interface HostWebServerLike {
  register(route: {
    readonly kind: 'exact' | 'prefix';
    readonly path: string;
    readonly handler: (request: unknown, response: unknown) => void | Promise<void>;
  }): () => void;
  registerUpgrade?(route: {
    readonly path: string;
    readonly handler: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
  }): () => void;
}

export const VIEWER_PREFIX = '/botharness-computer/viewer';

export function apply(ctx: Context, config: ComputerRuntimeConfig): void {
  ctx.plugin(ComputerUseRegistry);
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
  const diagnostics = createComputerDiagnostics(DIAGNOSTICS_LIMIT, {
    write: (event) => {
      logDb?.write(toLogEntry(event, 'computer', 'profile-shared'));
    },
  });
  let transferTokens = createTransferTokens();
  const statusChanged = coalesce(() => ctx.get('botharnessResourcePublisher')?.('computer'), {
    delayMs: 25,
    maxWaitMs: 1_000,
  });
  ctx.effect(() => statusChanged.cancel, 'botharness-computer: status notifications');
  const service: ComputerService = createComputerService();
  let requestedLanguage = '';
  const runner = createProcessRunner();
  const installState = createDesktopProvisioningState();
  let authorizationRevision = 0;
  const authorizationScope = (): string => `${target()}:${String(authorizationRevision)}`;
  const target = (): ComputerTarget => computerTarget(readLive(config.target));
  const savedTargetScope = createDeviceApprovalScope(
    join(resolveDshHome(), 'botharness', 'computer-approval-target.json'),
    () =>
      JSON.stringify(
        target() === 'local'
          ? ['local']
          : ['container', config.containerName, config.volumeName, config.dataDir, config.image],
      ),
  );
  const migratedLocal = (): boolean =>
    (process.platform === 'win32' || process.platform === 'darwin') && target() === 'local';
  const runtime = createComputerTargetRuntime({
    target,
    onChange: () => {
      transferTokens = createTransferTokens();
      toolProvider.resetRuntime();
      void localVideo
        .resetRuntime()
        .catch(() => diagnostics.record('lifecycle', 'phase=local-video-runtime-cleanup-refused'));
    },
    onEvent: (detail) => diagnostics.record('lifecycle', detail),
    onStatusChanged: statusChanged.schedule,
    create: (selected, onStatusChanged) => {
      if (selected === 'local') {
        const driver = createLocalCuaDriver({
          runner,
          onEvent: (detail) => diagnostics.record('lifecycle', detail),
        });
        const provider = createLocalComputerProvider({
          driver,
          runner,
          onEvent: (detail) => diagnostics.record('lifecycle', `target=local ${detail}`),
          onStatusChanged,
        });
        return { provider, driver };
      }
      const provider = createDockerComputerProvider({
        runner,
        onEvent: (detail) => diagnostics.record('container', detail),
        onStatusChanged,
        getLanguage: () => (requestedLanguage === '' ? config.language : requestedLanguage),
        config: {
          image: config.image,
          containerName: config.containerName,
          volumeName: config.volumeName,
          dataDir: config.dataDir,
          hostPort: config.hostPort,
          cpus: config.cpus,
          memory: config.memory,
          resolution: config.resolution,
          shmSize: config.shmSize,
          pidsLimit: config.pidsLimit,
          idleStopMinutes: readLive(config.idleStopMinutes),
          hardenDesktop: config.hardenDesktop,
          language: config.language,
        },
        tailnetAddress: () => detectTailnetAddress(),
      });
      const driver = createCuaDriver({
        runner,
        containerName: config.containerName,
        onEvent: (detail) => diagnostics.record('lifecycle', `target=container ${detail}`),
      });
      return { provider, driver };
    },
  });
  const release = service.registerProvider(runtime.provider);
  ctx.effect(() => release, 'botharness-computer: provider registration');
  ctx.provide('botharnessComputer', service);
  ctx.on('loader/volatile-update', (paths) => {
    if (!paths.some((path) => path[0] === 'target')) return;
    authorizationRevision += 1;
    savedTargetScope.invalidate();
    toolProvider.resetRuntime();
    void runtime
      .sync()
      .then(() => toolProvider.reconcileAll())
      .finally(statusChanged.schedule)
      .catch((error: unknown) =>
        diagnostics.record(
          'lifecycle',
          `phase=target-switch-failed detail=${String(error).slice(0, 200)}`,
        ),
      );
  });
  ctx.effect(() => () => runtime.dispose(), 'botharness-computer: target runtime');
  const activity = { touch: (): void => undefined };
  const driver = runtime.driver;
  const localVideo = createLocalVideoOwner({
    pause: createComputerPauseStore(join(resolveDshHome(), 'botharness', 'computer-pause.json')),
    driver,
    media: createLocalVideoMedia({
      onEvent: (detail) => diagnostics.record('lifecycle', detail),
    }),
    isRunning: () => migratedLocal() && runtime.isRunning(),
    supported: migratedLocal,
    driverPlatform: process.platform === 'darwin' ? 'darwin' : 'win32',
    ...(process.platform === 'darwin'
      ? { scrollMotion: createMacScroll((detail) => diagnostics.record('lifecycle', detail)) }
      : {}),
    onEvent: (detail) => diagnostics.record('lifecycle', detail),
  });
  service.localVideo = localVideo;
  service.callMedia = createCallMedia({
    onEvent: (detail) => diagnostics.record('lifecycle', detail),
  });
  ctx.effect(
    () => async () => {
      service.localVideo = undefined;
      service.callMedia = undefined;
      await localVideo.dispose();
    },
    'botharness-computer: Local video owner',
  );
  const desktopView = createDesktopView({
    driver,
    isRunning: () => runtime.isRunning(),
    scales: () => target() === 'local',
  });
  const toolProvider = createComputerToolProvider({
    ctx,
    driver,
    isComputerRunning: () => runtime.isRunning(),
    isPaused: () => (migratedLocal() ? localVideo.isPaused() : desktopView.isPaused()),
    isBotPaused: (slug) => {
      if (!migratedLocal()) return false;
      const browser = ctx.get('botharnessBrowserTools') as unknown as
        | { sharesLocalDesktop?: () => boolean; isTakeover?: (slug: string) => boolean }
        | undefined;
      return browser?.sharesLocalDesktop?.() === true && browser.isTakeover?.(slug) === true;
    },
    runBotOperation: (operation, signal) =>
      migratedLocal() ? localVideo.runBotOperation(() => operation()) : operation(signal),
    authorizationScope,
    guidance: () => (target() === 'local' ? localComputerGuidance() : COMPUTER_GUIDANCE),
    isAutoAllowed: () => effective().autoAllowActions,
    audit: (event) => diagnostics.record('computer-action', formatAudit(event)),
    note: (detail) => diagnostics.record('lifecycle', detail),
    onActivity: () => activity.touch(),
    core: () => {
      const core = ctx.get('botharness') as unknown as
        | { registry?: unknown; ownership?: unknown }
        | undefined;
      return {
        registry: core?.registry as never,
        ownership: core?.ownership as never,
      };
    },
  });
  ctx.provide('botharnessComputerTools', {
    desktopControl: (): LocalDesktopControl => ({
      desktop: migratedLocal(),
      held: migratedLocal() && runtime.isRunning() && localVideo.isPaused(),
      epoch: localVideo.controlEpoch(),
    }),
    reconcileBot: (slug: string) => toolProvider.reconcileBot(slug),
    ownsTool: (name: string) => ownsComputerTool(name),
    approvalScope: () => savedTargetScope.current(),
    authorizeCall: (token: symbol, authorized: () => boolean) =>
      toolProvider.authorizeCall(token, authorized),
    needsAuthorization: (sessionId: string) => toolProvider.needsAuthorization(sessionId),
    authorizationScope,
    markAuthorized: (sessionId: string, scope?: string) =>
      toolProvider.markAuthorized(sessionId, scope),
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
          registry?: { get(slug: string): { computerAccess?: boolean } | undefined };
          contributeEngineTools?: (
            source: (info: { botSlug: string }) => Promise<
              readonly {
                name: string;
                description: string;
                inputSchema: Record<string, unknown>;
                run(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
              }[]
            >,
          ) => () => void;
        };
      }
    ).botharness;
    const remove = core?.contributeBotAgentSetup?.((agentCtx, agent, info) => {
      toolProvider.attachAgent(agentCtx, String(agent.id), info);
    });
    const removeEngineTools = core?.contributeEngineTools?.(async ({ botSlug }) =>
      core.registry?.get(botSlug)?.computerAccess === true
        ? (await toolProvider.directTools()).map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: (tool.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
            run: (args: Record<string, unknown>, signal: AbortSignal) =>
              toolProvider.runDirect(botSlug, tool.name, args, signal),
          }))
        : [],
    );
    const hostTools = (core as { hostTools?: Set<string> } | undefined)?.hostTools;
    for (const name of computerToolNames()) hostTools?.add(name);
    return () => {
      remove?.();
      removeEngineTools?.();
      for (const name of computerToolNames()) hostTools?.delete(name);
    };
  });
  ctx.effect(() => () => toolProvider.dispose(), 'botharness-computer: tool provider');

  const log = (message: string): void => {
    ctx.logger.info(`botharness-computer: ${message}`);
    diagnostics.record('lifecycle', message);
  };

  const effective = (): ComputerSettings => ({
    exportDir: readLive(config.exportDir),
    idleStopMinutes: readLive(config.idleStopMinutes),
    autoAllowActions: readLive(config.autoAllowActions),
  });
  const resolveExportDir = (): string => {
    const dir = effective().exportDir;
    return dir === '' ? defaultExportDir() : dir;
  };
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });

  const watcher = createIdleWatcher({
    idleMs: () => Math.max(1, effective().idleStopMinutes) * 60_000,
    onIdle: async () => {
      try {
        if (target() !== 'container') return;
        const status = await service.status();
        if (status.state === 'running') {
          log(`idle stop after ${String(effective().idleStopMinutes)} min without activity`);
          await service.stop();
        }
      } catch {}
    },
  });
  activity.touch = () => watcher.touch();
  void service.status().catch(() => undefined);
  ctx.effect(() => {
    const timer = setInterval(() => watcher.tick(), 60_000);
    return () => clearInterval(timer);
  }, 'botharness-computer: idle stop');

  const webrtc = createSelkiesWebRtc({
    label: 'computer',
    upstream: () => (target() === 'container' ? service.upstream() : undefined),
    container: () => (target() === 'container' ? service.webrtc() : undefined),
    tailnetAddress: () => detectTailnetAddress(),
    log: (detail) => diagnostics.record('container', detail),
  });
  ctx.effect(() => () => void webrtc.close(), 'botharness-computer: WebRTC calls');

  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: HostConnectionLike }).connection;
    const json = (value: unknown, status = 200): Response =>
      Response.json(value as Record<string, unknown>, { status });

    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: LOCAL_VIDEO_PATH,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: createLocalVideoHttp(() => service.localVideo),
        }),
      'botharness-computer: Local video commands',
    );
    const legacyLocalRefusal = (): Response =>
      json(
        {
          ok: false,
          code: 'update-required',
          error:
            'Update the viewer to use Local Computer video and explicit control. Image viewing is unavailable.',
        },
        409,
      );

    const webrtcRoute = {
      path: '/api/computer/webrtc',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (): Promise<Response> =>
        json({ signaling: '/api/computer/webrtc/signaling', ...(await webrtc.status()) }),
    };
    connectionCtx.effect(
      () => connection.fetch.register(webrtcRoute),
      'botharness-computer: WebRTC status route',
    );

    const provisioningHttp = createDesktopProvisioningHandlers({
      json,
      installState,
      service,
      log,
      toolProvider,
      target,
      resolveExportDir,
      config,
      statusChanged,
      runner,
    });

    const statusRoute = {
      path: '/api/computer/status',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: provisioningHttp.status,
    };
    connectionCtx.effect(
      () => connection.fetch.register(statusRoute),
      'botharness-computer: status route',
    );

    const startRoute = {
      path: '/api/computer/start',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        let authorize = false;
        let body: { authorize?: unknown; language?: unknown; target?: unknown } = {};
        try {
          body = (await request.json()) as {
            authorize?: unknown;
            language?: unknown;
            target?: unknown;
          };
          authorize = body.authorize === true;
        } catch {}
        if (!authorize) {
          return json(
            { ok: false, code: 'authorize-required', error: 'explicit authorization required' },
            400,
          );
        }
        if (body.target !== undefined && body.target !== target())
          return json(
            {
              ok: false,
              code: 'target-changed',
              error: 'Computer Target changed; check the selected Computer before retrying',
            },
            409,
          );
        requestedLanguage =
          typeof body.language === 'string' && body.language !== ''
            ? desktopLocale(body.language)
            : '';
        log(
          `start requested (panel)${requestedLanguage === '' ? '' : ` locale=${requestedLanguage}`}`,
        );
        watcher.touch();
        void service
          .start()
          .then(() => toolProvider.reconcileAll())
          .catch(() => undefined);
        return json({ ok: true, started: true });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(startRoute),
      'botharness-computer: start route',
    );

    const installRoute = {
      path: '/api/computer/install-packages',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: provisioningHttp.install,
    };
    connectionCtx.effect(
      () => connection.fetch.register(installRoute),
      'botharness-computer: install-packages route',
    );

    const stopRoute = {
      path: '/api/computer/stop',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        let authorize = false;
        try {
          const body = (await request.json()) as { authorize?: unknown };
          authorize = body.authorize === true;
        } catch {}
        if (!authorize) {
          return json(
            { ok: false, code: 'authorize-required', error: 'explicit authorization required' },
            400,
          );
        }
        log('stop requested (panel)');
        try {
          await service.stop();
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(stopRoute),
      'botharness-computer: stop route',
    );

    const toolsRoute = {
      path: '/api/computer/tools',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (): Promise<Response> =>
        json({ ok: true, tools: await toolProvider.directTools() }),
    };
    connectionCtx.effect(
      () => connection.fetch.register(toolsRoute),
      'botharness-computer: tool catalog route',
    );

    const toolRoute = {
      path: '/api/computer/tool',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        const body = (await parseBody(request)) as {
          slug?: unknown;
          tool?: unknown;
          args?: unknown;
        };
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
        try {
          return json({
            ok: true,
            result: await toolProvider.runDirect(slug, tool, args as Record<string, unknown>),
          });
        } catch (error) {
          const code =
            error instanceof LocalVideoError
              ? error.code
              : migratedLocal() && localVideo.isPaused()
                ? 'control-required'
                : undefined;
          return json(
            {
              ok: false,
              ...(code === undefined ? {} : { code }),
              error: error instanceof Error ? error.message : String(error),
            },
            409,
          );
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(toolRoute),
      'botharness-computer: direct tool route',
    );

    const desktopHttp = createDesktopHandlers({
      json,
      migratedLocal,
      legacyLocalRefusal,
      desktopView,
      activity,
      target,
      parseBody: (request) => parseBody(request),
      runtime,
      toolProvider,
      diagnostics,
    });

    const frameRoute = {
      path: '/api/computer/frame',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: desktopHttp.frame,
    };
    connectionCtx.effect(
      () => connection.fetch.register(frameRoute),
      'botharness-computer: desktop frame route',
    );

    const takeoverRoute = {
      path: '/api/computer/takeover',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: desktopHttp.takeover,
    };
    connectionCtx.effect(
      () => connection.fetch.register(takeoverRoute),
      'botharness-computer: desktop takeover route',
    );

    const inputRoute = {
      path: '/api/computer/input',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: desktopHttp.input,
    };
    connectionCtx.effect(
      () => connection.fetch.register(inputRoute),
      'botharness-computer: desktop input route',
    );

    const parseBody = async (request: Request): Promise<Record<string, unknown>> => {
      try {
        return (await request.json()) as Record<string, unknown>;
      } catch {
        return {};
      }
    };
    const unauthorized = (): Response =>
      json(
        { ok: false, code: 'authorize-required', error: 'explicit authorization required' },
        400,
      );

    const permissionSettingsRoute = {
      path: '/api/computer/open-permission-settings',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        const body = await parseBody(request);
        const result = await openComputerPermissionSettings({
          permission: body.permission,
          authorize: body.authorize,
          target: target(),
          runner,
        });
        diagnostics.record(
          'lifecycle',
          `phase=permission-settings result=${result.ok ? 'opened' : result.code}`,
        );
        return json(result, result.ok ? 200 : 400);
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(permissionSettingsRoute),
      'botharness-computer: permission settings route',
    );

    const archiveHttp = createArchiveHandlers({
      json,
      parseBody,
      unauthorized,
      target,
      resolveExportDir,
      service,
      transferTokens: () => transferTokens,
      log,
    });

    const exportRoute = {
      path: '/api/computer/export',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: archiveHttp.exportArchive,
    };
    connectionCtx.effect(
      () => connection.fetch.register(exportRoute),
      'botharness-computer: export route',
    );

    const openDirRoute = {
      path: '/api/computer/open-dir',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: archiveHttp.openDirectory,
    };
    connectionCtx.effect(
      () => connection.fetch.register(openDirRoute),
      'botharness-computer: open-dir route',
    );

    const diagnosticsRoute = {
      path: '/api/computer/diagnostics',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (): Promise<Response> => json({ ok: true, events: diagnostics.tail() }),
    };
    connectionCtx.effect(
      () => connection.fetch.register(diagnosticsRoute),
      'botharness-computer: diagnostics route',
    );

    const viewerEventRoute = {
      path: '/api/computer/diagnostics/viewer',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        const body = await parseBody(request);
        const detail = typeof body.detail === 'string' ? body.detail.slice(0, 300) : '';
        diagnostics.record('viewer', detail === '' ? 'viewer event' : detail);
        return json({ ok: true });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(viewerEventRoute),
      'botharness-computer: viewer diagnostics route',
    );

    const logsRoute = {
      path: '/api/computer/logs',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        const params = new URL(request.url).searchParams;
        const sinceRaw = params.get('since');
        const limitRaw = params.get('limit');
        const since = sinceRaw === null || sinceRaw === '' ? undefined : Number(sinceRaw);
        const limit = limitRaw === null || limitRaw === '' ? undefined : Number(limitRaw);
        const plugin = params.get('plugin');
        const owner = params.get('owner');
        const entity = params.get('entity');
        const filter: LogQuery = Object.assign(
          {},
          plugin === null || plugin === '' ? null : { plugin },
          owner === null || owner === '' ? null : { owner: owner as LogOwnerScope },
          entity === null || entity === '' ? null : { entity },
          since === undefined ? null : { since },
          limit === undefined ? null : { limit },
        );
        return json({ ok: true, entries: logDb?.query(filter) ?? [] });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(logsRoute),
      'botharness-computer: operational logs route',
    );

    const exportsRoute = {
      path: '/api/computer/exports',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: archiveHttp.listArchives,
    };
    connectionCtx.effect(
      () => connection.fetch.register(exportsRoute),
      'botharness-computer: exports route',
    );

    const importRoute = {
      path: '/api/computer/import',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: archiveHttp.importArchive,
    };
    connectionCtx.effect(
      () => connection.fetch.register(importRoute),
      'botharness-computer: import route',
    );

    const downloadRoute = {
      path: '/api/computer/download',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: archiveHttp.download,
    };
    connectionCtx.effect(
      () => connection.fetch.register(downloadRoute),
      'botharness-computer: download route',
    );

    const uploadRoute = {
      path: '/api/computer/upload',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: archiveHttp.upload,
    };
    connectionCtx.effect(
      () => connection.fetch.register(uploadRoute),
      'botharness-computer: upload route',
    );

    const uploadContentRoute = {
      path: '/api/computer/upload-content',
      methods: ['POST'] as const,
      fetch: archiveHttp.uploadContent,
    };
    const registerUploadContent = (): (() => Promise<void>) =>
      connection.fetch.register({
        ...uploadContentRoute,
        requestBody: target() === 'container' ? 'streaming' : 'buffered',
      });
    let removeUploadContent = registerUploadContent();
    let uploadChange = Promise.resolve();
    let uploadDisposed = false;
    connectionCtx.effect(
      () => async () => {
        uploadDisposed = true;
        await uploadChange.catch(() => undefined);
        await removeUploadContent();
      },
      'botharness-computer: upload-content route',
    );
    connectionCtx.effect(
      () =>
        ctx.on('loader/volatile-update', (paths) => {
          if (!paths.some((path) => path[0] === 'target')) return;
          uploadChange = uploadChange
            .catch(() => undefined)
            .then(async () => {
              await removeUploadContent();
              if (!uploadDisposed) removeUploadContent = registerUploadContent();
            });
          void uploadChange.catch((error: unknown) =>
            diagnostics.record(
              'lifecycle',
              `phase=upload-policy-refused detail=${String(error).slice(0, 200)}`,
            ),
          );
        }),
      'botharness-computer: upload target policy',
    );
  });

  ctx.inject(['connection', 'webServer'], (viewerCtx) => {
    let webServer: HostWebServerLike | undefined;
    let connection: HostConnectionLike | undefined;
    try {
      webServer = (viewerCtx as unknown as { webServer?: HostWebServerLike }).webServer;
      connection = (viewerCtx as unknown as { connection?: HostConnectionLike }).connection;
    } catch (error) {
      log(`viewer registration failed: ${String(error)}`);
      return;
    }
    if (webServer === undefined || connection === undefined) {
      log('viewer registration skipped: connection or webServer service is missing');
      return;
    }
    const proxy = new ViewerProxy({ prefix: VIEWER_PREFIX, upstream: () => service.upstream() });

    ctx.effect(
      () =>
        webServer.register({
          kind: 'prefix',
          path: VIEWER_PREFIX,
          handler: async (request, response) => {
            const nodeRequest = request as IncomingMessage;
            const nodeResponse = response as {
              writeHead(status: number, headers?: Record<string, string>): void;
              end(body?: Uint8Array | string): void;
            };
            const requestHeaders = new Headers();
            for (const [key, value] of Object.entries(nodeRequest.headers)) {
              if (Array.isArray(value)) for (const item of value) requestHeaders.append(key, item);
              else if (value !== undefined) requestHeaders.set(key, value);
            }
            const rejection = connection.requestRejection({ headers: requestHeaders });
            if (rejection !== undefined) {
              nodeResponse.writeHead(rejection);
              nodeResponse.end();
              return;
            }
            watcher.touch();
            const url = new URL(nodeRequest.url ?? '/', 'http://127.0.0.1');
            let proxied: Response;
            try {
              proxied = await proxy.handle(
                new Request(url, { method: nodeRequest.method ?? 'GET' }),
              );
            } catch (error) {
              nodeResponse.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
              nodeResponse.end(`computer upstream unavailable: ${String(error)}`);
              return;
            }
            const headers: Record<string, string> = {};
            proxied.headers.forEach((value, key) => {
              headers[key] = value;
            });
            nodeResponse.writeHead(proxied.status, headers);
            nodeResponse.end(
              proxied.body === null ? undefined : Buffer.from(await proxied.arrayBuffer()),
            );
          },
        }),
      'botharness-computer: viewer route',
    );

    if (webServer.registerUpgrade !== undefined) {
      ctx.effect(
        () =>
          webServer.registerUpgrade?.({
            path: '/api/computer/webrtc/signaling',
            handler: (request, socket, head) => {
              const rejection = connection.requestRejection({
                headers: new Headers(request.headers as Record<string, string>),
              });
              if (rejection !== undefined) {
                socket.destroy();
                return;
              }
              watcher.touch();
              const timer = setInterval(() => watcher.touch(), 60_000);
              socket.once('close', () => clearInterval(timer));
              void webrtc.signal(request, socket, head);
            },
          }) ?? (() => undefined),
        'botharness-computer: WebRTC signaling',
      );
      for (const socketPath of viewerUpgradePaths(VIEWER_PREFIX)) {
        ctx.effect(
          () =>
            webServer.registerUpgrade?.({
              path: socketPath,
              handler: (request, socket, head) => {
                const rejection = connection.requestRejection({
                  headers: request.headers as unknown as Headers,
                });
                if (rejection !== undefined) {
                  socket.destroy();
                  return;
                }
                const upstream = service.upstream();
                if (upstream === undefined) {
                  socket.destroy();
                  return;
                }
                watcher.touch();
                proxyUpgrade({ upstream, prefix: VIEWER_PREFIX, request, socket, head });
              },
            }) ?? (() => undefined),
          `botharness-computer: viewer upgrade ${socketPath}`,
        );
      }
    }
  });
}
