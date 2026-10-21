import type { ConversationWorkspace } from '../cloud/conversations';
import type { HostColorId, HostIcon } from '../ui/design/host-look';

export type ConversationEnvironment = {
  key: string;
  title: string;
  detail?: string;
  accessibilityLabel?: string;
  kind: 'all' | 'computer' | 'cloud';
  hostIcon?: HostIcon;
  hostColor?: HostColorId;
};
export const computerEnvironmentKey = (hostId: string) => JSON.stringify(['computer', hostId]);
export const cloudEnvironmentKey = (scope: string, organizationId: string) =>
  JSON.stringify([scope, organizationId]);

export function conversationEnvironments(
  computer: { hostId: string; name: string; icon?: HostIcon; color?: HostColorId } | undefined,
  sourceScopes: readonly string[],
  workspaces: readonly ConversationWorkspace[],
  allTitle: string,
): ConversationEnvironment[] {
  const result: ConversationEnvironment[] = [{ key: 'all', title: allTitle, kind: 'all' }];
  if (computer)
    result.push({
      key: computerEnvironmentKey(computer.hostId),
      title: computer.name,
      kind: 'computer',
      ...(computer.icon === undefined ? {} : { hostIcon: computer.icon }),
      ...(computer.color === undefined ? {} : { hostColor: computer.color }),
    });
  const seen = new Set<string>();
  for (const scope of sourceScopes) {
    for (const workspace of workspaces) {
      if (workspace.scope !== scope) continue;
      const key = cloudEnvironmentKey(scope, workspace.organizationId);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ key, title: workspace.organizationName, kind: 'cloud' });
    }
  }
  for (const route of result) {
    if (route.kind !== 'cloud' || result.filter((r) => r.title === route.title).length < 2)
      continue;
    const workspace = workspaces.find(
      (w) => cloudEnvironmentKey(w.scope, w.organizationId) === route.key,
    );
    if (!workspace) continue;
    const host = new URL(workspace.server).host;
    const peers = workspaces.filter(
      (w) =>
        w.organizationName === workspace.organizationName &&
        w.server === workspace.server &&
        w.organizationId !== workspace.organizationId,
    );
    let length = 8;
    while (
      length < workspace.organizationId.length &&
      peers.some((w) => w.organizationId.endsWith(workspace.organizationId.slice(-length)))
    )
      length++;
    const duplicateSource = workspaces.some(
      (w) =>
        w.scope !== workspace.scope &&
        w.server === workspace.server &&
        w.organizationId === workspace.organizationId,
    );
    const source = duplicateSource ? `${host} · ${workspace.instanceId}` : host;
    route.detail = `${workspace.organizationId.slice(-length)} · ${source}`;
    route.accessibilityLabel = `${route.title}, ${workspace.server}, ${workspace.organizationId}${duplicateSource ? `, ${workspace.instanceId}` : ''}`;
  }
  return result;
}

export function includesComputerActivity(scope: string, hostId: string | undefined): boolean {
  return hostId !== undefined && (scope === 'all' || scope === computerEnvironmentKey(hostId));
}
