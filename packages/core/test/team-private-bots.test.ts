import { afterEach, describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { TeamService } from '../src/team/service.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { MEMBER_BOT_METHODS } from '../src/team/member-methods.js';
import { privateBotRegistry } from '../src/team/bot-access.js';
import { privateBotCreations } from '../src/bots/creation.js';
import { createMemberTobOperations } from '../src/tob/member-operations.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const alice = humanContext('alice');
const bob = humanContext('bob');
const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});

function fixture(run: (input: OrchestratorAgentRun) => Promise<void> = async () => {}) {
  const core = createCore({
    dshHome: createTempRoot('team-private-bots-'),
    agents: {
      runOrchestrator: run,
      async runAssignment() {},
      requestAssignment() {
        throw new Error('unexpected-assignment');
      },
      async close() {},
    },
  });
  closes.push(async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const database = attachOperationalModule(core.operationalDatabase, 'team');
  database.transaction((db) => {
    for (const human of [alice, bob])
      db.prepare("INSERT INTO humans VALUES (?, ?, 'active', ?)").run(
        human.humanId,
        human.humanId,
        new Date().toISOString(),
      );
    db.prepare('UPDATE team_settings SET enabled = 1').run();
  });
  const team = new TeamService(database, core.channels, {
    ensureTob: (human) => core.tob.ensure(human),
  });
  const methods = createBridgeMethodsForHumans({ ...core, team });
  for (const human of [owner, alice, bob]) {
    const slug = human.humanId === owner.humanId ? 'owner-bot' : human.humanId + '-bot';
    expect(core.registry.create({ slug, displayName: slug, ownerHumanId: human.humanId }).ok).toBe(
      true,
    );
    core.channels.getOrCreateDm(human, slug, slug);
  }
  return { core, database, team, methods };
}

describe('M2 private Bot boundaries', () => {
  it.each(MEMBER_BOT_METHODS)(
    'refuses %s against another member before reading or mutating it',
    async (method) => {
      const f = fixture();
      const payload =
        method === 'botStop'
          ? { botSlug: 'alice-bot' }
          : ['botAvatarSet', 'botBannerSet', 'botAppearanceSet', 'botPrimaryColorSet'].includes(
                method,
              )
            ? { channelId: 'dm-alice-bot' }
            : { slug: 'alice-bot' };
      const result = await f.methods(bob)[method](payload);
      expect(result).toEqual({
        ok: false,
        error: { code: 'bot-not-found', message: 'bot-not-found' },
      });
      expect(f.core.registry.get('alice-bot')?.displayName).toBe('alice-bot');
    },
  );

  it('scopes roster, DM, settings and session aggregates to the caller and keeps Owner administration out of content', async () => {
    const f = fixture();
    for (const human of [owner, alice, bob]) {
      const slug = human.humanId === owner.humanId ? 'owner-bot' : human.humanId + '-bot';
      const listed = f.methods(human).list({});
      expect(listed).toMatchObject({
        ok: true,
        value: { bots: [{ slug, ownerHumanId: human.humanId, owner: true }] },
      });
      if (!listed.ok) throw new Error('list-refused');
      expect(listed.value.bots).toHaveLength(1);
      const channels = await f.methods(human).channels({});
      expect(JSON.stringify(channels)).toContain('dm-' + slug);
      expect(JSON.stringify(channels)).not.toContain(human === alice ? 'bob-bot' : 'alice-bot');
      expect(f.methods(human).botSessionIds({})).toMatchObject({
        ok: true,
        value: { groups: [{ botSlug: slug }] },
      });
      expect(f.methods(human).activitySnapshot({})).toMatchObject({
        ok: true,
        value: { bots: [{ slug }] },
      });
    }
    const administrative = f.methods(owner).list({ administration: true });
    expect(administrative).toMatchObject({
      ok: true,
      value: {
        bots: expect.arrayContaining([
          expect.objectContaining({ slug: 'alice-bot', owner: false }),
        ]),
      },
    });
    expect(f.methods(bob).list({ administration: true })).toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
    expect(f.methods(owner).get({ slug: 'alice-bot' })).toMatchObject({
      ok: true,
      value: { bot: { owner: false } },
    });
    expect(f.methods(owner).channelMessages({ channelId: 'dm-alice-bot' })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(
      f.methods(bob).update({ slug: 'bob-bot', patch: { displayName: 'Bobby' } }),
    ).toMatchObject({ ok: true });
    expect(f.methods(bob).get({ slug: 'bob-bot' })).toMatchObject({
      ok: true,
      value: { bot: { displayName: 'Bobby' } },
    });
  });

  it('namespaces creation receipts, ignores supplied ownership and prepares only the member DM', () => {
    const f = fixture();
    const input = { operationKey: 'same-key-00001', displayName: 'Created', ownerHumanId: 'alice' };
    const a = f.methods(alice).create(input);
    const b = f.methods(bob).create(input);
    expect(a).toMatchObject({ ok: true, value: { bot: { ownerHumanId: 'alice' } } });
    expect(b).toMatchObject({ ok: true, value: { bot: { ownerHumanId: 'bob' } } });
    if (!a.ok || !b.ok) throw new Error('creation-refused');
    expect(a.value.bot.slug).not.toBe(b.value.bot.slug);
    expect(f.methods(bob).create(input)).toEqual(b);
    expect(f.methods(bob).createLookup(input)).toMatchObject({
      ok: true,
      value: { receipt: { botSlug: b.value.bot.slug, operationKey: input.operationKey } },
    });
    expect(f.team.belongs(bob, b.value.channelId!)).toBe(true);
    expect(f.team.belongs(alice, b.value.channelId!)).toBe(false);
  });

  it('refuses cross-member DM reads, sends, references, explicit mentions and group additions', async () => {
    const f = fixture();
    const shared = f.core.channels.createGroup(bob, {
      name: 'Shared',
      members: ['bob-bot', 'alice-bot'],
    });
    for (const method of ['channelDm', 'channelMessages', 'channelSend'] as const) {
      expect(
        await f
          .methods(bob)
          [method]({ slug: 'alice-bot', channelId: 'dm-alice-bot', body: 'private' }),
      ).toMatchObject({ ok: false, error: { code: 'bot-not-found' } });
    }
    expect(
      await f.methods(bob).channelSend({
        channelId: shared.id,
        body: 'Hello',
        mentions: [{ botSlug: 'alice-bot', label: 'Alice', start: 0, end: 5 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'bot-not-found' } });
    expect(
      await f.methods(bob).channelCreate({ name: 'Private', members: ['alice-bot'] }),
    ).toMatchObject({ ok: false });
    expect(f.core.channels.readMessages('dm-alice-bot')).toEqual([]);
  });

  it('creates one private Tob per member concurrently and scopes member onboarding', async () => {
    const f = fixture();
    const [a, b, again] = await Promise.all([
      f.core.tob.ensure(alice),
      f.core.tob.ensure(bob),
      f.core.tob.ensure(bob),
    ]);
    expect(b).toEqual(again);
    expect(a.botSlug).not.toBe(b.botSlug);
    expect(f.core.tob.slug(bob)).toBe(b.botSlug);
    expect(f.core.registry.get(b.botSlug)?.ownerHumanId).toBe('bob');
    expect(await f.methods(bob).tobHome({})).toMatchObject({ ok: true, value: b });
    expect(await f.methods(bob).onboarding({})).toMatchObject({
      ok: true,
      value: { defaultBotSlug: b.botSlug, channelId: b.channelId },
    });
    expect(f.methods(alice).get({ slug: b.botSlug })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    const ops = createMemberTobOperations({
      bridge: f.methods(bob),
      registry: privateBotRegistry(f.core.registry, bob),
      creations: privateBotCreations(f.core.creations, bob),
      isProtectedBot: (slug) => f.core.tob.isTob(slug),
    });
    await expect(ops('show', { slug: 'alice-bot' })).rejects.toThrow('bot-not-found');
    for (const argv of [
      ['settings'],
      ['devices'],
      ['members', 'list'],
      ['im-apps'],
      ['data-reset-preview'],
      ['model-catalog'],
    ])
      await expect((await ops('cli', { argv }))!.run(() => {})).rejects.toThrow(
        'permission-required',
      );
    const listed = await (await ops('cli', { argv: ['list'] }))!.run(() => {});
    expect(JSON.stringify(listed)).toContain('bob-bot');
    expect(JSON.stringify(listed)).not.toContain('alice-bot');
  });

  it('isolates Activity items, unread counts and read/dismiss state in the durable projection', async () => {
    const f = fixture();
    for (const human of [owner, alice, bob]) {
      const slug = human === owner ? 'owner-bot' : human.humanId + '-bot';
      await f.core.channels.appendMessage(human, 'dm-' + slug, {
        id: 'reply-' + slug,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug },
        body: 'secret-' + slug,
        grantRequest: true,
      });
    }
    for (const human of [owner, alice, bob]) {
      const slug = human === owner ? 'owner-bot' : human.humanId + '-bot';
      const items = f.core.humanAttention.list(human, { category: 'action' }).items;
      expect(items).toHaveLength(1);
      expect(items[0]?.botSlug).toBe(slug);
      expect(f.methods(human).humanAttentionStatus({ messageCounts: true })).toMatchObject({
        ok: true,
        value: { unreadCount: 1, hasAction: true },
      });
      expect(f.methods(human).channelUnreadCounts({})).toMatchObject({
        ok: true,
        value: { channels: [{ channelId: 'dm-' + slug, unreadCount: 1 }] },
      });
    }
    const action = f.core.humanAttention.list(bob, { category: 'action' }).items[0]!;
    expect(
      await f
        .methods(bob)
        .humanAttentionDismiss({ itemId: action.id, sourceKey: action.sourceEventId ?? '' }),
    ).toMatchObject({ ok: true });
    expect(f.core.humanAttention.list(bob, { category: 'action' }).items).toHaveLength(0);
    expect(f.core.humanAttention.list(alice, { category: 'action' }).items).toHaveLength(1);
  });

  it('runs the real member Bot tool path without exposing or messaging another member Bot', async () => {
    let core: ReturnType<typeof createCore>;
    const outcomes: unknown[] = [];
    const prompts: string[] = [];
    const f = fixture(async (run) => {
      if (run.bot.slug !== 'bob-bot') return;
      prompts.push(run.message);
      outcomes.push(await run.channels.contacts());
      try {
        await run.channels.sendToBot({ botSlug: 'alice-bot', body: 'Must not send' });
      } catch (error) {
        outcomes.push(error instanceof Error ? error.message : error);
      }
      try {
        await run.channels.contacts({ botId: 'alice-bot' });
      } catch (error) {
        outcomes.push(error instanceof Error ? error.message : error);
      }
      const group = run.channels.createGroup('Bobs group');
      try {
        run.channels.inviteGroup({ channelId: group.id, targetBotSlug: 'alice-bot' });
      } catch (error) {
        outcomes.push(error instanceof Error ? error.message : error);
      }
      expect(core.channels.readMessages('dm-alice-bot')).toEqual([]);
    });
    core = f.core;
    core.channels.setHumanDefaultName(owner, 'Confidential Owner Name');
    core.channels.setHumanDefaultName(bob, 'Bob Runtime');
    await core.channels.appendMessage(bob, 'dm-bob-bot', {
      id: 'trigger',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: 'bob' },
      body: 'inspect own colleagues',
    });
    core.runtime.admitDmMessage(bob, {
      channelId: 'dm-bob-bot',
      messageId: 'trigger',
      body: 'inspect own colleagues',
    });
    await core.runtime.whenIdle();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('Bob Runtime');
    expect(prompts[0]).not.toContain('Confidential Owner Name');
    expect(outcomes).toEqual([
      { outputLimit: 12000, contacts: [] },
      'bot-not-found',
      'bot-not-found',
      'bot-not-found',
    ]);
  });
});
