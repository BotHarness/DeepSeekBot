import { router } from 'expo-router';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { conversationFilter } from '../../host/native-conversation-filter';
import { SavedHostsWriteError } from '@botharness/host-client/hosts';
import { hostSession } from '../../host/host-session';
import { showAppDialog } from '../primitives/app-dialog';
import { t } from '../strings';
import { createHostDrawer } from './host-drawer-model';
import { showWorkspaceRoot } from './native-workspace-navigation';

export const hostDrawer = createHostDrawer({
  switchTo: (hostId, current) => hostSession.switchTo(hostId, current),
  showView: (hostId) => {
    conversationFilter.set(hostId === undefined ? 'all' : computerEnvironmentKey(hostId));
    if (!showWorkspaceRoot())
      showAppDialog(t.channelOpeningNotReady, undefined, [{ text: t.done }]);
  },
  pair: () => router.push('/pair'),
  notifications: () => router.push('/notifications'),
  failed: (error) =>
    error instanceof SavedHostsWriteError
      ? showAppDialog(t.savedComputersKeychainFailed, t.savedComputersErrorDetail(error.message), [
          { text: t.done },
        ])
      : showAppDialog(t.channelOpeningFailed, undefined, [{ text: t.done }]),
});

let dismissSheet: (() => void) | undefined;

export function bindEnvironmentSheet(dismiss: () => void): () => void {
  dismissSheet = dismiss;
  return () => {
    if (dismissSheet === dismiss) dismissSheet = undefined;
  };
}

export function closeEnvironmentSheet(): void {
  const dismiss = dismissSheet;
  dismissSheet = undefined;
  dismiss?.();
}

export function closeThen(action: () => void): void {
  closeEnvironmentSheet();
  action();
}
