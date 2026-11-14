import { afterEach, describe, expect, it, vi } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { createTobService } from '../src/tob/service.js';
import { openPurgeLedger } from '../src/purge/ledger.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import { acceptMemberBotPurge } from '../src/bots/deletion.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';

const bob = humanContext('bob');
const alice = humanContext('alice');
const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});

function fixture(
  options: {
    dshHome?: string;
    running?: boolean;
    seed?: boolean;
    coreOptions?: Pick<
      NonNullable<Parameters<typeof createCore>[0]>,
      'erasePrivateAccounts' | 'workspaces'
    >;
  } = {},
) {
  const dshHome = options.dshHome ?? createTempRoot('m2-m9-lifecycle-');
  const pending = new Map<string, () => void>();
  let notifyFirstRun: (() => void) | undefined;
  const firstRun = new Promise<void>((resolve) => {
    notifyFirstRun = resolve;
  });
  const runs = vi.fn(async (run: OrchestratorAgentRun) => {
    notifyFirstRun?.();
    if (options.running) await new Promise<void>((resolve) => pending.set(run.bot.slug, resolve));
  });
  const stop = vi.fn(async (slug: string) => {
    pending.get(slug)?.();
    pending.delete(slug);
  });
  const core = createCore({
    dshHome,
    ...options.coreOptions,
    agents: {
      runOrchestrator: runs,
      async runAssignment() {},
      stopBot: stop,
      requestAssignment() {
        throw new Error('unexpected-assignment');
      },
      async close() {},
    },
  });
  closes.push(async () => {
    for (const resolve of pending.values()) resolve();
    await core.contentPurge.memberSettled().catch(() => {});
    core.schedules.close();
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const db = attachOperationalModule(core.operationalDatabase, 'member-lifecycle-test');
  if (options.seed !== false && !core.team.member('bob'))
    db.transaction((connection) => {
      for (const human of [bob, alice]) {
        connection
          .prepare("INSERT INTO humans VALUES (?, ?, 'active', '2026-11-14T00:00:00Z')")
          .run(human.humanId, human.humanId);
        connection.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(human.humanId);
        connection
          .prepare("INSERT INTO member_credentials VALUES (?, ?, '{}', '[]', 0)")
          .run(human.humanId, human.humanId);
      }
      connection.prepare('UPDATE team_settings SET enabled = 1').run();
    });
  return { core, dshHome, db, runs, stop, firstRun };
}

async function restoreDeletionFact(f: ReturnType<typeof fixture>, privateBots: string[]) {
  f.core.schedules.close();
  f.core.externalMessaging.close();
  await f.core.runtime.close();
  f.core.operationalDatabase.close();
  const ledger = openPurgeLedger(join(f.dshHome, 'botharness', 'purge', 'ledger.db'), true);
  try {
    ledger.union({
      format: 'botharness-purge',
      version: 3,
      facts: [],
      deletedHumans: [
        {
          humanId: 'bob',
          deletedAt: '2026-11-14T00:00:00.000Z',
          privateBots,
          privateChannels: [],
        },
      ],
    });
  } finally {
    ledger.close();
  }
}

function createBot(f: ReturnType<typeof fixture>, human = bob, slug = 'bob-bot') {
  const result = f.core.registry.create({ slug, ownerHumanId: human.humanId, displayName: slug });
  if (!result.ok) throw new Error('Bot fixture failed');
  const dm = f.core.channels.getOrCreateDm(human, slug, slug);
  if (!dm) throw new Error('DM fixture failed');
  return { bot: result.record, dm, memory: f.core.registry.memoryDirFor(slug)! };
}
async function send(f: ReturnType<typeof fixture>, slug: string, id: string) {
  await f.core.channels.appendMessage(bob, 'dm-' + slug, {
    id,
    at: new Date().toISOString(),
    author: { kind: 'human', humanId: bob.humanId },
    body: 'private request',
  });
  return f.core.runtime.admitDmMessage(bob, {
    channelId: 'dm-' + slug,
    messageId: id,
    body: 'private request',
  });
}

describe('M2 × M9 member lifecycle integration', { timeout: 60_000 }, () => {
  it.each(['retained', 'pending', 'erased'] as const)(
    'preserves a pending acceptance without upgrading its intent, memory=%s',
    (memory) => {
      const f = fixture();
      const bot = createBot(f);
      const state = {
        slug: bot.bot.slug,
        displayName: 'Bob',
        acceptedAt: '2026-11-14T00:00:00Z',
        memoryDir: bot.memory,
        phase: 'stopping',
        eraseMemory: memory !== 'retained',
        memory,
      };
      f.db.transaction((db) => {
        db.prepare("INSERT INTO deleted_humans VALUES ('bob', '2026-11-14T00:00:00Z')").run();
        db.prepare('INSERT INTO persona_bot_deletions VALUES (?, ?)').run(
          bot.bot.slug,
          JSON.stringify(state),
        );
        const accept = () =>
          acceptMemberBotPurge({
            db,
            humanId: 'bob',
            slug: bot.bot.slug,
            acceptedAt: '2026-11-15T00:00:00Z',
            rootDir: f.core.registry.rootDir,
          });
        if (memory === 'pending') accept();
        else expect(accept).toThrow('deletion-in-progress');
        expect(
          db.prepare('SELECT body FROM persona_bot_deletions WHERE slug = ?').get(bot.bot.slug)
            ?.body,
        ).toBe(JSON.stringify(state));
      });
      expect(existsSync(bot.memory)).toBe(true);
    },
  );

  it.each(['preview', 'confirm'])(
    'refuses member purge at %s until an ordinary retain-Memory deletion finishes',
    async (stage) => {
      let release!: () => void;
      let started!: () => void;
      const waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
      const stopping = new Promise<void>((resolve) => {
        started = resolve;
      });
      const f = fixture({
        coreOptions: {
          erasePrivateAccounts: async () => {
            started();
            await waiting;
          },
        },
      });
      const bot = createBot(f);
      await f.core.team.deactivate(owner, 'bob');
      const preview = f.core.deletions.preview(bot.bot.slug);
      const deletion = f.core.deletions.confirm(bot.bot.slug, preview.token, false);
      let attempt: Promise<unknown> | undefined;
      try {
        await stopping;
        expect(f.core.deletions.get(bot.bot.slug)).toMatchObject({
          phase: 'stopping',
          eraseMemory: false,
        });
        if (stage === 'confirm') {
          vi.spyOn(f.core.deletions, 'memberPreview').mockImplementationOnce((_humanId, slug) =>
            f.core.deletions.preview(slug),
          );
          const memberPreview = f.core.team.purgePreview(owner, 'bob');
          attempt = f.core.team.purgeConfirm(owner, 'bob', memberPreview.token, 'bob');
          void attempt.catch(() => {});
          expect(f.core.contentPurge.checkpoint().deletedHumans).toBeUndefined();
          await expect(attempt).rejects.toMatchObject({ code: 'purge-scope-unsupported' });
        } else
          expect(() => f.core.team.purgePreview(owner, 'bob')).toThrowError(
            /outside current Human read access/u,
          );
        expect(f.core.contentPurge.checkpoint().deletedHumans).toBeUndefined();
        expect(f.core.team.member('bob')?.status).toBe('deactivated');
        expect(f.core.operationalDatabase.mode).toBe('ready');
      } finally {
        release();
        await Promise.allSettled([deletion, ...(attempt ? [attempt] : [])]);
      }
      expect(f.core.deletions.get(bot.bot.slug)).toMatchObject({
        phase: 'complete',
        memory: 'retained',
      });
      expect(existsSync(bot.memory)).toBe(true);
      const fresh = f.core.team.purgePreview(owner, 'bob');
      await f.core.team.purgeConfirm(owner, 'bob', fresh.token, 'bob');
      expect(f.core.deletions.get(bot.bot.slug)).toMatchObject({
        phase: 'complete',
        memory: 'erased',
      });
      expect(existsSync(bot.memory)).toBe(false);
    },
  );

  it('purges a former Owner with relationship-derived devices while preserving the Host relationship', async () => {
    const f = fixture({ seed: false });
    const pairing = createDevicePairing({
      database: f.db,
      hostName: 'Host',
      ownerHumanId: () => f.core.team.ownerContext().humanId,
    });
    const off = f.core.team.bindPairing(pairing);
    closes.push(async () => {
      off();
      pairing.clearOffers();
    });
    const relationships = createHostRelationships({ database: f.db, pairing });
    const peer = {
      id: 'peer',
      name: 'Peer',
      publicKey: 'ab'.repeat(32),
      routes: ['http://127.0.0.1:3000'],
    };
    const relationship = relationships.propose({ peer, direction: 'incoming' });
    relationships.approve(relationship.id, peer.publicKey);
    relationships.activate(relationship.id, peer.publicKey);
    const publicKey = 'cd'.repeat(32);
    const offer = relationships.enrollment(relationship.id, peer.publicKey, {
      publicKey,
      name: 'Owner device',
    });
    const device = pairing.redeem({ offer: offer.offer, publicKey });
    if (!device.ok) throw new Error(device.code);
    await f.core.team.setOwnerPassword(owner, 'owner-password-1');
    await f.core.team.setMode(owner, true);
    const next = await f.core.team.createMember(owner, 'next-owner', 'Next Owner');
    const nextOwner = humanContext(next.member.humanId);
    await f.core.team.changePassword(nextOwner, next.initialPassword, 'next-password-1');
    await f.core.team.transferOwner(owner, nextOwner.humanId, 'owner-password-1');
    await f.core.team.deactivate(nextOwner, owner.humanId);
    const preview = f.core.team.purgePreview(nextOwner, owner.humanId);
    await f.core.team.purgeConfirm(nextOwner, owner.humanId, preview.token, 'owner');
    expect(f.core.operationalDatabase.mode).toBe('ready');
    expect(
      f.db.read((db) =>
        db
          .prepare('SELECT 1 FROM relationship_device_grants WHERE device_id = ?')
          .get(device.device.id),
      ),
    ).toBeUndefined();
    expect(relationships.list().find((entry) => entry.id === relationship.id)?.state).toBe(
      'active',
    );
    const nextKey = 'ef'.repeat(32);
    const nextOffer = relationships.enrollment(relationship.id, peer.publicKey, {
      publicKey: nextKey,
      name: 'New Owner device',
    });
    const nextDevice = pairing.redeem({ offer: nextOffer.offer, publicKey: nextKey });
    if (!nextDevice.ok) throw new Error(nextDevice.code);
    expect(pairing.admit(`Device ${nextDevice.credential}`).ok).toBe(true);
    expect(f.db.read((db) => db.prepare('PRAGMA foreign_key_check').all())).toEqual([]);
  });

  it('fails closed if a remaining member-owned Bot loses its accepted deletion state', async () => {
    const f = fixture();
    const bot = createBot(f);
    await f.core.team.deactivate(owner, 'bob');
    const off = f.core.operationalDatabase.subscribe(({ topics }) => {
      if (topics.includes('member-purged'))
        f.db.transaction((db) => {
          db.prepare('DELETE FROM persona_bot_deletions WHERE slug = ?').run(bot.bot.slug);
        });
    });
    try {
      const preview = f.core.team.purgePreview(owner, 'bob');
      await expect(f.core.team.purgeConfirm(owner, 'bob', preview.token, 'bob')).rejects.toThrow(
        'Deletion has not been accepted',
      );
      expect(f.core.operationalDatabase.mode).toBe('recovery');
      expect(existsSync(bot.memory)).toBe(true);
    } finally {
      off();
    }
  });

  it('stops restored member Bots and revokes resources even when Memory is already absent', async () => {
    const path = createTempRoot('member-workspace-');
    const workspace = {
      id: 'workspace',
      path,
      title: 'Workspace',
      status: async () => 'ok' as const,
    };
    const workspaces = () => ({
      get: (id: string) => (id === workspace.id ? workspace : undefined),
      list: () => [workspace],
    });
    const f = fixture({ coreOptions: { workspaces } });
    const bot = createBot(f);
    const grant = await f.core.grants.create(bot.bot.slug, workspace.id);
    const rule = f.core.toolRules.createPending({
      botSlug: bot.bot.slug,
      role: 'orchestrator',
      scopeKey: '*',
      kind: 'tool',
      toolName: 'read_file',
      input: '{}',
    });
    f.core.toolRules.activate(bot.bot.slug, rule.id);
    await restoreDeletionFact(f, [bot.bot.slug]);
    rmSync(bot.memory, { recursive: true });
    const erasePrivateAccounts = vi.fn(async () => {});
    const restored = fixture({
      dshHome: f.dshHome,
      seed: false,
      coreOptions: { workspaces, erasePrivateAccounts },
    });
    await restored.core.contentPurge.memberSettled();
    expect(erasePrivateAccounts).toHaveBeenCalledWith(bot.bot.slug);
    expect(
      restored.core.grants.list(bot.bot.slug).find((entry) => entry.id === grant.id)?.revokedAt,
    ).toBeDefined();
    expect(
      restored.core.toolRules.list(bot.bot.slug).find((entry) => entry.id === rule.id)?.revokedAt,
    ).toBeDefined();
    expect(restored.core.deletions.get(bot.bot.slug)).toMatchObject({
      phase: 'complete',
      memory: 'erased',
    });
  });

  it.each([false, true])(
    'preserves a restored different-owner Bot and fails closed on remaining cleanup failure=%s',
    async (failStop) => {
      const f = fixture();
      const transferred = createBot(f, bob, 'transferred');
      writeFileSync(join(transferred.memory, 'keep.md'), 'Alice retained Memory');
      await f.core.team.transfer(owner, 'bob', 'alice');
      const remaining = createBot(f, bob, 'remaining');
      await restoreDeletionFact(f, [transferred.bot.slug, remaining.bot.slug]);
      const erasePrivateAccounts = vi.fn(async () => {
        if (failStop) throw new Error('cleanup-stop-unavailable');
      });
      const restored = fixture({
        dshHome: f.dshHome,
        seed: false,
        coreOptions: { erasePrivateAccounts },
      });
      if (failStop) {
        await expect(restored.core.contentPurge.memberSettled()).rejects.toThrow('unavailable');
        expect(restored.core.operationalDatabase.mode).toBe('recovery');
      } else {
        await restored.core.contentPurge.memberSettled();
        expect(restored.core.operationalDatabase.mode).toBe('ready');
        expect(restored.core.registry.get(transferred.bot.slug)?.ownerHumanId).toBe('alice');
        expect(restored.core.deletions.get(transferred.bot.slug)).toBeUndefined();
        expect(restored.core.deletions.get(remaining.bot.slug)).toMatchObject({
          phase: 'complete',
          memory: 'erased',
        });
        expect(existsSync(remaining.memory)).toBe(false);
      }
      expect(erasePrivateAccounts).toHaveBeenCalledExactlyOnceWith(remaining.bot.slug);
      expect(readFileSync(join(transferred.memory, 'keep.md'), 'utf8')).toBe(
        'Alice retained Memory',
      );
    },
  );

  it.each([null, '2026-11-14T01:00:00Z'])(
    'retains a Bot-owner DM with another Human membership, left_at=%s',
    async (leftAt) => {
      const f = fixture();
      const shared = createBot(f, bob, 'shared-bot');
      const privateBot = createBot(f, bob, 'private-bot');
      f.db.transaction((db) =>
        db
          .prepare(`INSERT INTO channel_human_members
      (channel_id, human_id, display_name, visible_from_revision, joined_at, left_at)
      VALUES (?, 'alice', 'Alice', 1, '2026-11-14', ?)`)
          .run(shared.dm.id, leftAt),
      );
      const upload = (name: string) =>
        f.core.attachments.upload({
          name,
          data: (async function* () {
            yield Buffer.from(name);
          })(),
        });
      const sharedFile = await upload('alice-file.txt'),
        privateFile = await upload('bob-file.txt');
      for (const [human, channelId, file] of [
        [alice, shared.dm.id, sharedFile],
        [bob, privateBot.dm.id, privateFile],
      ] as const)
        await f.core.channels.appendMessage(human, channelId, {
          id: 'message',
          at: new Date().toISOString(),
          author: { kind: 'human', humanId: human.humanId },
          body: 'retained ' + human.humanId,
          attachments: [file],
        });
      await f.core.team.deactivate(owner, 'bob');
      const preview = f.core.team.purgePreview(owner, 'bob');
      expect(preview.counts).toEqual({ channels: 1, bots: 2, messages: 1, files: 1 });
      await f.core.team.purgeConfirm(owner, 'bob', preview.token, 'bob');
      expect(f.core.channels.get(shared.dm.id)).toBeDefined();
      expect(f.core.channels.readMessages(shared.dm.id)[0]?.body).toBe('retained alice');
      expect(f.core.attachments.has(sharedFile)).toBe(true);
      expect(f.core.channels.get(privateBot.dm.id)).toBeUndefined();
      expect(f.core.attachments.has(privateFile)).toBe(false);
    },
  );

  it.each(['purge', 'transfer-first'])(
    'scopes real channelDm, Tob and exclusive Bot DMs: %s',
    async (operation) => {
      const f = fixture();
      expect(
        f.core.registry.create({ slug: 'bob-bot', ownerHumanId: 'bob', displayName: 'Bob Bot' }).ok,
      ).toBe(true);
      const second = createBot(f, bob, 'bob-second');
      const other = createBot(f, alice, 'alice-bot');
      const opened = createBridgeMethodsForHumans(f.core)(bob).channelDm({ slug: 'bob-bot' });
      if (!opened.ok) throw new Error('DM unavailable');
      const tob = await f.core.tob.ensure(bob);
      const exclusive = f.core.channels.getOrCreateBotDm(bob, 'bob-bot', 'bob-second', 'Exclusive');
      const mixed = f.core.channels.getOrCreateBotDm(bob, 'bob-bot', 'alice-bot', 'Mixed');
      if (!exclusive || !mixed) throw new Error('Bot DM unavailable');
      const upload = (name: string) =>
        f.core.attachments.upload({
          name,
          data: (async function* () {
            yield Buffer.from(name);
          })(),
        });
      const tobFile = await upload('tob-private.txt');
      const botFile = await upload('bot-private.txt');
      for (const channelId of [opened.value.channel.id, second.dm.id, tob.channelId])
        await f.core.channels.appendMessage(bob, channelId, {
          id: 'private-' + channelId,
          at: new Date().toISOString(),
          author: { kind: 'human', humanId: 'bob' },
          body: 'private body',
          attachments: [channelId === tob.channelId ? tobFile : botFile],
        });
      if (operation === 'transfer-first') await f.core.team.transfer(owner, 'bob', 'alice');
      await f.core.team.deactivate(owner, 'bob');
      const preview = f.core.team.purgePreview(owner, 'bob');
      expect(preview.counts).toEqual(
        operation === 'purge'
          ? { channels: 4, bots: 3, messages: 3, files: 2 }
          : { channels: 1, bots: 1, messages: 1, files: 1 },
      );
      await f.core.team.purgeConfirm(owner, 'bob', preview.token, 'bob');
      expect(f.core.channels.get(tob.channelId)).toBeUndefined();
      expect(f.core.attachments.has(tobFile)).toBe(false);
      for (const channelId of [opened.value.channel.id, second.dm.id, exclusive.id])
        expect(Boolean(f.core.channels.get(channelId))).toBe(operation === 'transfer-first');
      expect(f.core.attachments.has(botFile)).toBe(operation === 'transfer-first');
      for (const channelId of [other.dm.id, mixed.id])
        expect(f.core.channels.get(channelId)).toBeDefined();
    },
  );

  it('publishes deleted authors after commit and repairs an already open shared Channel', async () => {
    const f = fixture();
    const shared = f.core.channels.createGroup(owner, { name: 'Shared', members: [] });
    f.core.team.setPublic(owner, shared.id, true);
    f.core.team.joinPublic(alice, shared.id);
    await f.core.channels.appendMessage(owner, shared.id, {
      id: 'shared-author',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: 'bob', displayName: 'Bob' },
      body: 'body stays',
    });
    await f.core.team.deactivate(owner, 'bob');
    const controller = new AbortController();
    const stream = f.core.live
      .followChannel(alice, shared.id, 50, controller.signal)
      [Symbol.asyncIterator]();
    await stream.next();
    const authors: unknown[] = [];
    const publish = f.core.live.publishRosterCommitted.bind(f.core.live);
    vi.spyOn(f.core.live, 'publishRosterCommitted').mockImplementation(() => {
      authors.push(f.core.channels.readMessages(shared.id)[0]?.author);
      publish();
    });
    try {
      const next = stream.next();
      const preview = f.core.team.purgePreview(owner, 'bob');
      await f.core.team.purgeConfirm(owner, 'bob', preview.token, 'bob');
      expect(authors).toContainEqual({ kind: 'human', humanId: 'bob', deleted: true });
      let tail = await next;
      for (let i = 0; !tail.done && i < 5; i++) tail = await stream.next();
      expect(tail).toMatchObject({ done: true });
      const repaired = f.core.live
        .followChannel(alice, shared.id, 50, controller.signal)
        [Symbol.asyncIterator]();
      try {
        expect(await repaired.next()).toMatchObject({
          value: {
            type: 'opened',
            page: {
              entries: [
                { message: { body: 'body stays', author: { humanId: 'bob', deleted: true } } },
              ],
            },
          },
        });
      } finally {
        await repaired.return?.();
      }
    } finally {
      controller.abort();
      await stream.return?.();
    }
  });

  it.each(['tob', 'transferred', 'never-signed-in'])(
    'purges a %s member created through the real sign-in lifecycle under an aliased Profile path',
    async (scenario) => {
      const root = createTempRoot('member-sign-in-purge-');
      mkdirSync(join(root, 'actual'));
      symlinkSync(join(root, 'actual'), join(root, 'profile-alias'), 'dir');
      const f = fixture({ dshHome: join(root, 'profile-alias', 'home'), seed: false });
      const ctx = new Context();
      const off = f.core.team.bindRuntime({
        createPeer: (principal) => new Peer(ctx, { principal }),
        invalidate() {},
        urls: () => [],
      });
      closes.push(async () => {
        await off();
        await ctx.fiber.dispose();
      });
      await f.core.team.setOwnerPassword(owner, 'owner-password-1');
      await f.core.team.setMode(owner, true);
      const created = await f.core.team.createMember(owner, 'bob', 'Bob');
      const human = humanContext(created.member.humanId);
      if (scenario !== 'never-signed-in')
        await f.core.team.signIn('bob', created.initialPassword, 'first-sign-in');
      const tobSlug = f.core.tob.slug(human);
      expect(Boolean(tobSlug)).toBe(scenario !== 'never-signed-in');
      const memory = tobSlug && f.core.registry.memoryDirFor(tobSlug);
      if (memory) writeFileSync(join(memory, 'private.md'), 'private Tob Memory');
      const shared = f.core.channels.createGroup(owner, {
        name: 'General',
        members: [],
      });
      f.core.team.setPublic(owner, shared.id, true);
      f.core.team.joinPublic(human, shared.id);
      await f.core.channels.appendMessage(human, shared.id, {
        id: 'shared-member-post',
        at: new Date().toISOString(),
        author: { kind: 'human', humanId: human.humanId, displayName: 'Bob' },
        body: 'shared text stays',
      });
      let transferredMemory: string | undefined;
      if (scenario === 'transferred') {
        const target = await f.core.team.createMember(owner, 'alice', 'Alice');
        const bot = createBot(f, human, 'transferred-bot');
        transferredMemory = bot.memory;
        await f.core.team.transfer(owner, human.humanId, target.member.humanId);
      }
      await f.core.team.resetPassword(owner, human.humanId);
      await f.core.team.deactivate(owner, human.humanId);
      await f.core.team.setMode(owner, false);
      await f.core.team.setMode(owner, true);
      await f.core.team.reactivate(owner, human.humanId);
      await f.core.team.deactivate(owner, human.humanId);
      expect(f.core.team.transferPreview(owner, human.humanId)).toEqual({ channels: [], bots: [] });
      const preview = f.core.team.purgePreview(owner, human.humanId);
      expect(preview.counts.bots).toBe(tobSlug ? 1 : 0);
      await f.core.team.purgeConfirm(owner, human.humanId, preview.token, 'bob');
      expect(f.core.team.member(human.humanId)).toBeUndefined();
      if (tobSlug) {
        expect(f.core.registry.get(tobSlug)).toBeUndefined();
        expect(f.core.deletions.get(tobSlug)).toMatchObject({
          memory: 'erased',
          phase: 'complete',
        });
        expect(existsSync(memory!)).toBe(false);
      }
      if (transferredMemory) {
        expect(f.core.registry.get('transferred-bot')).toBeDefined();
        expect(existsSync(transferredMemory)).toBe(true);
      }
      expect(f.core.channels.readMessages(shared.id)[0]).toMatchObject({
        body: 'shared text stays',
        author: { humanId: human.humanId, deleted: true },
      });
      expect(f.core.channels.readMessages(shared.id)[0]?.author).not.toHaveProperty('displayName');
    },
  );

  it('upgrades a database that already applied main generation 144 to 145 without losing identity or ownership', () => {
    const home = createTempRoot('m2-m9-migration-');
    const previous = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 144),
      ),
    });
    const port = attachOperationalModule(previous, 'm2-m9-old');
    expect(previous.generation).toBe(144);
    port.transaction((db) => {
      db.prepare(`INSERT INTO host_relationships
        (relationship_id, peer_host_id, peer_name, peer_key, peer_routes, direction, state, expires_at, created_at, updated_at)
        VALUES ('relationship', 'peer', 'Peer', 'key', '[]', 'outgoing', 'active', 0, '2026-11-14', '2026-11-14')`).run();
      db.prepare(
        "INSERT INTO humans VALUES ('bob', 'Bob', 'active', '2026-11-14T00:00:00Z')",
      ).run();
      db.prepare("INSERT INTO human_roles VALUES ('bob', 'member')").run();
      db.prepare("INSERT INTO member_credentials VALUES ('bob', 'bob', '{}', '[]', 1)").run();
      db.prepare('INSERT INTO persona_bots(slug, body, owner_human_id) VALUES (?, ?, ?)').run(
        'bob-bot',
        JSON.stringify({
          slug: 'bob-bot',
          displayName: 'Bob Bot',
          ownerHumanId: 'bob',
          createdAt: '2026-11-14T00:00:00Z',
          workspaces: [],
        }),
        'bob',
      );
      db.prepare("INSERT INTO tob_identity VALUES ('bob', 'bob-bot')").run();
    });
    previous.close();
    const upgraded = trackTestOwner(
      mountOperationalDatabase({
        dshHome: home,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 145),
        ),
      }),
    );
    expect(upgraded.mode).toBe('ready');
    expect(upgraded.generation).toBe(145);
    const check = attachOperationalModule(upgraded, 'm2-m9-new');
    expect(
      check.read((db) =>
        db
          .prepare('SELECT peer_host_id FROM host_relationships WHERE relationship_id = ?')
          .get('relationship'),
      ),
    ).toEqual({ peer_host_id: 'peer' });
    expect(check.read((db) => db.prepare('PRAGMA foreign_key_check').all())).toEqual([]);
    expect(
      check.read((db) =>
        db
          .prepare(
            "SELECT owner_human_id, json_extract(body, '$.ownerHumanId') AS owner FROM persona_bots WHERE slug = 'bob-bot'",
          )
          .get(),
      ),
    ).toEqual({ owner_human_id: 'bob', owner: 'bob' });
    expect(
      check.read((db) => db.prepare("SELECT * FROM tob_identity WHERE human_id = 'bob'").get()),
    ).toEqual({ human_id: 'bob', bot_slug: 'bob-bot' });
    expect(
      check.read((db) =>
        db.prepare("SELECT username FROM member_credentials WHERE human_id = 'bob'").get(),
      ),
    ).toEqual({ username: 'bob' });
    check.transaction((db) =>
      db.prepare("UPDATE humans SET status = 'deactivated' WHERE human_id = 'bob'").run(),
    );
  });

  it('transfers private Bots and their history while keeping Tob bound to the original member', async () => {
    const f = fixture();
    const original = createBot(f);
    createBot(f, alice, 'alice-bot');
    const tob = await f.core.tob.ensure(bob);
    writeFileSync(join(original.memory, 'transferred.md'), 'private transferred memory');
    const group = f.core.channels.createGroup(owner, {
      name: 'Bot group',
      members: [original.bot.slug],
    });
    f.db.transaction((db) =>
      db
        .prepare(
          "INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at) VALUES (?, 'bob', 'Bob', 1, '2026-11-14T00:00:00Z')",
        )
        .run(group.id),
    );
    await f.core.channels.appendMessage(bob, original.dm.id, {
      id: 'history',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: bob.humanId },
      body: 'history retained for transferred Bot',
    });
    expect(f.core.team.transferPreview(owner, 'bob').bots).toEqual([
      { slug: 'bob-bot', displayName: 'bob-bot' },
    ]);
    const controller = new AbortController();
    const rosters = [bob, alice].map((human) =>
      f.core.live.followRoster(human, controller.signal)[Symbol.asyncIterator](),
    );
    await Promise.all(rosters.map((roster) => roster.next()));
    const changed = rosters.map((roster) => roster.next());
    try {
      await f.core.team.transfer(owner, 'bob', 'alice');
      expect(await Promise.all(changed)).toMatchObject([
        { value: { type: 'changed' } },
        { value: { type: 'changed' } },
      ]);
    } finally {
      controller.abort();
      await Promise.all(rosters.map((roster) => roster.return?.()));
    }

    expect(f.core.registry.list('bob').map((bot) => bot.slug)).toEqual([tob.botSlug]);
    expect(
      f.core.registry
        .list('alice')
        .map((bot) => bot.slug)
        .sort(),
    ).toEqual(['alice-bot', 'bob-bot']);
    expect(f.core.tob.slug(bob)).toBe(tob.botSlug);
    expect(f.core.registry.get(tob.botSlug)?.ownerHumanId).toBe('bob');
    expect(f.core.team.belongs(alice, group.id)).toBe(true);
    expect(readFileSync(join(original.memory, 'transferred.md'), 'utf8')).toBe(
      'private transferred memory',
    );
    const methods = createBridgeMethodsForHumans(f.core);
    expect(methods(bob).get({ slug: 'bob-bot' })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(methods(alice).get({ slug: 'bob-bot' })).toMatchObject({ ok: true });
    expect(f.core.channels.readMessages(original.dm.id)[0]?.body).toBe(
      'history retained for transferred Bot',
    );
  });

  it('stops the transferred Bot and rejects queued turns captured under the former owner', async () => {
    const options = { running: true };
    const f = fixture(options);
    createBot(f);
    const admission = await send(f, 'bob-bot', 'first-turn');
    expect(admission.admitted).toBe(true);
    if (!admission.admitted) throw new Error(admission.reason);
    await Promise.race([f.firstRun, admission.settled]);
    expect(f.runs).toHaveBeenCalledOnce();
    await send(f, 'bob-bot', 'queued-turn');
    await f.core.team.transfer(owner, 'bob', 'alice');
    expect(f.runs).toHaveBeenCalledOnce();
    expect(f.stop.mock.calls.map(([slug]) => slug)).toContain('bob-bot');
    options.running = false;
    await f.core.channels.appendMessage(alice, 'dm-bob-bot', {
      id: 'new-owner',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: 'alice' },
      body: 'new owner request',
    });
    expect(
      f.core.runtime.admitDmMessage(alice, {
        channelId: 'dm-bob-bot',
        messageId: 'new-owner',
        body: 'new owner request',
      }).admitted,
    ).toBe(true);
    await f.core.runtime.whenIdle();
    expect(f.runs.mock.calls.map(([run]) => run.bot.ownerHumanId)).toEqual(['bob', 'alice']);
  });

  it('purges retained private Bots, Tob, private messages, files and Memory while preserving shared authorship', async () => {
    const f = fixture();
    const original = createBot(f);
    const aliceBot = createBot(f, alice, 'alice-bot');
    const tob = await f.core.tob.ensure(bob);
    const tobMemory = f.core.registry.memoryDirFor(tob.botSlug)!;
    expect(() => f.core.deletions.preview(tob.botSlug)).toThrowError('protected-bot');
    const file = await f.core.attachments.upload({
      name: 'private.txt',
      data: (async function* () {
        yield Buffer.from('private attachment');
      })(),
    });
    writeFileSync(join(original.memory, 'private.md'), 'Bob private memory');
    writeFileSync(join(tobMemory, 'private.md'), 'Bob Tob memory');
    const shared = f.core.channels.createGroup(owner, { name: 'Shared', members: [] });
    await f.core.channels.appendMessage(owner, shared.id, {
      id: 'shared',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: 'bob', displayName: 'Bob' },
      body: 'shared text stays',
    });
    for (const channelId of [original.dm.id, tob.channelId])
      await f.core.channels.appendMessage(bob, channelId, {
        id: 'private-' + channelId,
        at: new Date().toISOString(),
        author: { kind: 'human', humanId: 'bob', displayName: 'Bob' },
        body: 'private body',
        attachments: [file],
      });
    await f.core.team.deactivate(owner, 'bob');
    const preview = f.core.team.purgePreview(owner, 'bob');
    expect(preview.counts).toMatchObject({ bots: 2, channels: 2, messages: 2, files: 1 });
    await f.core.team.purgeConfirm(owner, 'bob', preview.token, 'bob');
    for (const slug of ['bob-bot', tob.botSlug]) {
      expect(f.core.registry.get(slug)).toBeUndefined();
      expect(f.core.deletions.get(slug)).toMatchObject({ phase: 'complete', memory: 'erased' });
    }
    const inventory = createBridgeMethodsForHumans(f.core)(owner).list({ administration: true });
    expect(inventory).toMatchObject({ ok: true });
    if (!inventory.ok) throw new Error('inventory unavailable');
    for (const slug of ['bob-bot', tob.botSlug])
      expect(inventory.value.bots.find((bot) => bot.slug === slug)).toMatchObject({
        deleted: true,
        displayName: '',
      });
    expect(f.core.attachments.has(file)).toBe(false);
    expect(existsSync(original.memory)).toBe(false);
    expect(existsSync(tobMemory)).toBe(false);
    expect(existsSync(aliceBot.memory)).toBe(true);
    expect(f.core.registry.get('alice-bot')).toBeDefined();
    expect(f.core.tob.slug(bob)).toBeUndefined();
    expect(f.core.team.member('bob')).toBeUndefined();
    expect(f.core.channels.readMessages(shared.id)[0]).toMatchObject({
      body: 'shared text stays',
      author: { kind: 'human', humanId: 'bob', deleted: true },
    });
    expect(f.core.channels.readMessages(shared.id)[0]?.author).not.toHaveProperty('displayName');
    expect(
      f.db.read((db) =>
        db.prepare("SELECT 1 FROM source_events WHERE body = 'private body'").get(),
      ),
    ).toBeUndefined();
    expect(JSON.stringify(f.core.contentPurge.checkpoint())).not.toContain('Bob private memory');
  });

  it('does not recreate a Tob grant when offboarding finishes during first-sign-in workspace setup', async () => {
    const f = fixture();
    let finish: ((value: { id: string }) => void) | undefined;
    const workspace = new Promise<{ id: string }>((resolve) => {
      finish = resolve;
    });
    const tob = createTobService({
      database: f.db,
      registry: f.core.registry,
      channels: f.core.channels,
      workspaceRoot: join(f.dshHome, 'pending-tob-workspaces'),
      grants: f.core.grants,
      ensureWorkspace: async () => workspace,
    });
    const createGrant = vi.spyOn(f.core.grants, 'create');
    const preparing = tob.ensure(bob);
    const rejected = expect(preparing).rejects.toMatchObject({ code: 'tob-identity-unavailable' });
    await f.core.team.deactivate(owner, 'bob');
    const preview = f.core.team.purgePreview(owner, 'bob');
    await f.core.team.purgeConfirm(owner, 'bob', preview.token, 'bob');
    if (!finish) throw new Error('workspace was not pending');
    finish({ id: 'late-workspace' });
    await rejected;
    expect(createGrant).not.toHaveBeenCalled();
    expect(tob.slug(bob)).toBeUndefined();
  });

  it('refuses unsafe Memory before accepting member deletion, including the private Tob', async () => {
    const f = fixture();
    const tob = await f.core.tob.ensure(bob);
    const path = f.core.registry.memoryDirFor(tob.botSlug)!;
    const retained = createTempRoot('m2-m9-retained-');
    writeFileSync(join(retained, 'keep.txt'), 'unrelated retained data');
    renameSync(path, path + '-original');
    symlinkSync(retained, path, 'dir');
    await f.core.team.deactivate(owner, 'bob');
    expect(() => f.core.team.purgePreview(owner, 'bob')).toThrowError(
      /outside current Human read access/u,
    );
    expect(f.core.team.member('bob')?.status).toBe('deactivated');
    expect(readFileSync(join(retained, 'keep.txt'), 'utf8')).toBe('unrelated retained data');
    expect(f.core.contentPurge.checkpoint().deletedHumans).toBeUndefined();
    expect(f.core.registry.get(tob.botSlug)).toBeDefined();
  });

  it('replays Bot and Memory deletion over a pre-offboarding database snapshot without reviving Tob', async () => {
    const f = fixture();
    const bot = createBot(f);
    const tob = await f.core.tob.ensure(bob);
    const tobMemory = f.core.registry.memoryDirFor(tob.botSlug)!;
    writeFileSync(join(bot.memory, 'secret.md'), 'private memory before purge');
    const snapshot = join(f.dshHome, 'before-offboarding.db');
    await f.core.runtime.close();
    f.core.operationalDatabase.close();
    copyFileSync(join(f.dshHome, 'botharness', 'botharness.db'), snapshot);
    const live = fixture({ dshHome: f.dshHome, seed: false });
    await live.core.team.deactivate(owner, 'bob');
    const preview = live.core.team.purgePreview(owner, 'bob');
    await live.core.team.purgeConfirm(owner, 'bob', preview.token, 'bob');
    await live.core.runtime.close();
    live.core.operationalDatabase.close();
    copyFileSync(snapshot, join(f.dshHome, 'botharness', 'botharness.db'));
    const restored = fixture({ dshHome: f.dshHome, seed: false });
    await restored.core.contentPurge.memberSettled();
    expect(restored.core.operationalDatabase.mode).toBe('ready');
    expect(restored.core.team.member('bob')).toBeUndefined();
    expect(restored.core.registry.list('bob')).toEqual([]);
    expect(restored.core.tob.slug(bob)).toBeUndefined();
    expect(existsSync(bot.memory)).toBe(false);
    expect(existsSync(tobMemory)).toBe(false);
    expect(restored.core.deletions.get('bob-bot')).toMatchObject({
      phase: 'complete',
      memory: 'erased',
    });
  });

  it.each(['deactivate', 'off'] as const)(
    '%s stops existing turns and blocks private Bot and Tob admission without changing explicit pause settings',
    async (operation) => {
      const f = fixture({ running: true });
      const bot = createBot(f);
      createBot(f, bob, 'paused-bot');
      expect(f.core.registry.setPaused('paused-bot', true)).toMatchObject({ ok: true });
      const tob = await f.core.tob.ensure(bob);
      const group = f.core.channels.createGroup(bob, { name: 'Mentions', members: ['bob-bot'] });
      const schedule = f.core.schedules.create(
        'bob-bot',
        {
          title: 'Blocked schedule',
          prompt: 'Must not run',
          trigger: { kind: 'every', everySeconds: 3600 },
        },
        'human',
      );
      const result = await send(f, 'bob-bot', 'running');
      expect(result.admitted).toBe(true);
      if (!result.admitted) throw new Error(result.reason);
      await Promise.race([f.firstRun, result.settled]);
      expect(f.runs).toHaveBeenCalledOnce();
      if (operation === 'deactivate') await f.core.team.deactivate(owner, 'bob');
      else await f.core.team.setMode(owner, false);
      expect(f.stop.mock.calls.map(([slug]) => slug)).toContain('bob-bot');
      expect(f.stop.mock.calls.map(([slug]) => slug)).toContain(tob.botSlug);
      expect(f.core.registry.get('bob-bot')?.paused).toBeUndefined();
      expect((await send(f, 'bob-bot', 'blocked')).admitted).toBe(false);
      expect((await send(f, tob.botSlug, 'blocked-tob')).admitted).toBe(false);
      await f.core.channels.appendMessage(bob, group.id, {
        id: 'blocked-mention',
        at: new Date().toISOString(),
        author: { kind: 'human', humanId: 'bob' },
        body: '@bob-bot must not run',
        mentions: [{ botSlug: 'bob-bot', label: 'bob-bot', start: 0, end: 8 }],
      });
      f.core.runtime.admitGroupMessage(group.id, 'blocked-mention');
      f.core.schedules.runNow('bob-bot', schedule.id);
      await f.core.runtime.whenIdle();
      expect(f.runs).toHaveBeenCalledOnce();
      expect(existsSync(bot.memory)).toBe(true);
      if (operation === 'deactivate') await f.core.team.reactivate(owner, 'bob');
      else {
        await f.core.team.setOwnerPassword(owner, 'owner-password-1');
        await f.core.team.setMode(owner, true);
      }
      expect(f.core.team.member('bob')?.status).toBe('active');
      expect(f.core.tob.slug(bob)).toBe(tob.botSlug);
      expect(f.core.registry.get('bob-bot')?.ownerHumanId).toBe('bob');
      expect(f.core.registry.get('paused-bot')?.paused).toBe(true);
    },
  );
});
