import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { TeamRoles } from '../src/team/roles.js';
import { WorkspaceSpaces } from '../src/workspaces/spaces.js';

const resources: { database: OperationalDatabaseOwner; home: string }[] = [];
afterEach(() => {
  for (const { database, home } of resources.splice(0)) {
    database.close();
    rmSync(home, { recursive: true, force: true });
  }
});
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'm6-role-references-'));
  const database = mountOperationalDatabase({ dshHome: home });
  resources.push({ database, home });
  const port = attachOperationalModule(database, 'role-space-fixture');
  port.transaction((db) =>
    db.exec(`
    CREATE TABLE humans(human_id TEXT PRIMARY KEY, display_name TEXT, status TEXT);
    CREATE TABLE team_settings(singleton INTEGER PRIMARY KEY, owner_human_id TEXT, enabled INTEGER);
    CREATE TABLE host_roles(role_id TEXT PRIMARY KEY, name TEXT COLLATE NOCASE UNIQUE, builtin TEXT, permissions_json TEXT, models_json TEXT NOT NULL DEFAULT '{"kind":"all"}');
    CREATE TABLE human_roles(human_id TEXT REFERENCES humans, role_id TEXT REFERENCES host_roles, PRIMARY KEY(human_id, role_id));
    CREATE TABLE workspace_spaces(space_id TEXT PRIMARY KEY, kind TEXT, name TEXT COLLATE NOCASE, owner_human_id TEXT UNIQUE, audience_json TEXT);
    INSERT INTO humans VALUES ('local-human', 'Owner', 'active'), ('alice', 'Alice', 'active');
    INSERT INTO team_settings VALUES (1, 'local-human', 1);
    INSERT INTO host_roles(role_id, name, builtin, permissions_json) VALUES ('member', 'Member', 'member', '[]');
    INSERT INTO human_roles VALUES ('alice', 'member');
  `),
  );
  const invalidated = vi.fn();
  const roles = new TeamRoles(port, invalidated);
  const spaces = new WorkspaceSpaces(port, home, roles);
  return { roles, spaces, invalidated };
}

it('refuses deleting a referenced Host Role without changing the role, assignments or space audience', () => {
  const { roles, spaces, invalidated } = fixture();
  const role = roles.create(owner, 'Finance', ['models.use']).role;
  roles.set(owner, 'alice', [role.roleId]);
  const shared = spaces.create(owner, 'Finance files', { kind: 'roles', roleIds: [role.roleId] });
  const before = {
    roles: roles.list(owner),
    spaces: spaces.list(owner),
    permissions: roles.permissions(humanContext('alice')),
  };
  invalidated.mockClear();
  expect(() => roles.delete(owner, role.roleId)).toThrow(
    expect.objectContaining({ code: 'role-in-use' }),
  );
  expect(invalidated).not.toHaveBeenCalled();
  expect({
    roles: roles.list(owner),
    spaces: spaces.list(owner),
    permissions: roles.permissions(humanContext('alice')),
  }).toEqual(before);
  expect(spaces.list(humanContext('alice')).some((space) => space.spaceId === shared.spaceId)).toBe(
    true,
  );
  spaces.update(owner, shared.spaceId, { audience: { kind: 'everyone' } });
  expect(roles.delete(owner, role.roleId)).toBeNull();
  expect(roles.list(owner).some((row) => row.roleId === role.roleId)).toBe(false);
});

it('keeps the refusal until every space releases the role and preserves permission and built-in protections', () => {
  const { roles, spaces } = fixture();
  const role = roles.create(owner, 'Finance', []).role;
  const first = spaces.create(owner, 'First', { kind: 'roles', roleIds: [role.roleId] });
  const second = spaces.create(owner, 'Second', { kind: 'roles', roleIds: [role.roleId] });
  expect(() => roles.delete(humanContext('alice'), role.roleId)).toThrow(
    expect.objectContaining({ code: 'permission-required' }),
  );
  expect(() => roles.delete(owner, 'member')).toThrow(
    expect.objectContaining({ code: 'role-builtin' }),
  );
  spaces.update(owner, first.spaceId, { audience: { kind: 'members', humanIds: ['alice'] } });
  expect(() => roles.delete(owner, role.roleId)).toThrow(
    expect.objectContaining({ code: 'role-in-use' }),
  );
  spaces.update(owner, second.spaceId, { audience: { kind: 'roles', roleIds: [] } });
  expect(roles.delete(owner, role.roleId)).toBeNull();
  expect(() => roles.delete(owner, role.roleId)).toThrow(
    expect.objectContaining({ code: 'role-not-found' }),
  );
});
