import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createWorkspaceGrantStore, type DshWorkspace } from '../src/workspaces/grants.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';

describe('Workspace Grant store', () => {
  it('rechecks scoped eligibility after async directory validation and reports only committed new Grants', async () => {
    const home = createTempRoot('botharness-group-grants-');
    const path = join(home, 'project');
    mkdirSync(path);
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let eligible = true;
    let release: (() => void) | undefined;
    let defer = false;
    let creations = 0;
    const workspace: DshWorkspace = {
      id: 'project',
      path,
      title: 'Project',
      status: async () => {
        if (defer)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return 'ok';
      },
    };
    const grants = createWorkspaceGrantStore({
      database: attachOperationalModule(owner, 'workspace-grants'),
      workspaces: () => ({ get: () => workspace, list: () => [workspace] }),
    });
    const confirmation = {
      validate: () => {
        if (!eligible) throw new Error('Member departed or Bot deleted');
      },
      onCreated: () => {
        creations += 1;
      },
    };
    try {
      const first = await grants.create('selected', 'project', confirmation);
      expect(first.orchestratorWrite).toBe(false);
      expect((await grants.create('selected', 'project', confirmation)).id).toBe(first.id);
      expect(creations).toBe(1);
      defer = true;
      const pending = grants.create('departing', 'project', confirmation);
      eligible = false;
      release!();
      await expect(pending).rejects.toThrow('Member departed');
      expect(grants.list('departing')).toEqual([]);
      expect(grants.list('unselected')).toEqual([]);
      expect(grants.list('selected')).toHaveLength(1);
      expect(creations).toBe(1);
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('upgrades existing read-only Grants without silently granting write permission', () => {
    const home = createTempRoot('botharness-grant-upgrade-');
    const path = join(home, 'project');
    mkdirSync(path);
    const prior = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation < 42),
      ),
    });
    attachOperationalModule(prior, 'workspace-grants').transaction((database) => {
      database
        .prepare(
          'INSERT INTO workspace_grants (id, bot_slug, workspace_id, workspace_path, workspace_title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('existing', 'ada', 'workspace-1', path, 'Project', FIXED_NOW().toISOString());
    });
    prior.close();
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const workspace: DshWorkspace = {
      id: 'workspace-1',
      path,
      title: 'Project',
      status: async () => 'ok',
    };
    const grants = createWorkspaceGrantStore({
      database: attachOperationalModule(owner, 'workspace-grants'),
      now: FIXED_NOW,
      workspaces: () => ({ get: () => workspace, list: () => [workspace] }),
    });
    try {
      expect(owner.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
      expect(grants.requireActive('ada', 'existing')).toMatchObject({
        id: 'existing',
        orchestratorWrite: false,
        writeRevision: 0,
      });
      expect(grants.setOrchestratorWrite('ada', 'existing', true)).toMatchObject({
        orchestratorWrite: true,
        writeRevision: 1,
      });
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('records a canonical DSH Workspace and blocks later use after revocation', async () => {
    const home = createTempRoot('botharness-grant-');
    const path = join(home, 'project');
    mkdirSync(path);
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let workspace: DshWorkspace | undefined = {
      id: 'workspace-1',
      path,
      title: 'Project',
      status: async () => 'ok',
    };
    let index = 0;
    const grants = createWorkspaceGrantStore({
      database: attachOperationalModule(owner, 'workspace-grants'),
      now: FIXED_NOW,
      createId: () => `grant-${++index}`,
      workspaces: () => ({
        get: (id) => (id === workspace?.id ? workspace : undefined),
        list: () => (workspace === undefined ? [] : [workspace]),
      }),
    });
    try {
      const first = await grants.create('ada', 'workspace-1');
      expect(first).toMatchObject({
        id: 'grant-1',
        botSlug: 'ada',
        workspaceId: 'workspace-1',
        workspacePath: path,
      });
      expect(await grants.create('ada', 'workspace-1')).toEqual(first);
      expect(grants.requireActive('ada', first.id)).toEqual(first);
      expect(first).toMatchObject({ orchestratorWrite: false, writeRevision: 0 });
      expect(() => grants.setOrchestratorWrite('bob', first.id, true)).toThrow(
        /missing or revoked/,
      );
      expect(grants.setOrchestratorWrite('ada', first.id, true)).toMatchObject({
        orchestratorWrite: true,
        writeRevision: 1,
      });
      expect(grants.setOrchestratorWrite('ada', first.id, true).writeRevision).toBe(1);
      expect(grants.setOrchestratorWrite('ada', first.id, false)).toMatchObject({
        orchestratorWrite: false,
        writeRevision: 2,
      });
      expect(grants.setOrchestratorWrite('ada', first.id, true).writeRevision).toBe(3);
      expect(() => grants.requireActive('bob', first.id)).toThrow(/missing or revoked/);

      const revoked = grants.revoke('ada', first.id);
      expect(revoked.revokedAt).toBe(FIXED_NOW().toISOString());
      expect(() => grants.requireActive('ada', first.id)).toThrow(/missing or revoked/);
      expect(() => grants.setOrchestratorWrite('ada', first.id, true)).toThrow(
        /missing or revoked/,
      );
      expect((await grants.create('ada', 'workspace-1')).id).toBe('grant-2');

      workspace = { ...workspace!, path: join(home, 'other') };
      expect(() => grants.requireActive('ada', 'grant-2')).toThrow(/unavailable/);
      workspace = undefined;
      await expect(grants.create('ada', 'workspace-1')).rejects.toThrow(/Unknown DSH Workspace/);
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('does not restore a Grant when revoke overtakes an in-flight create', async () => {
    const home = createTempRoot('botharness-grant-race-');
    const path = join(home, 'project');
    mkdirSync(path);
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let blockStatus = false;
    let releaseStatus!: () => void;
    let enteredStatus!: () => void;
    const statusGate = new Promise<void>((resolve) => {
      releaseStatus = resolve;
    });
    const statusEntered = new Promise<void>((resolve) => {
      enteredStatus = resolve;
    });
    const workspace: DshWorkspace = {
      id: 'workspace-1',
      path,
      title: 'Project',
      status: async () => {
        if (blockStatus) {
          enteredStatus();
          await statusGate;
        }
        return 'ok';
      },
    };
    let index = 0;
    const grants = createWorkspaceGrantStore({
      database: attachOperationalModule(owner, 'workspace-grants'),
      now: FIXED_NOW,
      createId: () => `grant-${++index}`,
      workspaces: () => ({ get: () => workspace, list: () => [workspace] }),
    });
    try {
      const first = await grants.create('ada', workspace.id);
      blockStatus = true;
      const pendingCreate = grants.create('ada', workspace.id);
      await statusEntered;
      grants.revoke('ada', first.id);
      releaseStatus();
      await expect(pendingCreate).rejects.toThrow(/revoked while authorization was pending/);
      expect(grants.list('ada').filter((grant) => grant.revokedAt === undefined)).toEqual([]);
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('fences an older first-create when a newer Grant is revoked', async () => {
    const home = createTempRoot('botharness-grant-first-race-');
    const path = join(home, 'project');
    mkdirSync(path);
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let statusCalls = 0;
    let releaseFirst!: () => void;
    let firstEntered!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      firstEntered = resolve;
    });
    const workspace: DshWorkspace = {
      id: 'workspace-1',
      path,
      title: 'Project',
      status: async () => {
        statusCalls += 1;
        if (statusCalls === 1) {
          firstEntered();
          await firstGate;
        }
        return 'ok';
      },
    };
    let index = 0;
    const grants = createWorkspaceGrantStore({
      database: attachOperationalModule(owner, 'workspace-grants'),
      now: FIXED_NOW,
      createId: () => `grant-${++index}`,
      workspaces: () => ({ get: () => workspace, list: () => [workspace] }),
    });
    try {
      const older = grants.create('ada', workspace.id);
      await entered;
      const newer = await grants.create('ada', workspace.id);
      grants.revoke('ada', newer.id);
      releaseFirst();
      await expect(older).rejects.toThrow(/revoked while authorization was pending/);
      expect(grants.list('ada').filter((grant) => grant.revokedAt === undefined)).toEqual([]);
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
