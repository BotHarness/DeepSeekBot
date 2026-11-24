import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
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
      vi.spyOn(f.core.ownership, 'claim').mockImplementationOnce(() => {
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

describe('Memory move rollback', () => {
  it('keeps the old answer when moving Memory back succeeds', async () => {
    const f = await fixture();
    try {
      await f.send();
      const before = f.core.registry.memoryDirFor('ada')!;
      const location = createTempRoot('botharness-memory-move-target-');
      const setMemoryDir = vi.spyOn(f.core.registry, 'setMemoryDir').mockImplementation(() => {
        throw new Error('registry unavailable');
      });
      try {
        const result = await f.methods.memoryMove({ slug: 'ada', location });
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('expected refusal');
        expect(result.error.message).toContain('Memory was not moved: registry unavailable');
        expect(existsSync(before)).toBe(true);
        expect(existsSync(join(location, 'ada'))).toBe(false);
      } finally {
        setMemoryDir.mockRestore();
      }
    } finally {
      await f.close();
    }
  });

  it('names the directory and the registry path when both the rollback and the retry fail', async () => {
    const f = await fixture();
    try {
      await f.send();
      const before = f.core.registry.memoryDirFor('ada')!;
      const location = createTempRoot('botharness-memory-move-target-');
      const target = join(location, 'ada');
      const parent = dirname(before);
      let restricted = false;
      const setMemoryDir = vi.spyOn(f.core.registry, 'setMemoryDir').mockImplementation(() => {
        chmodSync(parent, 0o500);
        restricted = true;
        throw new Error('registry unavailable');
      });
      try {
        const result = await f.methods.memoryMove({ slug: 'ada', location });
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('expected refusal');
        expect(result.error.message).toContain(`Memory is at ${target}`);
        expect(result.error.message).toContain(`but the registry names ${before}`);
        expect(result.error.message).not.toContain('Memory was not moved');
        expect(existsSync(target)).toBe(true);
        expect(existsSync(before)).toBe(false);
        expect(f.core.registry.memoryDirFor('ada')).toBe(before);
      } finally {
        if (restricted) chmodSync(parent, 0o700);
        setMemoryDir.mockRestore();
      }
    } finally {
      await f.close();
    }
  });

  it('agrees on the target when the registry committed before the failure', async () => {
    const f = await fixture();
    try {
      await f.send();
      const before = f.core.registry.memoryDirFor('ada')!;
      const location = createTempRoot('botharness-memory-move-target-');
      const target = join(location, 'ada');
      const parent = dirname(before);
      const real = f.core.registry.setMemoryDir.bind(f.core.registry);
      let restricted = false;
      const setMemoryDir = vi
        .spyOn(f.core.registry, 'setMemoryDir')
        .mockImplementation((slug, dir) => {
          real(slug, dir);
          chmodSync(parent, 0o500);
          restricted = true;
          throw new Error('ownership transfer failed');
        });
      try {
        const result = await f.methods.memoryMove({ slug: 'ada', location });
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('expected refusal');
        expect(f.core.registry.memoryDirFor('ada')).toBe(target);
        expect(existsSync(target)).toBe(true);
        expect(existsSync(before)).toBe(false);
        expect(result.error.message).toContain(
          `Memory is at ${target} and the registry names it too`,
        );
      } finally {
        if (restricted) chmodSync(parent, 0o700);
        setMemoryDir.mockRestore();
      }
    } finally {
      await f.close();
    }
  });

  it('leaves the directory and the registry naming one path after a failed rollback', async () => {
    const f = await fixture();
    try {
      await f.send();
      const before = f.core.registry.memoryDirFor('ada')!;
      const location = createTempRoot('botharness-memory-move-target-');
      const target = join(location, 'ada');
      const parent = dirname(before);
      const real = f.core.registry.setMemoryDir.bind(f.core.registry);
      let restricted = false;
      const setMemoryDir = vi
        .spyOn(f.core.registry, 'setMemoryDir')
        .mockImplementationOnce(() => {
          chmodSync(parent, 0o500);
          restricted = true;
          throw new Error('registry commit failed');
        })
        .mockImplementation((slug, dir) => real(slug, dir));
      try {
        const result = await f.methods.memoryMove({ slug: 'ada', location });
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('expected refusal');
        expect(f.core.registry.memoryDirFor('ada')).toBe(target);
        expect(existsSync(target)).toBe(true);
        expect(result.error.message).toContain(
          `Memory is at ${target} and the registry names it too`,
        );
      } finally {
        if (restricted) chmodSync(parent, 0o700);
        setMemoryDir.mockRestore();
      }
    } finally {
      await f.close();
    }
  });
});
