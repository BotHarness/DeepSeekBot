import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import { useCloudConversations } from '../../cloud/native-conversations';
import { creationTargets } from '../../host/creation-targets';
import { useHostSession } from '../../host/host-session';
import { useMemberCreationPermissions } from '../../host/member-permissions';
import { useHostLook } from '../../host/native-host-look';

export function useCreationTargets() {
  const { saved, client } = useHostSession();
  const look = useHostLook(saved?.hostId);
  const directory = useCloudConversations();
  const permissions = useMemberCreationPermissions(client);
  return creationTargets(
    saved ? { hostId: saved.hostId, name: shownHostName(look, saved.hostName) } : undefined,
    directory.workspaces,
  ).map((target) =>
    target.kind === 'computer'
      ? {
          ...target,
          botCreation: permissions?.bots !== false,
          channelCreation: saved?.member === undefined || permissions?.channels === true,
        }
      : target,
  );
}
