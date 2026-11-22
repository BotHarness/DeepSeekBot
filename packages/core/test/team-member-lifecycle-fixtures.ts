import { afterEach, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createCore } from '../src/plugin.js';
import { humanContext } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';
import { openPurgeLedger } from '../src/purge/ledger.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';

export const bob = humanContext('bob');
export const alice = humanContext('alice');
export const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});

export function fixture(
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
  if (options.seed !== false && !core.team.member('bob')) {
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
    for (const human of [bob, alice]) core.team.spaces.ensureAccount(human.humanId);
  }
  return { core, dshHome, db, runs, stop, firstRun };
}

export async function restoreDeletionFact(f: ReturnType<typeof fixture>, privateBots: string[]) {
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

export function createBot(f: ReturnType<typeof fixture>, human = bob, slug = 'bob-bot') {
  const result = f.core.registry.create({ slug, ownerHumanId: human.humanId, displayName: slug });
  if (!result.ok) throw new Error('Bot fixture failed');
  const dm = f.core.channels.getOrCreateDm(human, slug, slug);
  if (!dm) throw new Error('DM fixture failed');
  return { bot: result.record, dm, memory: f.core.registry.memoryDirFor(slug)! };
}
export function legacyMemberTob(f: ReturnType<typeof fixture>) {
  const { bot, dm } = createBot(f, bob, 'legacy-tob');
  return { botSlug: bot.slug, channelId: dm.id };
}

export function accountFileCount(f: ReturnType<typeof fixture>) {
  const root = join(f.dshHome, 'spaces', bob.humanId);
  return readdirSync(root, { recursive: true, withFileTypes: true }).filter(
    (entry) => !entry.isDirectory(),
  ).length;
}
export async function send(f: ReturnType<typeof fixture>, slug: string, id: string) {
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
