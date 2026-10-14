import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { homedir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { Readable, type Duplex } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { Context, Volatile } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-settings';
import Schema from '@deepseek-ai/schemastery';

import { DIAGNOSTICS_LIMIT, createComputerDiagnostics, toLogEntry } from './diagnostics.js';
import {
  openLogDatabase,
  type LogDatabase,
  type LogOwnerScope,
  type LogQuery,
} from '../../core/src/logs/log-db.js';
import { createTransferTokens } from './transfer-tokens.js';
import { createIdleWatcher } from './idle.js';
import {
  COMPUTER_EXPORT_DIR_FIELD,
  COMPUTER_IDLE_STOP_FIELD,
  COMPUTER_SETTINGS_NAMESPACE,
  type ComputerSettings,
} from './settings.js';
import { DEFAULT_DOCKER_CONFIG, createDockerComputerProvider } from './providers/docker.js';
import type { ComputerRuntimeResult, ComputerRuntimeRunner, ComputerStatus } from './provider.js';
import { createComputerService, type ComputerService } from './service.js';
import { createCuaDriver } from './tool/driver.js';
import { createLocalCuaDriver } from './tool/local-driver.js';
import { installSystemPackages } from '../../core/src/system/system-packages.js';
import { missingDesktopPackages } from './tool/local-display.js';
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

export interface ComputerConfig {
  target: ComputerTarget;
  enabled: boolean;
  image: string;
  containerName: string;
  volumeName: string;
  hostPort: number;
  cpus: number;
  memory: string;
  resolution: string;
  shmSize: string;
  pidsLimit: number;
  idleStopMinutes: number;
  hardenDesktop: boolean;
  language: string;
  exportDir: string;
  autoAllowActions: boolean;
  dataDir: string;
}

type ComputerRuntimeConfig = Omit<
  ComputerConfig,
  'exportDir' | 'idleStopMinutes' | 'autoAllowActions' | 'target'
> & {
  target: ComputerTarget | Volatile<ComputerTarget>;
  exportDir: string | Volatile<string>;
  idleStopMinutes: number | Volatile<number>;
  autoAllowActions: boolean | Volatile<boolean>;
};

function readLive<T>(value: T | Volatile<T>): T {
  return typeof value === 'object' && value !== null && 'get' in value
    ? ((value as Volatile<T>).get() as T)
    : (value as T);
}
export function desktopLocale(language: string): string {
  return /^zh([-_]|$)/i.test(language) ? 'zh_CN.UTF-8' : 'en_US.UTF-8';
}

export const DEFAULT_CONFIG: ComputerConfig = {
  target: 'local',
  enabled: true,
  image: DEFAULT_DOCKER_CONFIG.image,
  containerName: DEFAULT_DOCKER_CONFIG.containerName,
  volumeName: DEFAULT_DOCKER_CONFIG.volumeName,
  hostPort: DEFAULT_DOCKER_CONFIG.hostPort,
  cpus: DEFAULT_DOCKER_CONFIG.cpus,
  memory: DEFAULT_DOCKER_CONFIG.memory,
  resolution: DEFAULT_DOCKER_CONFIG.resolution,
  shmSize: DEFAULT_DOCKER_CONFIG.shmSize,
  pidsLimit: DEFAULT_DOCKER_CONFIG.pidsLimit,
  idleStopMinutes: DEFAULT_DOCKER_CONFIG.idleStopMinutes,
  hardenDesktop: DEFAULT_DOCKER_CONFIG.hardenDesktop,
  language: DEFAULT_DOCKER_CONFIG.language,
  exportDir: '',
  autoAllowActions: false,
  dataDir: '',
};

export const Config = Schema.object({
  target: Schema.union([Schema.const('local'), Schema.const('container')])
    .default('container')
    .volatile(),
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 Computer'),
  image: Schema.string().default(DEFAULT_CONFIG.image),
  containerName: Schema.string().default(DEFAULT_CONFIG.containerName),
  volumeName: Schema.string().default(DEFAULT_CONFIG.volumeName),
  hostPort: Schema.number().default(DEFAULT_CONFIG.hostPort),
  cpus: Schema.number().default(DEFAULT_CONFIG.cpus),
  memory: Schema.string().default(DEFAULT_CONFIG.memory),
  resolution: Schema.string()
    .default(DEFAULT_CONFIG.resolution)
    .description(
      '桌面分辨率上限（Xvfb MAX_RES）；viewer 不缩放画面，需覆盖最大观看画布，默认 2560x1600',
    ),
  shmSize: Schema.string().default(DEFAULT_CONFIG.shmSize),
  pidsLimit: Schema.number().default(DEFAULT_CONFIG.pidsLimit),
  idleStopMinutes: Schema.number().default(DEFAULT_CONFIG.idleStopMinutes).volatile(),
  hardenDesktop: Schema.boolean()
    .default(DEFAULT_CONFIG.hardenDesktop)
    .description(
      '硬化桌面（禁用 sudo/终端/xfce 启动器）；查看专用部署可选开，computer use 需要保持关闭',
    ),
  language: Schema.string().default(DEFAULT_CONFIG.language),
  exportDir: Schema.string()
    .default(DEFAULT_CONFIG.exportDir)
    .description(
      '导出目录；为空时回退到默认目录（~/Desktop/BotHarness Exports，无 Desktop 时为 ~/BotHarness Exports）',
    )
    .volatile(),
  autoAllowActions: Schema.boolean()
    .default(DEFAULT_CONFIG.autoAllowActions)
    .description('自动允许 PersonaBot 操作 Computer（跳过按会话的人工授权）')
    .volatile(),
  dataDir: Schema.string()
    .default(DEFAULT_CONFIG.dataDir)
    .description('持久目录（仅 Linux 生效，bind mount 到 /config；为空时用命名卷）'),
});

export function isSafeArchiveName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.tar$/u.test(name) && !name.includes('..');
}

export async function streamArchiveResponse(archivePath: string): Promise<Response> {
  const info = await stat(archivePath);
  const body = Readable.toWeb(createReadStream(archivePath));
  return new Response(body as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/x-tar',
      'content-disposition': `attachment; filename="${basename(archivePath)}"`,
      'content-length': String(info.size),
    },
  });
}

export async function receiveUploadBody(
  body: ReadableStream<Uint8Array> | null,
  destPath: string,
): Promise<void> {
  if (body === null) throw new Error('empty upload body');
  const out = createWriteStream(destPath);
  try {
    await pipeline(body, out);
  } catch (error) {
    await rm(destPath, { force: true });
    throw error;
  }
}

export async function storeUploadBody(
  body: ReadableStream<Uint8Array> | null,
  destPath: string,
): Promise<void> {
  const tmp = `${destPath}.part`;
  await receiveUploadBody(body, tmp);
  await rename(tmp, destPath);
}

export function defaultExportDir(home = homedir()): string {
  const desktop = join(home, 'Desktop');
  return existsSync(desktop)
    ? join(desktop, 'BotHarness Exports')
    : join(home, 'BotHarness Exports');
}

export function createProcessRunner(): ComputerRuntimeRunner {
  const spawnOnce = (
    argv: readonly string[],
    onChunk?: (chunk: string) => void,
    extraEnv?: Readonly<Record<string, string>>,
  ): Promise<ComputerRuntimeResult> =>
    new Promise((resolve) => {
      const child = spawn(argv[0] ?? '', argv.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(extraEnv === undefined ? {} : { env: { ...process.env, ...extraEnv } }),
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        onChunk?.(text);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        onChunk?.(text);
      });
      child.on('error', (error) => {
        resolve({ code: -1, stdout, stderr: `${stderr}${String(error)}` });
      });
      child.on('close', (code) => {
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });

  return {
    run: (argv, options) => spawnOnce(argv, undefined, options?.env),
    runStreaming: (argv, onChunk) => spawnOnce(argv, onChunk),
  };
}

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
  const service: ComputerService = createComputerService();
  let requestedLanguage = '';
  const runner = createProcessRunner();
  let packageInstall:
    | {
        state: 'installing' | 'installed' | 'failed';
        packages: readonly string[];
        percent: number;
        text: string;
      }
    | undefined;
  let recheckingDesktop = false;
  let authorizationRevision = 0;
  const authorizationScope = (): string => `${target()}:${String(authorizationRevision)}`;
  const target = (): ComputerTarget => computerTarget(readLive(config.target));
  const runtime = createComputerTargetRuntime({
    target,
    onChange: () => {
      transferTokens = createTransferTokens();
      toolProvider.resetRuntime();
    },
    onEvent: (detail) => diagnostics.record('lifecycle', detail),
    create: (selected) => {
      if (selected === 'local') {
        const driver = createLocalCuaDriver({
          runner,
          onEvent: (detail) => diagnostics.record('lifecycle', detail),
        });
        const provider = createLocalComputerProvider({
          driver,
          runner,
          onEvent: (detail) => diagnostics.record('lifecycle', `target=local ${detail}`),
        });
        return { provider, driver };
      }
      const provider = createDockerComputerProvider({
        runner,
        onEvent: (detail) => diagnostics.record('container', detail),
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
    toolProvider.resetRuntime();
    void runtime
      .sync()
      .then(() => toolProvider.reconcileAll())
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
  const toolProvider = createComputerToolProvider({
    ctx,
    driver,
    isComputerRunning: () => runtime.isRunning(),
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
    reconcileBot: (slug: string) => toolProvider.reconcileBot(slug),
    ownsTool: (name: string) => ownsComputerTool(name),
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
        };
      }
    ).botharness;
    const remove = core?.contributeBotAgentSetup?.((agentCtx, agent, info) => {
      toolProvider.attachAgent(agentCtx, String(agent.id), info);
    });
    const hostTools = (core as { hostTools?: Set<string> } | undefined)?.hostTools;
    for (const name of computerToolNames()) hostTools?.add(name);
    return () => {
      remove?.();
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

  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: HostConnectionLike }).connection;
    const json = (value: unknown, status = 200): Response =>
      Response.json(value as Record<string, unknown>, { status });

    const unknownToken = (kind: string): Response =>
      json({ ok: false, code: 'unknown-token', error: `unknown or expired ${kind} token` }, 404);

    const statusRoute = {
      path: '/api/computer/status',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (): Promise<Response> => {
        const probe = await service
          .probe()
          .catch((error: unknown) => ({ available: false, detail: String(error) }));
        const status: ComputerStatus = await service
          .status()
          .catch((error: unknown) => ({ state: 'failed' as const, detail: String(error) }));
        if (
          status.missing !== undefined &&
          packageInstall?.state !== 'installing' &&
          !recheckingDesktop
        ) {
          const still = await missingDesktopPackages();
          if (!still.includes('xvfb') && !still.includes('openbox')) {
            recheckingDesktop = true;
            log('desktop packages present; checking Local Computer again');
            void service
              .start()
              .then(() => toolProvider.reconcileAll())
              .catch(() => undefined)
              .finally(() => {
                recheckingDesktop = false;
              });
          }
        }
        return json({
          target: target(),
          provider: service.providerName ?? null,
          probe,
          status,
          exportDir: target() === 'container' ? resolveExportDir() : '',
          ...(packageInstall === undefined ? {} : { install: packageInstall }),
          ...(target() === 'container' ? { resolution: config.resolution } : {}),
        });
      },
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
      fetch: async (request: Request): Promise<Response> => {
        const body = await request
          .json()
          .then((value) => value as { authorize?: unknown })
          .catch(() => ({}) as { authorize?: unknown });
        if (body.authorize !== true)
          return json(
            { ok: false, code: 'authorize-required', error: 'explicit authorization required' },
            400,
          );
        if (packageInstall?.state === 'installing')
          return json({ ok: false, code: 'install-running', error: 'an install is running' }, 409);
        const missing = target() === 'local' ? (await service.status()).missing : undefined;
        if (missing === undefined || missing.packages.length === 0)
          return json({ ok: false, code: 'nothing-missing', error: 'nothing to install' }, 409);
        if (missing.install === 'none')
          return json(
            {
              ok: false,
              code: 'needs-administrator',
              error: `Run this on the Host: ${missing.command}`,
            },
            403,
          );
        const started = Date.now();
        packageInstall = { state: 'installing', packages: missing.packages, percent: 0, text: '' };
        log(
          `install-packages start packages=${missing.packages.join(',')} access=${missing.install}`,
        );
        void installSystemPackages({
          packages: missing.packages,
          access: missing.install,
          runner,
          onProgress: (progress) => {
            packageInstall = {
              state: 'installing',
              packages: missing.packages,
              percent: progress.percent,
              text: progress.text,
            };
          },
        })
          .then(async () => {
            packageInstall = {
              state: 'installed',
              packages: missing.packages,
              percent: 100,
              text: '',
            };
            log(`install-packages done durationMs=${String(Date.now() - started)}`);
            await service.start();
            await toolProvider.reconcileAll();
          })
          .catch((error: unknown) => {
            const detail = error instanceof Error ? error.message : String(error);
            if (packageInstall?.state === 'installing')
              packageInstall = {
                state: 'failed',
                packages: missing.packages,
                percent: packageInstall.percent,
                text: detail,
              };
            log(`install-packages refused detail=${detail}`);
          });
        return json({ ok: true, started: true });
      },
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

    const exportRoute = {
      path: '/api/computer/export',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        if (target() !== 'container')
          return json(
            {
              ok: false,
              code: 'container-only',
              error: 'Archive transfer is only available for Container Computer',
            },
            400,
          );
        const body = await parseBody(request);
        if (body.authorize !== true) return unauthorized();
        const requested = typeof body.dir === 'string' && body.dir !== '' ? body.dir : undefined;
        if (requested !== undefined && !isAbsolute(requested)) {
          return json({ ok: false, code: 'dir-invalid', error: 'dir must be absolute' }, 400);
        }
        const exportDir = requested ?? resolveExportDir();
        log(`export requested (panel)${requested === undefined ? '' : ` → ${requested}`}`);
        try {
          await mkdir(exportDir, { recursive: true });
          const archive = await service.exportTo(exportDir);
          return json({
            ok: true,
            archive,
            downloadToken: transferTokens.mint(archive, 'download'),
          });
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(exportRoute),
      'botharness-computer: export route',
    );

    const openDirRoute = {
      path: '/api/computer/open-dir',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        if (target() !== 'container')
          return json(
            {
              ok: false,
              code: 'container-only',
              error: 'Archive transfer is only available for Container Computer',
            },
            400,
          );
        const body = await parseBody(request);
        if (body.authorize !== true) return unauthorized();
        const requested = typeof body.dir === 'string' && body.dir !== '' ? body.dir : undefined;
        if (requested !== undefined && !isAbsolute(requested)) {
          return json({ ok: false, code: 'dir-invalid', error: 'dir must be absolute' }, 400);
        }
        const dir = requested ?? resolveExportDir();
        const opener =
          process.platform === 'darwin'
            ? 'open'
            : process.platform === 'win32'
              ? 'explorer'
              : 'xdg-open';
        try {
          await mkdir(dir, { recursive: true });
          const child = spawn(opener, [dir], { detached: true, stdio: 'ignore' });
          await new Promise<void>((resolve, reject) => {
            child.once('spawn', () => {
              child.unref();
              resolve();
            });
            child.once('error', reject);
          });
          log(`opened directory (${dir})`);
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
      },
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
      fetch: async (): Promise<Response> => {
        if (target() !== 'container')
          return json(
            {
              ok: false,
              code: 'container-only',
              error: 'Archive transfer is only available for Container Computer',
            },
            400,
          );
        const exportDir = resolveExportDir();
        try {
          const entries = await readdir(exportDir);
          return json({ ok: true, files: entries.filter(isSafeArchiveName).sort() });
        } catch (error) {
          if ((error as { code?: string }).code === 'ENOENT') {
            return json({ ok: true, files: [] });
          }
          return json({ ok: false, error: String(error) }, 500);
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(exportsRoute),
      'botharness-computer: exports route',
    );

    const importRoute = {
      path: '/api/computer/import',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        if (target() !== 'container')
          return json(
            {
              ok: false,
              code: 'container-only',
              error: 'Archive transfer is only available for Container Computer',
            },
            400,
          );
        const body = await parseBody(request);
        if (body.authorize !== true) return unauthorized();
        const exportDir = resolveExportDir();
        const file = typeof body.file === 'string' ? body.file : '';
        if (!isSafeArchiveName(file)) {
          return json({ ok: false, code: 'invalid-archive', error: 'invalid archive name' }, 400);
        }
        log(`import requested (panel): ${file}`);
        try {
          await service.importFrom(join(exportDir, file));
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(importRoute),
      'botharness-computer: import route',
    );

    const downloadRoute = {
      path: '/api/computer/download',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        if (target() !== 'container')
          return json(
            {
              ok: false,
              code: 'container-only',
              error: 'Archive transfer is only available for Container Computer',
            },
            400,
          );
        const token = new URL(request.url).searchParams.get('token') ?? '';
        const archive = transferTokens.consume(token, 'download');
        if (archive === undefined) return unknownToken('download');
        try {
          log(`download requested (panel): ${basename(archive)}`);
          return await streamArchiveResponse(archive);
        } catch {
          return json(
            { ok: false, code: 'archive-missing', error: 'archive is no longer available' },
            404,
          );
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(downloadRoute),
      'botharness-computer: download route',
    );

    const uploadRoute = {
      path: '/api/computer/upload',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        if (target() !== 'container')
          return json(
            {
              ok: false,
              code: 'container-only',
              error: 'Archive transfer is only available for Container Computer',
            },
            400,
          );
        const body = await parseBody(request);
        if (body.authorize !== true) return unauthorized();
        const file = typeof body.file === 'string' ? body.file : '';
        if (!isSafeArchiveName(file)) {
          return json({ ok: false, code: 'invalid-archive', error: 'invalid archive name' }, 400);
        }
        const exportDir = resolveExportDir();
        try {
          await mkdir(exportDir, { recursive: true });
          const uploadToken = transferTokens.mint(join(exportDir, file), 'upload');
          log(`upload requested (panel): ${file}`);
          return json({ ok: true, uploadToken });
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(uploadRoute),
      'botharness-computer: upload route',
    );

    const uploadContentRoute = {
      path: '/api/computer/upload-content',
      methods: ['POST'] as const,
      fetch: async (request: Request): Promise<Response> => {
        if (target() !== 'container')
          return json(
            {
              ok: false,
              code: 'container-only',
              error: 'Archive transfer is only available for Container Computer',
            },
            400,
          );
        const token = new URL(request.url).searchParams.get('token') ?? '';
        const dest = transferTokens.consume(token, 'upload');
        if (dest === undefined) return unknownToken('upload');
        log(
          `upload streaming in (panel): ${request.method} ` +
            `content-type=${request.headers.get('content-type') ?? '?'} ` +
            `length=${request.headers.get('content-length') ?? '?'} ` +
            `encoding=${request.headers.get('transfer-encoding') ?? 'identity'}`,
        );
        try {
          await storeUploadBody(request.body, dest);
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
        log(`upload received (panel): ${basename(dest)}`);
        return json({ ok: true });
      },
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
