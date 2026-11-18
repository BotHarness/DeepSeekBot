import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { requestListener } from './async-listener.js';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
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

async function host(
  handler: (method: string, args: Record<string, unknown>) => unknown,
  stallBody = false,
) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  let logins = 0;
  const server = createServer(
    requestListener(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'GET') {
        logins += 1;
        if (
          new URL(req.url!, 'http://localhost').searchParams.get('token') !== 'private-test-token'
        ) {
          res.writeHead(403).end();
          return;
        }
        if (logins % 2 === 0) res.setHeader('set-cookie', 'authority=signed; HttpOnly');
        res.writeHead(302, { location: '/' }).end();
        return;
      }
      expect(req.headers.cookie).toBe('authority=signed');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      expect(body.type).toBe('client-request');
      expect(req.url).toBe(`/api/${body.method}`);
      const method = body.method.replace('botharness/', '');
      calls.push({ method, args: body.payload.args });
      res.setHeader('content-type', 'application/json');
      if (stallBody) {
        res.write('{');
        return;
      }
      res.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: body.rpcId,
          result:
            method === 'channelDm'
              ? { ok: true, value: { channel: { id: 'dm-' + String(body.payload.args.slug) } } }
              : handler(method, body.payload.args),
        }),
      );
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function invoke(argv: string[], url?: string, stdin = '', token = 'private-test-token') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: token },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => stdin,
  });
  expect(stdout).toHaveLength(1);
  const out = stdout.join('');
  expect(out + stderr.join('')).not.toContain('private-test-token');
  return { code, text: out, json: JSON.parse(out) };
}
const route = (model: string, reasoningEffort?: string) => ({
  provider: 'deepseek',
  model,
  ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
});
const option = {
  provider: 'deepseek',
  model: 'chat',
  allowedEfforts: ['low'],
  defaultEffort: 'low',
};

const noGroups = {
  orchestratorGroupId: null,
  assignmentGroups: [],
  assignmentDefaultGroupId: null,
};

describe('Model commands', () => {
  it('reads the model catalog from the live Host', async () => {
    const live = await host(() => ({
      ok: true,
      value: { models: [], default: route('chat') },
    }));
    expect((await invoke(['model-catalog'], live.url)).json).toEqual({
      models: [],
      default: route('chat'),
    });
    expect((await invoke(['model-catalog', 'extra'], live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([{ method: 'modelCatalog', args: {} }]);
  });

  it('stars and unstars a model, a Model Route Group or a Model Preset for the signed-in Human', async () => {
    const live = await host(() => ({ ok: true, value: { favorites: [] } }));
    expect((await invoke(['model-favorite-add', 'deepseek/v4-pro'], live.url)).json).toEqual({
      favorites: [],
    });
    await invoke(['model-favorite-remove', 'group:daily'], live.url);
    await invoke(['model-favorite-add', 'preset:p1'], live.url);
    expect((await invoke(['model-favorite-add', 'v4-pro'], live.url)).json.error.code).toBe(
      'usage',
    );
    expect((await invoke(['model-favorite-add', 'preset: '], live.url)).json.error.code).toBe(
      'usage',
    );
    expect(live.calls).toEqual([
      {
        method: 'modelFavoriteSet',
        args: { choice: { kind: 'model', provider: 'deepseek', model: 'v4-pro' }, favorite: true },
      },
      {
        method: 'modelFavoriteSet',
        args: { choice: { kind: 'group', id: 'daily' }, favorite: false },
      },
      {
        method: 'modelFavoriteSet',
        args: { choice: { kind: 'preset', id: 'p1' }, favorite: true },
      },
    ]);
  });

  it('sets a whole plan or its Assignment part from stdin against the current revision', async () => {
    const live = await host((method) =>
      method === 'modelPlan'
        ? { ok: true, value: { revision: 4 } }
        : { ok: true, value: { plan: { revision: 5 } } },
    );
    const plan = {
      orchestrator: route('reasoner', 'high'),
      assignmentDefault: route('chat', 'low'),
      assignmentModels: [option],
    };
    expect(
      (await invoke(['model-plan-set', 'ada', '--plan-stdin'], live.url, JSON.stringify(plan)))
        .json,
    ).toEqual({ plan: { revision: 5 } });
    const { orchestrator: _, ...assignments } = plan;
    await invoke(
      ['model-plan-assignments-set', 'ada', '--plan-stdin', '--expected-revision', '7'],
      live.url,
      JSON.stringify(assignments),
    );
    expect(live.calls).toEqual([
      { method: 'modelPlan', args: { slug: 'ada' } },
      {
        method: 'modelPlanSet',
        args: { slug: 'ada', expectedRevision: 4, ...plan },
      },
      {
        method: 'modelPlanAssignmentsSet',
        args: { slug: 'ada', expectedRevision: 7, ...assignments },
      },
    ]);
    for (const [argv, stdin] of [
      [['model-plan-set', 'ada'], JSON.stringify(plan)],
      [['model-plan-set', 'ada', '--plan-stdin'], 'not json'],
      [['model-plan-set', 'ada', '--plan-stdin'], JSON.stringify(assignments)],
      [['model-plan-assignments-set', 'ada', '--plan-stdin'], JSON.stringify(plan)],
      [
        ['model-plan-set', 'ada', '--plan-stdin', '--expected-revision', '-1'],
        JSON.stringify(plan),
      ],
      [['model-plan-set', '--plan-stdin'], JSON.stringify(plan)],
    ] as const)
      expect((await invoke([...argv], live.url, stdin)).json.error.code).toBe('usage');
    expect(live.calls).toHaveLength(3);
    const { orchestrator: _route, ...rest } = plan;
    const grouped = { ...rest, orchestratorGroupId: 'main', assignmentGroups: ['side'] };
    await invoke(
      ['model-plan-set', 'ada', '--plan-stdin', '--expected-revision', '5'],
      live.url,
      JSON.stringify(grouped),
    );
    expect(live.calls.at(-1)).toEqual({
      method: 'modelPlanSet',
      args: { slug: 'ada', expectedRevision: 5, ...grouped },
    });
    expect(
      (
        await invoke(
          ['model-plan-set', 'ada', '--plan-stdin'],
          live.url,
          JSON.stringify({ ...plan, orchestratorGroupId: 'main' }),
        )
      ).json.error.code,
    ).toBe('usage');
    const plain = { ...plan, orchestratorGroupId: null };
    await invoke(
      ['model-plan-set', 'ada', '--plan-stdin', '--expected-revision', '5'],
      live.url,
      JSON.stringify(plain),
    );
    expect(live.calls.at(-1)).toEqual({
      method: 'modelPlanSet',
      args: { slug: 'ada', expectedRevision: 5, ...plan },
    });
    await invoke(
      ['model-plan-set', 'ada', '--plan-stdin', '--expected-revision', '5'],
      live.url,
      JSON.stringify({ ...grouped, orchestrator: null }),
    );
    expect(live.calls.at(-1)).toEqual({
      method: 'modelPlanSet',
      args: { slug: 'ada', expectedRevision: 5, ...grouped },
    });
  });

  it('opens or keeps listed Assignment models with --assignment-models', async () => {
    const live = await host(() => ({ ok: true, value: { plan: { revision: 5 } } }));
    const assignments = { assignmentDefault: route('chat', 'low'), assignmentModels: [option] };
    await invoke(
      [
        'model-plan-assignments-set',
        'ada',
        '--plan-stdin',
        '--expected-revision',
        '4',
        '--assignment-models',
        'open',
      ],
      live.url,
      JSON.stringify(assignments),
    );
    await invoke(
      [
        'model-plan-assignments-set',
        'ada',
        '--plan-stdin',
        '--expected-revision',
        '5',
        '--assignment-models',
        'listed',
      ],
      live.url,
      JSON.stringify(assignments),
    );
    expect(
      (
        await invoke(
          [
            'model-plan-assignments-set',
            'ada',
            '--plan-stdin',
            '--expected-revision',
            '5',
            '--assignment-models',
            'any',
          ],
          live.url,
          JSON.stringify(assignments),
        )
      ).json.error.code,
    ).toBe('usage');
    expect(live.calls).toEqual([
      {
        method: 'modelPlanAssignmentsSet',
        args: { slug: 'ada', expectedRevision: 4, ...assignments, openAssignmentModels: true },
      },
      {
        method: 'modelPlanAssignmentsSet',
        args: { slug: 'ada', expectedRevision: 5, ...assignments, openAssignmentModels: false },
      },
    ]);
  });

  it('keeps the Host refusal code when a plan changed meanwhile', async () => {
    const live = await host(() => ({
      ok: false,
      error: {
        code: 'invalid-input',
        message: 'Bot Model Plan changed; reopen Profile before saving',
      },
    }));
    const refused = await invoke(
      ['model-plan-inherit', 'ada', '--expected-revision', '2'],
      live.url,
    );
    expect(refused.code).not.toBe(0);
    expect(refused.json.error.code).toBe('invalid-input');
    expect(live.calls).toEqual([
      {
        method: 'modelPlanInherit',
        args: { slug: 'ada', expectedRevision: 2 },
      },
    ]);
  });

  it('customizes the Orchestrator and inherits the Profile default', async () => {
    const live = await host((method) =>
      method === 'modelPlan'
        ? { ok: true, value: { revision: 3 } }
        : { ok: true, value: { revision: 4 } },
    );
    await invoke(
      [
        'model-plan-customize',
        'ada',
        '--orchestrator-provider',
        'deepseek',
        '--orchestrator-model',
        'reasoner',
        '--orchestrator-effort',
        'high',
      ],
      live.url,
    );
    await invoke(['model-plan-inherit', 'ada'], live.url);
    expect(
      (await invoke(['model-plan-customize', 'ada', '--orchestrator-model', 'x'], live.url)).json
        .error.code,
    ).toBe('usage');
    expect(live.calls).toEqual([
      { method: 'modelPlan', args: { slug: 'ada' } },
      {
        method: 'modelPlanCustomize',
        args: { slug: 'ada', orchestrator: route('reasoner', 'high'), expectedRevision: 3 },
      },
      { method: 'modelPlan', args: { slug: 'ada' } },
      {
        method: 'modelPlanInherit',
        args: { slug: 'ada', expectedRevision: 3 },
      },
    ]);
  });

  it('creates a complete preset through the online command without discarding Assignment choices', async () => {
    const live = await host((_method, args) => ({
      ok: true,
      value: { preset: { id: 'p', ...args } },
    }));
    const choices = [
      {
        provider: 'deepseek',
        model: 'flash',
        allowedEfforts: ['', 'high'],
        defaultEffort: '',
        note: 'Keep this note',
      },
    ];
    const result = await invoke(
      [
        'model-preset-create',
        '--name',
        'Daily',
        '--orchestrator-provider',
        'deepseek',
        '--orchestrator-model',
        'reasoner',
        '--assignment-provider',
        'deepseek',
        '--assignment-model',
        'flash',
        '--plan-stdin',
      ],
      live.url,
      JSON.stringify({ assignmentModels: choices }),
    );
    expect(result.code).toBe(0);
    expect(live.calls).toEqual([
      {
        method: 'modelPresetCreate',
        args: {
          name: 'Daily',
          orchestrator: { provider: 'deepseek', model: 'reasoner' },
          assignmentDefault: { provider: 'deepseek', model: 'flash' },
          assignmentModels: choices,
        },
      },
    ]);
  });

  it('updates a preset over its current values and revision', async () => {
    const preset = {
      id: 'p1',
      name: 'Daily',
      revision: 2,
      orchestrator: route('reasoner', 'high'),
      assignmentDefault: route('chat', 'low'),
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    const live = await host((method, args) =>
      method === 'modelPresets'
        ? { ok: true, value: { presets: [preset] } }
        : { ok: true, value: { preset: { ...preset, ...args, revision: 3 } } },
    );
    expect(
      (
        await invoke(
          ['model-preset-update', 'p1', '--name', 'Nightly', '--orchestrator-effort', 'max'],
          live.url,
        )
      ).json.preset.name,
    ).toBe('Nightly');
    await invoke(
      ['model-preset-update', 'p1', '--assignment-model', 'flash', '--plan-stdin'],
      live.url,
      JSON.stringify({ assignmentModels: [option] }),
    );
    expect((await invoke(['model-preset-update', 'missing'], live.url)).json.error.code).toBe(
      'unknown-preset',
    );
    expect(
      (await invoke(['model-preset-update', 'p1', '--name', ' '], live.url)).json.error.code,
    ).toBe('usage');
    expect(live.calls.filter((call) => call.method === 'modelPresetUpdate')).toEqual([
      {
        method: 'modelPresetUpdate',
        args: {
          id: 'p1',
          expectedRevision: 2,
          name: 'Nightly',
          orchestrator: route('reasoner', 'max'),
          assignmentDefault: route('chat', 'low'),
          ...noGroups,
        },
      },
      {
        method: 'modelPresetUpdate',
        args: {
          id: 'p1',
          expectedRevision: 2,
          name: 'Daily',
          orchestrator: route('reasoner', 'high'),
          assignmentDefault: route('flash'),
          assignmentModels: [option],
          ...noGroups,
        },
      },
    ]);
  });

  it('keeps the Routing Groups of a preset, replaces only the ones named, and clears with an empty value', async () => {
    const preset = {
      id: 'p1',
      name: 'Grouped',
      revision: 4,
      orchestrator: route('reasoner', 'high'),
      orchestratorGroupId: 'main',
      assignmentDefault: route('chat', 'low'),
      assignmentGroups: ['side'],
      assignmentDefaultGroupId: 'side',
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    const live = await host((method, args) =>
      method === 'modelPresets'
        ? { ok: true, value: { presets: [preset] } }
        : { ok: true, value: { preset: { ...preset, ...args, revision: 5 } } },
    );
    await invoke(['model-preset-update', 'p1', '--name', 'Renamed'], live.url);
    await invoke(['model-preset-update', 'p1', '--assignment-groups', 'side,extra'], live.url);
    await invoke(['model-preset-update', 'p1', '--orchestrator-model', 'chat'], live.url);
    const calls = live.calls
      .filter((call) => call.method === 'modelPresetUpdate')
      .map((call) => call.args);
    expect(calls[0]).toMatchObject({
      name: 'Renamed',
      orchestratorGroupId: 'main',
      assignmentGroups: ['side'],
      assignmentDefaultGroupId: 'side',
    });
    expect(calls[0]).not.toHaveProperty('orchestrator');
    expect(calls[1]).toMatchObject({
      orchestratorGroupId: 'main',
      assignmentGroups: ['side', 'extra'],
      assignmentDefaultGroupId: 'side',
    });
    expect(calls[2]).toMatchObject({
      orchestratorGroupId: null,
      orchestrator: route('chat'),
    });
  });
});

describe('Routing Group commands', () => {
  const go = { kind: 'model', provider: 'opencode-go', model: 'flash' };
  const deepseek = { kind: 'model', provider: 'deepseek', model: 'flash' };
  const group = { id: 'g1', name: 'Flash', revision: 2, mode: 'order', members: [go] };

  it('lists, reads, creates, updates and deletes groups at the read revision', async () => {
    const live = await host((method) =>
      method === 'modelGroups'
        ? { ok: true, value: { groups: [group] } }
        : { ok: true, value: { group } },
    );
    expect((await invoke(['model-groups'], live.url)).json).toEqual({ groups: [group] });
    await invoke(['model-group', 'g1'], live.url);
    const members = JSON.stringify({ members: [go, deepseek] });
    await invoke(['model-group-create', '--name', 'Flash', '--members-stdin'], live.url, members);
    await invoke(['model-group-update', 'g1', '--members-stdin'], live.url, members);
    await invoke(
      ['model-group-update', 'g1', '--name', 'Fast', '--expected-revision', '9'],
      live.url,
    );
    await invoke(['model-group-delete', 'g1'], live.url);
    expect(live.calls).toEqual([
      { method: 'modelGroups', args: {} },
      { method: 'modelGroup', args: { id: 'g1' } },
      { method: 'modelGroupCreate', args: { name: 'Flash', members: [go, deepseek] } },
      { method: 'modelGroup', args: { id: 'g1' } },
      {
        method: 'modelGroupUpdate',
        args: { id: 'g1', expectedRevision: 2, name: 'Flash', members: [go, deepseek] },
      },
      { method: 'modelGroup', args: { id: 'g1' } },
      {
        method: 'modelGroupUpdate',
        args: { id: 'g1', expectedRevision: 9, name: 'Fast', members: [go] },
      },
      { method: 'modelGroup', args: { id: 'g1' } },
      { method: 'modelGroupDelete', args: { id: 'g1', expectedRevision: 2 } },
    ]);
  });

  it('refuses malformed input before calling the Host and passes Host refusals through', async () => {
    const live = await host(() => ({
      ok: false,
      error: { code: 'routing-group-in-use', message: 'Routing Group Flash is used by Bot Ada' },
    }));
    for (const [argv, stdin] of [
      [['model-group-create', '--members-stdin'], '{"members":[]}'],
      [['model-group-create', '--name', 'Flash'], ''],
      [['model-group-create', '--name', 'Flash', '--members-stdin'], '[]'],
      [['model-group-update', 'g1'], ''],
      [['model-group'], ''],
      [
        ['model-plan-customize', 'ada', '--orchestrator-group', 'g1', '--orchestrator-model', 'x'],
        '',
      ],
    ] as const)
      expect((await invoke([...argv], live.url, stdin)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([]);
    const refused = await invoke(
      ['model-group-delete', 'g1', '--expected-revision', '2'],
      live.url,
    );
    expect(refused.code).not.toBe(0);
    expect(refused.json.error).toMatchObject({ code: 'routing-group-in-use' });
  });

  it('chooses a group as the Orchestrator through model-plan-customize', async () => {
    const live = await host((method) =>
      method === 'modelPlan'
        ? { ok: true, value: { revision: 3 } }
        : { ok: true, value: { plan: { revision: 4, orchestratorGroupId: 'g1' } } },
    );
    expect(
      (await invoke(['model-plan-customize', 'ada', '--orchestrator-group', 'g1'], live.url)).json,
    ).toEqual({ plan: { revision: 4, orchestratorGroupId: 'g1' } });
    expect(live.calls).toEqual([
      { method: 'modelPlan', args: { slug: 'ada' } },
      {
        method: 'modelPlanCustomize',
        args: { slug: 'ada', expectedRevision: 3, orchestratorGroupId: 'g1' },
      },
    ]);
  });
});

describe('Usage and activity commands', () => {
  it('reads Overview usage and Memory activity with optional cursors', async () => {
    const live = await host((method) => ({ ok: true, value: { method } }));
    expect((await invoke(['overview-usage'], live.url)).json).toEqual({
      method: 'overviewUsage',
    });
    await invoke(['overview-usage', '--period', 'week', '--after', 'ada'], live.url);
    await invoke(['overview-usage', '--period', 'month'], live.url);
    await invoke(['overview-usage', '--period', 'quarter'], live.url);
    await invoke(['overview-memory'], live.url);
    await invoke(['overview-memory', '--after', 'ada'], live.url);
    await invoke(['activity-overview'], live.url);
    await invoke(['channel-activity-today'], live.url);
    for (const argv of [
      ['overview-usage', '--period', 'year'],
      ['overview-memory', '--after', ''],
      ['activity-overview', 'ada'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([
      { method: 'overviewUsage', args: { period: 'today' } },
      { method: 'overviewUsage', args: { period: 'week', after: 'ada' } },
      { method: 'overviewUsage', args: { period: 'month' } },
      { method: 'overviewUsage', args: { period: 'quarter' } },
      { method: 'overviewMemory', args: {} },
      { method: 'overviewMemory', args: { after: 'ada' } },
      { method: 'activityOverview', args: {} },
      { method: 'channelActivityToday', args: {} },
    ]);
  });

  it("reads a Bot's usage and activity through its DM Channel", async () => {
    const live = await host((method) => ({ ok: true, value: { method } }));
    await invoke(
      [
        'bot-usage',
        'ada',
        '--start',
        '2026-10-01',
        '--end',
        '2026-10-14',
        '--purpose',
        'assignment',
        '--model',
        'chat',
      ],
      live.url,
    );
    await invoke(['bot-session-usage', 'ada'], live.url);
    await invoke(
      ['bot-activity-history', 'ada', '--before', '2026-10-14', '--weeks', '4'],
      live.url,
    );
    await invoke(['group-activity', 'group-1'], live.url);
    for (const argv of [
      ['bot-usage', 'ada', '--start', '2026-10-01'],
      ['bot-usage', 'ada', '--start', '2026-10-01', '--end', '14/10/2026'],
      ['bot-activity-history', 'ada', '--weeks', '105'],
      ['group-activity'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([
      { method: 'channelDm', args: { slug: 'ada' } },
      {
        method: 'profileUsage',
        args: {
          channelId: 'dm-ada',
          filter: {
            start: '2026-10-01',
            end: '2026-10-14',
            model: 'chat',
            purpose: 'assignment',
          },
        },
      },
      { method: 'channelDm', args: { slug: 'ada' } },
      { method: 'profileSessionUsage', args: { channelId: 'dm-ada' } },
      { method: 'channelDm', args: { slug: 'ada' } },
      {
        method: 'profileActivity',
        args: { channelId: 'dm-ada', before: '2026-10-14', weeks: 4 },
      },
      { method: 'groupProfileActivity', args: { channelId: 'group-1' } },
    ]);
  });
});

it('configures the Home native default with its actual revision and reasoning effort', async () => {
  const live = await host((method) => ({
    ok: true,
    value: method === 'modelCatalog' ? { defaultRevision: 7 } : { revision: 8 },
  }));
  const result = await invoke(
    [
      'home-model-set',
      '--provider',
      'deepseek',
      '--model',
      'test-model',
      '--orchestrator-effort',
      'high',
    ],
    live.url,
  );
  expect(result.code).toBe(0);
  expect(live.calls).toEqual([
    { method: 'modelCatalog', args: {} },
    {
      method: 'onboardingModel',
      args: {
        expectedRevision: 0,
        expectedDefaultRevision: 7,
        route: { provider: 'deepseek', model: 'test-model', reasoningEffort: 'high' },
        globalDefault: true,
      },
    },
  ]);
  expect((await invoke(['home-model-set'], live.url)).json.error.code).toBe('usage');
  expect(
    (await invoke(['home-model-set', '--group', 'daily', '--provider', ''], live.url)).json.error
      .code,
  ).toBe('usage');
});
it('forwards explicit native default and preset target revisions', async () => {
  const live = await host(() => ({ ok: true, value: { revision: 9 } }));
  expect(
    (
      await invoke(
        ['home-model-set', '--provider', 'deepseek', '--model', 'test', '--expected-revision', '8'],
        live.url,
      )
    ).code,
  ).toBe(0);
  expect(live.calls[0]).toMatchObject({
    method: 'onboardingModel',
    args: { expectedDefaultRevision: 8 },
  });
  expect(
    (
      await invoke(
        [
          'model-preset-apply',
          'one',
          '--preset',
          'preset-1',
          '--expected-revision',
          '2',
          '--preset-revision',
          '4',
        ],
        live.url,
      )
    ).code,
  ).toBe(0);
  expect(live.calls[1]).toEqual({
    method: 'modelPresetApply',
    args: { slug: 'one', presetId: 'preset-1', expectedRevision: 2, expectedPresetRevision: 4 },
  });
  expect(
    (
      await invoke(
        ['model-preset-apply', 'one', '--preset', 'preset-1', '--preset-revision', '-1'],
        live.url,
      )
    ).json.error.code,
  ).toBe('usage');
});
