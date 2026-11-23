import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { requestListener } from './async-listener.js';
import { invoke as invokeOffline } from './bot-create-cli-fixture.js';
import { createTempRoot } from './helpers.js';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

async function host(handler: (method: string, args: Record<string, unknown>) => unknown) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  const server = createServer(
    requestListener(async (req, res) => {
      if (req.method === 'GET') {
        res.writeHead(302, { 'set-cookie': 'authority=signed', location: '/' }).end();
        return;
      }
      expect(req.headers.cookie).toBe('authority=signed');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const method = input.method.replace('botharness/', '');
      expect(req.url).toBe(`/api/${input.method}`);
      calls.push({ method, args: input.payload.args });
      res.end(
        JSON.stringify({
          type: 'server-response',
          result: handler(method, input.payload.args),
        }),
      );
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  return { calls, url: `http://127.0.0.1:${address.port}` };
}

async function invoke(argv: string[], url: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: {
      DEEPSEEKBOT_HOST: url,
      DEEPSEEKBOT_HOST_TOKEN: 'private-test-token',
    },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  });
  expect(stdout).toHaveLength(1);
  expect(stdout.join('') + stderr.join('')).not.toContain('private-test-token');
  return { code, value: JSON.parse(stdout[0]!) };
}

const schedule = {
  id: 'sched-1',
  title: 'Standup',
  prompt: 'Summarize',
  trigger: { kind: 'daily', time: '09:00', timeZone: 'Asia/Tokyo' },
  enabled: true,
  locked: false,
};

describe('online schedule commands', () => {
  it('lists a Bot schedules through scheduleList', async () => {
    const live = await host(() => ({
      ok: true,
      value: { schedules: [schedule] },
    }));
    const result = await invoke(['schedules', 'ada'], live.url);
    expect(result).toEqual({ code: 0, value: { schedules: [schedule] } });
    expect(live.calls).toEqual([{ method: 'scheduleList', args: { slug: 'ada' } }]);
  });

  it('creates a schedule with the same input the Web UI sends', async () => {
    const live = await host(() => ({ ok: true, value: { schedule } }));
    const result = await invoke(
      [
        'schedule-create',
        'ada',
        '--title',
        'Standup',
        '--prompt',
        'Summarize',
        '--daily',
        '09:00',
        '--timezone',
        'Asia/Tokyo',
        '--locked',
      ],
      live.url,
    );
    expect(result).toEqual({ code: 0, value: { schedule } });
    expect(live.calls).toEqual([
      {
        method: 'scheduleCreate',
        args: {
          slug: 'ada',
          input: {
            title: 'Standup',
            prompt: 'Summarize',
            trigger: { kind: 'daily', time: '09:00', timeZone: 'Asia/Tokyo' },
            locked: true,
          },
        },
      },
    ]);
  });

  it('passes the Host validation error through with a non-zero exit', async () => {
    const live = await host(() => ({
      ok: false,
      error: {
        code: 'invalid-input',
        message: 'A valid IANA time_zone is required',
      },
    }));
    const result = await invoke(
      [
        'schedule-create',
        'ada',
        '--title',
        'T',
        '--prompt',
        'P',
        '--daily',
        '09:00',
        '--timezone',
        'Mars/Olympus',
      ],
      live.url,
    );
    expect(result).toEqual({
      code: 1,
      value: {
        error: {
          code: 'invalid-input',
          message: 'A valid IANA time_zone is required',
        },
      },
    });
  });

  it('refuses a create without a trigger before calling the Host', async () => {
    const live = await host(() => ({ ok: true, value: {} }));
    const result = await invoke(
      ['schedule-create', 'ada', '--title', 'T', '--prompt', 'P'],
      live.url,
    );
    expect(result.code).toBe(2);
    expect(result.value.error.code).toBe('usage');
    expect(live.calls).toEqual([]);
  });

  it('updates only the changed fields', async () => {
    const live = await host(() => ({ ok: true, value: { schedule } }));
    const result = await invoke(
      ['schedule-update', 'ada', '--sid', 'sched-1', '--every', '600', '--disabled'],
      live.url,
    );
    expect(result.code).toBe(0);
    expect(live.calls).toEqual([
      {
        method: 'scheduleUpdate',
        args: {
          slug: 'ada',
          id: 'sched-1',
          change: {
            trigger: { kind: 'every', everySeconds: 600 },
            enabled: false,
          },
        },
      },
    ]);
  });

  it('refuses an update with no change flag', async () => {
    const live = await host(() => ({ ok: true, value: {} }));
    const result = await invoke(['schedule-update', 'ada', '--sid', 'sched-1'], live.url);
    expect(result.value.error.code).toBe('usage');
    expect(live.calls).toEqual([]);
  });

  it('requires --confirm to delete and then deletes through scheduleDelete', async () => {
    const live = await host(() => ({ ok: true, value: { removed: true } }));
    const refused = await invoke(['schedule-delete', 'ada', '--sid', 'sched-1'], live.url);
    expect(refused.code).toBe(2);
    expect(refused.value.error.code).toBe('usage');
    expect(live.calls).toEqual([]);
    const deleted = await invoke(
      ['schedule-delete', 'ada', '--sid', 'sched-1', '--confirm'],
      live.url,
    );
    expect(deleted).toEqual({ code: 0, value: { removed: true } });
    expect(live.calls).toEqual([
      { method: 'scheduleDelete', args: { slug: 'ada', id: 'sched-1' } },
    ]);
  });

  it('reads history and runs a schedule now', async () => {
    const firing = { id: 'f-1', scheduleId: 'sched-1', state: 'pending' };
    const live = await host((method) =>
      method === 'scheduleHistory'
        ? { ok: true, value: { firings: [firing] } }
        : { ok: true, value: { firing } },
    );
    expect((await invoke(['schedule-history', 'ada', '--sid', 'sched-1'], live.url)).value).toEqual(
      { firings: [firing] },
    );
    expect((await invoke(['schedule-run-now', 'ada', '--sid', 'sched-1'], live.url)).value).toEqual(
      { firing },
    );
    expect(live.calls).toEqual([
      { method: 'scheduleHistory', args: { slug: 'ada', id: 'sched-1' } },
      { method: 'scheduleRunNow', args: { slug: 'ada', id: 'sched-1' } },
    ]);
  });

  it('passes an unknown schedule refusal through', async () => {
    const live = await host(() => ({
      ok: false,
      error: { code: 'not-found', message: 'Bot Schedule nope not found' },
    }));
    const result = await invoke(['schedule-run-now', 'ada', '--sid', 'nope'], live.url);
    expect(result).toEqual({
      code: 1,
      value: {
        error: { code: 'not-found', message: 'Bot Schedule nope not found' },
      },
    });
  });

  it('previews a trigger on the Host', async () => {
    const occurrences = ['2026-10-15T00:00:00.000Z'];
    const live = await host(() => ({ ok: true, value: { occurrences } }));
    const result = await invoke(
      ['schedule-preview', '--cron', '0 9 * * *', '--timezone', 'Asia/Tokyo'],
      live.url,
    );
    const trigger = {
      kind: 'cron',
      expression: '0 9 * * *',
      timeZone: 'Asia/Tokyo',
    };
    expect(result).toEqual({ code: 0, value: { trigger, occurrences } });
    expect(live.calls).toEqual([{ method: 'schedulePreview', args: { trigger } }]);
  });

  it('sends the operation key on create and passes a reconciled result through', async () => {
    const live = await host(() => ({ ok: true, value: { schedule, reconciled: true } }));
    const argv = [
      'schedule-create',
      'ada',
      '--title',
      'Standup',
      '--prompt',
      'Summarize',
      '--every',
      '3600',
      '--operation-key',
      'tob-op-0001',
    ];
    const result = await invoke(argv, live.url);
    expect(result).toEqual({ code: 0, value: { schedule, reconciled: true } });
    expect(live.calls[0]).toEqual({
      method: 'scheduleCreate',
      args: {
        slug: 'ada',
        input: {
          title: 'Standup',
          prompt: 'Summarize',
          trigger: { kind: 'every', everySeconds: 3600 },
        },
        operationKey: 'tob-op-0001',
      },
    });
    const malformed = await invoke([...argv.slice(0, -1), 'bad key'], live.url);
    expect(malformed.value.error.code).toBe('usage');
    expect(live.calls).toHaveLength(1);
  });

  it('sends the expected revision on update and delete and refuses it elsewhere', async () => {
    const live = await host((method) =>
      method === 'scheduleDelete'
        ? { ok: false, error: { code: 'stale-revision', message: 'changed' } }
        : { ok: true, value: { schedule } },
    );
    await invoke(
      ['schedule-update', 'ada', '--sid', 'sched-1', '--title', 'T', '--expected-revision', 'r1'],
      live.url,
    );
    const stale = await invoke(
      ['schedule-delete', 'ada', '--sid', 'sched-1', '--confirm', '--expected-revision', 'r1'],
      live.url,
    );
    expect(stale).toEqual({
      code: 1,
      value: { error: { code: 'stale-revision', message: 'changed' } },
    });
    const misplaced = await invoke(
      ['schedule-run-now', 'ada', '--sid', 'sched-1', '--expected-revision', 'r1'],
      live.url,
    );
    expect(misplaced.value.error.code).toBe('usage');
    expect(live.calls).toEqual([
      {
        method: 'scheduleUpdate',
        args: { slug: 'ada', id: 'sched-1', change: { title: 'T' }, expectedRevision: 'r1' },
      },
      {
        method: 'scheduleDelete',
        args: { slug: 'ada', id: 'sched-1', expectedRevision: 'r1' },
      },
    ]);
  });

  it('refuses --home together with an online Host', async () => {
    const live = await host(() => ({ ok: true, value: {} }));
    const result = await invoke(['schedules', 'ada', '--home', '/tmp/x'], live.url);
    expect(result.value.error.code).toBe('usage');
    expect(live.calls).toEqual([]);
  });
});

describe('offline schedule operation keys and revisions', () => {
  it('reconciles a repeated keyed create and refuses a stale revision', async () => {
    const home = createTempRoot('botharness-cli-schedule-keys-');
    const bot = await invokeOffline(['create', '--name', 'Ada'], home);
    const id = bot.json.bot.id as string;
    const argv = [
      'schedule-create',
      id,
      '--title',
      'Ping',
      '--prompt',
      'Say hi',
      '--every',
      '3600',
      '--operation-key',
      'human-op-0001',
    ];
    const created = await invokeOffline(argv, home);
    const retried = await invokeOffline(argv, home);
    expect(created.json.reconciled).toBeUndefined();
    expect(retried.json).toMatchObject({
      reconciled: true,
      schedule: { id: created.json.schedule.id },
    });
    const listed = await invokeOffline(['schedules', id], home);
    expect(listed.json.schedules).toHaveLength(1);
    const revision = listed.json.schedules[0].revision as string;
    expect(revision).toBe(created.json.schedule.revision);
    const sid = created.json.schedule.id as string;
    const updated = await invokeOffline(
      ['schedule-update', id, '--sid', sid, '--title', 'Pong', '--expected-revision', revision],
      home,
    );
    expect(updated.code).toBe(0);
    const stale = await invokeOffline(
      ['schedule-delete', id, '--sid', sid, '--confirm', '--expected-revision', revision],
      home,
    );
    expect(stale.code).toBe(1);
    expect(stale.json.error.code).toBe('stale-revision');
    const deleted = await invokeOffline(
      [
        'schedule-delete',
        id,
        '--sid',
        sid,
        '--confirm',
        '--expected-revision',
        updated.json.schedule.revision,
      ],
      home,
    );
    expect(deleted.json.removed).toBe(true);
    const consumed = await invokeOffline(argv, home);
    expect(consumed.json.error.code).toBe('operation-key-consumed');
  });
});
