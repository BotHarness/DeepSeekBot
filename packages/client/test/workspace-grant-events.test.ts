import { expect, it, vi } from 'vitest';
import {
  publishWorkspaceGrantChange,
  subscribeWorkspaceGrantChanges,
  workspaceGrantRevision,
} from '../src/client/workspace-grant-events.js';

it('refreshes workspace consumers only within their owning Host, including same-name Bots', () => {
  const localActions = {};
  const remoteActions = {};
  const localChanged = vi.fn();
  const remoteChanged = vi.fn();
  const otherBotChanged = vi.fn();
  const stopLocal = subscribeWorkspaceGrantChanges('tob', localChanged, localActions);
  const stopRemote = subscribeWorkspaceGrantChanges('tob', remoteChanged, remoteActions);
  const stopOther = subscribeWorkspaceGrantChanges('other', otherBotChanged, remoteActions);
  try {
    publishWorkspaceGrantChange('tob', remoteActions);
    expect(remoteChanged).toHaveBeenCalledOnce();
    expect(localChanged).not.toHaveBeenCalled();
    expect(otherBotChanged).not.toHaveBeenCalled();
    expect(workspaceGrantRevision('tob', remoteActions)).toBe(1);
    expect(workspaceGrantRevision('tob', localActions)).toBe(0);
    publishWorkspaceGrantChange('tob', localActions);
    expect(localChanged).toHaveBeenCalledOnce();
    expect(workspaceGrantRevision('tob', localActions)).toBe(1);
    stopRemote();
    publishWorkspaceGrantChange('tob', remoteActions);
    expect(remoteChanged).toHaveBeenCalledOnce();
    expect(workspaceGrantRevision('tob', remoteActions)).toBe(0);
  } finally {
    stopLocal();
    stopRemote();
    stopOther();
  }
});
