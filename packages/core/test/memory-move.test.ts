import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import { inspectMemoryRepository } from '../src/memory/repository.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

async function fixture(options: { refuseArchive?: boolean; unsaved?: boolean } = {}) {
  const home = createTempRoot('botharness-memory-move-');
  const archived = new Set<string>();
  const calls: string[] = [];
  const runs: OrchestratorAgentRun[] = [];
  let gate: Promise<void> | undefined;
  const adapter: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
      await gate;
    },
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No assignments in this test');
    },
    async stopAssignment() {},
    async releaseSession(id) {
      calls.push(`release:${id}`);
    },
    async close() {},
  };
  const core = createCore({
    dshHome: home,
    agents: adapter,
    sessionArchive: () => ({
      async archiveSession(id) {
        calls.push(`archive:${id}`);
        if (options.unsaved === true) {
          const error = new Error(`cannot archive session '${id}': no such session`);
          error.name = 'WorkspaceUnknownSessionError';
          throw error;
        }
        if (options.refuseArchive === true) {
          const error = new Error('running');
          error.name = 'WorkspaceActiveSessionError';
          throw error;
        }
        archived.add(id);
      },
      async unarchiveSession(id) {
        calls.push(`unarchive:${id}`);
        archived.delete(id);
      },
    }),
    workspaces: () => ({
      get: () => undefined,
      list: () => [],
      archivedSessionIds: [...archived],
    }),
  });
  const created = core.registry.create({ slug: 'ada', displayName: 'Ada' });
  if (!created.ok) throw new Error(created.reason);
  const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  if (dm === undefined) throw new Error('Missing DM');
  let sent = 0;
  const send = async () => {
    const admission = core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: dm.id,
      messageId: `human-${++sent}`,
      body: 'Hello',
    });
    if (!admission.admitted) throw new Error('Not admitted');
    await admission.settled;
  };
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
  const close = async () => {
    await core.runtime.whenIdle();
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  return {
    home,
    core,
    methods,
    calls,
    runs,
    send,
    close,
    hold: () => {
      let release!: () => void;
      gate = new Promise<void>((resolve) => (release = resolve));
      return () => {
        gate = undefined;
        release();
      };
    },
  };
}

describe('Memory move', () => {
  it('resumes a committed Orchestrator with a different cwd when no replacement is pending', async () => {
    const f = await fixture();
    try {
      const memoryDir = f.core.registry.memoryDirFor('ada')!;
      const sessionId = 'existing-orchestrator';
      f.core.ownership.claim({
        sessionId,
        botSlug: 'ada',
        rootRole: 'orchestrator',
        cwdReference: `${memoryDir}/`,
        at: new Date().toISOString(),
      });

      expect(f.core.runtime.currentOrchestratorSessionId?.('ada')).toBe(sessionId);
      await f.send();
      expect(f.runs).toMatchObject([{ sessionId, resume: true }]);
    } finally {
      await f.close();
    }
  });

  it('moves Memory to a chosen folder, archives the main session and starts a new one there', async () => {
    const f = await fixture();
    try {
      await f.send();
      const before = f.core.registry.memoryDirFor('ada')!;
      const head = inspectMemoryRepository({ memoryDir: before }).head;
      const first = f.runs[0]!.sessionId;
      const location = createTempRoot('botharness-memory-move-target-');

      const result = await f.methods.memoryMove({ slug: 'ada', location });

      expect(result).toEqual({
        ok: true,
        value: { memoryDir: join(location, 'ada'), moved: true },
      });
      expect(existsSync(before)).toBe(false);
      expect(inspectMemoryRepository({ memoryDir: join(location, 'ada') }).head).toBe(head);
      expect(f.core.registry.get('ada')?.memoryDir).toBe(join(location, 'ada'));
      expect(f.calls).toEqual([`archive:${first}`, `release:${first}`]);
      expect(f.core.deletions.preview('ada')).toMatchObject({
        memoryDir: join(location, 'ada'),
        eraseAvailable: true,
      });

      await f.send();
      expect(f.runs[1]).toMatchObject({ resume: false });
      expect(f.runs[1]!.sessionId).not.toBe(first);
      expect(f.core.ownership.resolve(f.runs[1]!.sessionId)?.cwdReference).toBe(
        join(location, 'ada'),
      );

      await expect(f.methods.memoryMove({ slug: 'ada', location: null })).resolves.toEqual({
        ok: true,
        value: { memoryDir: before, moved: true },
      });
      expect(f.core.registry.get('ada')?.memoryDir).toBeUndefined();
      expect(inspectMemoryRepository({ memoryDir: before }).head).toBe(head);
      expect(f.core.deletions.preview('ada').refusal).toBeUndefined();
      expect(f.core.deletions.preview('ada').eraseAvailable).toBe(true);
    } finally {
      await f.close();
    }
  });

  it('refuses a folder that is missing, relative, occupied or inside the current Memory', async () => {
    const f = await fixture();
    try {
      const before = f.core.registry.get('ada');
      const occupied = join(f.home, 'occupied');
      mkdirSync(join(occupied, 'ada'), { recursive: true });
      writeFileSync(join(occupied, 'ada', 'keep.md'), 'keep');
      const inside = f.core.registry.memoryDirFor('ada')!;
      for (const location of [join(f.home, 'missing'), 'relative/folder', occupied, inside]) {
        await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toMatchObject({
          ok: false,
          error: { code: 'invalid-memory-dir' },
        });
      }
      expect(f.core.registry.get('ada')).toEqual(before);
      expect(f.calls).toEqual([]);
    } finally {
      await f.close();
    }
  });

  it('refuses while the Bot is working and leaves Memory in place', async () => {
    const f = await fixture();
    try {
      const before = f.core.registry.get('ada');
      const release = f.hold();
      const working = f.send();
      const location = join(f.home, 'elsewhere');
      mkdirSync(location);
      await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toMatchObject({
        ok: false,
        error: { code: 'bot-busy' },
      });
      release();
      await working;
      expect(existsSync(join(location, 'ada'))).toBe(false);
      expect(f.core.registry.get('ada')).toEqual(before);
    } finally {
      await f.close();
    }
  });

  it('keeps Memory in place when DSH reports the main session still running', async () => {
    const f = await fixture({ refuseArchive: true });
    try {
      await f.send();
      const location = join(f.home, 'elsewhere');
      mkdirSync(location);
      await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toMatchObject({
        ok: false,
        error: { code: 'bot-busy' },
      });
      expect(existsSync(join(location, 'ada'))).toBe(false);
    } finally {
      await f.close();
    }
  });

  it('restores the main session when the move fails', async () => {
    const f = await fixture();
    try {
      await f.send();
      const first = f.runs[0]!.sessionId;
      const location = join(f.home, 'elsewhere');
      mkdirSync(location);
      f.core.registry.setMemoryDir = () => {
        throw new Error('database is read-only');
      };
      const before = f.core.registry.memoryDirFor('ada')!;
      await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toMatchObject({
        ok: false,
        error: { code: 'memory-unavailable' },
      });
      expect(inspectMemoryRepository({ memoryDir: before }).state).toBe('ready');
      expect(existsSync(join(location, 'ada'))).toBe(false);
      expect(f.calls).toEqual([`archive:${first}`, `release:${first}`, `unarchive:${first}`]);
    } finally {
      await f.close();
    }
  });

  it('leaves Memory and the unsaved Orchestrator intact when claiming the replacement fails', async () => {
    const f = await fixture({ unsaved: true });
    try {
      await f.send();
      const first = f.runs[0]!.sessionId;
      const before = f.core.registry.memoryDirFor('ada')!;
      const location = createTempRoot('botharness-memory-claim-failed-');
      vi.spyOn(f.core.ownership, 'reserveOrchestratorReplacement').mockImplementationOnce(() => {
        throw new Error('Replacement claim failed');
      });
      await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toMatchObject({
        ok: false,
        error: {
          code: 'memory-unavailable',
          message: expect.stringContaining('Replacement claim failed'),
        },
      });
      expect(f.core.registry.memoryDirFor('ada')).toBe(before);
      expect(inspectMemoryRepository({ memoryDir: before }).state).toBe('ready');
      expect(existsSync(join(location, 'ada'))).toBe(false);
      expect(f.core.runtime.currentOrchestratorSessionId!('ada')).toBe(first);

      vi.spyOn(f.core.registry, 'setMemoryDir').mockImplementationOnce(() => {
        throw new Error('Registry update failed');
      });
      await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toMatchObject({
        ok: false,
        error: { message: expect.stringContaining('Registry update failed') },
      });
      expect(
        f.core.ownership.rootsFor('ada', 'orchestrator').map((root) => root.sessionId),
      ).toEqual([first]);
      expect(f.core.registry.memoryDirFor('ada')).toBe(before);
      expect(existsSync(join(location, 'ada'))).toBe(false);
    } finally {
      await f.close();
    }
  });

  it('preserves the mutation error and resumes the original Orchestrator when replacement discard fails', async () => {
    const f = await fixture({ unsaved: true });
    try {
      await f.send();
      const first = f.runs[0]!.sessionId;
      const before = f.core.registry.memoryDirFor('ada')!;
      const location = createTempRoot('botharness-memory-discard-failed-');
      const database = attachOperationalModule(f.core.operationalDatabase, 'memory-move-test');
      database.transaction((db) =>
        db.exec(`CREATE TRIGGER fail_orchestrator_discard BEFORE DELETE ON pending_orchestrator_replacements
                 BEGIN SELECT RAISE(ABORT, 'Replacement discard failed'); END`),
      );
      vi.spyOn(f.core.registry, 'setMemoryDir').mockImplementationOnce(() => {
        throw new Error('Registry update failed');
      });

      await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toMatchObject({
        ok: false,
        error: { message: 'Memory was not moved: Registry update failed' },
      });
      expect(f.core.registry.memoryDirFor('ada')).toBe(before);
      expect(existsSync(join(location, 'ada'))).toBe(false);
      expect(f.core.runtime.currentOrchestratorSessionId?.('ada')).toBe(first);
      await f.send();
      expect(f.runs[1]).toMatchObject({ sessionId: first, resume: true });
      expect(f.core.ownership.pendingOrchestratorReplacements('ada')).toMatchObject([
        { cwdReference: join(location, 'ada'), previousCwdReference: before },
      ]);
      expect(f.core.ownership.list().map((root) => root.sessionId)).toEqual([first]);
      database.transaction((db) => db.exec('DROP TRIGGER fail_orchestrator_discard'));
    } finally {
      await f.close();
    }
    const reopened = createCore({ dshHome: f.home });
    try {
      const first = f.runs[0]!.sessionId;
      expect(reopened.runtime.currentOrchestratorSessionId?.('ada')).toBe(first);
      expect(
        attachOperationalModule(reopened.operationalDatabase, 'memory-move-test').read((db) =>
          db
            .prepare('SELECT session_id FROM pending_orchestrator_replacements WHERE bot_slug = ?')
            .all('ada'),
        ),
      ).toEqual([]);
      expect(reopened.ownership.list().map((root) => root.sessionId)).toEqual([first]);
    } finally {
      await reopened.runtime.close();
      reopened.operationalDatabase.close();
    }
  });

  it('resumes a legacy Orchestrator after a failed same-directory replacement and discard', async () => {
    const f = await fixture({ unsaved: true });
    try {
      const sessionId = 'legacy-orchestrator';
      f.core.ownership.claim({
        sessionId,
        botSlug: 'ada',
        rootRole: 'orchestrator',
        provenance: 'legacy',
        at: new Date().toISOString(),
      });
      const database = attachOperationalModule(f.core.operationalDatabase, 'memory-move-test');
      database.transaction((db) =>
        db.exec(`CREATE TRIGGER fail_orchestrator_discard BEFORE DELETE ON pending_orchestrator_replacements
                 BEGIN SELECT RAISE(ABORT, 'Replacement discard failed'); END`),
      );
      const mutationError = new Error('Replacement mutation failed without moving Memory');
      await expect(
        f.core.runtime.replaceOrchestrator!('ada', () => {
          throw mutationError;
        }),
      ).rejects.toBe(mutationError);

      const cwd = f.core.registry.memoryDirFor('ada');
      expect(f.core.ownership.pendingOrchestratorReplacements('ada')).toMatchObject([
        { cwdReference: cwd, previousCwdReference: cwd },
      ]);
      expect(f.core.runtime.currentOrchestratorSessionId?.('ada')).toBe(sessionId);
      await f.send();
      expect(f.runs).toMatchObject([{ sessionId, resume: true }]);
    } finally {
      await f.close();
    }
  });

  it('does not revive a failed reservation when a later move reaches the same directory', async () => {
    const f = await fixture({ unsaved: true });
    const location = createTempRoot('botharness-memory-retry-');
    const memoryDir = join(location, 'ada');
    let failedId: string;
    let laterId: string;
    try {
      await f.send();
      const database = attachOperationalModule(f.core.operationalDatabase, 'memory-move-test');
      database.transaction((db) =>
        db.exec(`CREATE TRIGGER fail_orchestrator_discard BEFORE DELETE ON pending_orchestrator_replacements
                 BEGIN SELECT RAISE(ABORT, 'Replacement discard failed'); END`),
      );
      vi.spyOn(f.core.registry, 'setMemoryDir').mockImplementationOnce(() => {
        throw new Error('Registry update failed');
      });
      await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toMatchObject({
        ok: false,
        error: { message: 'Memory was not moved: Registry update failed' },
      });
      const [failed] = f.core.ownership.pendingOrchestratorReplacements('ada');
      if (failed === undefined) throw new Error('Missing the failed reservation');
      failedId = failed.sessionId;

      database.transaction((db) =>
        db.exec(`DROP TRIGGER fail_orchestrator_discard;
                 CREATE TRIGGER fail_latest_orchestrator_publication BEFORE INSERT ON session_ownership
                 WHEN NEW.session_id = (
                   SELECT session_id FROM pending_orchestrator_replacements
                   WHERE bot_slug = NEW.bot_slug ORDER BY created_at DESC LIMIT 1
                 )
                 BEGIN SELECT RAISE(ABORT, 'Latest replacement publication failed'); END`),
      );
      await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toEqual({
        ok: true,
        value: { memoryDir, moved: true },
      });
      const [later] = f.core.ownership.pendingOrchestratorReplacements('ada');
      if (later === undefined) throw new Error('Missing the later reservation');
      laterId = later.sessionId;
      expect(laterId).not.toBe(failedId);
    } finally {
      await f.close();
    }

    const blocked = createCore({ dshHome: f.home });
    try {
      expect(blocked.runtime.currentOrchestratorSessionId?.('ada')).toBeUndefined();
      expect(blocked.ownership.resolve(failedId)).toBeUndefined();
      expect(blocked.ownership.pendingOrchestratorReplacements('ada')).toMatchObject([
        { sessionId: laterId, cwdReference: memoryDir },
      ]);
      attachOperationalModule(blocked.operationalDatabase, 'memory-move-test').transaction((db) =>
        db.exec('DROP TRIGGER fail_latest_orchestrator_publication'),
      );
    } finally {
      await blocked.runtime.close();
      blocked.operationalDatabase.close();
    }

    const reopened = createCore({ dshHome: f.home });
    try {
      expect(reopened.runtime.currentOrchestratorSessionId?.('ada')).toBe(laterId);
      expect(reopened.ownership.resolve(failedId)).toBeUndefined();
      expect(reopened.ownership.pendingOrchestratorReplacements('ada')).toEqual([]);
    } finally {
      await reopened.runtime.close();
      reopened.operationalDatabase.close();
    }
  });

  it('reports the applied Memory move and keeps new turns off the old cwd when replacement publication fails', async () => {
    const f = await fixture({ unsaved: true });
    let freshSessionId: string | undefined;
    try {
      await f.send();
      const first = f.runs[0]!.sessionId;
      const oldMemory = f.core.registry.memoryDirFor('ada')!;
      const location = createTempRoot('botharness-memory-publish-failed-');
      const memoryDir = join(location, 'ada');
      const publish = vi
        .spyOn(f.core.ownership, 'commitOrchestratorReplacement')
        .mockImplementation(() => {
          throw new Error('Replacement publication failed');
        });

      await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toEqual({
        ok: true,
        value: { memoryDir, moved: true },
      });
      expect(publish).toHaveBeenCalledTimes(2);
      expect(existsSync(oldMemory)).toBe(false);
      expect(inspectMemoryRepository({ memoryDir }).state).toBe('ready');
      expect(f.core.registry.memoryDirFor('ada')).toBe(memoryDir);
      expect(f.core.runtime.currentOrchestratorSessionId?.('ada')).not.toBe(first);

      await f.send();
      freshSessionId = f.runs[1]!.sessionId;
      expect(freshSessionId).not.toBe(first);
      expect(f.core.ownership.resolve(freshSessionId)?.cwdReference).toBe(memoryDir);
    } finally {
      await f.close();
    }
    const reopened = createCore({ dshHome: f.home });
    try {
      expect(reopened.runtime.currentOrchestratorSessionId?.('ada')).toBe(freshSessionId);
    } finally {
      await reopened.runtime.close();
      reopened.operationalDatabase.close();
    }
  });

  it('publishes the pending replacement on startup when Memory reached its destination', async () => {
    const f = await fixture({ unsaved: true });
    const location = createTempRoot('botharness-memory-publish-recovery-');
    const memoryDir = join(location, 'ada');
    let replacementId: string | undefined;
    try {
      await f.send();
      const first = f.runs[0]!.sessionId;
      const database = attachOperationalModule(f.core.operationalDatabase, 'memory-move-test');
      database.transaction((db) =>
        db.exec(`CREATE TRIGGER fail_orchestrator_publication BEFORE DELETE ON pending_orchestrator_replacements
                 BEGIN SELECT RAISE(ABORT, 'Replacement publication failed'); END`),
      );
      await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toEqual({
        ok: true,
        value: { memoryDir, moved: true },
      });
      expect(f.core.registry.memoryDirFor('ada')).toBe(memoryDir);
      const pending = database.read((db) =>
        db
          .prepare('SELECT session_id FROM pending_orchestrator_replacements WHERE bot_slug = ?')
          .get('ada'),
      );
      if (typeof pending?.session_id !== 'string') throw new Error('Missing pending replacement');
      replacementId = pending.session_id;
      expect(f.core.ownership.resolve(replacementId)).toBeUndefined();
      expect(
        f.core.ownership.rootsFor('ada', 'orchestrator').map((root) => root.sessionId),
      ).toEqual([first]);
      database.transaction((db) => db.exec('DROP TRIGGER fail_orchestrator_publication'));
    } finally {
      await f.close();
    }

    const reopened = createCore({ dshHome: f.home });
    try {
      expect(reopened.runtime.currentOrchestratorSessionId?.('ada')).toBe(replacementId);
      expect(reopened.ownership.resolve(replacementId!)?.cwdReference).toBe(memoryDir);
      expect(
        attachOperationalModule(reopened.operationalDatabase, 'memory-move-test').read((db) =>
          db.prepare('SELECT session_id FROM pending_orchestrator_replacements').all(),
        ),
      ).toEqual([]);
    } finally {
      await reopened.runtime.close();
      reopened.operationalDatabase.close();
    }
  });

  it('moves Memory when the main session was claimed but never saved', async () => {
    const f = await fixture({ unsaved: true });
    try {
      await f.send();
      const first = f.runs[0]!.sessionId;
      const location = createTempRoot('botharness-memory-move-target-');
      await expect(f.methods.memoryMove({ slug: 'ada', location })).resolves.toEqual({
        ok: true,
        value: { memoryDir: join(location, 'ada'), moved: true },
      });
      await f.send();
      expect(f.runs[1]!.sessionId).not.toBe(first);
      expect(f.core.ownership.resolve(f.runs[1]!.sessionId)?.cwdReference).toBe(
        join(location, 'ada'),
      );
    } finally {
      await f.close();
    }
  });
});
