import { readChannel } from './channel-management';
import { record, type HostCall } from './host-answer';
import { readTeamMode } from './people';

export interface GroupDetailsViewer {
  readonly teamEnabled: boolean;
  readonly owner: boolean;
  readonly permissions: readonly string[];
}

export function groupDetailsViewer(team: {
  readonly enabled: boolean;
  readonly viewer: {
    readonly kind: 'owner' | 'member';
    readonly owner: boolean;
    readonly permissions: readonly string[];
  };
}): GroupDetailsViewer {
  return {
    teamEnabled: team.enabled,
    owner: team.viewer.kind === 'owner' || team.viewer.owner,
    permissions: team.viewer.permissions,
  };
}

export function editsGroupDetailsWithoutChannelRead(viewer: GroupDetailsViewer): boolean {
  return !viewer.teamEnabled || viewer.owner || viewer.permissions.includes('channels.manageAll');
}

export function canEditGroupDetails(viewer: GroupDetailsViewer, channelAccess: unknown): boolean {
  if (editsGroupDetailsWithoutChannelRead(viewer)) return true;
  const access = record(channelAccess);
  const role = access?.['role'];
  return (
    role === 'owner' ||
    role === 'admin' ||
    record(access?.['policy'])?.['editDetails'] === 'everyone'
  );
}

export async function readGroupDetailsEditable(
  host: HostCall,
  channelId: string,
): Promise<boolean> {
  const viewer = groupDetailsViewer(await readTeamMode(host));
  if (editsGroupDetailsWithoutChannelRead(viewer)) return true;
  return canEditGroupDetails(viewer, await readChannel(host, channelId));
}
