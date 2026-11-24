import { existsSync, realpathSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

export function runFolderCreateGate(s, fx, tag, check) {
  const permission = 'workspaces.createFolder';
  const { role } = s.cli([
    'roles',
    'create',
    '--name',
    `Folder creators ${tag}`,
    '--permissions',
    permission,
  ]);
  const as = fx.users.alice;
  const own = realpathSync(join(s.home, 'spaces', fx.humans.alice.humanId, 'files'));
  const other = realpathSync(join(fx.bobSpace, 'files'));
  const outside = realpathSync(fx.sharedFinance);
  const create = (parent, name, as) =>
    s.cli(['folder-create', '--parent', parent, '--name', name], { as, allowFail: true });
  const verifyRefusal = (label, parent, name, code) => {
    const result = create(parent, name, as);
    check(
      label,
      result.error?.code === code && !existsSync(join(parent, name)),
      result.error?.code,
    );
  };

  verifyRefusal(
    'Member without permission cannot create in their own folder',
    own,
    'no-permission',
    'permission-required',
  );
  s.cli([
    'members',
    'roles',
    as,
    '--set',
    ['member', fx.roles.finance.roleId, fx.roles.creators.roleId, role.roleId].join(','),
  ]);
  try {
    const workspace = create(own, 'member-created', as);
    check(
      'Member with permission creates a child in their own files',
      workspace.path === join(own, 'member-created') &&
        typeof workspace.id === 'string' &&
        existsSync(workspace.path),
    );
    if (workspace.id) {
      const result = s.cli(['grant-create', fx.bots.alice, '--workspace', workspace.id], {
        as,
        allowFail: true,
      });
      check(
        'The returned Workspace id selects the created directory for a Bot grant',
        result.grant?.workspacePath === workspace.path,
        result.error?.code,
      );
    }
    verifyRefusal(
      'Permission does not grant another member folder',
      other,
      'denied',
      'folder-create/outside-grant',
    );
    verifyRefusal(
      'Permission does not grant an unshared folder',
      outside,
      'denied',
      'folder-create/outside-grant',
    );
    const alias = join(own, 'outside-alias');
    symlinkSync(outside, alias, 'junction');
    verifyRefusal(
      'A parent symlink cannot leave granted folders',
      alias,
      'denied',
      'folder-create/outside-grant',
    );
  } finally {
    s.cli([
      'members',
      'roles',
      as,
      '--set',
      ['member', fx.roles.finance.roleId, fx.roles.creators.roleId].join(','),
    ]);
  }
  const owner = create(outside, 'owner-created');
  check(
    'The Owner can create a Workspace outside the member grant',
    owner.path === join(outside, 'owner-created') &&
      typeof owner.id === 'string' &&
      existsSync(owner.path),
  );
}
