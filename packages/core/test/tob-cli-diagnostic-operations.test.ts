import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { startTobCliBroker, type TobCliBroker } from '../src/tob/cli-broker.js';
import {
  createTobDiagnosticOperations,
  TOB_DIAGNOSTIC_CAPABILITIES,
} from '../src/tob/cli-diagnostic-operations.js';

const NOW = Date.UTC(2026, 10, 9, 12);
const brokers: TobCliBroker[] = [];
afterEach(async () => {
  await Promise.all(brokers.splice(0).map((broker) => broker.close()));
});

const entry = (code: string, ts: number) => ({
  id: ts,
  ts,
  fields: {},
  level: 'error',
  source: 'host',
  category: 'plugin',
  code,
});

async function scoped(options: { database?: boolean; updateRun?: unknown } = {}) {
  const list = vi.fn((query: { filter: string; since: number; limit: number }) =>
    options.database === false
      ? undefined
      : {
          version: 1,
          since: query.since,
          filter: query.filter,
          entries: [
            entry('plugin-load-failed detail', NOW - 60_000),
            entry('plugin-load-failed', NOW),
          ],
        },
  );
  const approve = vi.fn(async () => {});
  const broker = await startTobCliBroker({
    signal: new AbortController().signal,
    authorize: () => {},
    approve,
    readSetting: () => ({ scope: 'global', value: 8, revision: 1 }),
    writeSetting: vi.fn(),
    capabilities: [...TOB_DIAGNOSTIC_CAPABILITIES],
    prepareOperation: createTobDiagnosticOperations({
      list,
      updateRun: () => options.updateRun ?? null,
      environment: () => ({
        version: '1.7.0',
        dshVersion: '0.2.2',
        platform: 'darwin',
        arch: 'arm64',
        node: 'v22.0.0',
      }),
      now: () => NOW,
    }),
  });
  brokers.push(broker);
  const invoke = async (argv: string[]) => {
    const stdout: string[] = [];
    const code = await runBotCreateCli(argv, {
      env: {
        DEEPSEEKBOT_AGENT_ENDPOINT: broker.endpoint,
        DEEPSEEKBOT_AGENT_TOKEN: broker.token,
      },
      stdout: (text) => stdout.push(text),
      stderr: () => {},
      readStdin: async () => '',
    });
    return { code, json: JSON.parse(stdout.join('')) };
  };
  return { invoke, list, approve };
}

describe('Tob scoped diagnostics', () => {
  it('runs doctor from the Host without a Human Host token', async () => {
    const f = await scoped({
      updateRun: {
        kind: 'release',
        version: '1.7.0',
        phase: 'failed',
        failure: { reason: 'npm-failed' },
      },
    });
    const { code, json } = await f.invoke(['doctor']);
    expect(code).toBe(0);
    expect(json).toMatchObject({
      ok: true,
      source: 'host',
      versions: { tobs: '1.7.0', dsh: '0.2.2', node: 'v22.0.0' },
      next: ['diagnostic-logs --kind error --limit 100'],
    });
    const checks = Object.fromEntries(
      (json.checks as Array<{ id: string }>).map((check) => [check.id, check]),
    );
    expect(checks['plugin']).toMatchObject({ status: 'ok' });
    expect(checks['last-update']).toMatchObject({ status: 'warn', code: 'npm-failed' });
    expect(checks['errors-24h']).toMatchObject({
      status: 'warn',
      count: 2,
      top: [{ code: 'host.plugin:plugin-load-failed', count: 2 }],
    });
    expect(f.list).toHaveBeenCalledWith({ filter: 'error', since: NOW - 86_400_000, limit: 1000 });
    expect(json.guide.join(' ')).not.toContain('diagnostic-logs-export');
    expect(f.approve).not.toHaveBeenCalled();
  });

  it('reads the log with the same filters as the Human CLI and refuses local-only flags', async () => {
    const f = await scoped();
    const { code, json } = await f.invoke([
      'diagnostic-logs',
      '--kind',
      'error',
      '--since',
      '5',
      '--limit',
      '20',
    ]);
    expect(code).toBe(0);
    expect(json).toMatchObject({ source: 'host', filter: 'error' });
    expect(f.list).toHaveBeenCalledWith({ filter: 'error', since: 5, limit: 20 });
    expect((await f.invoke(['diagnostic-logs', '--offline'])).json.error.code).toBe(
      'agent-scope-denied',
    );
    expect((await f.invoke(['doctor', '--home', '/tmp'])).json.error.code).toBe(
      'agent-scope-denied',
    );
    expect((await f.invoke(['diagnostic-logs', '--kind', 'nope'])).json.error.code).toBe('usage');
    expect(f.approve).not.toHaveBeenCalled();
  });

  it('lists both commands in capabilities and reports a missing log', async () => {
    const f = await scoped({ database: false });
    const capabilities = (await f.invoke(['capabilities'])).json;
    expect(capabilities.commands).toEqual(expect.arrayContaining(['doctor', 'diagnostic-logs']));
    const doctor = (await f.invoke(['doctor'])).json;
    expect(doctor.ok).toBe(false);
    expect(doctor.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'log', status: 'fail', code: 'diagnostic-log-unavailable' }),
      ]),
    );
    expect((await f.invoke(['diagnostic-logs'])).json.error.code).toBe(
      'diagnostic-log-unavailable',
    );
  });
});
