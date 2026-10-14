import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, chmod, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConnection, type Socket } from 'node:net';

export const AGENT_BROWSER_VERSION = '0.38.2';
const TIMEOUT_MS = 15_000;

export interface AgentBrowserProcess {
  start(endpoint: string): Promise<void>;
  command(action: string, fields?: Record<string, unknown>): Promise<Record<string, unknown>>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

function nativeBinary(): string {
  let root: string;
  try {
    root = dirname(createRequire(import.meta.url).resolve('agent-browser/package.json'));
  } catch {
    throw new Error(
      `agent-browser ${AGENT_BROWSER_VERSION} is not installed in this Profile; add it before selecting the agent-browser driver`,
    );
  }
  let platform: string = process.platform;
  if (
    platform === 'linux' &&
    !(process.report.getReport() as { header?: { glibcVersionRuntime?: string } }).header
      ?.glibcVersionRuntime
  )
    platform = 'linux-musl';
  let arch = process.arch;
  if (platform === 'win32' && arch === 'arm64') arch = 'x64';
  const path = join(
    root,
    'bin',
    `agent-browser-${platform}-${arch}${platform === 'win32' ? '.exe' : ''}`,
  );
  if (!existsSync(path))
    throw new Error(`agent-browser ${AGENT_BROWSER_VERSION} has no binary for this platform`);
  return path;
}

export function createAgentBrowserProcess(note: (detail: string) => void): AgentBrowserProcess {
  let child: ChildProcess | undefined;
  let directory: string | undefined;
  let stopping: Promise<void> | undefined;
  const sockets = new Set<Socket>();
  const live = (): boolean =>
    child !== undefined &&
    child.pid !== undefined &&
    child.exitCode === null &&
    child.signalCode === null &&
    !child.killed;

  const command = async (
    action: string,
    fields: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> => {
    if (!live() || directory === undefined) throw new Error('agent-browser is not running');
    const address =
      process.platform === 'win32'
        ? {
            host: '127.0.0.1',
            port: Number(await readFile(join(directory, 'driver.port'), 'utf8')),
          }
        : { path: join(directory, 'driver.sock') };
    const started = Date.now();
    try {
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        const socket = createConnection(address);
        sockets.add(socket);
        let output = '';
        let settled = false;
        const finish = (error?: Error, data?: Record<string, unknown>): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          sockets.delete(socket);
          socket.destroy();
          if (error !== undefined) reject(error);
          else resolve(data ?? {});
        };
        const timer = setTimeout(() => {
          finish(new Error(`agent-browser ${action} timed out; inspect the page before retrying`));
          void stop();
        }, TIMEOUT_MS);
        socket.on('error', (error) => finish(error));
        socket.on('close', () =>
          finish(new Error('agent-browser command was cancelled or disconnected')),
        );
        socket.on('connect', () =>
          socket.write(`${JSON.stringify({ id: 'host', action, ...fields })}\n`),
        );
        socket.on('data', (chunk: Buffer) => {
          output += chunk.toString('utf8');
          if (Buffer.byteLength(output) > 4 * 1024 * 1024) {
            finish(new Error('agent-browser response exceeded the Host limit'));
            return;
          }
          const end = output.indexOf('\n');
          if (end < 0) return;
          try {
            const result = JSON.parse(output.slice(0, end));
            if (result.success !== true)
              finish(
                new Error(
                  /execution context was destroyed|cannot find context/iu.test(
                    String(result.error ?? ''),
                  )
                    ? 'Browser document context changed'
                    : `agent-browser ${action} failed; observe the page before deciding whether to retry`,
                ),
              );
            else finish(undefined, result.data);
          } catch {
            finish(new Error('agent-browser returned invalid JSON'));
          }
        });
      });
    } finally {
      note(
        `driver=agent-browser initiator=tool phase=${action} durationMs=${Date.now() - started}`,
      );
    }
  };

  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      const proc = child;
      child = undefined;
      if (
        proc !== undefined &&
        proc.pid !== undefined &&
        proc.exitCode === null &&
        proc.signalCode === null
      ) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            proc.kill('SIGKILL');
          }, 2000);
          proc.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          proc.kill('SIGTERM');
        });
      }
      const ownedDirectory = directory;
      directory = undefined;
      if (ownedDirectory !== undefined) await rm(ownedDirectory, { recursive: true, force: true });
      note('driver=agent-browser initiator=host phase=stopped');
    })().finally(() => {
      stopping = undefined;
    });
    return stopping;
  };

  return {
    command,
    isRunning: live,
    stop,
    async start(endpoint) {
      if (stopping !== undefined) await stopping;
      if (live()) return;
      if (child !== undefined || directory !== undefined) await stop();
      const binary = nativeBinary();
      directory = await mkdtemp(join(tmpdir(), 'bh-ab-'));
      await chmod(directory, 0o700);
      const env: NodeJS.ProcessEnv = {};
      for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'TMP', 'TEMP', 'TMPDIR']) {
        if (process.env[key] !== undefined) env[key] = process.env[key];
      }
      Object.assign(env, {
        AGENT_BROWSER_DAEMON: '1',
        AGENT_BROWSER_SESSION: 'driver',
        AGENT_BROWSER_SOCKET_DIR: directory,
        AGENT_BROWSER_PIN_TAB: '1',
        AGENT_BROWSER_IDLE_TIMEOUT_MS: '0',
        AGENT_BROWSER_DEFAULT_TIMEOUT: '10000',
      });
      const proc = spawn(binary, [], { env, stdio: 'ignore', windowsHide: true });
      child = proc;
      let spawnError: Error | undefined;
      proc.on('error', (error) => {
        spawnError = error;
      });
      try {
        const deadline = Date.now() + TIMEOUT_MS;
        const ready = join(directory, process.platform === 'win32' ? 'driver.port' : 'driver.sock');
        while (!existsSync(ready)) {
          if (spawnError !== undefined) throw spawnError;
          if (!live()) throw new Error('agent-browser exited during startup');
          if (Date.now() >= deadline) throw new Error('agent-browser startup timed out');
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const version = (await readFile(join(directory, 'driver.version'), 'utf8')).trim();
        if (version !== AGENT_BROWSER_VERSION)
          throw new Error('agent-browser binary version does not match the pinned driver');
        const disabled = await command('stream_disable');
        if (disabled['disabled'] !== true || existsSync(join(directory, 'driver.stream')))
          throw new Error('agent-browser interactive stream could not be disabled');
        await command('launch', { cdpUrl: endpoint, pinTab: true, webmcp: false });
        const stream = await command('stream_status');
        if (stream['enabled'] !== false)
          throw new Error('agent-browser interactive stream is unexpectedly enabled');
        note(`driver=agent-browser version=${AGENT_BROWSER_VERSION} initiator=host phase=ready`);
      } catch (error) {
        await stop();
        throw error;
      }
    },
  };
}
