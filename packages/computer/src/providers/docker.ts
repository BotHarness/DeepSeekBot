import { basename, dirname, isAbsolute, join } from 'node:path';

import type {
  ComputerPhase,
  ComputerProgress,
  ComputerProvider,
  ComputerRuntimeProbe,
  ComputerRuntimeResult,
  ComputerRuntimeRunner,
  ComputerStatus,
  ComputerStorage,
} from '../provider.js';
import {
  loopbackPort,
  SELKIES_RTC_CONFIG_SCRIPT,
  selkiesWebRtcEnv,
  selkiesWebRtcMediaFromEnv,
  type SelkiesWebRtcMedia,
} from '../../../core/src/http/selkies-webrtc.js';

export interface DockerComputerConfig {
  readonly image: string;
  readonly containerName: string;
  readonly volumeName: string;
  readonly hostPort: number;
  readonly containerPort: number;
  readonly webrtcPort: number;
  readonly dataDir: string;
  readonly cpus: number;
  readonly memory: string;
  readonly resolution: string;
  readonly shmSize: string;
  readonly pidsLimit: number;
  readonly idleStopMinutes: number;
  readonly hardenDesktop: boolean;
  readonly language: string;
}

export const DEFAULT_DOCKER_CONFIG: DockerComputerConfig = {
  image: 'lscr.io/linuxserver/webtop:ubuntu-xfce',
  containerName: 'botharness-computer',
  volumeName: 'botharness-computer-config',
  dataDir: '',
  hostPort: 39_001,
  containerPort: 3000,
  webrtcPort: 39_002,
  cpus: 2,
  memory: '4g',
  resolution: '1280x800',
  shmSize: '512m',
  pidsLimit: 4096,
  idleStopMinutes: 30,
  hardenDesktop: false,
  language: 'en_US.UTF-8',
};

interface DockerComputerProviderOptions {
  readonly runner: ComputerRuntimeRunner;
  readonly config?: Partial<DockerComputerConfig>;
  readonly onEvent?: (detail: string) => void;
  readonly getLanguage?: () => string;
  readonly platform?: () => string;
  readonly fetchImpl?: typeof fetch;
  readonly readyTimeoutMs?: number;
  readonly sleepImpl?: (ms: number) => Promise<void>;
  readonly tailnetAddress?: () => Promise<string | undefined>;
}

function combine(config: Partial<DockerComputerConfig> | undefined): DockerComputerConfig {
  return { ...DEFAULT_DOCKER_CONFIG, ...config };
}

function failure(detail: string): Error {
  return new Error(detail);
}

function platformDisplay(platform: string): string {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  return platform;
}

function resolveStorage(
  config: Pick<DockerComputerConfig, 'dataDir' | 'volumeName'>,
  platform: string,
): ComputerStorage {
  const dir = config.dataDir.trim();
  if (dir === '') return { kind: 'volume', target: config.volumeName };
  if (platform !== 'linux') {
    return {
      kind: 'volume',
      target: config.volumeName,
      ignoredReason: `dataDir 已忽略：bind mount 仅在 Linux 生效（当前：${platformDisplay(platform)}），继续使用命名卷`,
    };
  }
  return { kind: 'bind', target: dir };
}

function parseConfigMount(output: string): { type: string; source: string } | undefined {
  for (const part of output.split(';')) {
    const [type = '', source = '', dest = ''] = part.trim().split(/\s+/);
    if (dest === '/config' && type !== '' && source !== '') {
      return { type: type.toLowerCase(), source };
    }
  }
  return undefined;
}

function mountMatches(
  current: { type: string; source: string },
  want: { type: string; source: string },
): boolean {
  if (current.type !== want.type) return false;
  if (current.source === want.source) return true;
  if (want.type !== 'volume' || !current.source.endsWith('/_data')) return false;
  return basename(current.source.slice(0, -'/_data'.length)) === want.source;
}

export function createPullTracker(now: () => number = Date.now): {
  observe(chunk: string): void;
  snapshot(): ComputerProgress;
} {
  const layers = new Map<string, { done: boolean }>();
  let text = '';
  let percent = 0;
  let updatedAt: number | undefined;

  return {
    observe(chunk: string): void {
      for (const raw of chunk.split(/[\r\n]+/)) {
        const line = raw.trim();
        if (line === '') continue;
        text = line.length > 160 ? `${line.slice(0, 157)}…` : line;
        updatedAt = now();
        const match = /^([0-9a-f]{6,64})\s*:\s*(.+)$/i.exec(line);
        if (match === null) continue;
        const id = match[1] ?? '';
        const rest = match[2] ?? '';
        if (id === '') continue;
        const entry = layers.get(id) ?? { done: false };
        if (/pull complete|already exists/i.test(rest)) entry.done = true;
        layers.set(id, entry);
        const done = [...layers.values()].filter((value) => value.done).length;
        percent = Math.round((done / layers.size) * 100);
      }
    },
    snapshot(): ComputerProgress {
      return updatedAt === undefined
        ? { percent }
        : text === ''
          ? { percent, updatedAt }
          : { percent, text, updatedAt };
    },
  };
}

export const DESKTOP_READY_TIMEOUT_MS = 90_000;

const DESKTOP_PROBE_TIMEOUT_MS = 3_000;

export function parseResolution(value: string): { width: number; height: number } | undefined {
  const match = /^(\d{2,5})x(\d{2,5})$/u.exec(value.trim());
  if (match === null) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

export function parseDockerSize(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*([kmg]?b?)$/i.exec(value.trim());
  if (match === null) return undefined;
  const amount = Number(match[1] ?? '');
  if (!Number.isFinite(amount)) return undefined;
  const unit = (match[2] ?? '').toLowerCase();
  const factor = unit.startsWith('g')
    ? 1024 ** 3
    : unit.startsWith('m')
      ? 1024 ** 2
      : unit.startsWith('k')
        ? 1024
        : 1;
  return Math.round(amount * factor);
}

export function createDockerComputerProvider(
  options: DockerComputerProviderOptions,
): ComputerProvider {
  const config = combine(options.config);
  const { runner, onEvent, getLanguage, fetchImpl, readyTimeoutMs, sleepImpl } = options;
  const platformName =
    process.env.BOTHARNESS_COMPUTER_FORCE_BIND === '1'
      ? 'linux'
      : (options.platform ?? (() => process.platform))();
  let phase: ComputerPhase = 'idle';
  let detail: string | undefined;
  let running = false;
  let operation: Promise<void> | undefined;
  let pullProgress: ComputerProgress | undefined;
  let lifecycle: Promise<unknown> = Promise.resolve();
  let cancelRequested = false;
  let lastObservedState: string | undefined;
  let desiredMedia: SelkiesWebRtcMedia | undefined;

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = lifecycle.then(task, task);
    lifecycle = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const throwIfCancelled = (): void => {
    if (!cancelRequested) return;
    cancelRequested = false;
    phase = 'idle';
    detail = undefined;
    throw new Error('computer start cancelled');
  };

  const probeRuntime = async (): Promise<ComputerRuntimeProbe> => {
    const result = await runner.run(['docker', 'info', '--format', '{{.ServerVersion}}']);
    if (result.code !== 0) {
      return {
        available: false,
        detail: result.stderr.trim() || 'docker runtime is not available',
      };
    }
    return { available: true };
  };

  const observe = (state: string, detail: string | undefined): void => {
    if (lastObservedState === state) return;
    const from = lastObservedState ?? 'unknown';
    lastObservedState = state;
    onEvent?.(`container ${from} → ${state}${detail === undefined ? '' : ` (${detail})`}`);
  };

  const inspect = async (): Promise<ComputerStatus> => {
    const result = await runner.run([
      'docker',
      'inspect',
      '--format',
      '{{.State.Status}} {{.State.ExitCode}}',
      config.containerName,
    ]);
    if (result.code !== 0) {
      running = false;
      observe('absent', undefined);
      return { state: 'absent' };
    }
    const [status = '', exitCode = ''] = result.stdout.trim().split(/\s+/);
    running = status === 'running';
    if (running) {
      observe('running', undefined);
      return { state: 'running' };
    }
    const detail = status === '' ? undefined : `${status} code=${exitCode}`;
    observe(status === '' ? 'stopped' : status, detail);
    return detail === undefined ? { state: 'stopped' } : { state: 'stopped', detail };
  };

  const fail = (message: string): never => {
    phase = 'failed';
    detail = message;
    throw failure(message);
  };

  const containerImage = async (): Promise<string | undefined> => {
    const result = await runner.run([
      'docker',
      'inspect',
      '--format',
      '{{.Config.Image}}',
      config.containerName,
    ]);
    return result.code === 0 ? result.stdout.trim() : undefined;
  };

  const removeContainer = async (reason: string): Promise<void> => {
    const remove = await runner.run(['docker', 'rm', '-f', config.containerName]);
    if (remove.code !== 0) fail(remove.stderr.trim() || 'docker rm failed');
    running = false;
    observe('absent', reason);
  };

  const describeWant = (storage: ComputerStorage): { type: string; source: string } =>
    storage.kind === 'bind'
      ? { type: 'bind', source: storage.target }
      : { type: 'volume', source: config.volumeName };

  const readConfigMount = async (): Promise<{ type: string; source: string } | undefined> => {
    const mounts = await runner.run([
      'docker',
      'inspect',
      '--format',
      '{{range .Mounts}}{{.Type}} {{.Source}} {{.Destination}};{{end}}',
      config.containerName,
    ]);
    if (mounts.code !== 0) return undefined;
    return parseConfigMount(mounts.stdout);
  };

  const recreateIfSpecChanged = async (allowRebuild: boolean): Promise<boolean> => {
    const spec = await runner.run([
      'docker',
      'inspect',
      '--format',
      '{{.Config.Image}}|{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.ShmSize}}|{{.HostConfig.PidsLimit}}|{{range .Config.Env}}{{println .}}{{end}}',
      config.containerName,
    ]);
    if (spec.code !== 0) return false;
    const [image = '', memory = '', swap = '', nanoCpus = '', shmSize = '', pids = '', ...env] =
      spec.stdout.split('|');
    const expectedMemory = parseDockerSize(config.memory);
    const expectedShm = parseDockerSize(config.shmSize);
    const envText = env.join('|');
    const resolution = parseResolution(config.resolution);
    const managedEnv = [
      `HARDEN_DESKTOP=${config.hardenDesktop ? 'true' : 'false'}`,
      `MAX_RES=${config.resolution}`,
      ...(resolution === undefined
        ? []
        : [
            `SELKIES_MANUAL_WIDTH=${String(resolution.width)}`,
            `SELKIES_MANUAL_HEIGHT=${String(resolution.height)}`,
            'SELKIES_ENABLE_RESIZE=false',
          ]),
      'PIXELFLUX_WAYLAND=false',
    ];
    const webrtcMatches =
      !allowRebuild || selkiesWebRtcEnv(desiredMedia).every((entry) => envText.includes(entry));
    const matches =
      webrtcMatches &&
      image.trim() === config.image &&
      (expectedMemory === undefined || memory.trim() === String(expectedMemory)) &&
      (expectedMemory === undefined || swap.trim() === String(expectedMemory)) &&
      nanoCpus.trim() === String(Math.round(config.cpus * 1_000_000_000)) &&
      (expectedShm === undefined || shmSize.trim() === String(expectedShm)) &&
      pids.trim() === String(config.pidsLimit) &&
      managedEnv.every((entry) => envText.includes(entry));
    if (matches) return checkMountChanged(allowRebuild);
    await removeContainer(`spec changed (${image.trim()} → ${config.image})`);
    return true;
  };

  const checkMountChanged = async (allowRebuild: boolean): Promise<boolean> => {
    const storage = resolveStorage(config, platformName);
    const want = describeWant(storage);
    const current = await readConfigMount();
    if (current === undefined || mountMatches(current, want)) {
      return false;
    }
    if (!allowRebuild) return false;
    await removeContainer(
      `storage changed (${current.type}:${current.source} → ${want.type}:${want.source}) — previous data stays behind; move it manually`,
    );
    return true;
  };

  const migrationHint = async (state: string): Promise<string | undefined> => {
    if (config.dataDir.trim() === '') return undefined;
    const want = describeWant(resolveStorage(config, platformName));
    const current = await readConfigMount();
    if (current === undefined || mountMatches(current, want)) {
      return undefined;
    }
    return state === 'running'
      ? `存储位置已变更为 ${want.source}，运行中的容器保持不变；停止后重建生效，旧数据需手工迁移`
      : `存储位置已变更为 ${want.source}；下次启动将重建容器，旧数据需手工迁移`;
  };

  const ensureDesktopShortcut = async (): Promise<void> => {
    const result = await runner.run([
      'docker',
      'exec',
      config.containerName,
      'sh',
      '-c',
      'test -f /config/Desktop/chromium.desktop || { mkdir -p /config/Desktop && cp -f /usr/share/applications/chromium.desktop /config/Desktop/chromium.desktop && chmod +x /config/Desktop/chromium.desktop && chown abc:abc /config/Desktop /config/Desktop/chromium.desktop; }; command -v google-chrome-stable >/dev/null 2>&1 || rm -f /config/Desktop/google-chrome.desktop',
    ]);
    if (result.code !== 0) {
      onEvent?.('desktop shortcut could not be prepared');
    }
  };

  const ensureChromiumFlags = async (): Promise<void> => {
    const shim = (name: string): string =>
      `#!/bin/sh\nexec /usr/bin/${name} --disable-dev-shm-usage --disable-gpu "$@"\n`;
    const result = await runner.run([
      'docker',
      'exec',
      config.containerName,
      'sh',
      '-c',
      `mkdir -p /usr/local/bin && printf '%s' '${shim('chromium')}' > /usr/local/bin/chromium && printf '%s' '${shim('chromium-browser')}' > /usr/local/bin/chromium-browser && chmod +x /usr/local/bin/chromium /usr/local/bin/chromium-browser`,
    ]);
    if (result.code !== 0) {
      onEvent?.('chromium flag shims could not be prepared');
    }
  };

  const ensureSessionRestore = async (): Promise<void> => {
    const result = await runner.run([
      'docker',
      'exec',
      config.containerName,
      'sh',
      '-c',
      `mkdir -p /etc/chromium/policies/managed && printf '%s' '{"RestoreOnStartup":1}' > /etc/chromium/policies/managed/botharness.json`,
    ]);
    if (result.code !== 0) {
      onEvent?.('session-restore policy could not be prepared');
    }
  };

  const ensureDesktopDefaults = async (storage: ComputerStorage): Promise<void> => {
    const result = await runner.run([
      'docker',
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      '-v',
      `${storage.target}:/data`,
      config.image,
      '-c',
      `parent=/data/.config/xfce4/xfconf; d="$parent/xfce-perchannel-xml"; if [ ! -d "$d" ]; then for p in /data/.config /data/.config/xfce4 "$parent"; do if [ ! -d "$p" ]; then mkdir "$p" && chown abc:abc "$p" || exit 1; fi; done; t=$(mktemp -d "$parent/.botharness-defaults.XXXXXX") || exit 1; cp -a /defaults/xfce/. "$t/" && chown -R abc:abc "$t" && mv "$t" "$d" || { rm -rf "$t"; exit 1; }; fi; f="$d/xfce4-panel.xml"; if [ ! -f "$f" ]; then cp /defaults/xfce/xfce4-panel.xml "$f" && chown abc:abc "$f" || exit 1; fi; sed -i 's/name="icon-size" type="uint" value="16"/name="icon-size" type="uint" value="32"/; s/name="icon-size" type="uint" value="24"/name="icon-size" type="uint" value="32"/; s/name="size" type="uint" value="26"/name="size" type="uint" value="52"/; s/name="size" type="uint" value="40"/name="size" type="uint" value="52"/; s/name="size" type="uint" value="48"/name="size" type="uint" value="96"/; s/name="size" type="uint" value="64"/name="size" type="uint" value="96"/' "$f" || exit 1; rm -f /data/.config/autostart/chromium.desktop /data/.config/chromium/Singleton*; exit 0`,
    ]);
    if (result.code !== 0) {
      onEvent?.('desktop defaults could not be prepared');
    }
  };

  const ensureWorkspaceDir = async (): Promise<void> => {
    const result = await runner.run([
      'docker',
      'exec',
      config.containerName,
      'sh',
      '-c',
      'mkdir -p /config/workspace && chown abc:abc /config/workspace',
    ]);
    if (result.code !== 0) {
      onEvent?.('workspace directory could not be prepared');
    }
  };

  const quiesceBrowser = async (): Promise<void> => {
    const current = await inspect();
    if (current.state !== 'running') return;
    phase = 'stopping';
    detail = '正在关闭浏览器…';
    const script =
      'term_browsers() { for p in /proc/[0-9]*; do c=$(cat "$p/comm" 2>/dev/null) || continue; case "$c" in chromium|chrome) kill -TERM "$(basename "$p")" 2>/dev/null ;; esac; done; }; term_browsers; i=0; while [ "$i" -lt 20 ]; do alive=0; for p in /proc/[0-9]*; do c=$(cat "$p/comm" 2>/dev/null) || continue; case "$c" in chromium|chrome) alive=1 ;; esac; done; [ "$alive" -eq 0 ] && exit 0; sleep 0.5; i=$((i + 1)); done; exit 0';
    const result = await runner.run(['docker', 'exec', config.containerName, 'sh', '-c', script]);
    if (result.code !== 0) {
      onEvent?.('browser quiesce skipped');
    }
  };

  const waitForDesktop = async (): Promise<void> => {
    const timeoutMs = readyTimeoutMs ?? DESKTOP_READY_TIMEOUT_MS;
    const delay =
      sleepImpl ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const probeFetch = fetchImpl ?? globalThis.fetch;
    phase = 'starting';
    detail = '正在等待桌面响应…';
    const startedAt = Date.now();
    for (;;) {
      throwIfCancelled();
      try {
        const response = await probeFetch(`http://127.0.0.1:${config.hostPort}/`, {
          signal: AbortSignal.timeout(DESKTOP_PROBE_TIMEOUT_MS),
        });
        await response.arrayBuffer();
        if (response.ok) return;
      } catch {}
      if (Date.now() - startedAt > timeoutMs) {
        fail(`桌面在 ${Math.round(timeoutMs / 1000)} 秒内未响应，请重试启动`);
      }
      await delay(1000);
    }
  };

  const confirmRunning = async (): Promise<void> => {
    await waitForDesktop();
    phase = 'running';
    detail = undefined;
    running = true;
  };

  const runStart = async (): Promise<void> => {
    cancelRequested = false;
    const address = await options.tailnetAddress?.().catch(() => undefined);
    desiredMedia = address === undefined ? undefined : { address, port: config.webrtcPort };
    const probe = await probeRuntime();
    throwIfCancelled();
    if (!probe.available) {
      fail(probe.detail ?? 'docker runtime is not available');
    }
    const storage = resolveStorage(config, platformName);
    if (storage.kind === 'bind' && !isAbsolute(storage.target)) {
      fail(`dataDir must be an absolute path, got: ${storage.target}`);
    }
    const existing = await inspect();
    throwIfCancelled();
    if (existing.state === 'running' && !(await recreateIfSpecChanged(false))) {
      await confirmRunning();
      await ensureDesktopShortcut();
      await ensureSessionRestore();
      await ensureChromiumFlags();
      await ensureWorkspaceDir();
      return;
    }
    if (existing.state === 'stopped' && !(await recreateIfSpecChanged(true))) {
      phase = 'starting';
      detail = '正在启动已有容器…';
      throwIfCancelled();
      await ensureDesktopDefaults(storage);
      const start = await runner.run(['docker', 'start', config.containerName]);
      if (start.code !== 0) {
        fail(start.stderr.trim() || 'docker start failed');
      }
      await confirmRunning();
      await ensureDesktopShortcut();
      await ensureSessionRestore();
      await ensureChromiumFlags();
      await ensureWorkspaceDir();
      return;
    }
    const image = await runner.run(['docker', 'image', 'inspect', config.image]);
    throwIfCancelled();
    if (image.code !== 0) {
      phase = 'pulling';
      detail = '正在拉取镜像（首次约 1.5 GB，请耐心等待）…';
      const tracker = createPullTracker();
      pullProgress = tracker.snapshot();
      const pull: ComputerRuntimeResult =
        runner.runStreaming === undefined
          ? await runner.run(['docker', 'pull', config.image])
          : await runner.runStreaming(['docker', 'pull', config.image], (chunk) => {
              tracker.observe(chunk);
              pullProgress = tracker.snapshot();
            });
      if (pull.code !== 0) {
        fail(pull.stderr.trim() || 'docker pull failed');
      }
      pullProgress = undefined;
      throwIfCancelled();
    }
    phase = 'starting';
    detail = '正在创建并启动容器…';
    if (storage.kind === 'bind') {
      const mk = await runner.run(['mkdir', '-p', storage.target]);
      if (mk.code !== 0) {
        fail(mk.stderr.trim() || `cannot prepare dataDir ${storage.target}`);
      }
    } else {
      const volume = await runner.run(['docker', 'volume', 'create', config.volumeName]);
      if (volume.code !== 0) {
        fail(volume.stderr.trim() || 'docker volume create failed');
      }
    }
    throwIfCancelled();
    await ensureDesktopDefaults(storage);
    const start = await runner.run([
      'docker',
      'run',
      '-d',
      '--name',
      config.containerName,
      '--restart',
      'unless-stopped',
      '--cpus',
      String(config.cpus),
      '--memory',
      config.memory,
      '--memory-swap',
      config.memory,
      '--pids-limit',
      String(config.pidsLimit),
      '--shm-size',
      config.shmSize,
      '-p',
      `127.0.0.1:${config.hostPort}:${config.containerPort}`,
      ...(desiredMedia === undefined ? [] : ['-p', `127.0.0.1::${String(desiredMedia.port)}/udp`]),
      ...selkiesWebRtcEnv(desiredMedia).flatMap((entry) => ['-e', entry]),
      '-e',
      `HARDEN_DESKTOP=${config.hardenDesktop ? 'true' : 'false'}`,
      '-e',
      `MAX_RES=${config.resolution}`,
      ...(parseResolution(config.resolution) === undefined
        ? []
        : [
            '-e',
            `SELKIES_MANUAL_WIDTH=${String(parseResolution(config.resolution)?.width)}`,
            '-e',
            `SELKIES_MANUAL_HEIGHT=${String(parseResolution(config.resolution)?.height)}`,
            '-e',
            'SELKIES_ENABLE_RESIZE=false',
          ]),
      '-e',
      `LANG=${getLanguage?.() ?? config.language}`,
      '-e',
      `LC_ALL=${getLanguage?.() ?? config.language}`,
      '-e',
      'PIXELFLUX_WAYLAND=false',
      '-v',
      `${storage.target}:/config`,
      config.image,
    ]);
    if (start.code !== 0) {
      fail(start.stderr.trim() || 'docker run failed');
    }
    if (cancelRequested) {
      cancelRequested = false;
      await runner.run(['docker', 'stop', config.containerName]);
      running = false;
      phase = 'idle';
      detail = undefined;
      throw new Error('computer start cancelled');
    }
    await confirmRunning();
    await ensureDesktopShortcut();
    await ensureSessionRestore();
    await ensureChromiumFlags();
    await ensureWorkspaceDir();
  };

  const withDetail = (status: ComputerStatus): ComputerStatus => {
    if (detail === undefined) return status;
    return { ...status, detail };
  };

  const ensureStopped = async (reason: string): Promise<boolean> => {
    const current = await inspect();
    if (current.state !== 'running') return false;
    phase = 'stopping';
    detail = reason;
    const stop = await runner.run(['docker', 'stop', config.containerName]);
    if (stop.code !== 0) fail(stop.stderr.trim() || 'docker stop failed');
    running = false;
    return true;
  };

  const exportTo = async (destDir: string): Promise<string> => {
    await quiesceBrowser();
    const wasRunning = await ensureStopped('正在停止容器以导出…');
    phase = 'exporting';
    detail = '正在打包 Computer 数据…';
    const archive = `${config.volumeName}-${new Date().toISOString().replace(/[:.]/g, '-')}.tar`;
    try {
      const tar = await runner.run([
        'docker',
        'run',
        '--rm',
        '--entrypoint',
        '/bin/sh',
        '-v',
        `${config.volumeName}:/data`,
        '-v',
        `${destDir}:/backup`,
        config.image,
        '-c',
        `tar cf /backup/${archive} -C /data .`,
      ]);
      if (tar.code !== 0) fail(tar.stderr.trim() || 'computer export failed');
      phase = 'idle';
      detail = undefined;
      return join(destDir, archive);
    } finally {
      if (wasRunning) {
        const start = await runner.run(['docker', 'start', config.containerName]);
        if (start.code !== 0) {
          fail(start.stderr.trim() || 'docker start failed');
        } else {
          let confirmed = false;
          try {
            await waitForDesktop();
            confirmed = true;
          } catch {
            onEvent?.('desktop readiness unconfirmed after export restart');
          }
          running = confirmed;
          phase = 'idle';
          detail = undefined;
        }
      }
    }
  };

  const importFrom = async (archive: string): Promise<void> => {
    await ensureStopped('正在停止容器以导入…');
    phase = 'importing';
    detail = '正在恢复 Computer 数据…';
    const volume = await runner.run(['docker', 'volume', 'create', config.volumeName]);
    if (volume.code !== 0) fail(volume.stderr.trim() || 'docker volume create failed');
    const untar = await runner.run([
      'docker',
      'run',
      '--rm',
      '--entrypoint',
      '/bin/sh',
      '-v',
      `${config.volumeName}:/data`,
      '-v',
      `${dirname(archive)}:/backup`,
      config.image,
      '-c',
      `tar xf /backup/${basename(archive)} -C /data`,
    ]);
    if (untar.code !== 0) fail(untar.stderr.trim() || 'computer import failed');
    phase = 'idle';
    detail = undefined;
    await runStart();
  };

  return {
    name: 'docker',
    probe: probeRuntime,
    async status(): Promise<ComputerStatus> {
      const probe = await probeRuntime();
      const storage = resolveStorage(config, platformName);
      const withStorage = (status: ComputerStatus): ComputerStatus => ({ ...status, storage });
      if (!probe.available) {
        return withStorage(
          probe.detail === undefined
            ? { state: 'failed' }
            : { state: 'failed', detail: probe.detail },
        );
      }
      if (phase === 'pulling' || phase === 'starting') {
        const status: ComputerStatus = { state: 'absent', phase };
        const withProgress =
          pullProgress === undefined ? status : { ...status, progress: pullProgress };
        return withStorage(withDetail(withProgress));
      }
      if (phase === 'failed') {
        return withStorage(withDetail({ state: 'failed', phase: 'failed' }));
      }
      const status = await inspect();
      running = status.state === 'running';
      if (phase === 'stopping' || phase === 'exporting' || phase === 'importing') {
        return withStorage(withDetail({ ...status, phase }));
      }
      if (status.state === 'running') phase = 'running';
      if (status.state === 'absent') return withStorage(status);
      const hint = await migrationHint(status.state);
      return {
        ...status,
        storage: hint === undefined ? storage : { ...storage, migrationHint: hint },
      };
    },
    async start(): Promise<void> {
      if (operation !== undefined) return operation;
      operation = enqueue(runStart).finally(() => {
        operation = undefined;
      });
      return operation;
    },
    async stop(): Promise<void> {
      cancelRequested = true;
      await enqueue(async () => {
        phase = 'stopping';
        detail = undefined;
        const result = await runner.run(['docker', 'stop', config.containerName]);
        if (result.code !== 0 && !result.stderr.includes('No such container')) {
          phase = 'failed';
          detail = result.stderr.trim() || 'docker stop failed';
          throw failure(detail);
        }
        running = false;
        phase = 'idle';
        detail = undefined;
      });
    },
    upstream(): URL | undefined {
      return running ? new URL(`http://127.0.0.1:${config.hostPort}/`) : undefined;
    },
    webrtc: {
      async media() {
        if (!running) return undefined;
        const env = await runner.run([
          'docker',
          'inspect',
          '--format',
          '{{range .Config.Env}}{{println .}}{{end}}',
          config.containerName,
        ]);
        if (env.code !== 0) return undefined;
        const advertised = selkiesWebRtcMediaFromEnv(env.stdout.split('\n'));
        if (advertised === undefined) return undefined;
        const port = await runner.run([
          'docker',
          'port',
          config.containerName,
          `${String(advertised.port)}/udp`,
        ]);
        const published = port.code === 0 ? loopbackPort(port.stdout) : undefined;
        return published === undefined ? undefined : { advertised, loopbackPort: published };
      },
      async prepare() {
        const result = await runner.run([
          'docker',
          'exec',
          config.containerName,
          'sh',
          '-c',
          SELKIES_RTC_CONFIG_SCRIPT,
        ]);
        if (result.code !== 0) throw failure(result.stderr.trim() || 'WebRTC setup failed');
      },
    },
    exportTo: (destDir: string) => enqueue(() => exportTo(destDir)),
    importFrom: (archive: string) => enqueue(() => importFrom(archive)),
  };
}
