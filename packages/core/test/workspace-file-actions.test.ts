import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createTestRegistry } from './registry-fixture.js';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';

import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createWorkspaceGrantStore, type DshWorkspace } from '../src/workspaces/grants.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';

async function setup() {
  const root = createTempRoot();
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const path = join(root, '工程 project');
  mkdirSync(path);
  let workspace: DshWorkspace | undefined = {
    id: 'workspace-1',
    path,
    title: 'Project',
    status: async () => 'ok',
  };
  const registry = createTestRegistry({ rootDir: join(root, 'bots') });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  registry.create({ slug: 'other', displayName: 'Other' });
  const ownership = createTestOwnership();
  ownership.claim({
    sessionId: 'orchestrator-ada',
    botSlug: 'ada',
    rootRole: 'orchestrator',
    cwdReference: '/memory/ada',
    at: '2026-09-30T00:00:00.000Z',
  });
  ownership.claim({
    sessionId: 'assignment-ada',
    botSlug: 'ada',
    rootRole: 'assignment',
    cwdReference: path,
    at: '2026-09-30T00:00:00.000Z',
  });
  const grants = createWorkspaceGrantStore({
    database: attachOperationalModule(owner, 'workspace-grants'),
    workspaces: () => ({
      get: (id) => (id === workspace?.id ? workspace : undefined),
      list: () => (workspace === undefined ? [] : [workspace]),
    }),
  });
  const grant = await grants.create('ada', 'workspace-1');
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry,
    ownership,
    grants,
    channels: createChannelStore({ rootDir: join(root, 'channels') }),
    states: createBotStateTracker(),
    roster: createTestRosterStore(),
  });
  return {
    methods,
    registry,
    ownership,
    grants,
    grant,
    path,
    changeWorkspace: (next: DshWorkspace | undefined) => {
      workspace = next;
    },
  };
}

describe('Workspace file target owner', () => {
  it('reads the current registered directory by owned Grant identity without changing Grants, Bot or Session ownership', async () => {
    const { methods, registry, ownership, grants, grant, path } = await setup();
    const before = {
      bot: registry.get('ada'),
      grants: grants.list('ada'),
      sessions: ownership.list(),
    };
    expect(
      methods.workspaceFileTarget({
        slug: 'ada',
        grantId: grant.id,
        path: '/arbitrary-client-path',
      }),
    ).toEqual({ ok: true, value: { target: { path, relativePath: '', kind: 'directory' } } });
    expect({
      bot: registry.get('ada'),
      grants: grants.list('ada'),
      sessions: ownership.list(),
    }).toEqual(before);
  });
  it('refuses missing, wrong-owner and revoked Grants, including absolute path masquerading as identity', async () => {
    const { methods, grants, grant } = await setup();
    for (const payload of [
      { slug: 'other', grantId: grant.id },
      { slug: 'ada', grantId: '/etc' },
      { slug: 'ada', grantId: 'missing' },
    ]) {
      expect(methods.workspaceFileTarget(payload)).toMatchObject({
        ok: false,
        error: { code: 'invalid-grant' },
      });
    }
    expect(methods.workspaceFileTarget({ slug: 'absent', grantId: grant.id })).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(methods.workspaceFileTarget({ slug: 'ada', path: '/etc' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    grants.revoke('ada', grant.id);
    expect(methods.workspaceFileTarget({ slug: 'ada', grantId: grant.id })).toMatchObject({
      ok: false,
      error: { code: 'invalid-grant' },
    });
  });
  it('refuses moved, unregistered and vanished directories instead of opening a replacement', async () => {
    const { methods, changeWorkspace, grant, path } = await setup();
    changeWorkspace({
      id: 'workspace-1',
      path: path + '-moved',
      title: 'Moved',
      status: async () => 'ok',
    });
    expect(methods.workspaceFileTarget({ slug: 'ada', grantId: grant.id })).toMatchObject({
      ok: false,
      error: { code: 'unavailable-workspace' },
    });
    changeWorkspace(undefined);
    expect(methods.workspaceFileTarget({ slug: 'ada', grantId: grant.id })).toMatchObject({
      ok: false,
      error: { code: 'unavailable-workspace' },
    });
    changeWorkspace({ id: 'workspace-1', path, title: 'Project', status: async () => 'ok' });
    rmSync(path, { recursive: true });
    expect(methods.workspaceFileTarget({ slug: 'ada', grantId: grant.id })).toMatchObject({
      ok: false,
      error: { code: 'unavailable-workspace' },
    });
  });
});
