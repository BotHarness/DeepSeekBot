import type { ConversationWorkspace } from '../cloud/conversations';
import {
  cloudEnvironmentKey,
  computerEnvironmentKey,
  conversationEnvironments,
} from './conversation-environments';

export type CreationAction = 'channel' | 'bot' | 'zip' | 'marketplace' | 'git' | 'invite' | 'join';
export type CreationTarget =
  | { kind: 'computer'; key: string; hostId: string; name: string; channelCreation?: boolean }
  | { kind: 'cloud'; key: string; name: string; workspace: ConversationWorkspace };

export function creationTargets(
  computer: { hostId: string; name: string } | undefined,
  workspaces: readonly ConversationWorkspace[],
): CreationTarget[] {
  const routes = conversationEnvironments(
    computer,
    [...new Set(workspaces.map((w) => w.scope))],
    workspaces,
    'All',
  );
  return [
    ...(computer
      ? [{ ...computer, key: computerEnvironmentKey(computer.hostId), kind: 'computer' as const }]
      : []),
    ...workspaces
      .filter((w) => !w.guest && w.role === 'owner')
      .map((workspace) => ({
        kind: 'cloud' as const,
        key: cloudEnvironmentKey(workspace.scope, workspace.organizationId),
        name: (() => {
          const route = routes.find(
            (r) => r.key === cloudEnvironmentKey(workspace.scope, workspace.organizationId),
          );
          return route?.detail
            ? `${workspace.organizationName} · ${route.detail}`
            : workspace.organizationName;
        })(),
        workspace,
      })),
  ];
}

export function targetsFor(
  action: CreationAction,
  scope: string,
  targets: readonly CreationTarget[],
): CreationTarget[] {
  return targets.filter(
    (target) =>
      (scope === 'all' || target.key === scope) &&
      ((action === 'channel' && (target.kind !== 'computer' || target.channelCreation !== false)) ||
        (['bot', 'zip', 'marketplace', 'git'].includes(action) && target.kind === 'computer') ||
        (action === 'invite' && target.kind === 'cloud')),
  );
}

export function creationActions(
  scope: string,
  targets: readonly CreationTarget[],
): CreationAction[] {
  const actions: CreationAction[] =
    scope === 'all'
      ? ['bot', 'zip', 'git', 'channel', 'marketplace', 'join']
      : ['bot', 'zip', 'git', 'channel', 'marketplace', 'invite'];
  return actions.filter(
    (action) =>
      action === 'join' ||
      (['bot', 'zip', 'marketplace', 'git'].includes(action) && scope === 'all') ||
      targetsFor(action, scope, targets).length > 0,
  );
}
