import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import { useCloudConversations } from '../../cloud/native-conversations';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { creationTargets } from '../../host/creation-targets';
import { useHostSession } from '../../host/host-session';
import { useMemberCreationPermissions } from '../../host/member-permissions';
import { useHostLook } from '../../host/native-host-look';

export function useCreationTargets(scope = 'all') {
  const { hosts } = useHostSession();
  const scopedHost = hosts.find(({ hostId }) => computerEnvironmentKey(hostId) === scope);
  const { saved, client } = useHostSession(scopedHost?.hostId);
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
