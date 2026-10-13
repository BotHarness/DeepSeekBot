import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SecretCommandRefusal,
  maskSecrets,
  secretCommandArgs,
  secretCommandBaseEnv,
  secretCommandEnvName,
} from './secret-command.js';

export const SECRET_MCP_START_TIMEOUT_MS = 120_000;
export const rememberedStarts = new Set<symbol>();
export const SECRET_MCP_KEEP = 'BOTHARNESS_MCP_KEEP';
export const SECRET_MCP_LAUNCHER = [
  "const { spawn } = require('node:child_process');",
  "const keep = (process.env.BOTHARNESS_MCP_KEEP || '').split(',');",
  'const env = {};',
  'for (const name of keep) if (name && process.env[name] !== undefined) env[name] = process.env[name];',
  'const argv = process.argv.slice(1);',
  "const child = spawn(argv[0], argv.slice(1), { env, stdio: 'inherit' });",
  "for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => child.kill(signal));",
  "child.on('error', () => process.exit(127));",
  "child.on('exit', (code, signal) => process.exit(code === null ? (signal ? 1 : 0) : code));",
].join('\n');

const SHELLS = new Set([
  'sh',
  'bash',
  'zsh',
  'fish',
  'dash',
  'ksh',
  'csh',
  'tcsh',
  'pwsh',
  'powershell',
  'cmd',
  'env',
  'printenv',
  'xargs',
  'sudo',
  'doas',
  'su',
  'nohup',
  'osascript',
]);
const PLACEHOLDER = /\{\{[a-z][a-z0-9_]{0,47}\}\}/;

export interface SecretMcpInput {
  server_name: string;
  program: string;
  args: readonly string[];
  env: readonly { name: string; value: string }[];
}

export function secretMcpPlan(input: SecretMcpInput): {
  serverName: string;
  command: string[];
  names: string[];
} {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(input.server_name))
    throw new SecretCommandRefusal('server_name must be 1–32 letters, digits, _ or -');
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(input.program))
    throw new SecretCommandRefusal('program must be a bare program name without a path');
  if (SHELLS.has(input.program.toLowerCase().replace(/\.(?:exe|cmd|bat)$/, '')))
    throw new SecretCommandRefusal('program is a shell; name the MCP server launcher itself');
  const command = [input.program, ...secretCommandArgs(input.args)];
  const names = input.env.map((entry) => secretCommandEnvName(entry.name));
  if (
    input.env.length === 0 ||
    input.env.length > 16 ||
    new Set(names).size !== names.length ||
    !input.env.some((entry) => PLACEHOLDER.test(entry.value))
  )
    throw new SecretCommandRefusal(
      'env must hold 1–16 distinct variables and at least one {{field_id}} placeholder',
    );
  if (command.some((part) => PLACEHOLDER.test(part)))
    throw new SecretCommandRefusal(
      'a secret placeholder is allowed only in env values, never in arguments',
    );
  return { serverName: input.server_name, command, names };
}

export function secretMcpDenial(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return 'secret_mcp_connect arguments are invalid';
  const input = args as Record<string, unknown>;
  if (
    typeof input['server_name'] !== 'string' ||
    typeof input['program'] !== 'string' ||
    !Array.isArray(input['args']) ||
    !input['args'].every((arg) => typeof arg === 'string') ||
    !Array.isArray(input['env']) ||
    !input['env'].every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === 'string' &&
        typeof (entry as { value?: unknown }).value === 'string',
    )
  )
    return 'secret_mcp_connect arguments are invalid';
  try {
    secretMcpPlan(input as unknown as SecretMcpInput);
    return undefined;
  } catch (error) {
    if (error instanceof SecretCommandRefusal)
      return 'secret_mcp_connect refused: ' + error.message;
    throw error;
  }
}

export function secretMcpEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const cache = join(tmpdir(), 'botharness-mcp-cache');
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(secretCommandBaseEnv(source)))
    if (value !== undefined) env[name] = value;
  env['npm_config_cache'] = join(cache, 'npm');
  env['UV_CACHE_DIR'] = join(cache, 'uv');
  env['XDG_CACHE_HOME'] = cache;
  return env;
}

type ToolRegistry = {
  schemas(agent: Agent): Array<{ name: string }>;
};

interface Running {
  botSlug: string;
  account: string;
  secrets: string[];
  tools: string[];
  stopped?: () => void;
  stop(): Promise<void>;
}

export class SecretMcpServers {
  readonly #running = new Map<Agent, Map<string, Running>>();

  list(agent: Agent): Array<{ serverName: string; account: string; tools: string[] }> {
    return [...(this.#running.get(agent) ?? [])].map(([serverName, running]) => ({
      serverName,
      account: running.account,
      tools: running.tools,
    }));
  }

  has(agent: Agent, serverName: string): boolean {
    return this.#running.get(agent)?.has(serverName) === true;
  }

  owns(agent: Agent, toolName: string): boolean {
    for (const serverName of this.#running.get(agent)?.keys() ?? [])
      if (toolName.startsWith(`mcp__${serverName}__`)) return true;
    return false;
  }

  mask(agent: Agent, toolName: string, text: string): string {
    for (const [serverName, running] of this.#running.get(agent) ?? [])
      if (toolName.startsWith(`mcp__${serverName}__`)) return maskSecrets(text, running.secrets);
    return text;
  }

  async start(
    ctx: Context,
    agent: Agent,
    plan: {
      botSlug: string;
      serverName: string;
      account: string;
      argv: readonly string[];
      cwd: string;
    },
    env: Record<string, string>,
    secrets: readonly string[],
    timeoutMs = SECRET_MCP_START_TIMEOUT_MS,
  ): Promise<Running> {
    if (this.has(agent, plan.serverName))
      throw new SecretCommandRefusal('an MCP server with this server_name is already connected');
    const tools = ctx.get('tools') as unknown as ToolRegistry | undefined;
    if (tools === undefined || plan.argv[0] === undefined)
      throw new Error('Native Tool Registry is unavailable');
    const fiber = ctx.plugin(mcpClient, {
      transport: 'stdio',
      serverName: plan.serverName,
      command: process.execPath,
      args: ['-e', SECRET_MCP_LAUNCHER, '--', ...plan.argv],
      env: { ...env, [SECRET_MCP_KEEP]: Object.keys(env).join(',') },
      cwd: plan.cwd,
      toolCallTimeoutMs: 60_000,
      failOnStartupError: true,
      reconnect: { enabled: false },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = await Promise.race([
      fiber.await().then(
        () => fiber.state === 2,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    if (!started) {
      await Promise.resolve(fiber.dispose()).catch(() => undefined);
      throw new SecretCommandRefusal(
        'the MCP server did not start; check the program, its arguments and that it is installed',
      );
    }
    const prefix = `mcp__${plan.serverName}__`;
    const running: Running = {
      botSlug: plan.botSlug,
      account: plan.account,
      secrets: [...secrets],
      tools: tools
        .schemas(agent)
        .map((schema) => schema.name)
        .filter((name) => name.startsWith(prefix)),
      stop: async () => {
        const servers = this.#running.get(agent);
        if (servers?.get(plan.serverName) === running) servers.delete(plan.serverName);
        running.secrets.length = 0;
        await Promise.resolve(fiber.dispose()).catch(() => undefined);
        running.stopped?.();
      },
    };
    let servers = this.#running.get(agent);
    if (servers === undefined) {
      servers = new Map();
      this.#running.set(agent, servers);
    }
    servers.set(plan.serverName, running);
    return running;
  }

  async stop(agent: Agent, serverName: string): Promise<boolean> {
    const running = this.#running.get(agent)?.get(serverName);
    if (running === undefined) return false;
    await running.stop();
    return true;
  }

  connected(botSlug: string): Set<string> {
    const names = new Set<string>();
    for (const servers of this.#running.values())
      for (const [serverName, running] of servers)
        if (running.botSlug === botSlug) names.add(serverName);
    return names;
  }

  async stopFor(botSlug: string, serverName?: string): Promise<number> {
    const matches = [...this.#running.values()].flatMap((servers) =>
      [...servers].filter(
        ([name, running]) =>
          running.botSlug === botSlug && (serverName === undefined || name === serverName),
      ),
    );
    await Promise.allSettled(matches.map(([, running]) => running.stop()));
    return matches.length;
  }

  async close(): Promise<void> {
    const all = [...this.#running.values()].flatMap((servers) => [...servers.values()]);
    this.#running.clear();
    await Promise.allSettled(all.map((running) => running.stop()));
  }
}
