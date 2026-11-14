import { Context } from '@deepseek-ai/cordis';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import {
  humanContext,
  OWNER_HUMAN_CONTEXT as owner,
  type HumanContext,
} from '../src/humans/context.js';
import { createModelRouteReadiness } from '../src/models/readiness.js';
import { requireBotModel } from '../src/team/models.js';
import { createTempRoot } from './helpers.js';
import { createTestRosterStore } from './roster-fixture.js';
import type { ModelRoute } from '../src/models/presets.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';

const member = humanContext('m10-member');
const recipient = humanContext('m10-recipient');
const route = { provider: 'provider', model: 'allowed' };
const denied = { provider: 'provider', model: 'denied' };
const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});

function fixture(seed = true, dshHome = createTempRoot('m10-members-lifecycle-')) {
  let selected: ModelRoute = route;
  let core: ReturnType<typeof createCore>;
  const turns = new Map<string, number>();
  const catalog = {
    list: async () => [],
    validate: vi.fn(async () => {}),
    defaultRoute: () => selected,
  };
  const run = vi.fn(async (input: OrchestratorAgentRun) => {
    await createModelRouteReadiness(core.registry, catalog, (slug, route) =>
      requireBotModel(core.team, core.registry.get(slug), route),
    ).prepare(input.bot.slug, 'orchestrator');
    const turn = (turns.get(input.sessionId) ?? 0) + 1;
    turns.set(input.sessionId, turn);
    const time = Date.now();
    core.usage?.handleSessionEvent(input.sessionId, {
      type: 'turn/start',
      seq: turn * 3,
      time,
      data: { turn },
    });
    core.usage?.handleSessionEvent(input.sessionId, {
      type: 'assistant/message',
      seq: turn * 3 + 1,
      time,
      data: {
        turn,
        message: { source: selected },
        usage: {
          inputTokens: 9,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 10,
        },
      },
    });
    await input.channels.send({ body: 'Completed' });
  });
  core = createCore({
    dshHome,
    agents: {
      runOrchestrator: run,
      runAssignment: async () => {},
      requestAssignment: () => {
        throw new Error('unexpected-assignment');
      },
      stopBot: async () => {},
      close: async () => {},
    },
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    core.schedules.close();
    core.externalMessaging.close();
    await core.contentPurge.memberSettled();
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  closes.push(close);
  const db = attachOperationalModule(core.operationalDatabase, 'm10-members-test');
  if (seed)
    db.transaction((connection) => {
      for (const human of [member, recipient]) {
        connection
          .prepare("INSERT INTO humans VALUES (?, ?, 'active', ?)")
          .run(human.humanId, human.humanId, new Date().toISOString());
        connection.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(human.humanId);
        connection
          .prepare("INSERT INTO member_credentials VALUES (?, ?, '{}', '[]', 0)")
          .run(human.humanId, human.humanId);
      }
      connection.prepare('UPDATE team_settings SET enabled = 1').run();
    });
  const methods = createBridgeMethodsForHumans({
    ...core,
    roster: createTestRosterStore({ database: core.operationalDatabase }),
    modelCatalog: catalog,
  });
  const createBot = (human: HumanContext, slug: string) => {
    const result = core.registry.create({
      slug,
      displayName: slug.toUpperCase(),
      ownerHumanId: human.humanId,
    });
    if (!result.ok) throw new Error(result.reason);
    return result.record;
  };
  const send = async (human: HumanContext, slug: string) => {
    const bot = core.registry.get(slug);
    if (!bot) throw new Error('missing-bot');
    const dm = core.channels.getOrCreateDm(human, slug, bot.displayName);
    if (!dm) throw new Error('missing-dm');
    const messageId = 'human-' + randomUUID();
    await core.channels.appendMessage(human, dm.id, {
      id: messageId,
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: human.humanId },
      body: 'Work',
    });
    const admission = core.runtime.admitDmMessage(human, {
      channelId: dm.id,
      messageId,
      body: 'Work',
    });
    if (!admission.admitted) throw new Error(admission.reason);
    return admission.settled;
  };
  const report = () => {
    const result = methods(owner).usageByMember({ period: 'today' });
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  };
  return {
    core,
    close,
    dshHome,
    db,
    methods,
    createBot,
    send,
    report,
    run,
    catalog,
    setDefault: (next: ModelRoute) => {
      selected = next;
    },
  };
}

describe('M10 with M2 private ownership, M4 Channels and M9 lifecycle', () => {
  it('attributes private Bot, own Tob and shared-Channel mention turns and reconciles Owner and legacy usage', async () => {
    const f = fixture();
    const privateBot = f.createBot(member, 'private-bot');
    const ownerBot = f.createBot(owner, 'owner-bot');
    const tob = await f.core.tob.ensure(member);
    await f.send(member, privateBot.slug);
    await f.send(member, tob.botSlug);
    await f.send(owner, ownerBot.slug);
    const group = f.core.channels.createGroup(owner, {
      name: 'Shared',
      members: [privateBot.slug],
    });
    f.core.team.channelAccess.visibilitySet(owner, group.id, { kind: 'public' });
    f.core.team.channelAccess.join(recipient, group.id);
    const label = '@' + privateBot.displayName;
    await f.core.channels.appendMessage(recipient, group.id, {
      id: 'member-mention',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: recipient.humanId },
      body: label + ' work',
      mentions: [
        { botSlug: privateBot.slug, label: privateBot.displayName, start: 0, end: label.length },
      ],
    });
    f.core.runtime.admitGroupMessage(group.id, 'member-mention');
    await f.core.runtime.whenIdle();
    expect(f.run).toHaveBeenCalledTimes(4);
    const day = f.core.usage!.overview('today').end;
    f.db.transaction((db) =>
      db
        .prepare(
          "INSERT INTO usage_daily (bot_slug, day, provider, model, purpose, input_tokens, total_tokens, human_id, legacy) VALUES ('legacy', ?, 'p', 'm', 'orchestrator', 7, 7, ?, 1)",
        )
        .run(day, owner.humanId),
    );
    const report = f.report();
    expect(report.legacy).toBe(true);
    expect(report.members.find((row) => row.humanId === member.humanId)).toMatchObject({
      totals: { totalTokens: 20 },
      bots: expect.arrayContaining([
        {
          slug: privateBot.slug,
          displayName: privateBot.displayName,
          totals: expect.objectContaining({ totalTokens: 10 }),
        },
        expect.objectContaining({
          slug: tob.botSlug,
          totals: expect.objectContaining({ totalTokens: 10 }),
        }),
      ]),
    });
    expect(report.members.find((row) => row.humanId === recipient.humanId)).toMatchObject({
      totals: { totalTokens: 10 },
      bots: [
        expect.objectContaining({
          slug: privateBot.slug,
          totals: expect.objectContaining({ totalTokens: 10 }),
        }),
      ],
    });
    expect(report.members.find((row) => row.humanId === owner.humanId)?.totals.totalTokens).toBe(
      17,
    );
    for (const key of [
      'inputTokens',
      'outputTokens',
      'cacheReadTokens',
      'cacheWriteTokens',
      'totalTokens',
    ] as const)
      expect(report.members.reduce((sum, row) => sum + (row.totals[key] ?? 0), 0)).toBe(
        f.core.usage!.overview('today').totals[key],
      );
    const own = f.methods(member).overviewUsage({ period: 'today' });
    expect(own).toMatchObject({ ok: true, value: { totals: { totalTokens: 30 } } });
    expect(
      own.ok && own.value.bots.every((row) => row.slug !== ownerBot.slug && row.slug !== 'legacy'),
    ).toBe(true);
    f.core.team.roles.update(owner, 'member', {
      permissions: [...f.core.team.roles.permissions(member), 'usage.view'],
    });
    expect(f.methods(member).usageByMember({ period: 'today' })).toMatchObject({
      ok: true,
      value: {
        members: expect.arrayContaining([
          expect.objectContaining({
            humanId: owner.humanId,
            bots: expect.arrayContaining([
              expect.objectContaining({ slug: ownerBot.slug, displayName: ownerBot.displayName }),
            ]),
          }),
        ]),
      },
    });
  });

  it('marks a Tob created by sign-in with a disallowed Host default and refuses its next turn', async () => {
    const f = fixture(false);
    const ctx = new Context();
    const off = f.core.team.bindRuntime({
      createPeer: (principal) => new Peer(ctx, { principal }),
      invalidate: () => {},
      urls: () => [],
    });
    closes.push(async () => {
      await off();
      await ctx.fiber.dispose();
    });
    await f.core.team.setOwnerPassword(owner, 'owner-password-1');
    await f.core.team.setMode(owner, true);
    const created = await f.core.team.createMember(owner, 'restricted', 'Restricted');
    const human = humanContext(created.member.humanId);
    await f.core.team.changePassword(human, created.initialPassword, 'member-password-1');
    f.core.team.roles.update(owner, 'member', {
      models: { kind: 'only', routes: ['provider/allowed'] },
    });
    f.setDefault(denied);
    await f.core.team.signIn('restricted', 'member-password-1', 'test-device');
    const slug = f.core.tob.slug(human);
    if (!slug) throw new Error('missing-sign-in-tob');
    expect(f.core.registry.get(slug)?.ownerHumanId).toBe(human.humanId);
    expect(f.core.registry.get(slug)?.modelPlan).toBeUndefined();
    expect(f.methods(human).get({ slug })).toMatchObject({
      ok: true,
      value: { bot: { modelAllowed: false } },
    });
    expect(f.methods(human).list({})).toMatchObject({
      ok: true,
      value: { bots: [expect.objectContaining({ slug, modelAllowed: false })] },
    });
    await expect(f.send(human, slug)).rejects.toMatchObject({
      code: 'model-not-allowed',
      details: { route: 'provider/denied' },
    });
    expect(
      f.core.channels
        .queryMessages('dm-' + slug)
        .messages.some((message) => message.sessionFailure?.code === 'model-not-allowed'),
    ).toBe(true);
    expect(f.catalog.validate).not.toHaveBeenCalled();
    expect(f.core.registry.get(slug)?.modelPlan).toBeUndefined();
  });

  it('keeps usage under the deleted Human after M9 purges the private Bot and Tob', async () => {
    const f = fixture();
    const bot = f.createBot(member, 'purged-bot');
    const tob = await f.core.tob.ensure(member);
    await f.send(member, bot.slug);
    await f.send(member, tob.botSlug);
    const before = f.core.usage!.overview('today').totals;
    await f.core.team.deactivate(owner, member.humanId);
    const preview = f.core.team.purgePreview(owner, member.humanId);
    await f.core.team.purgeConfirm(owner, member.humanId, preview.token, member.humanId);
    expect(f.core.team.member(member.humanId)).toBeUndefined();
    expect(f.core.registry.get(bot.slug)).toBeUndefined();
    expect(f.core.tob.slug(member)).toBeUndefined();
    expect(f.report().members).toMatchObject([
      { humanId: member.humanId, deleted: true, totals: { totalTokens: 20 } },
    ]);
    expect(f.core.usage!.overview('today').totals).toEqual(before);
    expect(f.core.operationalDatabase.mode).toBe('ready');
    await f.close();
    const restored = fixture(false, f.dshHome);
    expect(restored.core.operationalDatabase.mode).toBe('ready');
    expect(restored.report().members).toMatchObject([
      { humanId: member.humanId, deleted: true, totals: { totalTokens: 20 } },
    ]);
    expect(restored.core.usage!.overview('today').totals).toEqual(before);
  });

  it('retains historical receipts and attributes transferred Bot future turns to the new owner', async () => {
    const f = fixture();
    const bot = f.createBot(member, 'transferred-bot');
    await f.send(member, bot.slug);
    await f.core.team.transfer(owner, member.humanId, recipient.humanId);
    await f.send(recipient, bot.slug);
    expect(f.report().members).toMatchObject([
      { humanId: member.humanId, totals: { totalTokens: 10 } },
      { humanId: recipient.humanId, totals: { totalTokens: 10 } },
    ]);
    const first = f.methods(member).overviewUsage({ period: 'today' });
    const second = f.methods(recipient).overviewUsage({ period: 'today' });
    expect(first).toMatchObject({ ok: true, value: { totals: { totalTokens: 0 }, bots: [] } });
    expect(second).toMatchObject({
      ok: true,
      value: { totals: { totalTokens: 20 }, bots: [expect.objectContaining({ slug: bot.slug })] },
    });
    f.core.team.roles.update(owner, 'member', {
      models: { kind: 'only', routes: ['provider/allowed'] },
    });
    f.setDefault(denied);
    const before = f.core.usage!.overview('today').totals;
    await expect(f.send(recipient, bot.slug)).rejects.toMatchObject({ code: 'model-not-allowed' });
    expect(f.core.usage!.overview('today').totals).toEqual(before);
  });
});
