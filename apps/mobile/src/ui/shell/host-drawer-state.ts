import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, type ViewInstance } from 'react-native';
import { makeMutable, runOnJS, withSpring } from 'react-native-reanimated';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { conversationFilter } from '../../host/native-conversation-filter';
import { SavedHostsWriteError } from '@botharness/host-client/hosts';
import { hostSession } from '../../host/host-session';
import { spring } from '../design/motion';
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

export const progress = makeMutable(0);

let docked = 0;
const dockedWatchers = new Set<() => void>();

export function dock(by: number): void {
  docked += by;
  for (const watcher of dockedWatchers) watcher();
}

function watchDocked(watcher: () => void): () => void {
  dockedWatchers.add(watcher);
  return () => dockedWatchers.delete(watcher);
}

export function useDocked(): boolean {
  return useSyncExternalStore(watchDocked, () => docked > 0);
}

function hidden(): void {
  hostDrawer.hidden();
}

function slide(open: boolean, velocity = 0): void {
  progress.value = withSpring(
    open ? 1 : 0,
    { ...spring.release, velocity, overshootClamping: true },
    (finished) => {
      if (finished === true && !open) runOnJS(hidden)();
    },
  );
}

export function settle(open: boolean, velocity = 0): void {
  if (open) hostDrawer.open();
  else hostDrawer.close();
  if (docked === 0) slide(open, velocity);
}

export function reveal(): void {
  hostDrawer.reveal();
}

export function focusOn(node: ViewInstance): void {
  AccessibilityInfo.sendAccessibilityEvent?.(node, 'focus');
}

export function openHostDrawer(): void {
  settle(true);
}

export function useHostDrawerOpen(): boolean {
  return useSyncExternalStore(hostDrawer.subscribe, () => hostDrawer.getSnapshot().open);
}

export function dockedOpenChange(open: boolean): void {
  if (open) {
    hostDrawer.open();
    return;
  }
  hostDrawer.close();
  hostDrawer.hidden();
}

export function closeThen(action: () => void): void {
  settle(false);
  action();
}
