import type { BridgeLive } from '../../bridge/rpc.js';
import type { HumanContext } from '../../humans/context.js';
import type { TeamService } from '../../team/service.js';
import { toRemoteError } from '../../bridge/rpc-result.js';
import type { ChannelFilesPage } from '../../channels/timeline.js';
import { unwrap } from '../../bridge/rpc-result.js';
import type { MemoryFileTarget } from '../../memory/file-actions.js';
import type { ChannelFilesAdapterMethods } from './methods.js';

export function messageAttachmentTarget(
  methods: ChannelFilesAdapterMethods,
  channelId: string,
  messageId: string,
  fileId: string,
): { target: MemoryFileTarget } {
  return unwrap(methods.messageAttachmentTarget({ channelId, messageId, fileId }));
}

export function channelFilesPage(
  live: BridgeLive | undefined,
  invocationHuman: () => HumanContext,
  team: TeamService | undefined,
  channelId: string,
  before?: number,
  limit?: number,
): ChannelFilesPage {
  const page = live?.filesPage(invocationHuman(), channelId, { before, limit });
  if (page === undefined)
    throw toRemoteError({
      code: 'not-found',
      message: 'Channel files page is unavailable',
    });
  return team?.approvals.project(invocationHuman(), page, channelId) ?? page;
}
