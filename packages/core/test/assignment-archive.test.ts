import { describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  BotAgentAdapter,
  OrchestratorAssignmentAccess,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

function agents() {
  const runs: AssignmentAgentRun[] = [];
  const finishes = new Map<string, () => void>();
  let access: OrchestratorAssignmentAccess | undefined;
  const adapter: BotAgentAdapter = {
    async runOrchestrator(run) {
      access = run.assignments;
    },
    runAssignment(run) {
      runs.push(run);
      return new Promise<void>((resolve) => finishes.set(run.sessionId, resolve));
    },
    requestAssignment(run) {
      runs.push(run);
      return {
        delivery: 'followup',
        accepted: Promise.resolve(),
        done: new Promise<void>((resolve) => finishes.set(run.sessionId, resolve)),
      };
    },
    async stopAssignment(id) {
      finishes.get(id)?.();
    },
    async close() {
      for (const finish of finishes.values()) finish();
    },
  };
  return { adapter, runs, access: () => access, finish: (id: string) => finishes.get(id)?.() };
}

async function fixture(options: { nativeRefusal?: Error; nativeGate?: Promise<void> } = {}) {
  const home = createTempRoot('botharness-assignment-archive-');
  const live = agents();
  const archived = new Set<string>();
  const nativeCalls: string[] = [];
  const core = createCore({
    dshHome: home,
    agents: live.adapter,
    sessionArchive: () => ({
      async archiveSession(id) {
        nativeCalls.push(`archive:${id}`);
        if (options.nativeRefusal !== undefined) throw options.nativeRefusal;
        await options.nativeGate;
        archived.add(id);
      },
      async unarchiveSession(id) {
        nativeCalls.push(`unarchive:${id}`);
        archived.delete(id);
      },
    }),
    workspaces: () => ({
      get: (id) =>
        id === 'test-workspace'
          ? { id, path: home, title: 'Test Workspace', status: async () => 'ok' }
          : undefined,
      list: () => [],
    }),
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  createTestWorkspaceGrants(core.operationalDatabase, home);
  const dm = core.channels.getOrCreateDm('ada', 'Ada');
  if (dm === undefined) throw new Error('Missing DM');
  const admission = core.runtime.admitDmMessage({
    channelId: dm.id,
    messageId: 'human-start',
    body: 'Start',
  });
  if (!admission.admitted) throw new Error('Not admitted');
  await admission.settled;
  const access = live.access();
  if (access === undefined) throw new Error('Missing Orchestrator');
  function create(purpose: string, key?: string) {
    const created = access!.create({
      grantId: TEST_GRANT_ID,
      purpose,
      ...(key === undefined ? {} : { key }),
    });
    if (created.outcome !== 'created') throw new Error(`Not created: ${created.outcome}`);
    return created.assignment.sessionId;
  }
  async function settle(sessionId: string) {
    live.finish(sessionId);
    await vi.waitFor(() =>
      expect(core.runtime.getAssignment('ada', sessionId)?.activity).toBe('idle'),
    );
  }
  async function close() {
    await live.adapter.close();
    await core.runtime.whenIdle();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  return { core, live, access, create, settle, close, archived, nativeCalls };
}

describe('Orchestrator Assignment archive', () => {
  it('refuses a working Assignment, then archives it natively and hides it from the directory', async () => {
    const f = await fixture();
    try {
      const id = f.create('Ship the release notes', 'release-notes');
      await expect(f.access.archive!(id)).resolves.toMatchObject({
        outcome: 'refused',
        code: 'assignment-active',
      });
      expect(f.nativeCalls).toEqual([]);
      expect(f.access.query!({}).assignments.map((a) => a.sessionId)).toEqual([id]);

      await f.settle(id);
      const archived = await f.access.archive!(id);
      expect(archived).toMatchObject({ outcome: 'archived' });
      expect(f.archived.has(id)).toBe(true);

      expect(f.access.query!({}).assignments).toEqual([]);
      const all = f.access.query!({ includeArchived: true }).assignments;
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ sessionId: id });
      expect(all[0]!.archivedAt).toEqual(expect.any(String));
      expect(all[0]!.continuityKey).toBeUndefined();

      expect(() =>
        f.access.request({ sessionId: id, mode: 'next-turn', text: 'One more thing' }),
      ).toThrow(/archived/);

      const next = f.create('Ship the next release notes', 'release-notes');
      expect(next).not.toBe(id);
      await f.settle(next);

      await expect(f.access.archive!(id)).resolves.toMatchObject({ outcome: 'archived' });
      expect(f.nativeCalls).toEqual([`archive:${id}`]);
    } finally {
      await f.close();
    }
  }, 60000);

  it('unarchives an Assignment back into the default directory', async () => {
    const f = await fixture();
    try {
      const id = f.create('Investigate flaky test');
      await f.settle(id);
      await f.access.archive!(id);
      const restored = await f.access.unarchive!(id);
      expect(restored).toMatchObject({ outcome: 'unarchived' });
      expect(restored.assignment.archivedAt).toBeUndefined();
      expect(f.archived.has(id)).toBe(false);
      expect(f.access.query!({}).assignments.map((a) => a.sessionId)).toEqual([id]);
    } finally {
      await f.close();
    }
  }, 60000);

  it('refuses a wake that races an archive in flight', async () => {
    let open!: () => void;
    const f = await fixture({ nativeGate: new Promise<void>((resolve) => (open = resolve)) });
    try {
      const id = f.create('Racing archive', 'racing');
      await f.settle(id);
      const archiving = f.access.archive!(id);
      expect(() => f.access.request({ sessionId: id, mode: 'next-turn', text: 'Wake up' })).toThrow(
        /archived/,
      );
      expect(() =>
        f.access.create({ grantId: TEST_GRANT_ID, purpose: 'Reuse', key: 'racing' }),
      ).toThrow(/archived/);
      open();
      await expect(archiving).resolves.toMatchObject({ outcome: 'archived' });
      expect(f.core.runtime.getAssignment('ada', id)).toMatchObject({ activity: 'idle' });
    } finally {
      await f.close();
    }
  }, 60000);

  it('leaves the directory unchanged when DSH refuses the archive', async () => {
    const refusal = Object.assign(new Error('Session is active'), {
      name: 'WorkspaceActiveSessionError',
      activity: [{ kind: 'job' }],
    });
    const f = await fixture({ nativeRefusal: refusal });
    try {
      const id = f.create('Native refusal', 'native');
      await f.settle(id);
      await expect(f.access.archive!(id)).resolves.toMatchObject({
        outcome: 'refused',
        code: 'assignment-active',
      });
      const [row] = f.access.query!({}).assignments;
      expect(row).toMatchObject({ sessionId: id, continuityKey: 'native' });
      expect(row!.archivedAt).toBeUndefined();
    } finally {
      await f.close();
    }
  }, 60000);
});

describe('Orchestrator Assignment Directory query', () => {
  it('searches purpose, key and latest report, filters activity, and pages with a cursor', async () => {
    const f = await fixture();
    try {
      const alpha = f.create('Fix login redirect', 'login');
      const beta = f.create('Write onboarding docs', 'docs');
      const gamma = f.create('Benchmark search index');
      const gammaRun = f.live.runs.find((run) => run.sessionId === gamma)!;
      await gammaRun.report({ state: 'progress', summary: 'Latency regression found in Login' });
      await f.settle(beta);

      const byPurpose = f.access.query!({ query: 'onboarding' }).assignments;
      expect(byPurpose.map((a) => a.sessionId)).toEqual([beta]);
      const byKeyOrReport = f.access.query!({ query: 'LOGIN' })
        .assignments.map((a) => a.sessionId)
        .sort();
      expect(byKeyOrReport).toEqual([alpha, gamma].sort());

      const working = f.access.query!({ activity: ['working'] }).assignments;
      expect(working.map((a) => a.sessionId).sort()).toEqual([alpha, gamma].sort());

      const first = f.access.query!({ limit: 2 });
      expect(first.assignments).toHaveLength(2);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = f.access.query!({ limit: 2, cursor: first.nextCursor! });
      expect(second.assignments).toHaveLength(1);
      expect(second.nextCursor).toBeUndefined();
      const seen = [...first.assignments, ...second.assignments].map((a) => a.sessionId);
      expect(new Set(seen)).toEqual(new Set([alpha, beta, gamma]));

      expect(() => f.access.query!({ limit: 0 })).toThrow();
      expect(() => f.access.query!({ cursor: 'not-a-cursor' })).toThrow();
    } finally {
      await f.close();
    }
  }, 60000);
});

describe('Assignment Concurrency Limit default', () => {
  it('allows eight executing Assignments and refuses the ninth', async () => {
    const f = await fixture();
    try {
      for (let index = 0; index < 8; index += 1) f.create(`Parallel ${index}`);
      const ninth = f.access.create({ grantId: TEST_GRANT_ID, purpose: 'One too many' });
      expect(ninth).toMatchObject({ outcome: 'capacity', limit: 8, activeCount: 8 });
    } finally {
      await f.close();
    }
  }, 60000);
});
