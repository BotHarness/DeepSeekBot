import { gitInstalling, loadGitAvailability, startGitInstall, type BridgeCall } from './bridge.js';
import type { ClientStore } from './store.js';
import { reportFailure } from './diagnostic-log.js';

export interface GitActions {
  refreshGit(signal?: AbortSignal): Promise<void>;
  installGit(): Promise<void>;
}

const GIT_INSTALL_POLL_MS = 500;

export function createGitActions(call: BridgeCall, clientStore: ClientStore) {
  let followingGitInstall = false;
  const followGitInstall = async (): Promise<void> => {
    if (followingGitInstall) return;
    followingGitInstall = true;
    try {
      while (gitInstalling(clientStore.getSnapshot().git)) {
        await new Promise((resolve) => setTimeout(resolve, GIT_INSTALL_POLL_MS));
        clientStore.setGit(await loadGitAvailability(call));
      }
    } catch (error) {
      reportFailure('git-install-status-check-failed', 'Git install status check failed', error);
    } finally {
      followingGitInstall = false;
    }
  };
  const refreshGit = async (signal?: AbortSignal): Promise<void> => {
    try {
      const git = await loadGitAvailability(call, signal);
      if (signal?.aborted === true) return;
      clientStore.setGit(git);
      if (gitInstalling(git)) void followGitInstall();
    } catch (error) {
      if (signal?.aborted !== true)
        reportFailure('git-status-check-failed', 'Git status check failed', error);
    }
  };
  const installGit = async (): Promise<void> => {
    try {
      clientStore.setGit(await startGitInstall(call));
      await followGitInstall();
    } catch (error) {
      reportFailure('git-install-failed-to-start', 'Git install failed to start', error);
    }
  };

  return {
    refreshGit,
    installGit,
  } satisfies GitActions;
}
