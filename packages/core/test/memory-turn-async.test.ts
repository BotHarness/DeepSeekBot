import { createTestRegistry } from './registry-fixture.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createCore } from '../src/plugin.js';
import { createMemoryService } from '../src/memory/service.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createTempRoot, FIXED_NOW, trackTestOwner } from './helpers.js';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function fixture() {
  const home = createTempRoot('botharness-memory-git-');
  const database = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const registry = createTestRegistry({
    database,
    rootDir: join(home, 'bots'),
    initializeMemory(memoryDir) {
      const result = ensureMemoryRepository({ memoryDir });
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    },
  });
  expect(registry.create({ slug: 'atlas', displayName: 'Atlas' }).ok).toBe(true);
  const ownership = createSessionOwnership(attachOperationalModule(database, 'session-ownership'));
  ownership.claim({
    sessionId: 'session-atlas',
    botSlug: 'atlas',
    rootRole: 'orchestrator',
    at: FIXED_NOW().toISOString(),
  });
  const source = attachOperationalModule(database, 'memory-test');
  const addSource = (id: string) =>
    source.transaction((db) => {
      db.prepare(`INSERT INTO source_events (
        source_event_id, source_kind, bot_slug, channel_id, message_id,
        body, created_at, attempt_state
      ) VALUES (?, 'human-message', 'atlas', 'dm-atlas', ?, 'remember', ?, 'running')`).run(
        id,
        id,
        FIXED_NOW().toISOString(),
      );
    });
  const memory = createMemoryService({ registry, ownership, database, now: FIXED_NOW });
  const root = registry.memoryDirFor('atlas');
  if (root === undefined) throw new Error('Memory root missing');
  return { home, database, registry, ownership, memory, root, addSource };
}

async function expectControlProgress(operation: () => Promise<unknown>): Promise<void> {
  let progressed = false;
  setImmediate(() => {
    progressed = true;
  });
  await operation();
  expect(progressed).toBe(true);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Memory turn Host responsiveness', () => {
  it('stops preparation before an adapter run exists and permits a later fresh turn', async () => {
    const gate = deferred();
    const entered = deferred();
    const ran = vi.fn();
    const core = createCore({
      dshHome: createTempRoot('memory-stop-async-'),
      agents: {
        async runOrchestrator() {
          ran();
        },
        stopOrchestratorTurn() {
          return undefined;
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('Unexpected assignment');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'atlas', displayName: 'Atlas' });
      const prepare = core.memory.prepareTurnAsync;
      vi.spyOn(core.memory, 'prepareTurnAsync').mockImplementationOnce(async (...args) => {
        entered.resolve();
        await gate.promise;
        return prepare(...args);
      });
      const group = core.channels.createGroup({ name: 'Stop', members: ['atlas'] });
      const send = async (id: string) => {
        await core.channels.appendMessage(group.id, {
          id,
          at: FIXED_NOW().toISOString(),
          author: { kind: 'human' },
          body: '@Atlas remember',
          mentions: [{ botSlug: 'atlas', label: 'Atlas', start: 0, end: 6 }],
        });
        core.runtime.admitGroupMessage(group.id, id);
      };
      await send('stop-before-run');
      await entered.promise;
      const stop = core.runtime.stopTurn?.('atlas');
      await new Promise<void>((resolve) => setImmediate(resolve));
      gate.resolve();
      expect(await stop).toBeDefined();
      await core.runtime.whenIdle();
      expect(ran).not.toHaveBeenCalled();
      await send('fresh-after-stop');
      await core.runtime.whenIdle();
      expect(ran).toHaveBeenCalledOnce();
    } finally {
      gate.resolve();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  }, 60_000);

  it('keeps control work progressing through prepare, reconcile, commit reporting and abort', async () => {
    const { memory, root, addSource } = fixture();
    await expectControlProgress(() => memory.prepareTurnAsync('atlas', 'session-atlas'));
    writeFileSync(join(root, 'remember.md'), 'Remember the synthetic test\n');
    git(root, 'add', '-A');
    git(
      root,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'Remember test',
    );
    addSource('source-1');
    await expectControlProgress(() =>
      memory.reconcileTurnAsync({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'source-1',
      }),
    );
    await expectControlProgress(() => memory.pendingCommitsAsync('atlas'));
    expect(memory.pendingCommits('atlas').commits).toHaveLength(1);
    await memory.prepareTurnAsync('atlas', 'session-atlas');
    await expectControlProgress(() => memory.abortTurnAsync('atlas', 'session-atlas'));
    await memory.prepareTurnAsync('atlas', 'session-atlas');
    await memory.abortTurnAsync('atlas', 'session-atlas', true);
  }, 60_000);

  it('reserves before the first Git wait and refuses synchronous observers and mutators', async () => {
    const { memory, root } = fixture();
    const sha = git(root, 'rev-parse', 'HEAD');
    const prepare = memory.prepareTurnAsync('atlas', 'session-atlas');
    await expect(memory.prepareTurnAsync('atlas', 'session-atlas')).rejects.toMatchObject({
      code: 'memory-conflict',
    });
    expect(() => memory.snapshot('atlas')).toThrow('in progress');
    expect(() => memory.scanChanges('atlas')).toThrow('in progress');
    expect(() => memory.nameVersionHuman({ botSlug: 'atlas', sha, name: 'Busy' })).toThrow(
      'in progress',
    );
    expect(() =>
      memory.saveHuman({
        botSlug: 'atlas',
        path: 'note.md',
        body: 'busy',
        expectedHead: sha,
        editId: 'busy-edit',
      }),
    ).toThrow('in progress');
    expect(() => memory.preparedObservation('atlas', 'session-atlas')).toThrow('in progress');
    await prepare;
    const abort = memory.abortTurnAsync('atlas', 'session-atlas');
    await expect(memory.prepareTurnAsync('atlas', 'session-atlas')).rejects.toMatchObject({
      code: 'memory-conflict',
    });
    await abort;
    expect(memory.snapshot('atlas').head).toBe(sha);
    await memory.prepareTurnAsync('atlas', 'session-atlas');
    await memory.abortTurnAsync('atlas', 'another-session', true);
    expect(memory.preparedObservation('atlas', 'session-atlas')).toBeDefined();
    await memory.abortTurnAsync('atlas', 'session-atlas', true);
  });

  it('releases a failed preparation and preserves source authorization', async () => {
    const { memory } = fixture();
    await expect(memory.prepareTurnAsync('atlas', 'unknown')).rejects.toMatchObject({
      code: 'memory-conflict',
    });
    await memory.prepareTurnAsync('atlas', 'session-atlas');
    await expect(
      memory.reconcileTurnAsync({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'missing',
      }),
    ).rejects.toThrow('does not authorize');
    expect(memory.preparedObservation('atlas', 'session-atlas')).toBeDefined();
    await memory.abortTurnAsync('atlas', 'session-atlas');
  });

  it('routes real runtime turns through asynchronous preparation and settlement', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW());
    const ran = vi.fn();
    const observedSources: string[] = [];
    const steer = vi.fn(() => false);
    const prepareEntered = deferred();
    const prepareGate = deferred();
    const reconcileEntered = deferred();
    const reconcileGate = deferred();
    const core = createCore({
      dshHome: createTempRoot('memory-runtime-async-'),
      agents: {
        steerOrchestrator: steer,
        async runOrchestrator(run) {
          ran();
          observedSources.push(...(run.triage?.current() ?? []));
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('Unexpected assignment');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'atlas', displayName: 'Atlas' });
      const originalPrepare = core.memory.prepareTurnAsync;
      const originalReconcile = core.memory.reconcileTurnAsync;
      const prepare = vi
        .spyOn(core.memory, 'prepareTurnAsync')
        .mockImplementation(async (...args) => {
          prepareEntered.resolve();
          await prepareGate.promise;
          return originalPrepare(...args);
        });
      const reconcile = vi
        .spyOn(core.memory, 'reconcileTurnAsync')
        .mockImplementation(async (...args) => {
          reconcileEntered.resolve();
          await reconcileGate.promise;
          return originalReconcile(...args);
        });
      const pending = vi.spyOn(core.memory, 'pendingCommitsAsync');
      vi.spyOn(core.memory, 'prepareTurn').mockImplementation(() => {
        throw new Error('Synchronous prepare reached');
      });
      vi.spyOn(core.memory, 'reconcileTurn').mockImplementation(() => {
        throw new Error('Synchronous reconcile reached');
      });
      const group = core.channels.createGroup({ name: 'Async', members: ['atlas'] });
      const send = async (id: string, mentioned = true) => {
        await core.channels.appendMessage(group.id, {
          id,
          at: FIXED_NOW().toISOString(),
          author: { kind: 'human' },
          body: mentioned ? '@Atlas remember' : 'Remember this ordinary message',
          ...(mentioned
            ? { mentions: [{ botSlug: 'atlas', label: 'Atlas', start: 0, end: 6 }] }
            : {}),
        });
        core.runtime.admitGroupMessage(group.id, id);
      };
      await send('ask');
      const idle = core.runtime.whenIdle();
      await prepareEntered.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(ran).not.toHaveBeenCalled();
      await send('during-prepare');
      await send('ordinary-during-prepare', false);
      vi.setSystemTime(new Date(FIXED_NOW().getTime() + 31_000));
      if (core.runtime.resumePendingDigests === undefined) {
        throw new Error('Runtime digest resumption is unavailable');
      }
      core.runtime.resumePendingDigests('atlas');
      prepareGate.resolve();
      await reconcileEntered.promise;
      let settled = false;
      void idle.then(() => {
        settled = true;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      await send('during-settle');
      reconcileGate.resolve();
      await idle;
      await core.runtime.whenIdle();
      expect(ran.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(prepare.mock.calls.length).toBe(ran.mock.calls.length);
      expect(reconcile.mock.calls.length).toBe(ran.mock.calls.length);
      expect(pending.mock.calls.length).toBe(ran.mock.calls.length);
      expect(steer).not.toHaveBeenCalled();
      const states = attachOperationalModule(core.operationalDatabase, 'memory-turn-test').read(
        (db) =>
          db
            .prepare(
              "SELECT a.source_event_id, a.reason, a.attempt_state, e.message_id FROM inbox_admissions a JOIN source_events e ON e.source_event_id = a.source_event_id WHERE e.message_id IN ('ask', 'during-prepare', 'ordinary-during-prepare', 'during-settle') AND a.bot_slug = 'atlas'",
            )
            .all(),
      );
      expect(states).toHaveLength(4);
      expect(states.every((row) => row.attempt_state === 'handled')).toBe(true);
      const ordinary = states.find((row) => row.message_id === 'ordinary-during-prepare');
      expect(ordinary?.reason).toBe('group-ordinary');
      expect(observedSources.filter((id) => id === ordinary?.source_event_id)).toHaveLength(1);
    } finally {
      prepareGate.resolve();
      reconcileGate.resolve();
      await core.runtime.close();
      core.operationalDatabase.close();
      vi.useRealTimers();
    }
  }, 60_000);
});
