import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTobCliBroker, type TobCliBroker } from '../src/tob/cli-broker.js';
import {
  classifyTobHostCli,
  createTobHostCliOperations,
  spawnHostCli,
  TOB_HOST_CLI_READS,
  type TobHostCliRunner,
} from '../src/tob/cli-host-commands.js';
import { TobError } from '../src/tob/service.js';

const brokers: TobCliBroker[] = [];
afterEach(async () => {
  await Promise.all(brokers.splice(0).map((broker) => broker.close()));
});

async function host(run: TobHostCliRunner, approve = vi.fn(async (_proposal: unknown) => {})) {
  const prepareOperation = createTobHostCliOperations({ run });
  const broker = await startTobCliBroker({
    signal: new AbortController().signal,
    authorize: () => {},
    approve,
    readSetting: () => ({ scope: 'global', value: 1, revision: 1 }),
    writeSetting: async () => ({ scope: 'global', value: 1, revision: 1 }),
    prepareOperation,
    capabilities: [],
  });
  brokers.push(broker);
  const invoke = async (args: object) => {
    const response = await fetch(broker.endpoint + '/invoke', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + broker.token, 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'cli', args }),
    });
    return (await response.json()) as Record<string, unknown>;
  };
  return { invoke, approve };
}

describe('Tob runs any Human CLI command on the Host', () => {
  it('treats only known reads as reads, and anything else or any --out as a write', () => {
    expect(classifyTobHostCli(['channels'])).toEqual({ command: 'channels', write: false });
    expect(classifyTobHostCli(['memory-save', 'tob'])).toEqual({
      command: 'memory-save',
      write: true,
    });
    expect(classifyTobHostCli(['some-future-command'])).toMatchObject({ write: true });
    expect(classifyTobHostCli(['browser-observation', 'tob', '--out', '/tmp/a.png'])).toMatchObject(
      { write: true },
    );
    expect(classifyTobHostCli(['memory-file', 'tob', '--out=/tmp/a'])).toMatchObject({
      write: true,
    });
    for (const command of TOB_HOST_CLI_READS)
      expect(command).not.toMatch(/-(set|create|delete|install|put|unset|revoke|save|import)$/u);
  });

  it('refuses a chosen Host target, Human credentials, local transports and malformed input', () => {
    for (const argv of [
      ['channels', '--host', 'http://127.0.0.1:1'],
      ['channels', '--token-file=/tmp/x'],
      ['list', '--home', '/tmp/profile'],
      ['ssh-tunnel'],
    ])
      expect(() => classifyTobHostCli(argv)).toThrow(
        expect.objectContaining({ code: 'cli-command-refused' }),
      );
    expect(() => classifyTobHostCli(['--compact'])).toThrow(
      expect.objectContaining({ code: 'invalid-request' }),
    );
    const prepare = createTobHostCliOperations({ run: vi.fn() });
    expect(prepare('other', {})).toBeUndefined();
    for (const args of [
      { argv: [] },
      { argv: [1] },
      { argv: ['channels'], cwd: 'relative' },
      { argv: ['channels'], extra: true },
    ])
      expect(() => prepare('cli', args)).toThrow(TobError);
  });

  it('runs a read at once without an approval card', async () => {
    const run = vi.fn<TobHostCliRunner>(async () => ({
      exitCode: 0,
      stdout: '{"channels":[]}\n',
    }));
    const f = await host(run);
    expect(await f.invoke({ argv: ['channels'], stdin: '' })).toEqual({
      ok: true,
      value: { channels: [] },
    });
    expect(f.approve).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ argv: ['channels'], stdin: '', cwd: undefined }),
    );
  });

  it('asks for approval with the exact command and only a hash of stdin before a write runs', async () => {
    const order: string[] = [];
    const run = vi.fn<TobHostCliRunner>(async () => {
      order.push('run');
      return { exitCode: 0, stdout: '{"secret":{"name":"API_KEY"}}' };
    });
    const approve = vi.fn(async (_proposal: unknown) => {
      order.push('approve');
    });
    const f = await host(run, approve);
    const cwd = tmpdir();
    expect(await f.invoke({ argv: ['secret-put', 'API_KEY'], stdin: 'hunter2', cwd })).toEqual({
      ok: true,
      value: { secret: { name: 'API_KEY' } },
    });
    expect(order).toEqual(['approve', 'run']);
    const proposal = approve.mock.calls[0]![0] as Record<string, unknown>;
    expect(proposal).toMatchObject({
      command: 'secret-put',
      via: 'cli',
      previousValue: null,
      patch: { argv: ['secret-put', 'API_KEY'], cwd, stdinBytes: 7 },
    });
    expect(JSON.stringify(proposal)).not.toContain('hunter2');
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ stdin: 'hunter2', cwd }));
  });

  it('never runs a write the Human rejects', async () => {
    const run = vi.fn<TobHostCliRunner>();
    const f = await host(
      run,
      vi.fn(async (_proposal: unknown) => {
        throw new TobError('approval-denied');
      }),
    );
    expect(await f.invoke({ argv: ['memory-save', 'tob'] })).toMatchObject({
      ok: false,
      error: { code: 'approval-denied' },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('passes the Human CLI refusal code and message back to Tob', async () => {
    const f = await host(async () => ({
      exitCode: 2,
      stdout: '{"error":{"code":"usage","message":"schedule-create needs --cron."}}',
    }));
    expect(await f.invoke({ argv: ['schedules'] })).toEqual({
      ok: false,
      error: { code: 'usage', message: 'schedule-create needs --cron.' },
    });
  });

  it('reports an interrupted write as uncertain rather than failed', async () => {
    const f = await host(async () => {
      throw new Error('spawn failed');
    });
    expect(await f.invoke({ argv: ['pause', 'helper'] })).toMatchObject({
      error: { code: 'operation-outcome-uncertain' },
    });
  });

  it('spawns the Human CLI against this Host without the parent scoped context, and redacts the token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tob-host-cli-'));
    const modulePath = join(dir, 'cli.mjs');
    writeFileSync(
      modulePath,
      `export async function runBotCreateCli(argv, io) {
        const stdin = await io.readStdin();
        io.stdout(JSON.stringify({ argv, stdin, cwd: process.cwd(), host: io.env.DEEPSEEKBOT_HOST,
          token: io.env.DEEPSEEKBOT_HOST_TOKEN, agent: io.env.DEEPSEEKBOT_AGENT_TOKEN ?? null }));
        return 0;
      }\n`,
    );
    process.env['DEEPSEEKBOT_AGENT_TOKEN'] = 'leaked';
    try {
      const run = spawnHostCli({
        modulePath: () => modulePath,
        host: () => ({ origin: 'http://127.0.0.1:9', token: 'launch-secret' }),
      });
      const result = await run({
        argv: ['channels', '--limit', '5'],
        stdin: 'in',
        cwd: dir,
        signal: undefined,
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        argv: ['channels', '--limit', '5'],
        stdin: 'in',
        cwd: expect.stringContaining('tob-host-cli-'),
        host: 'http://127.0.0.1:9',
        token: '[redacted]',
        agent: null,
      });
      await expect(
        spawnHostCli({ modulePath: () => modulePath, host: () => undefined })({
          argv: ['channels'],
          stdin: '',
          cwd: undefined,
          signal: undefined,
        }),
      ).rejects.toThrow(TobError);
    } finally {
      delete process.env['DEEPSEEKBOT_AGENT_TOKEN'];
    }
  });
});
