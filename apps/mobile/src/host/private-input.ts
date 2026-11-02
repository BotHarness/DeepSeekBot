import {
  privateRequestSchema,
  type PrivateInputDeclaration,
  type PrivateInputStatus,
} from '../../../../packages/core/src/credentials/contracts';
import type { HostClient } from './client';
import type { RequestRef } from './requests';

export async function loadPrivateInput(
  client: HostClient,
  ref: RequestRef,
): Promise<PrivateInputDeclaration & { status: PrivateInputStatus }> {
  const [{ page }, { status }] = await Promise.all([
    client.call<{
      page: { entries: { id: string; privateInputRequest?: PrivateInputDeclaration }[] };
    }>('channelTimeline', {
      channelId: ref.channelId,
      direction: 'around',
      around: ref.messageId,
      olderLimit: 0,
      newerLimit: 0,
    }),
    client.call<{ status: PrivateInputStatus }>('privateInputStatus', {
      channelId: ref.channelId,
      messageId: ref.messageId,
    }),
  ]);
  const request = page.entries.find((entry) => entry.id === ref.messageId)?.privateInputRequest;
  const declaration = privateRequestSchema.parse({
    account: request?.account,
    purpose: request?.purpose,
    fields: request?.fields,
  });
  return { ...declaration, status };
}
