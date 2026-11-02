import type { LocalVideoClientState } from '../../../../../packages/computer/src/local-video-client';
import type { ConnectionState } from '../../host/client';
import { connectionRecoveryText } from '../connection-recovery';
import { t } from '../strings';

export function localVideoNotice({
  connection,
  state,
  nativeMissing,
  mediaMounted,
  showWaiting = true,
}: {
  connection: ConnectionState;
  state: LocalVideoClientState;
  nativeMissing: boolean;
  mediaMounted: boolean;
  showWaiting?: boolean;
}): string | undefined {
  if (connection.status === 'refused') return t.deviceRefusal[connection.code];
  if (state.code === 'input-result-unknown') return t.computerVideoInputUnknown;
  if (nativeMissing) return t.computerVideoBuildRequired;
  if (connection.status === 'unreachable' || connection.status === 'reconnecting')
    return t.computerVideoConnectionIssue(connectionRecoveryText(connection.route));
  if (connection.status !== 'connected') return undefined;
  if (state.code === 'viewer-limit') return t.computerVideoViewerLimit;
  if (state.code === 'connect-carrier-required') return t.computerVideoCarrierRequired;
  if (state.code === 'connection-lost')
    return t.computerVideoConnectionIssue(connectionRecoveryText(connection.route));
  if (state.code === 'screen-recording-required') return t.computerVideoMacPermission;
  if (state.status === 'unavailable') return t.computerVideoUnavailable;
  if (
    showWaiting &&
    (state.host?.media.status === 'stalled' ||
      state.code === 'media-not-live' ||
      (mediaMounted && !state.presenting))
  )
    return t.computerVideoWaiting;
  return undefined;
}
