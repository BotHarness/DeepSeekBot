import { randomUUID } from 'node:crypto';
import { grantExecutionDenial, orchestratorPermission } from '../../workspaces/grant-execution.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { WorkspaceSpaces } from '../../workspaces/spaces.js';
import { TeamService } from '../../team/service.js';
import { createFolderBrowser } from '../../workspaces/folder-browse.js';
import type { Context } from '@deepseek-ai/cordis';
import { attachOperationalModule } from '../../database/owner.js';
import { createWorkspaceGrantStore } from '../../workspaces/grants.js';
import type { BotHarnessCore, createCore } from '../../plugin.js';
type CoreOptions = NonNullable<Parameters<typeof createCore>[0]>;

export function apply(
  operationalDatabase: BotHarnessCore['operationalDatabase'],
  dshHome: string,
  team: Pick<TeamService, 'roles'>,
) {
  const spaces = new WorkspaceSpaces(
    attachOperationalModule(operationalDatabase, 'workspace-spaces'),
    dshHome,
    team.roles,
    undefined,
    operationalDatabase.mode === 'ready',
  );
  return spaces;
}

export function createGrants(
  operationalDatabase: BotHarnessCore['operationalDatabase'],
  spaces: WorkspaceSpaces,
  options: Pick<CoreOptions, 'workspaces'>,
) {
  const grants = createWorkspaceGrantStore({
    database: attachOperationalModule(operationalDatabase, 'workspace-grants'),
    workspaces: () => spaces.workspaceLookup(options.workspaces?.()),
    validateTree: (slug, path) => spaces.assertTree(slug, path),
    validatePath: (slug, path, grant) => spaces.assertPath(slug, path, grant),
  });
  return grants;
}

export function mountFolders(ctx: Context) {
  const folders = createFolderBrowser({
    nativePicker: () =>
      (
        ctx.get('directoryPicker') as unknown as { capability?(): { kind?: string } } | undefined
      )?.capability?.().kind === 'native',
  });
  ctx.effect(() => () => folders.close(), 'botharness: folder reader');
  return folders;
}

export function mountPermissionTracking(
  ctx: Context,
  core: Pick<
    BotHarnessCore,
    'assignmentAccess' | 'channels' | 'grants' | 'ownership' | 'registry' | 'runtime' | 'team'
  >,
) {
  const permissionDenial = (session: import('@deepseek-ai/dsh-session').Session) =>
    grantExecutionDenial(core, session, ctx.get('sandboxPolicy'), ctx.get('approval'));

  const appliedPermission = new Map<string, string>();
  ctx.effect(() => () => appliedPermission.clear(), 'botharness: Orchestrator permission record');
  const recordOrchestratorPermission = (
    session: import('@deepseek-ai/dsh-session').Session,
    changed: boolean,
  ): void => {
    const owner = core.ownership.resolve(session.id);
    if (
      owner?.rootRole !== 'orchestrator' ||
      owner.provenance === 'subagent' ||
      owner.parentSessionId !== undefined
    )
      return;
    const expected = orchestratorPermission(core, owner.botSlug);
    const key = expected.mode + '+' + expected.approval;
    const changedOutside = changed && appliedPermission.get(session.id) === key;
    appliedPermission.set(session.id, key);
    if (!changedOutside) return;
    ctx.logger.warn(
      'botharness: restored the permission mode of an Orchestrator Session that was changed outside the PersonaBot access setting',
    );
    const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, owner.botSlug);
    if (channel !== undefined)
      void core.channels
        .appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
          id: randomUUID(),
          at: new Date().toISOString(),
          author: { kind: 'bot', slug: owner.botSlug },
          body: '这个会话的权限模式被单独改动过，Host 已把它恢复。聊天会话的权限由此 Bot 工作区设置里的“完全访问”开关决定，不能在会话里单独修改。',
        })
        .catch(() => undefined);
  };
  return { permissionDenial, recordOrchestratorPermission, appliedPermission };
}
