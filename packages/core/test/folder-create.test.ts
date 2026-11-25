import { existsSync, mkdirSync, realpathSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createTempRoot } from './helpers.js';
import { alice, bob, fixture } from './team-spaces-fixtures.js';

const folderPermission = 'workspaces.createFolder';

function setup() {
  const f = fixture();
  const registerWorkspace = vi.fn(async (path: string) => {
    const id = f.workspace(path);
    return { id, path, title: 'Registered Workspace' };
  });
  return {
    ...f,
    bridge: createBridgeMethodsForHumans({ ...f.core, registerWorkspace }),
    registerWorkspace,
    own: join(f.home, 'spaces', alice.humanId, 'files'),
    other: join(f.home, 'spaces', bob.humanId, 'files'),
    outside: realpathSync(createTempRoot('folder-create-outside-')),
    grantPermission() {
      const { role } = f.core.team.roles.create(owner, 'Folder creation', [folderPermission]);
      f.core.team.roles.set(owner, alice.humanId, [role.roleId]);
    },
  };
}

describe('folderCreate through the Host bridge', () => {
  it('creates one child and returns its registered Workspace for the Owner', async () => {
    const f = setup();
    const parent = realpathSync(createTempRoot('folder-create-parent-'));
    const result = await f.bridge(owner).folderCreate({ parent, name: 'New project' });
    const path = join(parent, 'New project');
    expect(readdirSync(parent)).toEqual(['New project']);
    expect(readdirSync(path)).toEqual([]);
    expect(f.registerWorkspace).toHaveBeenCalledExactlyOnceWith(path);
    expect(result).toEqual({
      ok: true,
      value: { id: path, path, title: 'Registered Workspace' },
    });
  });

  it.each(['', ' ', '.', '..', 'new..folder', 'foo/bar', 'foo\\bar', 'x\0y', '../escape'])(
    'refuses an invalid child name %j before registration',
    async (name) => {
      const f = setup();
      expect(await f.bridge(owner).folderCreate({ parent: f.outside, name })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
      expect(readdirSync(f.outside)).toEqual([]);
      expect(f.registerWorkspace).not.toHaveBeenCalled();
    },
  );

  it('refuses parent traversal and missing parents', async () => {
    const f = setup();
    const methods = f.bridge(owner);
    expect(await methods.folderCreate({ parent: f.own + '/../files', name: 'new' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(
      await methods.folderCreate({ parent: join(f.outside, 'missing'), name: 'new' }),
    ).toMatchObject({ ok: false, error: { code: 'folder-create/not-found' } });
    expect(readdirSync(f.outside)).toEqual([]);
    expect(f.registerWorkspace).not.toHaveBeenCalled();
  });

  it('refuses a member without the Host Permission and Bot callers', async () => {
    const f = setup();
    const request = { parent: f.own, name: 'denied' };
    expect(await f.bridge(alice).folderCreate(request)).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: folderPermission } },
    });
    f.grantPermission();
    expect(await f.bridge({ ...alice, caller: 'bot' }).folderCreate(request)).toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
    expect(f.registerWorkspace).not.toHaveBeenCalled();
  });

  it('reads the current Host Permission and limits it to the member’s granted files', async () => {
    const f = setup();
    f.grantPermission();
    const methods = f.bridge(alice);
    const parent = join(f.own, 'existing');
    mkdirSync(parent);
    expect(await methods.folderCreate({ parent, name: 'new' })).toMatchObject({
      ok: true,
      value: { path: join(parent, 'new') },
    });
    for (const outside of [f.outside, f.other, join(f.home, 'spaces', alice.humanId)]) {
      expect(await methods.folderCreate({ parent: outside, name: 'denied' })).toMatchObject({
        ok: false,
        error: { code: 'folder-create/outside-grant' },
      });
      expect(existsSync(join(outside, 'denied'))).toBe(false);
    }
    f.core.team.roles.set(owner, alice.humanId, ['member']);
    expect(await methods.folderCreate({ parent, name: 'revoked' })).toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
    expect(f.registerWorkspace).toHaveBeenCalledTimes(1);
  });

  it('respects the current audience of a shared folder', async () => {
    const f = setup();
    f.grantPermission();
    const shared = f.core.spaces.create(owner, 'Shared', {
      kind: 'members',
      humanIds: [alice.humanId],
    });
    const parent = join(f.core.spaces.path(shared.spaceId), 'files');
    const methods = f.bridge(alice);
    expect(await methods.folderCreate({ parent, name: 'first' })).toMatchObject({ ok: true });
    f.core.spaces.update(owner, shared.spaceId, {
      audience: { kind: 'members', humanIds: [bob.humanId] },
    });
    expect(await methods.folderCreate({ parent, name: 'second' })).toMatchObject({
      ok: false,
      error: { code: 'folder-create/outside-grant' },
    });
    expect(readdirSync(parent)).toEqual(['first']);
  });

  it('resolves parent symlinks under the grant and refuses links that leave it', async () => {
    const f = setup();
    f.grantPermission();
    const inside = join(f.own, 'inside');
    mkdirSync(inside);
    symlinkSync(inside, join(f.own, 'alias'), 'junction');
    symlinkSync(f.outside, join(f.own, 'outside'), 'junction');
    symlinkSync(f.outside, join(f.own, 'taken'), 'junction');
    const methods = f.bridge(alice);
    expect(await methods.folderCreate({ parent: join(f.own, 'alias'), name: 'new' })).toMatchObject(
      { ok: true, value: { path: join(inside, 'new') } },
    );
    expect(
      await methods.folderCreate({ parent: join(f.own, 'outside'), name: 'escape' }),
    ).toMatchObject({ ok: false, error: { code: 'folder-create/outside-grant' } });
    expect(await methods.folderCreate({ parent: f.own, name: 'taken' })).toMatchObject({
      ok: false,
      error: { code: 'folder-create/already-exists' },
    });
    expect(readdirSync(f.outside)).toEqual([]);
    expect(f.registerWorkspace).toHaveBeenCalledExactlyOnceWith(join(inside, 'new'));
  });

  it('cleans up an empty child when Workspace registration fails and allows retry', async () => {
    const f = setup();
    f.registerWorkspace.mockRejectedValueOnce(new Error('Registry unavailable'));
    const methods = f.bridge(owner);
    const request = { parent: f.outside, name: 'retry' };
    expect(await methods.folderCreate(request)).toMatchObject({
      ok: false,
      error: { code: 'folder-create/registration-failed' },
    });
    expect(readdirSync(f.outside)).toEqual([]);
    expect(await methods.folderCreate(request)).toMatchObject({
      ok: true,
      value: { path: join(f.outside, 'retry') },
    });
  });
});
