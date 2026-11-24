import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import { useHostSession } from '../../host/host-session';
import { useHostLook } from '../../host/native-host-look';
import { canCreateNativeSession } from '../../ui/shell/page-create-actions';
import { SessionDrawerPanel } from './session-drawer-panel';
import { openDrawerSession, openNewSession } from './session-drawer-navigation';
import { useDrawerPlace } from './session-drawer-state';

export function SessionDrawerContent({ active }: { active: boolean }) {
  const { client, saved } = useHostSession();
  const look = useHostLook(saved?.hostId);
  const place = useDrawerPlace();
  if (!client || !saved) return null;
  return (
    <SessionDrawerPanel
      key={`${saved.hostId}:${saved.deviceId}`}
      client={client}
      title={shownHostName(look, saved.hostName)}
      active={active}
      selectedSessionId={place.sessionId}
      canCreate={canCreateNativeSession(saved)}
      onOpen={(row) => openDrawerSession(saved.hostId, row)}
      onNew={openNewSession}
    />
  );
}
