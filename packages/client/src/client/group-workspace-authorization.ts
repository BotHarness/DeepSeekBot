import type { BridgeActions } from './actions.js';
import type { WorkspaceGrantView } from './bridge.js';
import { BridgeCallError, errorMessage } from './bridge.js';
import { publishWorkspaceGrantChange } from './workspace-grant-events.js';

export interface GroupGrantResult {
  slug: string;
  status: 'created' | 'existing' | 'confirmed' | 'failed' | 'unknown';
  grant?: WorkspaceGrantView;
  error?: string;
}

export async function authorizeGroupMembers({
  actions,
  channelId,
  path,
  slugs,
  previous = [],
  deadline = (operation) => operation,
  onResult,
}: {
  actions: Pick<BridgeActions, 'authorizeGroupWorkspacePath' | 'readGroupWorkspaceGrant'>;
  channelId: string;
  path: string;
  slugs: readonly string[];
  previous?: readonly GroupGrantResult[];
  deadline?: <Value>(operation: Promise<Value>) => Promise<Value>;
  onResult(result: GroupGrantResult): void;
}): Promise<void> {
  for (const slug of new Set(slugs)) {
    const prior = previous.find((row) => row.slug === slug);
    if (prior !== undefined && prior.status !== 'unknown' && prior.status !== 'failed') continue;
    let result: GroupGrantResult;
    try {
      const grant = await deadline(actions.readGroupWorkspaceGrant(channelId, slug, path));
      if (grant !== undefined) {
        result = { slug, status: prior === undefined ? 'existing' : 'confirmed', grant };
      } else {
        try {
          const written = await deadline(
            actions.authorizeGroupWorkspacePath(channelId, slug, path),
          );
          result = { slug, status: written.created ? 'created' : 'existing', grant: written.grant };
        } catch (cause) {
          const readback = await deadline(actions.readGroupWorkspaceGrant(channelId, slug, path));
          result =
            readback === undefined
              ? {
                  slug,
                  status: cause instanceof BridgeCallError ? 'failed' : 'unknown',
                  error: errorMessage(cause),
                }
              : { slug, status: 'confirmed', grant: readback };
        }
      }
    } catch (cause) {
      result = {
        slug,
        status: cause instanceof BridgeCallError ? 'failed' : 'unknown',
        error: errorMessage(cause),
      };
    }
    publishWorkspaceGrantChange(slug);
    onResult(result);
  }
}
