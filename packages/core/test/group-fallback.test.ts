import { describe, expect, it } from 'vitest';

import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createGroupFallback } from '../src/models/group-fallback.js';
import type { ModelRoute, PersonaBotModelPlan } from '../src/models/presets.js';
import { createRouteRests } from '../src/models/route-rest.js';
import { createCore } from '../src/plugin.js';
import {
  createBotRequestRetry,
  type RequestErrorPayload,
} from '../src/runtime/bot-request-retry.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const SPENT = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const FORBIDDEN = { provider: 'openrouter', model: 'deepseek-v4.1-flash' };
const DEEPSEEK = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };
const key = (route: ModelRoute) => `${route.provider}/${route.model}`;

function plan(groupId: string | undefined): PersonaBotModelPlan {
  return {
    revision: 1,
    sourcePresetId: 'p',
    sourcePresetName: 'P',
    orchestrator: SPENT,
    ...(groupId === undefined ? {} : { orchestratorGroupId: groupId }),
    appliedAt: '2026-11-17T00:00:00.000Z',
  };
}

function fallbackFor(options: {
  now: () => number;
  groups?: Record<string, string>;
  members?: ModelRoute[];
}) {
  const rests = createRouteRests({ now: options.now });
  const groups = options.groups ?? { ada: 'g', cy: 'g' };
  const fallback = createGroupFallback({
    plan: (slug) => plan(groups[slug]),
    routes: () => options.members ?? [SPENT, FORBIDDEN, DEEPSEEK],
    rests,
    requireAllowed: (_slug, route) => {
      if (key(route) === key(FORBIDDEN)) throw new Error('model-not-allowed');
    },
    validate: async () => undefined,
  });
  return { rests, fallback, groups };
}

describe('Routing Group fallback picks the next usable member (#4417)', () => {
  it('skips resting and disallowed members and keeps the choice for the Session', async () => {
    const clock = 1_000;
    const { rests, fallback } = fallbackFor({ now: () => clock });
    rests.rest(SPENT, 10_000, 'quota');
    const choice = await fallback.choose('ada', 's1', rests.restingUntil(SPENT)!);
    expect(choice).toEqual({
      kind: 'switch',
      from: SPENT,
      to: DEEPSEEK,
      reason: 'quota',
      until: new Date(10_000).toISOString(),
    });
    expect(fallback.route('s1')).toEqual(DEEPSEEK);
    expect(fallback.route('s2')).toBeUndefined();
    fallback.forget('s1');
    expect(fallback.route('s1')).toBeUndefined();
  });

  it('lists every resting member when none is usable', async () => {
    const { rests, fallback } = fallbackFor({ now: () => 0 });
    rests.rest(SPENT, 10_000, 'quota');
    rests.rest(DEEPSEEK, 20_000, 'credential');
    const choice = await fallback.choose('ada', 's1', rests.restingUntil(SPENT)!);
    expect(choice).toEqual({
      kind: 'exhausted',
      rests: [
        { ...SPENT, until: new Date(10_000).toISOString(), reason: 'quota' },
        { ...DEEPSEEK, until: new Date(20_000).toISOString(), reason: 'credential' },
      ],
    });
    expect(fallback.route('s1')).toBeUndefined();
  });

  it('does nothing for a Bot without a group and drops a choice when the group changes', async () => {
    const { rests, fallback, groups } = fallbackFor({ now: () => 0 });
    rests.rest(SPENT, 10_000);
    expect(await fallback.choose('bo', 's0', rests.restingUntil(SPENT)!)).toBeUndefined();
    await fallback.choose('ada', 's1', rests.restingUntil(SPENT)!);
    groups['ada'] = 'other';
    expect(fallback.route('s1')).toBeUndefined();
  });
});

describe('Request retry rests credential and long rate-limit failures (#4417)', () => {
  function payload(failure: RequestErrorPayload['failure']): RequestErrorPayload {
    return {
      agent: { session: { id: 'orchestrator-ada' }, model: { current: () => SPENT } },
      turn: 1,
      step: 1,
      provider: SPENT.provider,
      failure,
      retryPolicy: { mode: 'normal' },
      signal: new AbortController().signal,
    };
  }

  it('rests a route whose credential is refused, naming the reason and Session', async () => {
    const rested: unknown[] = [];
    const handle = createBotRequestRetry({
      isBotSession: () => true,
      now: () => 0,
      sleep: async () => true,
      onQuotaExhausted: (route, untilMs, reason, sessionId) =>
        rested.push({ ...route, untilMs, reason, sessionId }),
    });
    expect(
      await handle(
        payload({ code: 'AUTH', status: 401, message: 'invalid api key' }),
        async () => undefined,
      ),
    ).toBe(undefined);
    expect(rested).toMatchObject([
      { ...SPENT, reason: 'credential', sessionId: 'orchestrator-ada' },
    ]);
  });
});

describe('A Bot on a Routing Group keeps working when its route runs out (#4417)', () => {
  it('switches once with a notice, and a second Bot starts on the next member', async () => {
    let clock = Date.parse('2026-11-18T00:00:00.000Z');
    const until = clock + 452_761_000;
    const { rests, fallback } = fallbackFor({ now: () => clock });
    const runs: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        const route = fallback.route(run.sessionId) ?? SPENT;
        runs.push(`${run.bot.slug}:${key(route)}`);
        if (key(route) !== key(SPENT)) return;
        rests.rest(SPENT, until, 'quota');
        throw Object.assign(new Error('RATE_LIMIT: OpenCode Go usage limit reached'), {
          code: 'RATE_LIMIT',
        });
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({
      dshHome: createTempRoot('bh-group-fallback-'),
      agents,
      routeRests: rests,
      groupFallback: fallback,
      sessionRoute: (_slug, sessionId) => fallback.route(sessionId) ?? SPENT,
      autoContinueDelaysMs: [1],
    });
    async function dm(slug: string, id: string) {
      const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, slug, slug)!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
        id,
        at: new Date(clock).toISOString(),
        author: { kind: 'human' },
        body: 'Hello',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: channel.id,
        messageId: id,
        body: 'Hello',
      });
      for (let index = 0; index < 3; index += 1) {
        await core.runtime.whenIdle();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    const notices = (slug: string) =>
      core.channels.readMessages(`dm-${slug}`).filter((message) => message.modelSwitch);
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'cy', displayName: 'Cy' });

      await dm('ada', 'ada-1');
      expect(runs).toEqual([`ada:${key(SPENT)}`, `ada:${key(DEEPSEEK)}`]);
      expect(core.runtime.heldCause?.('ada')).toBeUndefined();
      expect(notices('ada')).toHaveLength(1);
      expect(notices('ada')[0]).toMatchObject({
        author: { kind: 'system' },
        modelSwitch: {
          botSlug: 'ada',
          botName: 'Ada',
          from: SPENT,
          to: DEEPSEEK,
          reason: 'quota',
          until: new Date(until).toISOString(),
        },
      });
      expect(core.channels.readMessages('dm-ada').filter((message) => message.turnStop)).toEqual(
        [],
      );

      await dm('cy', 'cy-1');
      expect(runs.filter((run) => run.startsWith('cy:'))).toEqual([`cy:${key(DEEPSEEK)}`]);
      expect(notices('cy')).toHaveLength(1);
      expect(
        core.channels.readMessages('dm-cy').filter((message) => message.sessionFailure),
      ).toEqual([]);
      clock += 1;
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('holds listing every member when the whole group is resting', async () => {
    const clock = Date.parse('2026-11-18T00:00:00.000Z');
    const { rests, fallback } = fallbackFor({ now: () => clock, members: [SPENT, DEEPSEEK] });
    rests.rest(SPENT, clock + 1_000_000, 'quota');
    rests.rest(DEEPSEEK, clock + 2_000_000, 'quota');
    const runs: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('bh-group-exhausted-'),
      agents: {
        async runOrchestrator(run) {
          runs.push(run.bot.slug);
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
      routeRests: rests,
      groupFallback: fallback,
      sessionRoute: (_slug, sessionId) => fallback.route(sessionId) ?? SPENT,
      autoContinueDelaysMs: [1],
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
        id: 'ada-1',
        at: new Date(clock).toISOString(),
        author: { kind: 'human' },
        body: 'Hello',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: channel.id,
        messageId: 'ada-1',
        body: 'Hello',
      });
      await core.runtime.whenIdle();
      expect(runs).toEqual([]);
      expect(core.runtime.heldCause?.('ada')).toBe('quota');
      const holds = core.channels.readMessages('dm-ada').filter((message) => message.turnStop);
      expect(holds).toHaveLength(1);
      expect(holds[0]!.turnStop!.rests?.map(key)).toEqual([key(SPENT), key(DEEPSEEK)]);
      expect(core.channels.readMessages('dm-ada').filter((m) => m.modelSwitch)).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});

describe('A Session returns to its preferred member once the rest ends (#4418)', () => {
  it('stays on the fallback while the preferred route rests', async () => {
    let clock = 0;
    const { rests, fallback } = fallbackFor({ now: () => clock });
    rests.rest(SPENT, 10_000, 'quota');
    await fallback.choose('ada', 's1', rests.restingUntil(SPENT)!);
    expect(await fallback.restore('ada', 's1')).toBeUndefined();
    expect(fallback.route('s1')).toEqual(DEEPSEEK);
    clock = 10_000;
    expect(await fallback.restore('ada', 's1')).toEqual({
      kind: 'switch',
      from: DEEPSEEK,
      to: SPENT,
      reason: 'returned',
    });
    expect(fallback.route('s1')).toEqual(SPENT);
    expect(await fallback.restore('ada', 's1')).toBeUndefined();
  });

  async function scenario(failOnReturn: boolean) {
    let clock = Date.parse('2026-11-18T00:00:00.000Z');
    const until = clock + 60_000;
    const { rests, fallback } = fallbackFor({ now: () => clock });
    let spentFails = true;
    const runs: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('bh-group-return-'),
      agents: {
        async runOrchestrator(run) {
          const route = fallback.route(run.sessionId) ?? SPENT;
          runs.push(key(route));
          if (key(route) !== key(SPENT) || !spentFails) return;
          rests.rest(SPENT, clock + 60_000, 'quota');
          throw Object.assign(new Error('QUOTA: OpenCode Go usage limit reached'), {
            code: 'QUOTA',
          });
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
      routeRests: rests,
      groupFallback: fallback,
      sessionRoute: (_slug, sessionId) => fallback.route(sessionId) ?? SPENT,
      autoContinueDelaysMs: [1],
    });
    async function dm(id: string) {
      const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
        id,
        at: new Date(clock).toISOString(),
        author: { kind: 'human' },
        body: 'Hello',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: channel.id,
        messageId: id,
        body: 'Hello',
      });
      for (let index = 0; index < 3; index += 1) {
        await core.runtime.whenIdle();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      await dm('ada-1');
      expect(runs).toEqual([key(SPENT), key(DEEPSEEK)]);
      clock = until;
      spentFails = failOnReturn;
      await dm('ada-2');
      return {
        runs,
        switches: core.channels
          .readMessages('dm-ada')
          .flatMap((message) => (message.modelSwitch === undefined ? [] : [message.modelSwitch]))
          .map((record) => `${record.reason}:${key(record.from)}>${key(record.to)}`),
        held: core.runtime.heldCause?.('ada'),
      };
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  }

  it('starts the next turn on the preferred member with one return notice', async () => {
    const result = await scenario(false);
    expect(result.runs).toEqual([key(SPENT), key(DEEPSEEK), key(SPENT)]);
    expect([...result.switches].sort()).toEqual(
      [`quota:${key(SPENT)}>${key(DEEPSEEK)}`, `returned:${key(DEEPSEEK)}>${key(SPENT)}`].sort(),
    );
    expect(result.held).toBeUndefined();
  });

  it('falls back again with a fresh rest when the preferred route fails on return', async () => {
    const result = await scenario(true);
    expect(result.runs).toEqual([key(SPENT), key(DEEPSEEK), key(SPENT), key(DEEPSEEK)]);
    expect(result.switches.filter((entry) => entry.startsWith('quota:'))).toHaveLength(2);
    expect(result.switches.filter((entry) => entry.startsWith('returned:'))).toHaveLength(1);
    expect(result.held).toBeUndefined();
  });
});
