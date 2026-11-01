import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createUsageProjection } from '../src/usage/usage.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import type { DshSessionEvent } from '../src/sessions/source.js';

const SINCE = '2000-01-01T00:00:00.000Z';
const TIME = Date.now();
const settlement = (seq: number, time = TIME): DshSessionEvent => ({
  type: 'assistant/message',
  seq,
  time,
  surfaceOp: 'append',
  data: {
    message: { source: { provider: 'actual-provider', model: 'actual-model' } },
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 50,
      cacheWriteTokens: 0,
      totalTokens: 170,
    },
  },
});

function open(home: string) {
  const database = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const ownership = createSessionOwnership(attachOperationalModule(database, 'session-ownership'));
  const usage = createUsageProjection({ ownership, database });
  return { database, ownership, usage };
}

function claim(
  ownership: ReturnType<typeof createSessionOwnership>,
  sessionId: string,
  botSlug = 'ada',
) {
  ownership.claim({
    sessionId,
    botSlug,
    rootRole: 'orchestrator',
    at: new Date(TIME - 1000).toISOString(),
  });
}

it('retains missing histories across restarts and never recounts restored or late evidence', async () => {
  const home = createTempRoot('botharness-retained-usage-');
  const first = open(home);
  claim(first.ownership, 'deleted-session');
  claim(first.ownership, 'surviving-session');
  first.usage.handleSessionEvent('deleted-session', settlement(1));
  first.usage.handleSessionEvent('surviving-session', settlement(1));
  const before = first.usage.activity('ada', SINCE);
  first.database.close();

  const restarted = open(home);
  expect(
    await restarted.usage.rebuild(['deleted-session', 'surviving-session'], async (id) =>
      id === 'deleted-session' ? undefined : { events: [settlement(1)], inheritedEventCount: 0 },
    ),
  ).toEqual({ folded: 0, failed: 1 });
  expect(restarted.usage.activity('ada', SINCE)).toEqual(before);
  restarted.usage.handleSessionEvent('deleted-session', settlement(1));
  expect(
    await restarted.usage.rebuild(['deleted-session'], async () => ({
      events: [settlement(1), settlement(2)],
      inheritedEventCount: 0,
    })),
  ).toEqual({ folded: 1, failed: 0 });
  restarted.usage.handleSessionEvent('deleted-session', settlement(2));
  expect(restarted.usage.activity('ada', SINCE)[0]?.totalTokens).toBe(510);
  restarted.database.close();
  const again = open(home);
  expect(
    await again.usage.rebuild(['deleted-session', 'surviving-session'], async () => {
      throw new Error('history deleted');
    }),
  ).toEqual({ folded: 0, failed: 2 });
  expect(again.usage.activity('ada', SINCE)[0]?.totalTokens).toBe(510);
  const receipts = attachOperationalModule(again.database, 'usage').read((db) =>
    db.prepare('SELECT * FROM usage_receipts').all(),
  );
  expect(receipts).toHaveLength(3);
  expect(JSON.stringify(receipts)).not.toContain('deleted-session');
  expect(Object.keys(receipts[0]!)).toEqual(['fingerprint', 'bot_slug']);
});

it('rolls back the entire reconciliation after projecting multiple sessions', async () => {
  let failCommit = false;
  const home = createTempRoot('botharness-rebuild-rollback-');
  const database = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      faultInjector: ({ stage }) => {
        if (failCommit && stage === 'before-commit') throw new Error('rebuild commit failed');
      },
    }),
  );
  const ownership = createSessionOwnership(attachOperationalModule(database, 'session-ownership'));
  claim(ownership, 'first-session');
  claim(ownership, 'second-session');
  const usage = createUsageProjection({ ownership, database });
  const readLog = async () => ({ events: [settlement(1)], inheritedEventCount: 0 });
  failCommit = true;
  await expect(usage.rebuild(['first-session', 'second-session'], readLog)).rejects.toThrow(
    'Operational commit for usage failed',
  );
  database.close();
  const recovered = open(home);
  expect(recovered.usage.activity('ada', SINCE)).toEqual([]);
  expect(
    attachOperationalModule(recovered.database, 'usage').read((connection) =>
      connection.prepare('SELECT COUNT(*) AS count FROM usage_receipts').get(),
    ),
  ).toEqual({ count: 0 });
  expect(await recovered.usage.rebuild(['first-session', 'second-session'], readLog)).toEqual({
    folded: 2,
    failed: 0,
  });
  expect(recovered.usage.activity('ada', SINCE)[0]?.totalTokens).toBe(340);
});

it('commits the receipt and counters together, allowing a failed write to be retried', () => {
  const home = createTempRoot('botharness-retention-rollback-');
  let fail = false;
  const database = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      faultInjector: ({ stage }) => {
        if (fail && stage === 'before-commit') throw new Error('injected commit failure');
      },
    }),
  );
  const ownership = createSessionOwnership(attachOperationalModule(database, 'session-ownership'));
  claim(ownership, 'retry-session');
  const usage = createUsageProjection({ ownership, database });
  fail = true;
  expect(() => usage.handleSessionEvent('retry-session', settlement(1))).toThrow();
  let removedFiles = false;
  expect(() =>
    usage.purgeBot('ada', () => {
      removedFiles = true;
    }),
  ).toThrow();
  expect(removedFiles).toBe(false);
  database.close();
  const recovered = open(home);
  expect(recovered.usage.activity('ada', SINCE)).toEqual([]);
  recovered.usage.handleSessionEvent('retry-session', settlement(1));
  recovered.usage.handleSessionEvent('retry-session', settlement(1));
  expect(recovered.usage.activity('ada', SINCE)[0]?.totalTokens).toBe(170);
});

it('preserves legacy counters on upgrade and seeds old receipts without doubling the baseline', async () => {
  const home = createTempRoot('botharness-retention-upgrade-');
  const old = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation < 40),
      ),
    }),
  );
  const ownership = createSessionOwnership(attachOperationalModule(old, 'session-ownership'));
  claim(ownership, 'legacy-session');
  attachOperationalModule(old, 'usage').transaction((db) =>
    db
      .prepare(`INSERT INTO usage_daily
    (bot_slug,day,provider,model,purpose,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,total_tokens)
    VALUES ('ada','2026-10-01','actual-provider','actual-model','orchestrator',100,20,50,0,170)`)
      .run(),
  );
  old.close();
  const upgraded = open(home);
  expect(upgraded.usage.activity('ada', SINCE)[0]?.totalTokens).toBe(170);
  await upgraded.usage.rebuild(['legacy-session'], async () => undefined);
  expect(upgraded.usage.activity('ada', SINCE)[0]?.totalTokens).toBe(170);
  await upgraded.usage.rebuild(['legacy-session'], async () => ({
    events: [settlement(1, TIME - 1000)],
    inheritedEventCount: 0,
  }));
  const afterMigration = Date.now() + 1000;
  upgraded.usage.handleSessionEvent('legacy-session', settlement(2, afterMigration));
  expect(
    upgraded.usage.activity('ada', SINCE).reduce((sum, row) => sum + (row.totalTokens ?? 0), 0),
  ).toBe(340);
  upgraded.database.close();
  const restarted = open(home);
  await restarted.usage.rebuild(['legacy-session'], async () => ({
    events: [settlement(1, TIME - 1000), settlement(2, afterMigration)],
    inheritedEventCount: 0,
  }));
  expect(
    restarted.usage.activity('ada', SINCE).reduce((sum, row) => sum + (row.totalTokens ?? 0), 0),
  ).toBe(340);
});

describe('Host PersonaBot lifecycle', () => {
  it('retains archived and deleted identity usage, without granting a same-name replacement historical ownership', async () => {
    const home = createTempRoot('botharness-usage-lifecycle-');
    const core = createCore({ dshHome: home });
    trackTestOwner(core.operationalDatabase);
    for (const slug of ['ada', 'bea']) {
      expect(core.registry.create({ slug, displayName: 'Ada' }).ok).toBe(true);
      core.ownership.claim({
        sessionId: slug + '-session',
        botSlug: slug,
        rootRole: 'orchestrator',
        at: new Date(Date.now() + 1).toISOString(),
      });
      core.usage!.handleSessionEvent(slug + '-session', settlement(1));
    }
    expect(core.registry.setPaused('ada', true).ok).toBe(true);
    expect(core.usage!.activity('ada', SINCE)[0]?.totalTokens).toBe(170);
    const deleted = await core.deletions.confirm('ada', core.deletions.preview('ada').token, true);
    expect(deleted).toMatchObject({ phase: 'complete', memory: 'erased' });
    core.usage!.handleSessionEvent('ada-session', settlement(2));
    expect(core.usage!.activity('ada', SINCE)[0]?.totalTokens).toBe(340);
    expect(core.usage!.activity('bea', SINCE)[0]?.totalTokens).toBe(170);
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
    const restarted = createCore({ dshHome: home });
    trackTestOwner(restarted.operationalDatabase);
    await restarted.usage!.rebuild(['ada-session'], async () => ({
      events: [settlement(1), settlement(2)],
      inheritedEventCount: 0,
    }));
    expect(restarted.usage!.activity('ada', SINCE)[0]?.totalTokens).toBe(340);
    expect(restarted.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(false);
    expect(restarted.registry.create({ slug: 'replacement', displayName: 'Ada' }).ok).toBe(true);
    restarted.ownership.claim({
      sessionId: 'replacement-session',
      botSlug: 'replacement',
      rootRole: 'orchestrator',
      at: new Date(Date.now() + 1).toISOString(),
    });
    restarted.usage!.handleSessionEvent('replacement-session', settlement(1));
    expect(restarted.usage!.activity('replacement', SINCE)[0]?.totalTokens).toBe(170);
    expect(restarted.ownership.resolve('ada-session')?.botSlug).toBe('ada');
    expect(restarted.usage!.activity('ada', SINCE)[0]?.totalTokens).toBe(340);
    await restarted.runtime.close();
    restarted.externalMessaging.close();
  });
});

it('rejects purged roots and their later descendants even when a new Bot shares the creation timestamp', async () => {
  const home = createTempRoot('botharness-retired-root-');
  const first = open(home);
  claim(first.ownership, 'old-root');
  first.usage.handleSessionEvent('old-root', settlement(1));
  first.usage.purgeBot('ada');
  first.database.close();
  const restarted = open(home);
  claim(restarted.ownership, 'new-root');
  restarted.ownership.claim({
    sessionId: 'late-child',
    botSlug: 'ada',
    rootRole: 'orchestrator',
    provenance: 'subagent',
    parentSessionId: 'old-root',
    at: new Date(TIME + 1000).toISOString(),
  });
  restarted.usage.handleSessionEvent('old-root', settlement(2));
  restarted.usage.handleSessionEvent('late-child', settlement(1));
  restarted.usage.handleSessionEvent('new-root', settlement(1));
  expect(restarted.usage.activity('ada', SINCE)[0]?.totalTokens).toBe(170);
  expect(restarted.usage.activity('ada', SINCE)).toHaveLength(1);
});

it('preserves accounting when the Bot filesystem purge fails', () => {
  const { usage, ownership } = open(createTempRoot('botharness-failed-purge-'));
  claim(ownership, 'retained-root');
  usage.handleSessionEvent('retained-root', settlement(1));
  const before = usage.activity('ada', SINCE);
  expect(() =>
    usage.purgeBot('ada', () => {
      throw new Error('filesystem refused deletion');
    }),
  ).toThrow();
  expect(usage.activity('ada', SINCE)).toEqual(before);
  usage.handleSessionEvent('retained-root', settlement(1));
  usage.handleSessionEvent('retained-root', settlement(2));
  expect(usage.activity('ada', SINCE)[0]?.totalTokens).toBe(340);
});

it('refuses Host Registry Purge in recovery mode before deleting the PersonaBot directory', () => {
  const home = createTempRoot('botharness-recovery-purge-');
  const original = createCore({ dshHome: home });
  trackTestOwner(original.operationalDatabase);
  expect(original.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  original.operationalDatabase.close();
  const future = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan([
        ...BOT_HARNESS_SCHEMA_PLAN.migrations,
        {
          generation: BOT_HARNESS_SCHEMA_PLAN.targetGeneration + 1,
          module: 'usage',
          description: 'Simulate a newer profile schema',
          migrate() {},
        },
      ]),
    }),
  );
  future.close();
  const recovery = createCore({ dshHome: home });
  trackTestOwner(recovery.operationalDatabase);
  expect(recovery.operationalDatabase.mode).toBe('recovery');
  expect(() => recovery.registry.remove('ada', { purge: true })).toThrow();
  expect(() => recovery.registry.get('ada')).toThrow();
  expect(existsSync(join(recovery.registry.rootDir, 'ada'))).toBe(true);
  const database = new DatabaseSync(recovery.operationalDatabase.databasePath, { readOnly: true });
  try {
    const stored = database.prepare('SELECT body FROM persona_bots WHERE slug = ?').get('ada');
    expect(JSON.parse(String(stored?.['body'])).displayName).toBe('Ada');
  } finally {
    database.close();
  }
});
