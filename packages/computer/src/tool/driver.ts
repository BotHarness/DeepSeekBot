import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import type { ComputerProgress, ComputerRuntimeRunner } from '../provider.js';

export const CUA_DRIVER_VERSION = '0.28.0';

export const CUA_DRIVER_DIR = `/config/.botharness/cua-driver/${CUA_DRIVER_VERSION}`;

export const CUA_DRIVER_PATH = `${CUA_DRIVER_DIR}/cua-driver`;

const DESKTOP_USER = 'abc';

const DRIVER_ENV_ARGS = [
  '-e',
  'CUA_DRIVER_RS_TELEMETRY_ENABLED=false',
  '-e',
  'CUA_DRIVER_RS_UPDATE_CHECK=false',
] as const;

export interface DriverToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema?: unknown;
}

export interface CuaDriverOptions {
  readonly runner: ComputerRuntimeRunner;
  readonly containerName: string;
  readonly onEvent?: (detail: string) => void;
}

export interface CuaDriver {
  ensure(
    signal?: AbortSignal,
    onProgress?: (progress: ComputerProgress) => void,
  ): Promise<{ status: 'present' | 'installed'; arch: string }>;
  tools(signal?: AbortSignal): Promise<readonly DriverToolDescriptor[]>;
  call(rawName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}

const READ_ONLY_TOOLS = new Set([
  'list_windows',
  'get_desktop_state',
  'get_window_state',
  'verify_state',
]);

export function driverAssetArch(machine: string): string {
  const value = machine.trim();
  if (value === 'x86_64' || value === 'amd64') return 'linux-x86_64';
  if (value === 'aarch64' || value === 'arm64') return 'linux-arm64';
  throw new Error(`unsupported Computer architecture "${machine}"`);
}

export function driverAssetUrl(arch: string): string {
  return `https://github.com/trycua/cua/releases/download/cua-driver-rs-v${CUA_DRIVER_VERSION}/cua-driver-rs-${CUA_DRIVER_VERSION}-${arch}-binary.tar.gz`;
}

export function driverInstallScript(arch: string): string {
  const asset = `cua-driver-rs-${CUA_DRIVER_VERSION}-${arch}-binary.tar.gz`;
  return [
    'set -euo pipefail',
    `D=${CUA_DRIVER_DIR}`,
    'mkdir -p "$D"',
    'TMP=$(mktemp -d)',
    'trap \'rm -rf "$TMP"\' EXIT',
    `curl -fsSL -o "$TMP/${asset}" '${driverAssetUrl(arch)}'`,
    `curl -fsSL -o "$TMP/checksums.txt" 'https://github.com/trycua/cua/releases/download/cua-driver-rs-v${CUA_DRIVER_VERSION}/checksums.txt'`,
    `(cd "$TMP" && grep ' ${asset}$' checksums.txt | sha256sum -c -)`,
    `tar -xzf "$TMP/${asset}" -C "$D"`,
    `chmod +x "$D/cua-driver"`,
    `chown -R ${DESKTOP_USER}:${DESKTOP_USER} /config/.botharness`,
  ].join('\n');
}

export function createCuaDriver(options: CuaDriverOptions): CuaDriver {
  const { runner, containerName, onEvent } = options;
  const log = (detail: string): void => onEvent?.(detail);

  const execArgs = (argv: readonly string[], user: string): string[] => [
    'exec',
    '-i',
    '-u',
    user,
    '-e',
    'HOME=/config',
    '-e',
    'DISPLAY=:1',
    ...DRIVER_ENV_ARGS,
    containerName,
    ...argv,
  ];

  const insideArgs = (argv: readonly string[], user: string): string[] => [
    'docker',
    ...execArgs(argv, user),
  ];

  const runInside = async (
    argv: readonly string[],
    user: string,
    signal?: AbortSignal,
  ): Promise<{ code: number; stdout: string; stderr: string }> => {
    if (signal?.aborted === true) throw new Error('computer driver operation aborted');
    return runner.run(insideArgs(argv, user));
  };

  return createMcpCuaDriver({
    onEvent,
    transport: {
      command: 'docker',
      args: execArgs([CUA_DRIVER_PATH, 'mcp'], DESKTOP_USER),
      env: { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin' },
    },
    async ensure(signal) {
      const machine = await runInside(['uname', '-m'], 'root', signal);
      if (machine.code !== 0) throw new Error('the Computer is not running');
      const arch = driverAssetArch(machine.stdout);
      const present = await runInside([CUA_DRIVER_PATH, '--version'], DESKTOP_USER, signal);
      if (present.code === 0) {
        log(`driver present: ${present.stdout.trim()}`);
        return { status: 'present', arch };
      }
      log(`driver missing; installing ${CUA_DRIVER_VERSION} (${arch})`);
      const installed = await runInside(['sh', '-c', driverInstallScript(arch)], 'root', signal);
      if (installed.code !== 0) {
        throw new Error(`Cua Driver install failed: ${installed.stderr.trim().slice(0, 300)}`);
      }
      const verified = await runInside([CUA_DRIVER_PATH, '--version'], DESKTOP_USER, signal);
      if (verified.code !== 0) throw new Error('Cua Driver install did not verify');
      log(`driver installed: ${verified.stdout.trim()}`);
      return { status: 'installed', arch };
    },
  });
}

export function createMcpCuaDriver(options: {
  ensure: CuaDriver['ensure'];
  transport: { command: string; args: string[]; env: Record<string, string> };
  onEvent?: ((detail: string) => void) | undefined;
  retryReadOnly?: boolean;
  beforeOpen?: () => Promise<void>;
}): CuaDriver {
  const log = (detail: string): void => options.onEvent?.(detail.slice(0, 300));
  let epoch = 0;
  let client: Client | undefined;
  let opening: Promise<Client> | undefined;
  let catalog: readonly DriverToolDescriptor[] | undefined;

  const dropClient = async (): Promise<void> => {
    epoch += 1;
    const current = client;
    const pending = opening;
    client = undefined;
    opening = undefined;
    catalog = undefined;
    try {
      await current?.close();
      await pending?.catch(() => undefined);
    } catch {}
  };

  const openClient = async (): Promise<Client> => {
    const openingEpoch = epoch;
    await options.beforeOpen?.();
    if (openingEpoch !== epoch) throw new Error('Computer driver connection was cancelled');
    const transport = new StdioClientTransport({ ...options.transport, stderr: 'pipe' });
    transport.stderr?.on('data', (chunk: Buffer | string) => {
      for (const line of String(chunk).split('\n'))
        if (line.trim() !== '') log(`driver: ${line.trim()}`);
    });
    const created = new Client(
      { name: 'botharness-computer', version: '0.0.0' },
      { capabilities: {}, versionNegotiation: { mode: 'auto' } },
    );
    created.onerror = (error) => log(`driver connection error: ${String(error)}`);
    created.onclose = () => log('driver connection closed');
    transport.onclose = () => log(`driver child exited (pid ${String(transport.pid ?? '?')})`);
    transport.onerror = (error) => log(`driver transport error: ${String(error)}`);
    let listed;
    try {
      await created.connect(transport);
      listed = await created.listTools();
      if (openingEpoch !== epoch) throw new Error('Computer driver connection was cancelled');
    } catch (error) {
      await created.close().catch(() => undefined);
      throw error;
    }
    catalog = listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
      ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
    }));
    client = created;
    log(`driver connected: ${catalog.length} tools`);
    return created;
  };

  const ensureClient = async (): Promise<Client> => {
    if (client !== undefined) return client;
    const pending = (opening ??= openClient());
    try {
      return await pending;
    } finally {
      if (opening === pending) opening = undefined;
    }
  };

  return {
    ensure: options.ensure,

    async tools(signal) {
      await ensureClient();
      if (signal?.aborted === true) throw new Error('computer driver operation aborted');
      return catalog ?? [];
    },

    async call(rawName, args, signal) {
      const alreadyAborted = signal?.aborted === true;
      if (alreadyAborted) throw new Error('computer driver operation aborted');
      const callOptions = signal === undefined ? undefined : { signal };
      const active = await ensureClient();
      const callEpoch = epoch;
      try {
        return await active.callTool({ name: rawName, arguments: args }, callOptions);
      } catch (error) {
        if (callEpoch !== epoch) throw error;
        await dropClient();
        if (options.retryReadOnly === false || signal?.aborted || !READ_ONLY_TOOLS.has(rawName))
          throw error;
        const retry = await ensureClient();
        return await retry.callTool({ name: rawName, arguments: args }, callOptions);
      }
    },

    async close() {
      await dropClient();
    },
  };
}
