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
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { startTobCliBroker, type TobCliBrokerOptions } from './cli-broker.js';

export interface TobCliShellOptions {
  capture(execution: ToolExecution): TobCliBrokerOptions | undefined;

  cliPath?: string;
}
interface Invocation {
  execution: ToolExecution;
  active: boolean;
  close: Set<() => Promise<void>>;
}
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function cliModulePath(): string {
  const built = fileURLToPath(new URL('../cli/index.mjs', import.meta.url));
  if (existsSync(built)) return built;
  const source = fileURLToPath(new URL('../../cli/index.mjs', import.meta.url));
  if (existsSync(source)) return source;
  throw new Error('The managed DeepSeekBot CLI is unavailable; rebuild the Bundle.');
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
    if (execution.name !== 'bash' && execution.name !== 'pwsh') return next();
    const call: Invocation = { execution, active: true, close: new Set() };
    try {
      return await invocation.run(call, next);
    } finally {
      call.active = false;
      await Promise.all([...call.close].map((close) => close()));
    }
  });
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
      return shell.resolve(request);
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
