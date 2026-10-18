import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Context } from '@deepseek-ai/cordis';
import {
  ShellExecutor,
  type ShellExecution,
  type ShellExecRequest,
  type ShellExecSpec,
  type ShellRunResult,
} from '@deepseek-ai/dsh-shell';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installTobCliShell } from '../src/tob/cli-shell.js';
import type { TobCliBrokerOptions } from '../src/tob/cli-broker.js';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
function execution(name = 'bash'): ToolExecution {
  return {
    name,
    arguments: { command: 'deepseekbot capabilities' },
    callId: 'test-shell',
    rootCallId: 'test-shell',
    token: Symbol(),
    signal: new AbortController().signal,
  } as ToolExecution;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture(eligible = true) {
  const ctx = new Context();
  const nativeCtx = new Context();
  const specs: ShellExecSpec[] = [];
  const pending = deferred();
  let status: 'running' | 'completed' | 'killed' = 'running';
  const output = (text = '') => ({ text, truncated: false });
  const native: ShellExecution = {
    get status() {
      return status;
    },
    get exitCode() {
      return status === 'completed' ? 0 : null;
    },
    signal: null,
    done: pending.promise,
    readOutput() {
      expect(this).toBe(native);
      return { delta: specs.at(-1)?.env?.['DEEPSEEKBOT_AGENT_TOKEN'] ?? 'ordinary', lossy: false };
    },
    observed: {
      stdout: {
        readFrom(offset) {
          return {
            text: specs.at(-1)?.env?.['DEEPSEEKBOT_AGENT_TOKEN'] ?? '',
            nextOffset: offset + 10,
            lossy: false,
          };
        },
      },
      stderr: {
        readFrom() {
          return { text: '', nextOffset: 0, lossy: false };
        },
      },
    },
    kill() {
      expect(this).toBe(native);
      status = 'killed';
      pending.resolve();
      return true;
    },
    async result(): Promise<ShellRunResult> {
      expect(this).toBe(native);
      await pending.promise;
      return {
        exitCode: 0,
        signal: null,
        aborted: false,
        timedOut: false,
        timeoutMs: 5000,
        stdout: output(specs.at(-1)?.env?.['DEEPSEEKBOT_AGENT_TOKEN']),
        stderr: output(),
      };
    },
  };
  class NativeShell extends ShellExecutor {
    override get sandboxMode() {
      return 'workspace-write' as const;
    }
    resolve(request: ShellExecRequest): ShellExecSpec {
      return {
        ...request,
        workdir: request.workdir ?? '/tmp',
        timeoutMs: 5000,
        onExpiry: 'kill',
        stdoutMaxBytes: 4096,
        sandboxPolicy: undefined,
      };
    }
    async execute(spec: ShellExecSpec) {
      specs.push(spec);
      return native;
    }
  }
  const shell = new NativeShell(nativeCtx);
  const directory = mkdtempSync(join(tmpdir(), 'tob-shell-test-'));
  const cliPath = join(directory, 'cli.mjs');
  writeFileSync(
    cliPath,
    `export async function runBotCreateCli(argv, io) { const response = await fetch(io.env.DEEPSEEKBOT_AGENT_ENDPOINT + '/invoke', {method:'POST',headers:{authorization:'Bearer '+io.env.DEEPSEEKBOT_AGENT_TOKEN,'content-type':'application/json'},body:JSON.stringify({command:argv[0],args:{}})}); io.stdout(await response.text()); return 0; }`,
  );
  const brokerOptions: TobCliBrokerOptions = {
    signal: new AbortController().signal,
    authorize() {},
    readSetting: () => ({ scope: 'global', value: 3, revision: 1 }),
    async writeSetting() {
      throw new Error('unexpected write');
    },
    async approve() {
      throw new Error('unexpected approval');
    },
  };
  const capture = vi.fn(() => (eligible ? brokerOptions : undefined));
  const wrapped = installTobCliShell(ctx, shell, { capture, cliPath });
  cleanup.push(async () => {
    await ctx.fiber.dispose();
    await nativeCtx.fiber.dispose();
    rmSync(directory, { recursive: true, force: true });
  });
  const run = (call: ToolExecution, callback: () => Promise<void>) =>
    ctx.waterfall('tools/execute', call, async () => {
      await callback();
      return { isError: false as const, value: null, content: [] };
    });
  return {
    ctx,
    shell,
    wrapped,
    specs,
    native,
    capture,
    run,
    finish() {
      status = 'completed';
      pending.resolve();
    },
  };
}
const requestBroker = (spec: ShellExecSpec) =>
  fetch(spec.env!['DEEPSEEKBOT_AGENT_ENDPOINT']! + '/invoke', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + spec.env!['DEEPSEEKBOT_AGENT_TOKEN'],
      'content-type': 'application/json',
    },
    body: JSON.stringify({ command: 'capabilities', args: {} }),
  });

describe('Tob native Shell scoped CLI leases', () => {
  it('does not change resolve, ordinary Agents, non-Shell tools or out-of-band execution', async () => {
    const f = fixture(false);
    const spec = f.wrapped.resolve({ command: 'pwd', workdir: '/chosen', stdin: 'input' });
    expect(spec).toEqual(f.shell.resolve({ command: 'pwd', workdir: '/chosen', stdin: 'input' }));
    expect(f.wrapped.sandboxMode).toBe('workspace-write');
    expect(await f.wrapped.execute(spec)).toBe(f.native);
    await f.run(execution(), async () => {
      expect(await f.wrapped.execute(spec)).toBe(f.native);
    });
    await f.run(execution('read'), async () => {
      expect(await f.wrapped.execute(spec)).toBe(f.native);
    });
    expect(f.capture).toHaveBeenCalledTimes(1);
    expect(f.specs).toEqual([spec, spec, spec]);
  });
  it('injects a temporary CLI shim with actual invocation context and closes before result delivery', async () => {
    const f = fixture();
    const call = execution();
    let supplied!: ShellExecSpec;
    let directory = '';
    await f.run(call, async () => {
      const spec = f.wrapped.resolve({
        command: 'deepseekbot capabilities',
        env: { KEEP: 'yes', DEEPSEEKBOT_HOST_TOKEN: 'human-private' },
      });
      const handle = await f.wrapped.execute(spec);
      supplied = f.specs[0]!;
      expect(f.capture).toHaveBeenCalledWith(call);
      expect(supplied.sandboxPolicy).toBe(spec.sandboxPolicy);
      expect(supplied.env?.['KEEP']).toBe('yes');
      expect(supplied.env?.['DEEPSEEKBOT_HOST_TOKEN']).toBe('');
      directory = supplied.env!['PATH']!.split(':')[0]!;
      expect(readFileSync(join(directory, 'deepseekbot'), 'utf8')).not.toContain(
        supplied.env!['DEEPSEEKBOT_AGENT_TOKEN'],
      );
      const child = await promisify(execFile)('/bin/sh', ['-c', spec.command], {
        env: { ...process.env, ...supplied.env },
      });
      expect(JSON.parse(child.stdout)).toMatchObject({
        ok: true,
        value: { commands: ['capabilities', 'settings', 'settings-set'] },
      });
      expect(handle.status).toBe('running');
      expect(handle.readOutput().delta).toBe('[redacted]');
      expect(handle.observed.stdout.readFrom(10)).toMatchObject({
        text: '[redacted]',
        nextOffset: 20,
      });
      f.finish();
      expect((await handle.result()).stdout.text).toBe('[redacted]');
      expect(handle.status).toBe('completed');
      expect(handle.exitCode).toBe(0);
      await expect(requestBroker(supplied)).rejects.toThrow();
    });
    await f.ctx.fiber.dispose();
    expect(existsSync(directory)).toBe(false);
  });
  it('uses separate leases for each Shell execution and revokes at tool completion even if still running', async () => {
    const f = fixture();
    await f.run(execution(), async () => {
      await f.wrapped.execute(f.wrapped.resolve({ command: 'first' }));
      await f.wrapped.execute(f.wrapped.resolve({ command: 'second' }));
      expect(f.specs[0]!.env!['DEEPSEEKBOT_AGENT_TOKEN']).not.toBe(
        f.specs[1]!.env!['DEEPSEEKBOT_AGENT_TOKEN'],
      );
      for (const spec of f.specs) expect((await requestBroker(spec)).status).toBe(200);
    });
    for (const spec of f.specs) await expect(requestBroker(spec)).rejects.toThrow();
  });
  it('revokes on caller abort and preserves native handle methods', async () => {
    const f = fixture();
    const abort = new AbortController();
    await f.run({ ...execution(), signal: abort.signal }, async () => {
      const handle = await f.wrapped.execute(f.wrapped.resolve({ command: 'pending' }));
      abort.abort();
      await vi.waitFor(async () => {
        await expect(requestBroker(f.specs[0]!)).rejects.toThrow();
      });
      expect(f.specs[0]!.signal?.aborted).toBe(true);
      expect(handle.kill()).toBe(true);
      await handle.done;
      expect(handle.status).toBe('killed');
    });
  });
  it('revokes active leases and aborts native work when the owning Fiber is disposed', async () => {
    const f = fixture();
    await f.run(execution(), async () => {
      const handle = await f.wrapped.execute(f.wrapped.resolve({ command: 'pending' }));
      expect((await requestBroker(f.specs[0]!)).status).toBe(200);
      await f.ctx.fiber.dispose();
      expect(f.specs[0]!.signal?.aborted).toBe(true);
      await expect(requestBroker(f.specs[0]!)).rejects.toThrow();
      handle.kill();
    });
  });

  it('closes the broker if native preparation throws', async () => {
    const f = fixture();
    let spec!: ShellExecSpec;
    vi.spyOn(f.shell, 'execute').mockImplementation(async (value) => {
      spec = value;
      throw new Error('preparation failed');
    });
    await expect(
      f.run(execution(), async () => {
        await f.wrapped.execute(f.wrapped.resolve({ command: 'fail' }));
      }),
    ).rejects.toThrow('preparation failed');
    await expect(requestBroker(spec)).rejects.toThrow();
  });
});
