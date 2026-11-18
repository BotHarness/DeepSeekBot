import {
  privateRequestSchema,
  type PrivateInputDeclaration,
  type PrivateInputStatus,
} from '../../../../packages/core/src/credentials/contracts';
import {
  loadPrivateInputStatus,
  readChannelTimeline,
  wireTimelineMessage,
} from '@botharness/host-client/channel-messages';
import type { HostClient } from '@botharness/host-client/client';
import type { TimelineMessage } from '@botharness/host-protocol/wire';
import type { RequestRef } from '@botharness/host-client/requests';

export async function loadPrivateInput(
  client: HostClient,
  ref: RequestRef,
): Promise<PrivateInputDeclaration & { status: PrivateInputStatus }> {
  const [{ page }, status] = await Promise.all([
    readChannelTimeline(
      client,
      ref.channelId,
      { direction: 'around', around: ref.messageId, olderLimit: 0, newerLimit: 0 },
      (value) =>
        wireTimelineMessage(value) as
          | (TimelineMessage & { privateInputRequest?: PrivateInputDeclaration })
          | undefined,
    ),
    loadPrivateInputStatus(client, ref.channelId, ref.messageId),
  ]);
  const request = page.entries.find((entry) => entry.id === ref.messageId)?.privateInputRequest;
  const declaration = privateRequestSchema.parse({
    account: request?.account,
    purpose: request?.purpose,
    fields: request?.fields,
  });
  return { ...declaration, status };
}
