import { spawn } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Context } from '@deepseek-ai/cordis';
import {
  ShellExecutor,
  type ShellExecRequest,
  type ShellExecSpec,
  type ShellExecution,
} from '@deepseek-ai/dsh-shell';
import { defineTool, type ToolDefinition, type ToolExecution } from '@deepseek-ai/dsh-tools';
import { tobCliCommandSchema } from './cli-request.js';
import { TobError } from './service.js';
import { startTobCliBroker, type TobCliBrokerOptions } from './cli-broker.js';

export interface TobCliShellOptions {
  capture(execution: ToolExecution): TobCliBrokerOptions | undefined;

  cliPath?: string;
  nativeCli?: {
    available(): boolean;
    register(definition: ToolDefinition): () => void;
    require(execution: ToolExecution): void;
  };
}
const CLI_APPROVAL_WAIT_MS = 10 * 60 * 1000;
const CLI_COMMAND = /(^|[\s;&|(`])deepseekbot(\s|$)/mu;

interface Invocation {
  execution: ToolExecution;
  active: boolean;
  close: Set<() => Promise<void>>;
}
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
export function cliModulePath(): string {
  const built = fileURLToPath(new URL('../cli/index.mjs', import.meta.url));
  if (existsSync(built)) return built;
  const source = fileURLToPath(new URL('../../cli/index.mjs', import.meta.url));
  if (existsSync(source)) return source;
  throw new Error('The managed Tobs CLI is unavailable; rebuild the Bundle.');
}
function makeShim(modulePath: string): { directory: string; remove(): void } {
  const directory = mkdtempSync(join(tmpdir(), 'botharness-tob-cli-'));
  const entry = join(directory, 'entry.mjs');
  try {
    writeFileSync(
      entry,
      `import { runBotCreateCli } from ${JSON.stringify(pathToFileURL(modulePath).href)};\nprocess.exitCode = await runBotCreateCli(process.argv.slice(2), {\n  env: process.env,\n  stdout: text => process.stdout.write(text + '\\n'),\n  stderr: text => process.stderr.write(text + '\\n'),\n  readStdin: async () => { const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk); return Buffer.concat(chunks).toString('utf8'); }\n});\n`,
      { mode: 0o400 },
    );
    writeFileSync(
      join(directory, 'deepseekbot'),
      `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(entry)} "$@"\n`,
      { mode: 0o500 },
    );
    if (process.platform === 'win32')
      writeFileSync(
        join(directory, 'deepseekbot.cmd'),
        `@echo off\r\n"${process.execPath}" "${entry}" %*\r\n`,
        { mode: 0o500 },
      );
    chmodSync(directory, 0o500);
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    directory,
    remove() {
      chmodSync(directory, 0o700);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function installTobCliShell(
  ctx: Context,
  shell: ShellExecutor,
  options: TobCliShellOptions,
): ShellExecutor {
  const invocation = new AsyncLocalStorage<Invocation>();
  const shutdown = new AbortController();
  const active = new Set<() => Promise<void>>();
  let shim: ReturnType<typeof makeShim> | undefined;
  ctx.on('tools/execute', async (execution, next) => {
    if (
      execution.name !== 'bash' &&
      execution.name !== 'pwsh' &&
      execution.name !== 'deepseekbot_cli'
    )
      return next();
    const call: Invocation = { execution, active: true, close: new Set() };
    try {
      return await invocation.run(call, next);
    } finally {
      call.active = false;
      await Promise.all([...call.close].map((close) => close()));
    }
  });
  const nativeCli = options.nativeCli;
  if (nativeCli !== undefined) {
    const definition = defineTool({
      name: 'deepseekbot_cli',
      description:
        'Run one typed deepseekbot command through the scoped Tob broker. Requires the owning live Human DM turn; writes retain their actual approval and execution fences.',
      parameters: {
        argv: { type: 'array', items: { type: 'string' }, required: true },
        stdin: { type: 'string' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, execution) {
        if (!nativeCli.available()) throw new TobError('tob-authority-required');
        nativeCli.require(execution);
        const command = tobCliCommandSchema.parse(args);
        const call = invocation.getStore();
        if (!call?.active || shutdown.signal.aborted) throw new TobError('agent-context-expired');
        const captured = options.capture(call.execution);
        if (!captured) throw new TobError('tob-authority-required');
        const signal = AbortSignal.any([shutdown.signal, captured.signal, call.execution.signal]);
        signal.throwIfAborted();
        captured.authorize();
        const cwd = call.execution.agent?.session.header.cwd;
        if (!cwd) throw new TobError('tob-authority-required');
        const broker = await startTobCliBroker({ ...captured, signal });
        try {
          const modulePath = pathToFileURL(options.cliPath ?? cliModulePath()).href;
          const entry = `import { runBotCreateCli } from ${JSON.stringify(modulePath)};
process.exitCode = await runBotCreateCli(process.argv.slice(1), {
  env: process.env,
  stdout: text => process.stdout.write(text + '\\n'),
  stderr: text => process.stderr.write(text + '\\n'),
  readStdin: async () => { const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk); return Buffer.concat(chunks).toString('utf8'); }
});`;
          const env = { ...process.env };
          for (const key of [
            'DEEPSEEKBOT_HOST',
            'DEEPSEEKBOT_HOST_TOKEN',
            'DEEPSEEKBOT_AGENT_ENDPOINT',
            'DEEPSEEKBOT_AGENT_TOKEN',
          ])
            delete env[key];
          env.DEEPSEEKBOT_AGENT_ENDPOINT = broker.endpoint;
          env.DEEPSEEKBOT_AGENT_TOKEN = broker.token;
          const output = await new Promise<import('./cli-request.js').TobCliOutput>(
            (resolve, reject) => {
              const child = spawn(
                process.execPath,
                ['--input-type=module', '--eval', entry, '--', ...command.argv],
                {
                  cwd,
                  env,
                  signal,
                  shell: false,
                  windowsHide: true,
                  stdio: ['pipe', 'pipe', 'pipe'],
                },
              );
              let bytes = 0,
                stdout = '',
                stderr = '',
                exceeded = false;
              let failure: unknown;
              child.stdout.setEncoding('utf8');
              child.stderr.setEncoding('utf8');
              const append = (chunk: string, stream: 'stdout' | 'stderr') => {
                bytes += Buffer.byteLength(chunk);
                if (bytes > 1024 * 1024) {
                  exceeded = true;
                  child.kill();
                  return;
                }
                if (stream === 'stdout') stdout += chunk;
                else stderr += chunk;
              };
              child.stdout.on('data', (chunk: string) => append(chunk, 'stdout'));
              child.stderr.on('data', (chunk: string) => append(chunk, 'stderr'));
              child.once('error', (error) => {
                failure = error;
              });
              child.once('close', (exitCode) => {
                if (failure !== undefined) {
                  reject(failure);
                  return;
                }
                if (exceeded) {
                  reject(new TobError('request-too-large'));
                  return;
                }
                const scrub = (text: string) =>
                  text
                    .replaceAll(broker.token, '[redacted]')
                    .replaceAll(encodeURIComponent(broker.token), '[redacted]')
                    .replaceAll(broker.endpoint, '[scoped-cli]');
                resolve({
                  exitCode: exitCode ?? 1,
                  stdout: scrub(stdout),
                  stderr: scrub(stderr),
                });
              });
              child.stdin.on('error', () => {});
              child.stdin.end(command.stdin);
            },
          );
          signal.throwIfAborted();
          return JSON.stringify(output);
        } finally {
          await broker.close();
        }
      },
    });
    ctx.tools.register(definition, { when: () => nativeCli.available() });
    ctx.effect(() => nativeCli.register(definition), 'botharness: trusted typed CLI registration');
  }
  ctx.effect(
    () => async () => {
      shutdown.abort();
      await Promise.all([...active].map((close) => close()));
      shim?.remove();
      shim = undefined;
    },
    'botharness: Tob CLI invocation leases',
  );
  class ScopedTobShell extends ShellExecutor {
    override get sandboxMode() {
      return shell.sandboxMode;
    }
    resolve(request: ShellExecRequest): ShellExecSpec {
      const call = invocation.getStore();
      if (
        call?.active !== true ||
        !CLI_COMMAND.test(request.command) ||
        options.capture(call.execution) === undefined
      )
        return shell.resolve(request);
      return shell.resolve({
        ...request,
        timeoutMs: Math.max(request.timeoutMs ?? 0, CLI_APPROVAL_WAIT_MS),
      });
    }
    async execute(spec: ShellExecSpec): Promise<ShellExecution> {
      const call = invocation.getStore();
      if (call === undefined) return shell.execute(spec);
      if (!call.active || shutdown.signal.aborted)
        throw new Error('The scoped Shell invocation has ended.');
      const captured = options.capture(call.execution);
      if (captured === undefined) return shell.execute(spec);
      const signal = AbortSignal.any([
        shutdown.signal,
        captured.signal,
        call.execution.signal,
        ...(spec.signal === undefined ? [] : [spec.signal]),
      ]);
      signal.throwIfAborted();
      shim ??= makeShim(options.cliPath ?? cliModulePath());
      const broker = await startTobCliBroker({ ...captured, signal });
      let closed: Promise<void> | undefined;
      const close = () =>
        (closed ??= broker.close().finally(() => {
          active.delete(close);
          call.close.delete(close);
          signal.removeEventListener('abort', abort);
        }));
      const abort = () => {
        void close();
      };
      active.add(close);
      call.close.add(close);
      signal.addEventListener('abort', abort, { once: true });
      const scrub = (text: string) =>
        text.replaceAll(broker.token, '[redacted]').replaceAll(broker.endpoint, '[scoped-cli]');
      try {
        signal.throwIfAborted();
        const env = { ...spec.env };

        for (const key of [
          'DEEPSEEKBOT_HOST',
          'DEEPSEEKBOT_HOST_TOKEN',
          'DEEPSEEKBOT_AGENT_ENDPOINT',
          'DEEPSEEKBOT_AGENT_TOKEN',
        ])
          delete env[key];
        const handle = await shell.execute({
          ...spec,
          signal,
          env: {
            ...env,
            DEEPSEEKBOT_HOST: '',
            DEEPSEEKBOT_HOST_TOKEN: '',
            DEEPSEEKBOT_AGENT_ENDPOINT: broker.endpoint,
            DEEPSEEKBOT_AGENT_TOKEN: broker.token,
            PATH: `${shim.directory}${delimiter}${env['PATH'] ?? process.env['PATH'] ?? ''}`,
          },
        });
        const done = handle.done.then(close);

        let result: ReturnType<ShellExecution['result']> | undefined;
        const observed = Object.fromEntries(
          Object.entries(handle.observed).map(([key, reader]) => [
            key,
            {
              readFrom(offset: number) {
                const read = reader.readFrom(offset);
                return { ...read, text: scrub(read.text) };
              },
            },
          ]),
        );
        return new Proxy(handle, {
          get(target, key) {
            if (key === 'done') return done;
            if (key === 'observed') return observed;
            if (key === 'result')
              return () =>
                (result ??= (async () => {
                  try {
                    const value = await target.result();
                    await close();
                    return {
                      ...value,
                      stdout: { ...value.stdout, text: scrub(value.stdout.text) },
                      stderr: { ...value.stderr, text: scrub(value.stderr.text) },
                    };
                  } finally {
                    await close();
                  }
                })());
            if (key === 'readOutput')
              return () => {
                const value = target.readOutput();
                return { ...value, delta: scrub(value.delta) };
              };
            const value: unknown = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      } catch (error) {
        await close();
        throw error;
      }
    }
  }
  return new ScopedTobShell(ctx);
}
