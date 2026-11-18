import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { requestListener } from './async-listener.js';

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

  it('refuses --home together with an online Host', async () => {
    const live = await host(() => ({ ok: true, value: {} }));
    const result = await invoke(['schedules', 'ada', '--home', '/tmp/x'], live.url);
    expect(result.value.error.code).toBe('usage');
    expect(live.calls).toEqual([]);
  });
});
