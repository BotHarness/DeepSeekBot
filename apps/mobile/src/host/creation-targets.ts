import type { ConversationWorkspace } from '../cloud/conversations';
import {
  cloudEnvironmentKey,
  computerEnvironmentKey,
  conversationEnvironments,
} from './conversation-environments';

export type CreationAction =
  | 'channel'
  | 'bot'
  | 'zip'
  | 'marketplace'
  | 'git'
  | 'invite'
  | 'join'
  | 'person';
export type CreationTarget =
  | {
      kind: 'computer';
      key: string;
      hostId: string;
      name: string;
      channelCreation?: boolean;
      botCreation?: boolean;
      peopleDm?: boolean;
    }
  | { kind: 'cloud'; key: string; name: string; workspace: ConversationWorkspace };

export function canCreateCloudChannel(role: ConversationWorkspace['role'], guest: boolean) {
  return !guest && role === 'owner';
}

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
      .filter((w) => canCreateCloudChannel(w.role, w.guest))
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
        (['bot', 'zip', 'marketplace', 'git'].includes(action) &&
          target.kind === 'computer' &&
          target.botCreation !== false) ||
        (action === 'invite' && target.kind === 'cloud') ||
        (action === 'person' && target.kind === 'computer' && target.peopleDm === true)),
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
      (['bot', 'zip', 'marketplace', 'git'].includes(action) &&
        scope === 'all' &&
        !targets.some((target) => target.kind === 'computer' && target.botCreation === false)) ||
      targetsFor(action, scope, targets).length > 0,
  );
}
