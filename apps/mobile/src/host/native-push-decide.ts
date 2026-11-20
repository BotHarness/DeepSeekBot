import { createHostClient } from '@botharness/host-client/client';
import type { SavedHost } from '@botharness/host-client/hosts';
import { nativeCarrier } from './native-carrier';
import {
  decideApproval,
  type ApprovalChoice,
  type RequestRef,
} from '@botharness/host-client/requests';

export async function decideOverRoute(
  host: SavedHost,
  route: string,
  ref: RequestRef,
  outcome: ApprovalChoice,
) {
  const client = createHostClient({ ...host, routes: [route], carrier: nativeCarrier() });
  try {
    return await decideApproval(client, ref, outcome, 'notification');
  } finally {
    client.stop();
  }
}
